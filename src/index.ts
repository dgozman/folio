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

export { expect } from './expect';
import { TestInfo } from './fixtures';
import { rootFixtures, WorkerFixtures, TestFixtures } from './spec';
export { Fixtures, WorkerFixtures, TestFixtures } from './spec';
export { Config } from './config';
export { config, TestInfo, currentTestInfo } from './fixtures';

type W = WorkerFixtures<typeof rootFixtures> & {
  // Worker index that runs this test.
  testWorkerIndex: number;
};

type T = TestFixtures<typeof rootFixtures> & W & {
  // Information about the test being run.
  testInfo: TestInfo;
  // Parameter-based relative path to be overridden, empty by default.
  testParametersPathSegment: string;
};

async function* testWorkerIndex(params: W) {
  // Worker injects the value for this one.
  yield 0;
}

async function* testInfo(params: T) {
  // Worker injects the value for this one.
  yield undefined as TestInfo;
}

async function* testParametersPathSegment({}: T) {
  yield '';
}

export const fixtures = rootFixtures
    .defineWorkerFixtures({ testWorkerIndex })
    .defineTestFixtures({ testInfo, testParametersPathSegment });
