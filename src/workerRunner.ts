/**
 * Copyright Microsoft Corporation. All rights reserved.
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

import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { monotonicTime, raceAgainstDeadline, serializeError } from './util';
import { TestBeginPayload, TestEndPayload, RunPayload, TestEntry, DonePayload, WorkerInitParams } from './ipc';
import { setCurrentTestInfo } from './globals';
import { Loader } from './loader';
import { Spec, Suite, Test } from './test';
import { FullConfig, TestInfo, WorkerInfo } from './types';
import { SkipError, SuiteDescription } from './spec';

export class WorkerRunner extends EventEmitter {
  private _params: WorkerInitParams;
  private _loader: Loader;
  private _suiteDescription: SuiteDescription;
  private _workerInfo: WorkerInfo;
  private _envInitialized = false;

  private _failedTestId: string | undefined;
  private _fatalError: any | undefined;
  private _entries: Map<string, TestEntry>;
  private _remaining: Map<string, TestEntry>;
  private _isStopped: any;
  _testId: string | null;
  private _testInfo: TestInfo | null = null;
  private _file: string;
  private _timeout: number;

  constructor(params: WorkerInitParams) {
    super();
    this._params = params;
  }

  stop() {
    this._isStopped = true;
    this._testId = null;
    this._setCurrentTestInfo(null);
  }

  async cleanup() {
    if (!this._envInitialized)
      return;
    this._envInitialized = false;
    if (this._suiteDescription.env.afterAll) {
      // TODO: separate timeout for afterAll?
      const result = await raceAgainstDeadline(this._suiteDescription.env.afterAll(this._workerInfo), this._deadline());
      if (result.timedOut)
        throw new Error(`Timeout of ${this._timeout}ms exceeded while shutting down environment`);
    }
  }

  unhandledError(error: Error | any) {
    if (this._isStopped)
      return;
    if (this._testInfo) {
      this._testInfo.status = 'failed';
      this._testInfo.error = serializeError(error);
      this._failedTestId = this._testId;
      this.emit('testEnd', buildTestEndPayload(this._testId, this._testInfo));
    } else {
      // No current test - fatal error.
      this._fatalError = serializeError(error);
    }
    this._reportDoneAndStop();
  }

  private _deadline() {
    return this._timeout ? monotonicTime() + this._timeout : 0;
  }

  private async _loadIfNeeded() {
    if (this._loader)
      return;

    this._loader = new Loader();
    this._loader.deserialize(this._params.loader);
    this._suiteDescription = this._loader.suites.get(this._params.suiteTitle);
    this._timeout = this._suiteDescription.config.timeout === undefined ? this._loader.config().timeout : this._suiteDescription.config.timeout;
    this._workerInfo = { workerIndex: this._params.workerIndex, config: this._loader.config() };

    if (this._isStopped)
      return;

    if (this._suiteDescription.env.beforeAll) {
      // TODO: separate timeout for beforeAll?
      const result = await raceAgainstDeadline(this._suiteDescription.env.beforeAll(this._workerInfo), this._deadline());
      if (result.timedOut) {
        this._fatalError = serializeError(new Error(`Timeout of ${this._timeout}ms exceeded while initializing environment`));
        this._reportDoneAndStop();
      }
    }
    this._envInitialized = true;
  }

  async run(runPayload: RunPayload) {
    this._file = runPayload.file;
    this._entries = new Map(runPayload.entries.map(e => [ e.testId, e ]));
    this._remaining = new Map(runPayload.entries.map(e => [ e.testId, e ]));

    await this._loadIfNeeded();
    if (this._isStopped)
      return;

    this._loader.loadTestFile(this._file);
    const fileSuite = this._suiteDescription.fileSuites.get(this._file);
    if (fileSuite) {
      fileSuite._renumber();
      fileSuite.findSpec(spec => {
        spec._appendTest(this._params.suiteTitle, this._params.repeatEachIndex);
      });
      await this._runSuite(fileSuite);
    }
    if (this._isStopped)
      return;
    this._reportDone();
  }

  private async _runSuite(suite: Suite) {
    if (this._isStopped)
      return;
    const skipHooks = !this._hasTestsToRun(suite);
    for (const hook of suite._hooks) {
      if (hook.type !== 'beforeAll' || skipHooks)
        continue;
      if (this._isStopped)
        return;
      // TODO: separate timeout for beforeAll?
      const result = await raceAgainstDeadline(hook.fn(this._workerInfo), this._deadline());
      if (result.timedOut) {
        this._fatalError = serializeError(new Error(`Timeout of ${this._timeout}ms exceeded while running beforeAll hook`));
        this._reportDoneAndStop();
      }
    }
    for (const entry of suite._entries) {
      if (entry instanceof Suite)
        await this._runSuite(entry);
      else
        await this._runSpec(entry);
    }
    for (const hook of suite._hooks) {
      if (hook.type !== 'afterAll' || skipHooks)
        continue;
      if (this._isStopped)
        return;
      // TODO: separate timeout for afterAll?
      const result = await raceAgainstDeadline(hook.fn(this._workerInfo), this._deadline());
      if (result.timedOut) {
        this._fatalError = serializeError(new Error(`Timeout of ${this._timeout}ms exceeded while running afterAll hook`));
        this._reportDoneAndStop();
      }
    }
  }

  private async _runSpec(spec: Spec) {
    if (this._isStopped)
      return;
    const test = spec.tests[0];
    if (!this._entries.has(test._id))
      return;
    const { retry } = this._entries.get(test._id);
    // TODO: support some of test.slow(), test.setTimeout(), describe.slow() and describe.setTimeout()
    const deadline = this._deadline();
    this._remaining.delete(test._id);

    const testId = test._id;
    this._testId = testId;

    const testInfo: TestInfo = {
      title: spec.title,
      file: spec.file,
      line: spec.line,
      column: spec.column,
      fn: spec.fn,
      repeatEachIndex: this._params.repeatEachIndex,
      workerIndex: this._params.workerIndex,
      retry,
      config: this._loader.config(),
      expectedStatus: 'passed',
      annotations: [],
      duration: 0,
      status: 'passed',
      stdout: [],
      stderr: [],
      timeout: this._timeout,
      data: {},
      relativeArtifactsPath: '',
      outputPath: () => '',
      snapshotPath: () => '',
      testOptions: spec.testOptions,
    };
    // Resolve artifacts and output paths.
    testInfo.relativeArtifactsPath = relativeArtifactsPath(this._loader.config(), testInfo, test.suiteTitle);
    testInfo.outputPath = outputPath(this._loader.config(), testInfo);
    testInfo.snapshotPath = snapshotPath(this._loader.config(), testInfo);
    this._setCurrentTestInfo(testInfo);

    // Preprocess suite annotations.
    for (let parent = spec.parent; parent; parent = parent.parent)
      testInfo.annotations.push(...parent._annotations);
    if (testInfo.annotations.some(a => a.type === 'skip' || a.type === 'fixme'))
      testInfo.expectedStatus = 'skipped';
    else if (testInfo.annotations.some(a => a.type === 'fail'))
      testInfo.expectedStatus = 'failed';

    this.emit('testBegin', buildTestBeginPayload(testId, testInfo));

    if (testInfo.expectedStatus === 'skipped') {
      testInfo.status = 'skipped';
      this.emit('testEnd', buildTestEndPayload(testId, testInfo));
      return;
    }

    const startTime = monotonicTime();

    const testArgsResult = await raceAgainstDeadline(this._runEnvBeforeEach(testInfo), deadline);
    if (testArgsResult.timedOut && testInfo.status === 'passed')
      testInfo.status = 'timedOut';
    if (this._isStopped)
      return;

    const testArgs = testArgsResult.result;
    // Do not run test/teardown if we failed to initialize.
    if (testArgs !== undefined) {
      const result = await raceAgainstDeadline(this._runTestWithBeforeHooks(test, testInfo, testArgs), deadline);
      // Do not overwrite test failure upon hook timeout.
      if (result.timedOut && testInfo.status === 'passed')
        testInfo.status = 'timedOut';
      if (this._isStopped)
        return;

      if (!result.timedOut) {
        const hooksResult = await raceAgainstDeadline(this._runAfterHooks(test, testInfo, testArgs), deadline);
        // Do not overwrite test failure upon hook timeout.
        if (hooksResult.timedOut && testInfo.status === 'passed')
          testInfo.status = 'timedOut';
      } else {
        // A timed-out test gets a full additional timeout to run after hooks.
        const newDeadline = this._deadline();
        await raceAgainstDeadline(this._runAfterHooks(test, testInfo, testArgs), newDeadline);
      }
    }
    if (this._isStopped)
      return;

    testInfo.duration = monotonicTime() - startTime;
    this.emit('testEnd', buildTestEndPayload(testId, testInfo));
    if (testInfo.status !== 'passed') {
      this._failedTestId = this._testId;
      this._reportDoneAndStop();
    }
    this._setCurrentTestInfo(null);
    this._testId = null;
  }

  private _setCurrentTestInfo(testInfo: TestInfo | null) {
    this._testInfo = testInfo;
    setCurrentTestInfo(testInfo);
  }

  // Returns TestArgs or undefined when env.beforeEach has failed.
  private async _runEnvBeforeEach(testInfo: TestInfo): Promise<any> {
    try {
      let testArgs: any = {};
      if (this._suiteDescription.env.beforeEach)
        testArgs = await this._suiteDescription.env.beforeEach(testInfo);
      if (testArgs === undefined)
        testArgs = {};
      return testArgs;
    } catch (error) {
      testInfo.status = 'failed';
      testInfo.error = serializeError(error);
      // Failed to initialize environment - no need to run any hooks now.
      return undefined;
    }
  }

  private async _runTestWithBeforeHooks(test: Test, testInfo: TestInfo, testArgs: any) {
    try {
      await this._runHooks(test.spec.parent, 'beforeEach', testArgs, testInfo);
    } catch (error) {
      if (error instanceof SkipError) {
        testInfo.status = 'skipped';
      } else {
        testInfo.status = 'failed';
        testInfo.error = serializeError(error);
      }
      // Continue running afterEach hooks even after the failure.
    }

    // Do not run the test when beforeEach hook fails.
    if (this._isStopped || testInfo.status === 'failed' || testInfo.status === 'skipped')
      return;

    try {
      await test.spec.fn(testArgs, testInfo);
      testInfo.status = 'passed';
    } catch (error) {
      if (error instanceof SkipError) {
        testInfo.status = 'skipped';
      } else {
        testInfo.status = 'failed';
        testInfo.error = serializeError(error);
      }
    }
  }

  private async _runAfterHooks(test: Test, testInfo: TestInfo, testArgs: any) {
    try {
      await this._runHooks(test.spec.parent, 'afterEach', testArgs, testInfo);
    } catch (error) {
      // Do not overwrite test failure error.
      if (!(error instanceof SkipError) && testInfo.status === 'passed') {
        testInfo.status = 'failed';
        testInfo.error = serializeError(error);
        // Continue running even after the failure.
      }
    }
    try {
      if (this._suiteDescription.env.afterEach)
        await this._suiteDescription.env.afterEach(testInfo);
    } catch (error) {
      // Do not overwrite test failure error.
      if (testInfo.status === 'passed') {
        testInfo.status = 'failed';
        testInfo.error = serializeError(error);
      }
    }
  }

  private async _runHooks(suite: Suite, type: 'beforeEach' | 'afterEach', testArgs: any, testInfo: TestInfo) {
    if (this._isStopped)
      return;
    const all = [];
    for (let s = suite; s; s = s.parent) {
      const funcs = s._hooks.filter(e => e.type === type).map(e => e.fn);
      all.push(...funcs.reverse());
    }
    if (type === 'beforeEach')
      all.reverse();
    let error: Error | undefined;
    for (const hook of all) {
      try {
        await hook(testArgs, testInfo);
      } catch (e) {
        // Always run all the hooks, and capture the first error.
        error = error || e;
      }
    }
    if (error)
      throw error;
  }

  private _reportDone() {
    const donePayload: DonePayload = {
      failedTestId: this._failedTestId,
      fatalError: this._fatalError,
      remaining: [...this._remaining.values()],
    };
    this.emit('done', donePayload);
  }

  private _reportDoneAndStop() {
    if (this._isStopped)
      return;
    this._reportDone();
    this.stop();
  }

  private _hasTestsToRun(suite: Suite): boolean {
    return suite.findSpec(spec => {
      const entry = this._entries.get(spec.tests[0]._id);
      if (!entry)
        return;
      for (let parent = spec.parent; parent; parent = parent.parent) {
        if (parent._annotations.some(a => a.type === 'skip' || a.type === 'fixme'))
          return;
      }
      return true;
    });
  }
}

function buildTestBeginPayload(testId: string, testInfo: TestInfo): TestBeginPayload {
  return {
    testId,
    workerIndex: testInfo.workerIndex
  };
}

function buildTestEndPayload(testId: string, testInfo: TestInfo): TestEndPayload {
  return {
    testId,
    duration: testInfo.duration,
    status: testInfo.status!,
    error: testInfo.error,
    data: testInfo.data,
    expectedStatus: testInfo.expectedStatus,
    annotations: testInfo.annotations,
    timeout: testInfo.timeout,
  };
}

function relativeArtifactsPath(config: FullConfig, testInfo: TestInfo, suitePathSegment: string) {
  const relativePath = path.relative(config.testDir, testInfo.file.replace(/\.(spec|test)\.(js|ts)/, ''));
  const sanitizedTitle = testInfo.title.replace(/[^\w\d]+/g, '-');
  return path.join(relativePath, sanitizedTitle, suitePathSegment);
}

function outputPath(config: FullConfig, testInfo: TestInfo): (...pathSegments: string[]) => string {
  const retrySuffix = testInfo.retry ? '-retry' + testInfo.retry : '';
  const repeatEachSuffix = testInfo.repeatEachIndex ? '-repeat' + testInfo.repeatEachIndex : '';
  const basePath = path.join(config.outputDir, testInfo.relativeArtifactsPath) + retrySuffix + repeatEachSuffix;
  return (...pathSegments: string[]): string => {
    fs.mkdirSync(basePath, { recursive: true });
    return path.join(basePath, ...pathSegments);
  };
}

function snapshotPath(config: FullConfig, testInfo: TestInfo): (...pathSegments: string[]) => string {
  const basePath = path.join(config.testDir, config.snapshotDir, testInfo.relativeArtifactsPath);
  return (...pathSegments: string[]): string => {
    return path.join(basePath, ...pathSegments);
  };
}
