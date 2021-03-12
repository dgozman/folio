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

it('should create two suites with different options', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'fixtures.ts': `
      async function foo({ testInfo }, run, options) {
        await run(options || 'foo');
      }
      export const toBeRenamed = { testFixtures: { foo } };
    `,
    'a.test.ts': `
      test('test', ({ testInfo, foo }) => {
        expect(foo).toBe('foo');
      });
      const test1 = createTest({ foo: 'bar' });
      test1('test1', ({ testInfo, foo }) => {
        expect(foo).toBe('bar');
      });
      const test2 = createTest({ foo: 'baz' });
      test2('test2', ({ testInfo, foo }) => {
        expect(foo).toBe('baz');
      });
    `
  });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(3);
});
