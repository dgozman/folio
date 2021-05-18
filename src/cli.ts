/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as commander from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { Runner } from './runner';
import { FullConfig } from './types';
import { Loader } from './loader';
import { ConfigOverrides } from './types';

const availableReporters = new Set(['dot', 'json', 'junit', 'line', 'list', 'null']);

const defaultConfig: FullConfig = {
  forbidOnly: false,
  globalSetup: null,
  globalTeardown: null,
  globalTimeout: 0,
  grep: /.*/,
  maxFailures: 0,
  preserveOutput: process.env.CI ? 'failures-only' : 'always',
  reporter: [process.env.CI ? 'dot' : 'list'],
  rootDir: path.resolve(process.cwd()),
  quiet: false,
  shard: null,
  updateSnapshots: process.env.CI ? 'none' : 'missing',
  workers: Math.ceil(require('os').cpus().length / 2),
};

const program = new commander.Command();
program.name('folio');
program.helpOption(false);
program.allowUnknownOption();
const builtinOptions = new Set(addRunnerOptions(program));
program.parse(process.argv);
(async () => {
  try {
    await runTests();
  } catch (e) {
    console.error(e.toString());
    process.exit(1);
  }
})();

async function runTests() {
  const opts = program.opts();
  const extraOptions: string[] = [];

  const loader = new Loader(defaultConfig, configFromCommand(opts), cliOption => {
    if (cliOption.name.length <= 1)
      throw new Error(`CLI option "${cliOption.name}" is too short`);
    if (builtinOptions.has(cliOption.name))
      throw new Error(`CLI option "${cliOption.name}" is reserved`);
    switch (cliOption.type) {
      case 'boolean':
        program.option(`--${cliOption.name}`, cliOption.description);
        break;
      case 'string':
        program.option(`--${cliOption.name} <value>`, cliOption.description);
        break;
      case 'list':
        program.option(`--${cliOption.name} <values...>`, cliOption.description);
        break;
    }
    extraOptions.push(cliOption.name);
    program.parse(process.argv);
    return program.opts()[cliOption.name];
  });

  const help = opts.help === undefined;

  function loadConfig(configName: string) {
    const configFile = path.resolve(process.cwd(), configName);
    if (fs.existsSync(configFile)) {
      loader.loadConfigFile(configFile);
      return true;
    }
    return false;
  }
  if (opts.config) {
    if (!loadConfig(opts.config))
      throw new Error(`${opts.config} does not exist`);
  } else if (!loadConfig('folio.config.ts') && !loadConfig('folio.config.js') && !help) {
    throw new Error(`Configuration file not found. Either pass --config, or create folio.config.(js|ts) file`);
  }

  if (help) {
    const lines = program.helpInformation().split('\n');
    const builtinHelp: string[] = [];
    const extraHelp: string[] = [];
    for (const line of lines.slice(3)) {
      if (extraOptions.some(e => line.includes('--' + e)))
        extraHelp.push(line);
      else
        builtinHelp.push(line);
    }
    lines.splice(2, lines.length - 2);
    if (extraHelp.length) {
      lines.push(`Test suite options:`);
      lines.push(...extraHelp);
      lines.push('');
      lines.push(`Folio options:`);
    } else {
      lines.push(`Options:`);
    }
    lines.push(...builtinHelp);
    console.log(lines.join('\n'));
    process.exit(0);
  }

  program.allowUnknownOption(false);
  program.parse(process.argv);

  const runner = new Runner(loader);
  const result = await runner.run(!!opts.list, program.args, opts.project || undefined);

  // Calling process.exit() might truncate large stdout/stderr output.
  // See https://github.com/nodejs/node/issues/6456.
  //
  // We can use writableNeedDrain to workaround this, but it is only available
  // since node v15.2.0.
  // See https://nodejs.org/api/stream.html#stream_writable_writableneeddrain.
  if ((process.stdout as any).writableNeedDrain)
    await new Promise(f => process.stdout.on('drain', f));
  if ((process.stderr as any).writableNeedDrain)
    await new Promise(f => process.stderr.on('drain', f));

  if (result === 'sigint')
    process.exit(130);
  if (result === 'forbid-only') {
    console.error('=====================================');
    console.error(' --forbid-only found a focused test.');
    console.error('=====================================');
    process.exit(1);
  }
  if (result === 'no-tests') {
    console.error('=================');
    console.error(' no tests found.');
    console.error('=================');
    process.exit(1);
  }
  process.exit(result === 'failed' ? 1 : 0);
}

function addRunnerOptions(program: commander.Command) {
  program = program
      .version('Folio version ' + /** @type {any} */ (require)('../package.json').version, '-v, --version', 'Output the version number')
      .option('-c, --config <file>', `Configuration file (default: "folio.config.ts" or "folio.config.js")`)
      .option('--forbid-only', `Fail if exclusive test(s) encountered (default: ${defaultConfig.forbidOnly})`)
      .option('-g, --grep <grep>', `Only run tests matching this regular expression (default: "${defaultConfig.grep}")`)
      .option('--global-timeout <timeout>', `Maximum time this test suite can run in milliseconds (default: 0 for unlimited)`)
      .option('-h, --help', `Display help`)
      .option('-j, --workers <workers>', `Number of concurrent workers, use 1 to run in single worker (default: number of CPU cores / 2)`)
      .option('--list', `Only collect all the test and report them`)
      .option('--max-failures <N>', `Stop after the first N failures (default: ${defaultConfig.maxFailures})`)
      .option('--output <dir>', `Folder for output artifacts (default: "test-results")`)
      .option('--quiet', `Suppress stdio`)
      .option('--repeat-each <repeat-each>', `Specify how many times to run the tests (default: 1)`)
      .option('--reporter <reporter>', `Specify reporter to use, comma-separated, can be ${availableReporters} (default: "${process.env.CI ? 'dot' : 'line'}")`)
      .option('--retries <retries>', `Specify retry count (default: 0)`)
      .option('--shard <shard>', `Shard tests and execute only selected shard, specify in the form "current/all", 1-based, for example "3/5"`)
      .option('--project <project-name>', `Only run tests from the specified project (default: run all projects)`)
      .option('--timeout <timeout>', `Specify test timeout threshold in milliseconds (default: 10000)`)
      .option('-u, --update-snapshots', `Update snapshots with actual results (default: ${defaultConfig.updateSnapshots})`)
      .option('-x', `Stop after the first failure`);
  return program.options.filter(o => !!o.long).map(o => o.long.substring(2));
}

function configFromCommand(command: any): ConfigOverrides {
  const config: ConfigOverrides = {};
  if (command.forbidOnly)
    config.forbidOnly = true;
  if (command.globalTimeout)
    config.globalTimeout = parseInt(command.globalTimeout, 10);
  if (command.grep)
    config.grep = forceRegExp(command.grep);
  if (command.maxFailures || command.x)
    config.maxFailures = command.x ? 1 : parseInt(command.maxFailures, 10);
  if (command.output)
    config.outputDir = path.resolve(process.cwd(), command.output);
  if (command.quiet)
    config.quiet = command.quiet;
  if (command.repeatEach)
    config.repeatEach = parseInt(command.repeatEach, 10);
  if (command.retries)
    config.retries = parseInt(command.retries, 10);
  if (command.reporter && command.reporter.length)
    config.reporter = command.reporter.split(',');
  if (command.shard) {
    const pair = command.shard.split('/').map((t: string) => parseInt(t, 10));
    config.shard = { current: pair[0] - 1, total: pair[1] };
  }
  if (command.timeout)
    config.timeout = parseInt(command.timeout, 10);
  if (command.updateSnapshots)
    config.updateSnapshots = 'all';
  if (command.workers)
    config.workers = parseInt(command.workers, 10);
  return config;
}

function forceRegExp(pattern: string): RegExp {
  const match = pattern.match(/^\/(.*)\/([gi]*)$/);
  if (match)
    return new RegExp(match[1], match[2]);
  return new RegExp(pattern, 'g');
}
