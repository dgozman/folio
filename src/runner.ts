/**
 * Copyright 2019 Google Inc. All rights reserved.
 * Modifications copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import rimraf from 'rimraf';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { Dispatcher } from './dispatcher';
import { createMatcher, Matcher, monotonicTime, raceAgainstDeadline } from './util';
import { Suite } from './test';
import { Loader } from './loader';
import { Reporter } from './reporter';
import { Multiplexer } from './reporters/multiplexer';
import DotReporter from './reporters/dot';
import LineReporter from './reporters/line';
import ListReporter from './reporters/list';
import JSONReporter from './reporters/json';
import JUnitReporter from './reporters/junit';
import EmptyReporter from './reporters/empty';
import { ProjectImpl } from './project';
import { Minimatch } from 'minimatch';

const removeFolderAsync = promisify(rimraf);
const readDirAsync = promisify(fs.readdir);
const readFileAsync = promisify(fs.readFile);

type RunResult = 'passed' | 'failed' | 'sigint' | 'forbid-only' | 'no-tests' | 'timedout';

export class Runner {
  private _loader: Loader;
  private _reporter: Reporter;
  private _didBegin = false;

  constructor(loader: Loader) {
    this._loader = loader;
    this._reporter = this._createReporter();
  }

  private _createReporter() {
    const reporters: Reporter[] = [];
    const defaultReporters = {
      dot: DotReporter,
      line: LineReporter,
      list: ListReporter,
      json: JSONReporter,
      junit: JUnitReporter,
      null: EmptyReporter,
    };
    for (const r of this._loader.fullConfig().reporter) {
      if (typeof r === 'string') {
        if (r in defaultReporters) {
          reporters.push(new defaultReporters[r]());
        } else {
          const p = path.resolve(process.cwd(), r);
          reporters.push(new (require(p).default)());
        }
      } else if ('name' in r && r.name === 'junit') {
        reporters.push(new JUnitReporter(r));
      } else if ('name' in r && r.name === 'json') {
        reporters.push(new JSONReporter(r));
      } else {
        throw new Error(`Unsupported reporter "${r}"`);
      }
    }
    return new Multiplexer(reporters);
  }

  async run(list: boolean, testFileFilter: Matcher, projectName?: string): Promise<RunResult> {
    const config = this._loader.fullConfig();
    const globalDeadline = config.globalTimeout ? config.globalTimeout + monotonicTime() : undefined;
    const { result, timedOut } = await raceAgainstDeadline(this._run(list, testFileFilter, projectName), globalDeadline);
    if (timedOut) {
      if (!this._didBegin)
        this._reporter.onBegin(config, new Suite(''));
      this._reporter.onTimeout(config.globalTimeout);
      return 'failed';
    }
    return result;
  }

  async _run(list: boolean, testFileFilter: Matcher, projectName?: string): Promise<RunResult> {
    const config = this._loader.fullConfig();

    const projects = this._loader.projects().filter(project => {
      return !projectName || project.config.name === projectName;
    });

    const files = new Map<ProjectImpl, string[]>();
    const allTestFiles = new Set<string>();
    for (const project of projects) {
      const testDir = project.config.testDir;
      if (!fs.existsSync(testDir))
        throw new Error(`${testDir} does not exist`);
      if (!fs.statSync(testDir).isDirectory())
        throw new Error(`${testDir} is not a directory`);
      const allFiles = await collectFiles(project.config.testDir);
      const testMatch = createMatcher(project.config.testMatch);
      const testIgnore = createMatcher(project.config.testIgnore);
      const testFiles = allFiles.filter(file => !testIgnore(file) && testMatch(file) && testFileFilter(file));
      files.set(project, testFiles);
      testFiles.forEach(file => allTestFiles.add(file));
    }

    if (config.globalSetup)
      await this._loader.loadGlobalHook(config.globalSetup)();
    try {
      for (const file of allTestFiles)
        this._loader.loadTestFile(file);

      const rootSuite = new Suite('');
      for (const fileSuite of this._loader.fileSuites().values())
        rootSuite._addSuite(fileSuite);
      if (config.forbidOnly && rootSuite._hasOnly())
        return 'forbid-only';
      filterOnly(rootSuite);

      const fileSuites = new Map<string, Suite>();
      for (const fileSuite of rootSuite.suites)
        fileSuites.set(fileSuite.file, fileSuite);

      const outputDirs = new Set<string>();
      const grepMatcher = createMatcher(config.grep);
      for (const project of projects) {
        for (const file of files.get(project)) {
          const fileSuite = fileSuites.get(file);
          if (!fileSuite)
            continue;
          for (const spec of fileSuite._allSpecs()) {
            if (grepMatcher(spec.fullTitle()))
              project.generateTests(spec);
          }
        }
        outputDirs.add(project.config.outputDir);
      }

      const total = rootSuite.totalTestCount();
      if (!total)
        return 'no-tests';

      await Promise.all(Array.from(outputDirs).map(outputDir => removeFolderAsync(outputDir).catch(e => {})));

      let sigint = false;
      let sigintCallback: () => void;
      const sigIntPromise = new Promise<void>(f => sigintCallback = f);
      const sigintHandler = () => {
        process.off('SIGINT', sigintHandler);
        sigint = true;
        sigintCallback();
      };
      process.on('SIGINT', sigintHandler);

      if (process.stdout.isTTY) {
        const workers = new Set();
        rootSuite.findTest(test => {
          workers.add(test.spec.file + test._workerHash);
        });
        console.log();
        const jobs = Math.min(config.workers, workers.size);
        const shard = config.shard;
        const shardDetails = shard ? `, shard ${shard.current + 1} of ${shard.total}` : '';
        console.log(`Running ${total} test${total > 1 ? 's' : ''} using ${jobs} worker${jobs > 1 ? 's' : ''}${shardDetails}`);
      }

      this._reporter.onBegin(config, rootSuite);
      this._didBegin = true;
      let hasWorkerErrors = false;
      if (!list) {
        const dispatcher = new Dispatcher(this._loader, rootSuite, this._reporter);
        await Promise.race([dispatcher.run(), sigIntPromise]);
        await dispatcher.stop();
        hasWorkerErrors = dispatcher.hasWorkerErrors();
      }
      this._reporter.onEnd();

      if (sigint)
        return 'sigint';
      return hasWorkerErrors || rootSuite.findSpec(spec => !spec.ok()) ? 'failed' : 'passed';
    } finally {
      if (config.globalTeardown)
        await this._loader.loadGlobalHook(config.globalTeardown)();
    }
  }
}

function filterOnly(suite: Suite) {
  const onlySuites = suite.suites.filter(child => filterOnly(child) || child._only);
  const onlyTests = suite.specs.filter(spec => spec._only);
  const onlyEntries = new Set([...onlySuites, ...onlyTests]);
  if (onlyEntries.size) {
    suite.suites = onlySuites;
    suite.specs = onlyTests;
    suite._entries = suite._entries.filter(e => onlyEntries.has(e)); // Preserve the order.
    return true;
  }
  return false;
}

async function collectFiles(testDir: string): Promise<string[]> {
  type Rule = {
    dir: string;
    negate: boolean;
    match: (s: string, partial?: boolean) => boolean
  };
  type IgnoreStatus = 'ignored' | 'included' | 'ignored-but-recurse';

  const checkIgnores = (entryPath: string, rules: Rule[], isDirectory: boolean, parentStatus: IgnoreStatus) => {
    let status = parentStatus;
    for (const rule of rules) {
      const ruleIncludes = rule.negate;
      if ((status === 'included') === ruleIncludes)
        continue;
      const relative = path.relative(rule.dir, entryPath);
      if (rule.match('/' + relative) || rule.match(relative)) {
        // Matches "/dir/file" or "dir/file"
        status = ruleIncludes ? 'included' : 'ignored';
      } else if (isDirectory && (rule.match('/' + relative + '/') || rule.match(relative + '/'))) {
        // Matches "/dir/subdir/" or "dir/subdir/" for directories.
        status = ruleIncludes ? 'included' : 'ignored';
      } else if (isDirectory && ruleIncludes && (rule.match('/' + relative, true) || rule.match(relative, true))) {
        // Matches "/dir/donotskip/" when "/dir" is excluded, but "!/dir/donotskip/file" is included.
        status = 'ignored-but-recurse';
      }
    }
    return status;
  };

  const files: string[] = [];

  const visit = async (dir: string, rules: Rule[], status: IgnoreStatus) => {
    const entries = await readDirAsync(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    const gitignore = entries.find(e => e.isFile() && e.name === '.gitignore');
    if (gitignore) {
      const content = await readFileAsync(path.join(dir, gitignore.name), 'utf8');
      const newRules: Rule[] = content.split(/\r?\n/).map(s => {
        s = s.trim();
        if (!s)
          return;
        // Use flipNegate, because we handle negation ourselves.
        const rule = new Minimatch(s, { matchBase: true, dot: true, flipNegate: true }) as any;
        if (rule.comment)
          return;
        rule.dir = dir;
        return rule;
      }).filter(rule => !!rule);
      rules = [...rules, ...newRules];
    }

    for (const entry of entries) {
      if (entry === gitignore || entry.name === '.' || entry.name === '..')
        continue;
      if (entry.isDirectory() && entry.name === 'node_modules')
        continue;
      const entryPath = path.join(dir, entry.name);
      const entryStatus = checkIgnores(entryPath, rules, entry.isDirectory(), status);
      if (entry.isDirectory() && entryStatus !== 'ignored')
        await visit(entryPath, rules, entryStatus);
      else if (entry.isFile() && entryStatus === 'included')
        files.push(entryPath);
    }
  };
  await visit(testDir, [], 'included');
  return files;
}
