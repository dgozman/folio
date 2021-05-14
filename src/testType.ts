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
import { currentlyLoadingFileSuite, currentTestInfo, setCurrentlyLoadingFileSuite } from './globals';
import { Spec, Suite } from './test';
import { callLocation, errorWithCallLocation } from './util';
import { Env, TestInfo, TestType } from './types';

Error.stackTraceLimit = 15;

const countByFile = new Map<string, number>();

export class TestTypeImpl {
  readonly children = new Set<TestTypeImpl>();
  readonly parent: TestTypeImpl | undefined;
  readonly envs: (Env | DeclaredEnv)[];
  readonly test: TestType<any, any, any>;

  constructor(envs: (Env | DeclaredEnv)[], parent: TestTypeImpl | undefined) {
    this.envs = envs;
    this.parent = parent;

    const test: any = this._spec.bind(this, 'default');
    test.expect = expect;
    test.only = this._spec.bind(this, 'only');
    test.describe = this._describe.bind(this, 'default');
    test.describe.only = this._describe.bind(this, 'only');
    test.beforeEach = this._hook.bind(this, 'beforeEach');
    test.afterEach = this._hook.bind(this, 'afterEach');
    test.beforeAll = this._hook.bind(this, 'beforeAll');
    test.afterAll = this._hook.bind(this, 'afterAll');
    test.skip = this._modifier.bind(this, 'skip');
    test.fixme = this._modifier.bind(this, 'fixme');
    test.fail = this._modifier.bind(this, 'fail');
    test.slow = this._modifier.bind(this, 'slow');
    test.setTimeout = this._setTimeout.bind(this);
    test.useOptions = this._useOptions.bind(this);
    test.extend = this._extend.bind(this);
    test.declare = this._declare.bind(this);
    this.test = test;
  }

  private _spec(type: 'default' | 'only', title: string, fn: Function) {
    const suite = currentlyLoadingFileSuite();
    if (!suite)
      throw errorWithCallLocation(`Test can only be defined in a test file.`);
    const location = callLocation(suite.file);

    const ordinalInFile = countByFile.get(suite.file) || 0;
    countByFile.set(location.file, ordinalInFile + 1);

    const spec = new Spec(title, fn, ordinalInFile, this);
    spec.file = location.file;
    spec.line = location.line;
    spec.column = location.column;
    suite._addSpec(spec);

    if (type === 'only')
      spec._only = true;
  }

  private _describe(type: 'default' | 'only', title: string, fn: Function) {
    const suite = currentlyLoadingFileSuite();
    if (!suite)
      throw errorWithCallLocation(`Suite can only be defined in a test file.`);
    const location = callLocation(suite.file);

    const child = new Suite(title);
    child.file = suite.file;
    child.line = location.line;
    child.column = location.column;
    suite._addSuite(child);

    if (type === 'only')
      child._only = true;

    setCurrentlyLoadingFileSuite(child);
    fn();
    setCurrentlyLoadingFileSuite(suite);
  }

  private _hook(name: string, fn: Function) {
    const suite = currentlyLoadingFileSuite();
    if (!suite)
      throw errorWithCallLocation(`Hook can only be defined in a test file.`);
    suite._hooks.push({ type: name, fn });
  }

  private _modifier(type: 'skip' | 'fail' | 'fixme' | 'slow', arg?: boolean | string | Function, description?: string) {
    const suite = currentlyLoadingFileSuite();
    if (suite) {
      const fn = (args: any, testInfo: TestInfo) => (testInfo[type] as any)(arg, description);
      suite._hooks.unshift({ type: 'beforeEach', fn });
      return;
    }

    const testInfo = currentTestInfo();
    if (!testInfo)
      throw new Error(`test.${type} can only be called inside the test`);
    (testInfo[type] as any)(arg, description);
  }

  private _setTimeout(timeout: number) {
    const testInfo = currentTestInfo();
    if (!testInfo)
      throw new Error(`test.setTimeout() can only be called inside the test`);
    testInfo.setTimeout(timeout);
  }

  private _useOptions(options: any) {
    const suite = currentlyLoadingFileSuite();
    if (!suite)
      throw errorWithCallLocation(`useOptions() can only be called in a test file.`);
    suite._options = { ...suite._options, ...options };
  }

  private _extend(env?: Env) {
    const child = new TestTypeImpl([...this.envs, env || {}], this);
    this.children.add(child);
    return child.test;
  }

  private _declare() {
    const declared = new DeclaredEnv();
    const child = new TestTypeImpl([...this.envs, declared], this);
    declared.testType = child;
    this.children.add(child);
    return child.test;
  }
}

export class DeclaredEnv {
  testType: TestTypeImpl;
}

export const rootTestType = new TestTypeImpl([], undefined);
