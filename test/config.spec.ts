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

import * as fs from 'fs';
import * as path from 'path';
import { test, expect } from './folio-test';

test('should be able to define config', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      module.exports = { timeout: 12345 };
    `,
    'a.test.ts': `
      const { test } = folio;
      test('pass', async ({}, testInfo) => {
        expect(testInfo.timeout).toBe(12345);
      });
    `
  });

  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
});

test('should prioritize project timeout', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      module.exports = { timeout: 500, projects: [{ timeout: 10000}, {}] };
    `,
    'a.test.ts': `
      const { test } = folio;
      test('pass', async ({}, testInfo) => {
        await new Promise(f => setTimeout(f, 1500));
      });
    `
  });

  expect(result.exitCode).toBe(1);
  expect(result.passed).toBe(1);
  expect(result.failed).toBe(1);
  expect(result.output).toContain('Timeout of 500ms exceeded.');
});

test('should prioritize command line timeout over project timeout', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      module.exports = { projects: [{ timeout: 10000}] };
    `,
    'a.test.ts': `
      const { test } = folio;
      test('pass', async ({}, testInfo) => {
        await new Promise(f => setTimeout(f, 1500));
      });
    `
  }, { timeout: '500' });

  expect(result.exitCode).toBe(1);
  expect(result.failed).toBe(1);
  expect(result.output).toContain('Timeout of 500ms exceeded.');
});

test('should read config from --config', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'my.config.ts': `
      import * as path from 'path';
      module.exports = {
        testDir: path.join(__dirname, 'dir'),
      };
    `,
    'a.test.ts': `
      const { test } = folio;
      test('ignored', async ({}) => {
      });
    `,
    'dir/b.test.ts': `
      const { test } = folio;
      test('run', async ({}) => {
      });
    `,
  }, { config: 'my.config.ts' });

  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
  expect(result.report.suites.length).toBe(1);
  expect(result.report.suites[0].file).toBe('b.test.ts');
});

test('should default testDir to the config file', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'dir/my.config.ts': `
      module.exports = {};
    `,
    'a.test.ts': `
      const { test } = folio;
      test('ignored', async ({}) => {
      });
    `,
    'dir/b.test.ts': `
      const { test } = folio;
      test('run', async ({}) => {
      });
    `,
  }, { config: path.join('dir', 'my.config.ts') });

  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
  expect(result.report.suites.length).toBe(1);
  expect(result.report.suites[0].file).toBe('b.test.ts');
});

test('should be able to set reporters', async ({ runInlineTest }, testInfo) => {
  const reportFile = testInfo.outputPath('my-report.json');
  const result = await runInlineTest({
    'folio.config.ts': `
      module.exports = {
        reporter: [
          { name: 'json', outputFile: ${JSON.stringify(reportFile)} },
          'list',
        ]
      };
    `,
    'a.test.ts': `
      const { test } = folio;
      test('pass', async () => {
      });
    `
  }, { reporter: '' });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
  const report = JSON.parse(fs.readFileSync(reportFile).toString());
  expect(report.suites[0].file).toBe('a.test.ts');
});

test('should support different testDirs', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      import * as path from 'path';
      module.exports = { projects: [
        { testDir: __dirname },
        { testDir: path.join(__dirname, 'dir') },
      ] };
    `,
    'a.test.ts': `
      const { test } = folio;
      test('runs once', async ({}) => {
      });
    `,
    'dir/b.test.ts': `
      const { test } = folio;
      test('runs twice', async ({}) => {
      });
    `,
  });

  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(3);

  expect(result.report.suites[0].specs[0].tests.length).toBe(1);
  expect(result.report.suites[0].specs[0].title).toBe('runs once');

  expect(result.report.suites[1].specs[0].tests.length).toBe(2);
  expect(result.report.suites[1].specs[0].title).toBe('runs twice');
});

test('should throw for define when projects are present', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      module.exports = { define: [], projects: [{}] };
    `,
    'a.test.ts': `
      const { test } = folio;
      test('pass', async ({}, testInfo) => {
      });
    `
  });

  expect(result.exitCode).toBe(1);
  expect(result.output).toContain('When using projects, passing "define" is not supported');
});

test('should allow export default form the config file', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      export default { timeout: 1000 };
    `,
    'a.test.ts': `
      const { test } = folio;
      test('fails', async ({}, testInfo) => {
        await new Promise(f => setTimeout(f, 2000));
      });
    `
  });

  expect(result.exitCode).toBe(1);
  expect(result.failed).toBe(1);
  expect(result.output).toContain('Timeout of 1000ms exceeded.');
});

test('should allow root testDir and use it for relative paths', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'config/config.ts': `
      import * as path from 'path';
      module.exports = {
        testDir: path.join(__dirname, '..'),
        projects: [{ testDir: path.join(__dirname, '..', 'dir') }]
      };
    `,
    'a.test.ts': `
      const { test } = folio;
      test('fails', async ({}, testInfo) => {
        expect(1 + 1).toBe(3);
      });
    `,
    'dir/a.test.ts': `
      const { test } = folio;
      test('fails', async ({}, testInfo) => {
        expect(1 + 1).toBe(3);
      });
    `,
  }, { config: path.join('config', 'config.ts') });

  expect(result.exitCode).toBe(1);
  expect(result.passed).toBe(0);
  expect(result.skipped).toBe(0);
  expect(result.failed).toBe(1);
  expect(result.output).toContain(`1) ${path.join('dir', 'a.test.ts')}:6:7 › fails`);
});

test('should register options', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'helper.ts': `
      export const booleanOption = folio.registerCLIOption('boolean', 'Boolean description', { type: 'boolean' });
      export const stringOption = folio.registerCLIOption('string', 'String description');
      export const listOption = folio.registerCLIOption('mylist', 'List description', { type: 'list' });
      export const extraOption = folio.registerCLIOption('extra', 'Extra description');
    `,
    'folio.config.ts': `
      import { booleanOption, stringOption, listOption, extraOption } from './helper';
      process.env.BOOLEAN = booleanOption.value;
      process.env.STRING = stringOption.value;
      process.env.LIST = listOption.value ? listOption.value.join(',') : undefined;
      process.env.EXTRA = extraOption.value;
      module.exports = {};
    `,
    'a.test.ts': `
      import { booleanOption, stringOption, listOption, extraOption } from './helper';
      const { test } = folio;
      test('fails', async ({}, testInfo) => {
        expect(process.env.BOOLEAN).toBe('true');
        expect(booleanOption.value).toBe(true);

        expect(process.env.STRING).toBe('foo');
        expect(stringOption.value).toBe('foo');

        expect(process.env.LIST).toBe('bar,baz');
        expect(listOption.value).toEqual(['bar', 'baz']);

        expect(process.env.EXTRA).toBe('undefined');
        expect(extraOption.value).toBe(undefined);
      });
    `,
  }, { 'boolean': true, 'string': 'foo', 'mylist': ['bar', 'baz'] });

  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
});

test('should throw for duplicate options', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      folio.registerCLIOption('foo', 'Foo1', { type: 'boolean' });
      folio.registerCLIOption('foo', 'Foo2');
      module.exports = {};
    `,
    'a.test.ts': `
      const { test } = folio;
      test('passes', async ({}, testInfo) => {
      });
    `,
  });

  expect(result.exitCode).toBe(1);
  expect(result.output).toContain('CLI option "foo" is already registered as "Foo1"');
});

test('should throw for short option', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      folio.registerCLIOption('p', 'Foo');
      module.exports = {};
    `,
    'a.test.ts': `
      const { test } = folio;
      test('passes', async ({}, testInfo) => {
      });
    `,
  });

  expect(result.exitCode).toBe(1);
  expect(result.output).toContain('CLI option "p" is too short');
});

test('should throw for reserved option', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      folio.registerCLIOption('list', 'Foo');
      module.exports = {};
    `,
    'a.test.ts': `
      const { test } = folio;
      test('passes', async ({}, testInfo) => {
      });
    `,
  });

  expect(result.exitCode).toBe(1);
  expect(result.output).toContain('CLI option "list" is reserved');
});

test('should print help with unknown options', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.test.ts': `
      const { test } = folio;
      test('passes', async ({}, testInfo) => {
      });
    `,
  }, { 'foo': 'bar', 'help': true });

  expect(result.exitCode).toBe(0);
  expect(result.output).toContain('Usage: folio [options]');
});

test('should validate options', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      folio.registerCLIOption('boolean', 'Foo', { type: 'boolean' });
      folio.registerCLIOption('string', 'Bar', { type: 'string' });
      module.exports = {};
    `,
    'a.test.ts': `
      const { test } = folio;
      test('passes', async ({}, testInfo) => {
      });
    `,
  }, { args: [ '--boolean', '--string', 'value', '--foo' ] });

  expect(result.exitCode).toBe(1);
  expect(result.output).toContain(`error: unknown option '--foo'`);
});

test('should throw when test() is called in config file', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      folio.test('hey', () => {});
      module.exports = {};
    `,
    'a.test.ts': `
      const { test } = folio;
      test('test', async ({}) => {
      });
    `,
  });
  expect(result.output).toContain('Test can only be defined in a test file.');
});

test('should filter by project', async ({ runInlineTest }) => {
  const { passed, failed, output, skipped } = await runInlineTest({
    'folio.config.ts': `
      module.exports = { projects: [
        { name: 'suite1' },
        { name: 'suite2' },
      ] };
    `,
    'a.test.ts': `
      const { test } = folio;
      test('pass', async ({}, testInfo) => {
        console.log(testInfo.project.name);
      });
    `
  }, { project: 'suite2' });
  expect(passed).toBe(1);
  expect(failed).toBe(0);
  expect(skipped).toBe(0);
  expect(output).toContain('suite2');
  expect(output).not.toContain('suite1');
});
