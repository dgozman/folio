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

import { expect } from './expect';
import { currentTestInfo } from './env';
import { Spec, Suite } from './test';
import { callLocation, errorWithCallLocation, interpretCondition } from './util';

Error.stackTraceLimit = 15;

let currentFile: string | undefined;

export function setCurrentFile(file: string) {
  currentFile = file;
}
export function clearCurrentFile() {
  currentFile = undefined;
}

export type SuiteDescription = {
  fileSuites: Map<string, Suite>;
  env: any;
  timeout?: number;
};

const allSuiteDescriptions = new Set<SuiteDescription>();
export function isSuiteDescription(d: any) {
  return allSuiteDescriptions.has(d);
}

function mergeEnvs(envs: any[]): any {
  if (envs.length === 1)
    return envs[0];
  const forward = [...envs];
  const backward = [...forward].reverse();
  return {
    beforeAll: async () => {
      for (const env of forward) {
        if (env.beforeAll)
          await env.beforeAll();
      }
    },
    afterAll: async () => {
      for (const env of backward) {
        if (env.afterAll)
          await env.afterAll();
      }
    },
    beforeEach: async () => {
      let result = undefined;
      for (const env of forward) {
        if (env.beforeEach) {
          const r = await env.beforeEach();
          result = result === undefined ? r : { ...result, ...r };
        }
      }
      return result;
    },
    afterEach: async () => {
      for (const env of backward) {
        if (env.afterEach)
          await env.afterEach();
      }
    },
  };
}

export function newTestTypeImpl(): any {
  const fileSuites = new Map<string, Suite>();
  let suites: Suite[] = [];

  function ensureSuiteForCurrentLocation() {
    const location = callLocation(currentFile);
    let fileSuite = fileSuites.get(location.file);
    if (!fileSuite) {
      fileSuite = new Suite('');
      fileSuite.file = location.file;
      fileSuites.set(location.file, fileSuite);
    }
    if (suites[suites.length - 1] !== fileSuite)
      suites = [fileSuite];
    return location;
  }

  function spec(type: 'default' | 'only', title: string, options: Function | any, fn?: Function) {
    if (!currentFile)
      throw errorWithCallLocation(`Test can only be defined in a test file.`);
    const location = ensureSuiteForCurrentLocation();

    if (typeof fn !== 'function') {
      fn = options;
      options = {};
    }
    const spec = new Spec(title, fn, suites[0]);
    spec.file = location.file;
    spec.line = location.line;
    spec.column = location.column;
    spec.testOptions = options;

    if (type === 'only')
      spec._only = true;
  }

  function describe(type: 'default' | 'only', title: string, fn: Function) {
    if (!currentFile)
      throw errorWithCallLocation(`Suite can only be defined in a test file.`);
    const location = ensureSuiteForCurrentLocation();

    const child = new Suite(title, suites[0]);
    child.file = location.file;
    child.line = location.line;
    child.column = location.column;

    if (type === 'only')
      child._only = true;

    suites.unshift(child);
    fn();
    suites.shift();
  }

  function hook(name: string, fn: Function) {
    if (!currentFile)
      throw errorWithCallLocation(`Hook can only be defined in a test file.`);
    suites[0]._addHook(name, fn);
  }

  const modifier = (type: 'skip' | 'fail' | 'fixme', arg?: boolean | string, description?: string) => {
    const processed = interpretCondition(arg, description);
    if (!processed.condition)
      return;

    if (currentFile) {
      suites[0]._annotations.push({ type, description: processed.description });
      return;
    }

    const testInfo = currentTestInfo();
    if (!testInfo)
      throw new Error(`test.${type} can only be called inside the test`);

    testInfo.annotations.push({ type, description: processed.description });
    if (type === 'skip' || type === 'fixme') {
      testInfo.expectedStatus = 'skipped';
      throw new SkipError(processed.description);
    } else if (type === 'fail') {
      if (testInfo.expectedStatus !== 'skipped')
        testInfo.expectedStatus = 'failed';
    }
  };

  const test: any = spec.bind(null, 'default');
  test.expect = expect;
  test.only = spec.bind(null, 'only');
  test.describe = describe.bind(null, 'default');
  test.describe.only = describe.bind(null, 'only');
  test.beforeEach = hook.bind(null, 'beforeEach');
  test.afterEach = hook.bind(null, 'afterEach');
  test.beforeAll = hook.bind(null, 'beforeAll');
  test.afterAll = hook.bind(null, 'afterAll');
  test.skip = modifier.bind(null, 'skip');
  test.fixme = modifier.bind(null, 'fixme');
  test.fail = modifier.bind(null, 'fail');
  test.runWith = (...envs: any[]): SuiteDescription => {
    let options = envs[envs.length - 1];
    if (!envs.length || options.beforeAll || options.beforeEach || options.afterAll || options.afterEach)
      options = {};
    else
      envs.pop();
    const description = {
      fileSuites,
      env: mergeEnvs(envs),
      timeout: options.timeout,
    };
    allSuiteDescriptions.add(description);
    return description;
  };
  return test;
}

export class SkipError extends Error {
}
