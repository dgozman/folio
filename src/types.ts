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

import type { Expect } from './expectType';

export type ReporterDescription =
  'dot' |
  'line' |
  'list' |
  'junit' | { name: 'junit', outputFile?: string, stripANSIControlSequences?: boolean } |
  'json' | { name: 'json', outputFile?: string } |
  'null' |
  string;

export type Shard = { total: number, current: number } | null;
export type PreserveOutput = 'always' | 'never' | 'failures-only';
export type UpdateSnapshots = 'all' | 'none' | 'missing';

type FixtureDefine<TestArgs extends KeyValue = {}, WorkerArgs extends KeyValue = {}> = { test: TestType<TestArgs, WorkerArgs>, fixtures: Fixtures<{}, {}, TestArgs, WorkerArgs> };

/**
 * Test run configuration.
 */
interface ProjectBase {
  /**
   * Output directory for files created during the test run.
   */
  outputDir?: string;

  /**
   * The number of times to repeat each test, useful for debugging flaky tests.
   */
  repeatEach?: number;

  /**
   * The maximum number of retry attempts given to failed tests.
   */
  retries?: number;

  /**
   * Directory containing all snapshots, used by `expect(value).toMatchSnapshot()`.
   */
  snapshotDir?: string;

  /**
   * Any JSON-serializable metadata that will be put directly to the test report.
   */
  metadata?: any;

  /**
   * The project name, shown in the title of each test.
   */
  name?: string;

  /**
   * Directory that will be recursively scanned for test files.
   */
  testDir?: string;

  /**
   * Files matching one of these patterns are not considered test files.
   */
  testIgnore?: string | RegExp | (string | RegExp)[];

  /**
   * Only files matching one of these patterns are considered test files.
   */
  testMatch?: string | RegExp | (string | RegExp)[];

  /**
   * Timeout for each test in milliseconds.
   */
  timeout?: number;
}

export interface Project<TestArgs = {}, WorkerArgs = {}> extends ProjectBase {
  /**
   * Fixtures defined for abstract tests created with `test.declare()` method.
   */
  define?: FixtureDefine | FixtureDefine[];

  /**
   * Fixture overrides for this run. Useful for specifying options.
   */
  use?: Fixtures<{}, {}, TestArgs, WorkerArgs>;
}
export type FullProject<TestArgs = {}, WorkerArgs = {}> = Required<Project<TestArgs, WorkerArgs>>;

/**
 * Folio configuration.
 */
export interface Config<TestArgs = {}, WorkerArgs = {}> extends Project<TestArgs, WorkerArgs> {
  /**
   * Whether to exit with an error if any tests are marked as `test.only`. Useful on CI.
   */
  forbidOnly?: boolean;

  /**
   * Path to the global setup file. This file will be required and run before all the tests.
   * It must export a single function.
   */
  globalSetup?: string | null;

  /**
   * Path to the global teardown file. This file will be required and run after all the tests.
   * It must export a single function.
   */
  globalTeardown?: string | null;

  /**
   * Maximum time in milliseconds the whole test suite can run.
   */
  globalTimeout?: number;

  /**
   * Filter to only run tests with a title matching one of the patterns.
   */
  grep?: RegExp | RegExp[];

  /**
   * The maximum number of test failures for this test run. After reaching this number,
   * testing will stop and exit with an error. Setting to zero (default) disables this behavior.
   */
  maxFailures?: number;

  /**
   * Whether to preserve test output in the `outputDir`:
   * - `'always'` - preserve output for all tests;
   * - `'never'` - do not preserve output for any tests;
   * - `'failures-only'` - only preserve output for failed tests.
   */
  preserveOutput?: PreserveOutput;

  /**
   * Projects specify test files that are executed with a specific configuration.
   */
  projects?: Project<TestArgs, WorkerArgs>[];

  /**
   * Reporter to use. Available options:
   * - `'list'` - default reporter, prints a single line per test;
   * - `'dot'` - minimal reporter that prints a single character per test run, useful on CI;
   * - `'line'` - uses a single line for all successfull runs, useful for large test suites;
   * - `'json'` - outputs a json file with information about the run;
   * - `'junit'` - outputs an xml file with junit-alike information about the run;
   * - `'null'` - no reporter, test run will be silent.
   *
   * It is possible to pass multiple reporters. A common pattern is using one terminal reporter
   * like `'line'` or `'list'`, and one file reporter like `'json'` or `'junit'`.
   */
  reporter?: ReporterDescription | ReporterDescription[];

  /**
   * Whether to suppress stdio output from the tests.
   */
  quiet?: boolean;

  /**
   * Shard tests and execute only the selected shard.
   * Specify in the one-based form `{ total: 5, current: 2 }`.
   */
  shard?: Shard;

  /**
   * Whether to update expected snapshots with the actual results produced by the test run.
   */
  updateSnapshots?: UpdateSnapshots;

  /**
   * The maxmium number of worker processes to use for parallelizing tests.
   */
  workers?: number;
}

export interface FullConfig {
  forbidOnly: boolean;
  globalSetup: string | null;
  globalTeardown: string | null;
  globalTimeout: number;
  grep: RegExp | RegExp[];
  maxFailures: number;
  preserveOutput: PreserveOutput;
  projects: FullProject[];
  reporter: ReporterDescription[];
  rootDir: string;
  quiet: boolean;
  shard: Shard;
  updateSnapshots: UpdateSnapshots;
  workers: number;
}

export interface ConfigOverrides {
  forbidOnly?: boolean;
  globalTimeout?: number;
  grep?: RegExp | RegExp[];
  maxFailures?: number;
  repeatEach?: number;
  outputDir?: string;
  preserveOutput?: PreserveOutput;
  retries?: number;
  reporter?: ReporterDescription[];
  quiet?: boolean;
  shard?: Shard;
  timeout?: number;
  updateSnapshots?: UpdateSnapshots;
  workers?: number;
}

export type TestStatus = 'passed' | 'failed' | 'timedOut' | 'skipped';

/**
 * Information common for all tests run in the same worker process.
 */
export interface WorkerInfo {
  /**
   * Folio configuration.
   */
  config: FullConfig;

  /**
   * Specific project configuration for this worker.
   * Different projects are always run in separate processes.
   */
  project: FullProject;

  /**
   * Unique worker index. Also available as `process.env.FOLIO_WORKER_INDEX`.
   */
  workerIndex: number;
}

/**
 * Information about a particular test run.
 */
export interface TestInfo extends WorkerInfo {
  /**
   * Test title as passed to `test('my test title', testFunction)`.
   */
  title: string;

  /**
   * Path to the file where test is declared.
   */
  file: string;

  /**
   * Line number in the test file where the test is declared.
   */
  line: number;

  /**
   * Column number in the test file where the test is declared.
   */
  column: number;

  /**
   * The test function as passed to `test('my test title', testFunction)`.
   */
  fn: Function;

  /**
   * Call this method to skip the current test.
   */
  skip(description?: string): void;

  /**
   * Call this method to mark the current test as "needs to be fixed". The test will not be run.
   */
  fixme(description?: string): void;

  /**
   * Call this method to mark the current test as "expected to fail". The test will be run and must fail.
   */
  fail(description?: string): void;

  /**
   * Call this method to mark the current test as slow. The default timeout will be trippled.
   */
  slow(description?: string): void;

  /**
   * Call this method to set a custom timeout for the current test.
   */
  setTimeout(timeout: number): void;

  /**
   * The expected status for the test:
   * - `'passed'` for most tests;
   * - `'failed'` for tests marked with `test.fail()`;
   * - `'skipped'` for tests marked with `test.skip()` or `test.fixme()`.
   */
  expectedStatus: TestStatus;

  /**
   * Timeout in milliseconds for this test.
   */
  timeout: number;

  /**
   * Annotations collected for this test.
   */
  annotations: { type: string, description?: string }[];

  /**
   * When tests are run multiple times, each run gets a unique `repeatEachIndex`.
   */
  repeatEachIndex: number;

  /**
   * When the test is retried after a failure, `retry` indicates the attempt number.
   * Zero for the first (non-retry) run.
   *
   * The maximum number of retries is configurable with `retries` field in the config.
   */
  retry: number;

  /**
   * The number of milliseconds this test took to finish.
   * Only available after the test has finished.
   */
  duration: number;

  /**
   * The result of the run.
   * Only available after the test has finished.
   */
  status?: TestStatus;

  /**
   * The error thrown by the test if any.
   * Only available after the test has finished.
   */
  error?: any;

  /**
   * Output written to `process.stdout` or `console.log` from the test.
   * Only available after the test has finished.
   */
  stdout: (string | Buffer)[];

  /**
   * Output written to `process.stderr` or `console.error` from the test.
   * Only available after the test has finished.
   */
  stderr: (string | Buffer)[];

  /**
   * Relative path segment used to differentiate snapshots between multiple test configurations.
   * For example, if snapshots depend on the platform, you can set `testInfo.snapshotPathSegment = process.platform`,
   * and `expect(value).toMatchSnapshot()` will use different snapshots depending on the platform.
   */
  snapshotPathSegment: string;

  /**
   * Absolute path to the output directory for this specific test run.
   * Each test gets its own directory.
   */
  outputDir: string;

  /**
   * Returns a path to a snapshot file.
   */
  snapshotPath: (...pathSegments: string[]) => string;

  /**
   * Returns a path inside the `outputDir` where the test can safely put a temporary file.
   * Guarantees that tests running in parallel will not interfere with each other.
   *
   * ```js
   * const file = testInfo.outputPath('temporary-file.txt');
   * await fs.promises.writeFile(file, 'Put some data to the file', 'utf8');
   * ```
   */
  outputPath: (...pathSegments: string[]) => string;
}

interface SuiteFunction {
  (name: string, inner: () => void): void;
}

interface TestFunction<TestArgs> {
  (name: string, inner: (args: TestArgs, testInfo: TestInfo) => Promise<void> | void): void;
}

/**
 * Call this function to declare a test.
 *
 * ```js
 * test('my test title', async () => {
 *   // Test code goes here.
 * });
 * ```
 */
export interface TestType<TestArgs extends KeyValue, WorkerArgs extends KeyValue> extends TestFunction<TestArgs & WorkerArgs> {
  /**
   * Use `test.only()` instead of `test()` to ignore all other tests and only run this one.
   * Useful for debugging a particular test.
   *
   * ```js
   * test.only('my test title', async () => {
   *   // Only this test will run.
   * });
   * ```
   *
   * All tests marked as `test.only()` will be run, so you can mark multiple of them.
   */
  only: TestFunction<TestArgs & WorkerArgs>;

  /**
   * Declare a block of related tests.
   *
   * ```js
   * test.decribe('my test suite', () => {
   *   test('one test', async () => {
   *     // Test code goes here.
   *   });
   *
   *   test('another test', async () => {
   *     // Test code goes here.
   *   });
   * });
   * ```
   *
   * Any `beforeEach`, `afterEach`, `beforeAll` and `afterAll` hooks declared inside the `test.decribe()` block
   * will only affect the tests from this block.
   */
  describe: SuiteFunction & {
    /**
     * Use `test.describe.only()` instead of `test.describe()` to ignore all other tests and only run this block.
     * Useful for debugging a few tests.
     */
    only: SuiteFunction;
  };

  /**
   * Skip running this test.
   *
   * ```js
   * test('my test title', async () => {
   *   test.skip();
   *   // Test code goes here. It will not be executed.
   * });
   * ```
   */
  skip(): void;

  /**
   * Skip running this test when `condition` is true.
   *
   * ```js
   * test('my test title', async () => {
   *   test.skip(process.platform === 'darwin');
   *   // Test code goes here. It will not be executed on MacOS.
   * });
   * ```
   */
  skip(condition: boolean): void;

  /**
   * Skip running this test when `condition` is true.
   * Put a reason in `description` to easily remember it later.
   *
   * ```js
   * test('my test title', async () => {
   *   test.skip(process.platform === 'darwin', 'Dependency "foo" is crashing on MacOS');
   *   // Test code goes here. It will not be executed on MacOS.
   * });
   * ```
   */
  skip(condition: boolean, description: string): void;

  /**
   * Skip running tests in the `describe` block based on some condition.
   *
   * ```js
   * test.describe('my tests', () => {
   *   test.skip(() => process.platform === 'darwin');
   *
   *   // Declare tests below - they will not be executed on MacOS.
   * });
   * ```
   */
  skip(callback: (args: TestArgs & WorkerArgs) => boolean): void;

  /**
   * Skip running tests in the `describe` block based on some condition.
   * Put a reason in `description` to easily remember it later.
   *
   * ```js
   * test.describe('my tests', () => {
   *   test.skip(() => process.platform === 'darwin', 'Dependency "foo" is crashing on MacOS');
   *
   *   // Declare tests below - they will not be executed on MacOS.
   * });
   * ```
   */
  skip(callback: (args: TestArgs & WorkerArgs) => boolean, description: string): void;

  /**
   * Skip running this test, with intention to fix it later.
   *
   * ```js
   * test('my test title', async () => {
   *   test.fixme();
   *   // Test code goes here. It will not be executed.
   * });
   * ```
   */
  fixme(): void;

  /**
   * Skip running this test when `condition` is true, with intention to fix it later.
   *
   * ```js
   * test('my test title', async () => {
   *   test.fixme(process.platform === 'darwin');
   *   // Test code goes here. It will not be executed on MacOS.
   * });
   * ```
   */
  fixme(condition: boolean): void;

  /**
   * Skip running this test when `condition` is true, with intention to fix it later.
   * Put a reason in `description` to easily remember it later.
   *
   * ```js
   * test('my test title', async () => {
   *   test.fixme(process.platform === 'darwin', 'Dependency "foo" is crashing on MacOS');
   *   // Test code goes here. It will not be executed on MacOS.
   * });
   * ```
   */
  fixme(condition: boolean, description: string): void;

  /**
   * Skip running tests in the `describe` block based on some condition, with intention to fix it later.
   *
   * ```js
   * test.describe('my tests', () => {
   *   test.fixme(() => process.platform === 'darwin');
   *
   *   // Declare tests below - they will not be executed on MacOS.
   * });
   * ```
   */
  fixme(callback: (args: TestArgs & WorkerArgs) => boolean): void;

  /**
   * Skip running tests in the `describe` block based on some condition, with intention to fix it later.
   * Put a reason in `description` to easily remember it later.
   *
   * ```js
   * test.describe('my tests', () => {
   *   test.fixme(() => process.platform === 'darwin', 'Dependency "foo" is crashing on MacOS');
   *
   *   // Declare tests below - they will not be executed on MacOS.
   * });
   * ```
   */
  fixme(callback: (args: TestArgs & WorkerArgs) => boolean, description: string): void;

  /**
   * Mark the test as "expected to fail". It will be run and should fail.
   * When "expected to fail" test acceidentally passes, test runner will exit with an error.
   *
   * ```js
   * test('my test title', async () => {
   *   test.fail();
   *   // Test code goes here.
   * });
   * ```
   */
  fail(): void;

  /**
   * Mark the test as "expected to fail", when `condition` is true. It will be run and should fail.
   * When "expected to fail" test acceidentally passes, test runner will exit with an error.
   *
   * ```js
   * test('my test title', async () => {
   *   test.fail(process.platform === 'darwin');
   *   // Test code goes here. It should fail on MacOS.
   * });
   * ```
   */
  fail(condition: boolean): void;

  /**
   * Mark the test as "expected to fail", when `condition` is true. It will be run and should fail.
   * When "expected to fail" test acceidentally passes, test runner will exit with an error.
   * Put a reason in `description` to easily remember it later.
   *
   * ```js
   * test('my test title', async () => {
   *   test.fail(process.platform === 'darwin', 'Could not find resources - see issue #1234');
   *   // Test code goes here. It should fail on MacOS.
   * });
   * ```
   */
  fail(condition: boolean, description: string): void;

  /**
   * Mark tests in the `describe` block as "expected to fail" based on some condition.
   * The tests will be run and should fail.
   * When "expected to fail" test acceidentally passes, test runner will exit with an error.
   *
   * ```js
   * test.describe('my tests', () => {
   *   test.fail(() => process.platform === 'darwin');
   *
   *   // Declare tests below - they should fail on MacOS.
   * });
   * ```
   */
  fail(callback: (args: TestArgs & WorkerArgs) => boolean): void;

  /**
   * Mark tests in the `describe` block as "expected to fail" based on some condition.
   * The tests will be run and should fail.
   * When "expected to fail" test acceidentally passes, test runner will exit with an error.
   * Put a reason in `description` to easily remember it later.
   *
   * ```js
   * test.describe('my tests', () => {
   *   test.fail(() => process.platform === 'darwin', 'Could not find resources - see issue #1234');
   *
   *   // Declare tests below - they should fail on MacOS.
   * });
   * ```
   */
  fail(callback: (args: TestArgs & WorkerArgs) => boolean, description: string): void;

  /**
   * Triples the default timeout for this test.
   *
   * ```js
   * test('my test title', async () => {
   *   test.slow();
   *   // Test code goes here.
   * });
   * ```
   */
  slow(): void;

  /**
   * Triples the default timeout for this test, when `condition` is true.
   *
   * ```js
   * test('my test title', async () => {
   *   test.slow(process.platform === 'darwin');
   *   // Test code goes here. It will be given triple timeout on MacOS.
   * });
   * ```
   */
  slow(condition: boolean): void;

  /**
   * Triples the default timeout for this test, when `condition` is true.
   * Put a reason in `description` to easily remember it later.
   *
   * ```js
   * test('my test title', async () => {
   *   test.slow(process.platform === 'darwin', 'Dependency "foo" is slow on MacOS');
   *   // Test code goes here. It will be given triple timeout on MacOS.
   * });
   * ```
   */
  slow(condition: boolean, description: string): void;

  /**
   * Give all tests in the `describe` block triple timeout, based on some condition.
   *
   * ```js
   * test.describe('my tests', () => {
   *   test.slow(() => process.platform === 'darwin');
   *
   *   // Declare tests below - they will be given triple timeout on MacOS.
   * });
   * ```
   */
  slow(callback: (args: TestArgs & WorkerArgs) => boolean): void;

  /**
   * Give all tests in the `describe` block triple timeout, based on some condition.
   * Put a reason in `description` to easily remember it later.
   *
   * ```js
   * test.describe('my tests', () => {
   *   test.slow(() => process.platform === 'darwin', 'Dependency "foo" is slow on MacOS');
   *
   *   // Declare tests below - they will be given triple timeout on MacOS.
   * });
   * ```
   */
  slow(callback: (args: TestArgs & WorkerArgs) => boolean, description: string): void;

  /**
   * Set a custom timeout for the test.
   *
   * ```js
   * test('my test title', async () => {
   *   // Give this test 20 seconds.
   *   test.setTimeout(20000);
   *   // Test code goes here.
   * });
   * ```
   */
  setTimeout(timeout: number): void;

  /**
   * Declare a hook that will be run before each test.
   * It may use all the available fixtures.
   *
   * ```js
   * test.beforeEach(async ({ fixture }, testInfo) => {
   *   // Do some work here.
   * });
   * ```
   *
   * When called inside a `test.describe()` block, the hook only applies to the tests from the block.
   */
  beforeEach(inner: (args: TestArgs & WorkerArgs, testInfo: TestInfo) => Promise<any> | any): void;

  /**
   * Declare a hook that will be run after each test.
   * It may use all the available fixtures.
   *
   * ```js
   * test.afterEach(async ({ fixture }, testInfo) => {
   *   // Do some work here.
   * });
   * ```
   *
   * When called inside a `test.describe()` block, the hook only applies to the tests from the block.
   */
  afterEach(inner: (args: TestArgs & WorkerArgs, testInfo: TestInfo) => Promise<any> | any): void;

  /**
   * Declare a hook that will be run once before all tests in the file.
   * It may use all worker-scoped fixtures.
   *
   * ```js
   * test.beforeAll(async ({ workerFixture }, workerInfo) => {
   *   // Do some work here.
   * });
   * ```
   *
   * When called inside a `test.describe()` block, the hook only applies to the tests from the block.
   */
  beforeAll(inner: (args: WorkerArgs, workerInfo: WorkerInfo) => Promise<any> | any): void;

  /**
   * Declare a hook that will be run once after all tests in the file.
   * It may use all worker-scoped fixtures.
   *
   * ```js
   * test.afterAll(async ({ workerFixture }, workerInfo) => {
   *   // Do some work here.
   * });
   * ```
   *
   * When called inside a `test.describe()` block, the hook only applies to the tests from the block.
   */
  afterAll(inner: (args: WorkerArgs, workerInfo: WorkerInfo) => Promise<any> | any): void;

  /**
   * Declare fixtures/options to be used for tests in this file.
   *
   * ```js
   * test.use({ myOption: 'foo' });
   *
   * test('my test title', async ({ myFixtureThatUsesMyOption }) => {
   *   // Test code goes here.
   * });
   * ```
   *
   * When called inside a `test.describe()` block, fixtures/options only apply to the tests from the block.
   */
  use(fixtures: Fixtures<{}, {}, TestArgs, WorkerArgs>): void;

  /**
   * Use `test.expect(value).toBe(expected)` to assert something in the test.
   * See [expect library](https://jestjs.io/docs/expect) documentation for more details.
   */
  expect: Expect;

  declare<T extends KeyValue = {}, W extends KeyValue = {}>(): TestType<TestArgs & T, WorkerArgs & W>;

  /**
   * Extend the test with fixtures. These fixtures will be invoked for test when needed,
   * can perform setup/teardown and provide a resource to the test.
   *
   * ```ts
   * import base from 'folio';
   * import rimraf from 'rimraf';
   *
   * const test = base.extend<{ dirCount: number, dirs: string[] }>({
   *   // Define an option that can be configured in tests with `test.use()`.
   *   // Provide a default value.
   *   dirCount: 1,
   *
   *   // Define a fixture that prodives some useful functionality to the test.
   *   // In this example, it will create some temporary directories.
   *   dirs: async ({ dirCount }, use, testInfo) => {
   *     // Our fixture uses the "dirCount" option that can be configured by the test.
   *     const dirs = [];
   *     for (let i = 0; i < dirCount; i++) {
   *       // Create an isolated directory.
   *       const dir = testInfo.outputPath('dir-' + i);
   *       await fs.promises.mkdir(dir, { recursive: true });
   *       dirs.push(dir);
   *     }
   *
   *     // Use the list of directories in the test.
   *     await use(dirs);
   *
   *     // Cleanup if needed.
   *     for (const dir of dirs)
   *       await new Promise(done => rimraf(dir, done));
   *   },
   * });
   *
   *
   * // Tests in this file need two temporary directories.
   * test.use({ dirCount: 2 });
   *
   * test('my test title', async ({ dirs }) => {
   *   // Test code goes here.
   *   // It can use "dirs" right away - the fixture has already run and created two temporary directories.
   * });
   * ```
   */
  extend<T, W extends KeyValue = {}>(fixtures: Fixtures<T, W, TestArgs, WorkerArgs>): TestType<TestArgs & T, WorkerArgs & W>;
}

export type KeyValue = { [key: string]: any };
type FixtureValue<R, Args, Info> = R | ((args: Args, run: (r: R) => Promise<void>, info: Info) => any);
export type Fixtures<T extends KeyValue = {}, W extends KeyValue = {}, PT extends KeyValue = {}, PW extends KeyValue = {}> = {
  [K in keyof PW]?: FixtureValue<PW[K], W & PW, WorkerInfo>;
} & {
  [K in keyof PT]?: FixtureValue<PT[K], T & W & PT & PW, TestInfo>;
} & {
  [K in keyof W]?: [FixtureValue<W[K], W & PW, WorkerInfo>, { scope: 'worker', auto?: boolean }];
} & {
  [K in keyof T]?: FixtureValue<T[K], T & W & PT & PW, TestInfo> | [FixtureValue<T[K], T & W & PT & PW, TestInfo>, { scope?: 'test', auto?: boolean }];
};

export type Location = {file: string, line: number, column: number};
export type FixturesWithLocation = {
  fixtures: Fixtures;
  location: Location;
};

export interface BooleanCLIOption {
  name: string;
  description: string;
  type: 'boolean';
  value?: boolean;
}
export interface StringCLIOption {
  name: string;
  description: string;
  type: 'string';
  value?: string;
}
export interface ListCLIOption {
  name: string;
  description: string;
  type: 'list';
  value?: string[];
}
export type CLIOption = BooleanCLIOption | StringCLIOption | ListCLIOption;

// ---------- Reporters API -----------

export interface Suite {
  title: string;
  file: string;
  line: number;
  column: number;
  suites: Suite[];
  specs: Spec[];
  fullTitle(): string;
  findTest(fn: (test: Test) => boolean | void): boolean;
  findSpec(fn: (spec: Spec) => boolean | void): boolean;
  totalTestCount(): number;
}
export interface Spec {
  suite: Suite;
  title: string;
  file: string;
  line: number;
  column: number;
  tests: Test[];
  fullTitle(): string;
  ok(): boolean;
}
export interface Test {
  spec: Spec;
  results: TestResult[];
  skipped: boolean;
  expectedStatus: TestStatus;
  timeout: number;
  annotations: { type: string, description?: string }[];
  projectName: string;
  retries: number;
  status(): 'skipped' | 'expected' | 'unexpected' | 'flaky';
  ok(): boolean;
}
export interface TestResult {
  retry: number;
  workerIndex: number,
  duration: number;
  status?: TestStatus;
  error?: TestError;
  stdout: (string | Buffer)[];
  stderr: (string | Buffer)[];
}
export interface TestError {
  message?: string;
  stack?: string;
  value?: string;
}
export interface Reporter {
  onBegin(config: FullConfig, suite: Suite): void;
  onTestBegin(test: Test): void;
  onStdOut(chunk: string | Buffer, test?: Test): void;
  onStdErr(chunk: string | Buffer, test?: Test): void;
  onTestEnd(test: Test, result: TestResult): void;
  onTimeout(timeout: number): void;
  onError(error: TestError): void;
  onEnd(): void;
}
