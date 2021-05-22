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
import * as path from 'path';

const tests = {
  'a.test.ts': `
    const { test } = folio;
    test('pass', ({}) => {});
  `,
  'b.test.ts': `
    const { test } = folio;
    test('pass', ({}) => {});
  `,
  'c.test.ts': `
    const { test } = folio;
    test('pass', ({}) => {});
  `
};

test('should run all three tests', async ({ runInlineTest }) => {
  const result = await runInlineTest(tests);
  expect(result.passed).toBe(3);
  expect(result.exitCode).toBe(0);
});

test('should ignore a test', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    ...tests,
    'folio.config.ts': `
      module.exports = { testIgnore: 'b.test.ts' };
    `,
  });
  expect(result.passed).toBe(2);
  expect(result.exitCode).toBe(0);
});

test('should ignore a folder', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      module.exports = { testIgnore: 'folder/**' };
    `,
    'a.test.ts': `
      const { test } = folio;
      test('pass', ({}) => {});
    `,
    'folder/a.test.ts': `
      const { test } = folio;
      test('pass', ({}) => {});
    `,
    'folder/b.test.ts': `
      const { test } = folio;
      test('pass', ({}) => {});
    `,
    'folder/c.test.ts': `
      const { test } = folio;
      test('pass', ({}) => {});
    `
  });
  expect(result.passed).toBe(1);
  expect(result.exitCode).toBe(0);
});

test('should ignore a node_modules', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.test.ts': `
      const { test } = folio;
      test('pass', ({}) => {});
    `,
    'node_modules/a.test.ts': `
      const { test } = folio;
      test('pass', ({}) => {});
    `,
    'node_modules/b.test.ts': `
      const { test } = folio;
      test('pass', ({}) => {});
    `,
    'folder/c.test.ts': `
      const { test } = folio;
      test('pass', ({}) => {});
    `
  });
  expect(result.passed).toBe(2);
  expect(result.exitCode).toBe(0);
});

test('should filter tests', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    ...tests,
    'folio.config.ts': `
      module.exports = { testIgnore: 'c.test.*' };
    `,
  });
  expect(result.passed).toBe(2);
  expect(result.exitCode).toBe(0);
});

test('should use a different test match', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    ...tests,
    'folio.config.ts': `
      module.exports = { testMatch: '[a|b].test.ts' };
    `,
  });
  expect(result.passed).toBe(2);
  expect(result.exitCode).toBe(0);
});

test('should use an array for testMatch', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      module.exports = { testMatch: ['b.test.ts', /\\${path.sep}a.[tes]{4}.TS$/i] };
    `,
    'dir/a.test.ts': `
      const { test } = folio;
      test('pass', ({}) => {});
    `,
    'b.test.ts': `
      const { test } = folio;
      test('pass', ({}) => {});
    `,
    'c.test.ts': `
      const { test } = folio;
      test('pass', ({}) => {});
    `
  });
  expect(result.passed).toBe(2);
  expect(result.report.suites.map(s => s.file).sort()).toEqual(['b.test.ts', 'dir/a.test.ts']);
  expect(result.exitCode).toBe(0);
});

test('should match absolute path', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      import * as path from 'path';
      module.exports = { testDir: path.join(__dirname, 'dir'), testMatch: /dir\\${path.sep}a/ };
    `,
    'dir/a.test.ts': `
      const { test } = folio;
      test('pass', ({}) => {});
    `,
    'dir/b.test.ts': `
      const { test } = folio;
      test('pass', ({}) => {});
    `,
    'a.test.ts': `
      const { test } = folio;
      test('pass', ({}) => {});
    `
  });
  expect(result.passed).toBe(1);
  expect(result.report.suites.map(s => s.file).sort()).toEqual(['a.test.ts']);
  expect(result.exitCode).toBe(0);
});

test('should match cli string argument', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      import * as path from 'path';
      module.exports = { testDir: path.join(__dirname, 'dir') };
    `,
    'dir/a.test.ts': `
      const { test } = folio;
      test('pass', ({}) => {});
    `,
    'dir/b.test.ts': `
      const { test } = folio;
      test('pass', ({}) => {});
    `,
    'a.test.ts': `
      const { test } = folio;
      test('pass', ({}) => {});
    `
  }, { args: [`dir\\${path.sep}a`] });
  expect(result.passed).toBe(1);
  expect(result.report.suites.map(s => s.file).sort()).toEqual(['a.test.ts']);
  expect(result.exitCode).toBe(0);
});

test('should match regex string argument', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'dir/filea.test.ts': `
      const { test } = folio;
      test('pass', ({}) => {});
    `,
    'dir/fileb.test.ts': `
      const { test } = folio;
      test('pass', ({}) => {});
    `,
    'filea.test.ts': `
      const { test } = folio;
      test('pass', ({}) => {});
    `
  }, { args: ['/filea.*ts/'] });
  expect(result.passed).toBe(2);
  expect(result.report.suites.map(s => s.file).sort()).toEqual(['dir/filea.test.ts', 'filea.test.ts']);
  expect(result.exitCode).toBe(0);
});
