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

import { test, expect } from './folio-test';

test('should access error in env', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'test-error-visible-in-env.spec.ts': `
      const test = folio.test.extend({
        async afterEach({}, testInfo) {
          console.log('ERROR[[[' + JSON.stringify(testInfo.error, undefined, 2) + ']]]');
        }
      });
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

test('should access data in env', async ({ runInlineTest }) => {
  const { exitCode, report } = await runInlineTest({
    'test-data-visible-in-env.spec.ts': `
      const test = folio.test.extend({
        async afterEach({}, testInfo) {
          testInfo.data['myname'] = 'myvalue';
        }
      });
      test('ensure env can set data', async ({}, testInfo) => {
        console.log('console.log');
        console.error('console.error');
        expect(testInfo.config.rootDir).toBeTruthy();
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

test('should report projectName in result', async ({ runInlineTest }) => {
  const { exitCode, report } = await runInlineTest({
    'folio.config.ts': `
      module.exports = {
        projects: [
          { name: 'foo' },
          {},
        ],
      };
    `,
    'test-data-visible-in-env.spec.ts': `
      folio.test('some test', async ({}, testInfo) => {
      });
    `
  });
  expect(report.suites[0].specs[0].tests[0].projectName).toBe('foo');
  expect(report.suites[0].specs[0].tests[1].projectName).toBe('');
  expect(exitCode).toBe(0);
});
