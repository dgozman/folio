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

import { folio, stripAscii } from './fixtures';
const { it, expect } = folio;

it('should retry failures', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'retry-failures.spec.js': `
      it('flake', async ({ testInfo }) => {
        // Passes on the second run.
        expect(testInfo.retry).toBe(1);
      });
    `
  }, { retries: 10 });
  expect(result.exitCode).toBe(0);
  expect(result.flaky).toBe(1);
  expect(result.results.length).toBe(2);
  expect(result.results[0].workerIndex).toBe(0);
  expect(result.results[0].retry).toBe(0);
  expect(result.results[0].status).toBe('failed');
  expect(result.results[1].workerIndex).toBe(1);
  expect(result.results[1].retry).toBe(1);
  expect(result.results[1].status).toBe('passed');
});

it('should retry timeout', async ({ runInlineTest }) => {
  const { exitCode, passed, failed, output } = await runInlineTest({
    'one-timeout.spec.js': `
      it('timeout', async () => {
        await new Promise(f => setTimeout(f, 10000));
      });
    `
  }, { timeout: 100, retries: 2 });
  expect(exitCode).toBe(1);
  expect(passed).toBe(0);
  expect(failed).toBe(1);
  expect(stripAscii(output).split('\n')[0]).toBe('××T');
});

it('should fail on unexpected pass with retries', async ({ runInlineTest }) => {
  const { exitCode, failed, output } = await runInlineTest({
    'unexpected-pass.spec.js': `
      it('succeeds', test => test.fail(), () => {
        expect(1 + 1).toBe(2);
      });
    `
  }, { retries: 1 });
  expect(exitCode).toBe(1);
  expect(failed).toBe(1);
  expect(output).toContain('passed unexpectedly');
});

it('should not retry unexpected pass', async ({ runInlineTest }) => {
  const { exitCode, passed, failed, output } = await runInlineTest({
    'unexpected-pass.spec.js': `
      it('succeeds', test => test.fail(), () => {
        expect(1 + 1).toBe(2);
      });
    `
  }, { retries: 2 });
  expect(exitCode).toBe(1);
  expect(passed).toBe(0);
  expect(failed).toBe(1);
  expect(stripAscii(output).split('\n')[0]).toBe('F');
});

it('should not retry expected failure', async ({ runInlineTest }) => {
  const { exitCode, passed, failed, output } = await runInlineTest({
    'expected-failure.spec.js': `
      it('fails', test => test.fail(), () => {
        expect(1 + 1).toBe(3);
      });

      it('non-empty remaining',() => {
        expect(1 + 1).toBe(2);
      });
    `
  }, { retries: 2 });
  expect(exitCode).toBe(0);
  expect(passed).toBe(2);
  expect(failed).toBe(0);
  expect(stripAscii(output).split('\n')[0]).toBe('··');
});

it('should retry unhandled rejection', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'unhandled-rejection.spec.js': `
      it('unhandled rejection', async () => {
        setTimeout(() => {
          throw new Error('Unhandled rejection in the test');
        });
        await new Promise(f => setTimeout(f, 20));
      });
    `
  }, { retries: 2 });
  expect(result.exitCode).toBe(1);
  expect(result.passed).toBe(0);
  expect(result.failed).toBe(1);
  expect(stripAscii(result.output).split('\n')[0]).toBe('××F');
  expect(result.output).toContain('Unhandled rejection');
});
