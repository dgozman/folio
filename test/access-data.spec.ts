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

import { folio } from './fixtures';
const { it, expect } = folio;

it('should access error in env', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      const { newTestType } = folio;
      class MyEnv {
        async afterEach(testInfo) {
          console.log('ERROR[[[' + JSON.stringify(testInfo.error, undefined, 2) + ']]]');
        }
      }
      export const test = newTestType();
      export const suite = test.runWith(new MyEnv());
    `,
    'test-error-visible-in-env.spec.ts': `
      import { test } from './folio.config';
      test('ensure env handles test error', async ({}) => {
        expect(true).toBe(false);
      });
    `
  }, {});
  expect(result.exitCode).toBe(1);
  const start = result.output.indexOf('ERROR[[[') + 8;
  const end = result.output.indexOf(']]]');
  const data = JSON.parse(result.output.substring(start, end));
  expect(data.message).toContain('Object.is equality');
});

it('should access data in env', async ({ runInlineTest }) => {
  const { exitCode, report } = await runInlineTest({
    'folio.config.ts': `
      const { newTestType } = folio;
      class MyEnv {
        async afterEach(testInfo) {
          testInfo.data['myname'] = 'myvalue';
        }
      }
      export const test = newTestType();
      export const suite = test.runWith(new MyEnv());
    `,
    'test-data-visible-in-env.spec.ts': `
      import { test } from './folio.config';
      test('ensure env can set data', async ({}, testInfo) => {
        console.log('console.log');
        console.error('console.error');
        expect(testInfo.config.testDir).toBeTruthy();
        expect(testInfo.file).toContain('test-data-visible-in-env');
      });
    `
  });
  expect(exitCode).toBe(0);
  const testResult = report.suites[0].specs[0].tests[0].results[0];
  expect(testResult.data).toEqual({ 'myname': 'myvalue' });
  expect(testResult.stdout).toEqual([{ text: 'console.log\n' }]);
  expect(testResult.stderr).toEqual([{ text: 'console.error\n' }]);
});
