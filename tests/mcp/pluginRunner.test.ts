import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FORMAT_PLUGIN_LIMITS } from '../../src/model';
import { ToolError } from '../../mcp/errors';
import {
  pluginToolError,
  runPlugin,
  type PluginFailure,
  type PluginFunction,
  type PluginRun,
} from '../../mcp/pluginRunner';

// The executor of the format plugins (stage #1923, FP3; decisions 11, 15, 16 and 18): the plugin
// runs in QuickJS (WebAssembly), in a new runtime per call, with a time limit, memory and stack
// limits and size limits, and every failure becomes a typed result. The plugins of the tests are in
// `tests/fixtures/plugins/`.

const fixture = (name: string): string =>
  readFileSync(`tests/fixtures/plugins/${name}`, 'utf8');

const input = {
  contract: 1,
  format: { ref: 'data-model/csv', id: 'csv', specId: 'data-model' },
  markings: [{ ref: 'mapping://p/m/1', rect: { x: 1, y: 2, width: 3, height: 4 } }],
};

/** A run that must have failed: the failure, with the code it was expected to have. */
function failure(run: PluginRun, code: PluginFailure['code']): PluginFailure {
  if (run.ok) throw new Error(`expected ${code}, the plugin returned ${JSON.stringify(run.value)}`);
  expect(run.failure.code).toBe(code);
  return run.failure;
}

/** A run that must have worked: its value. */
function value(run: PluginRun): unknown {
  if (!run.ok) throw new Error(`${run.failure.code}: ${run.failure.message}`);
  return run.value;
}

const run = (source: string, fn: PluginFunction, args: readonly unknown[], options = {}) =>
  runPlugin(source, fn, args, options);

describe('runPlugin: the values go in and come out', () => {
  it('echo.js: generate returns its input', async () => {
    const text = value(await run(fixture('echo.js'), 'generate', [input]));
    expect(typeof text).toBe('string');
    expect(JSON.parse(text as string)).toEqual(input);
  });

  it('echo.js: parse receives the text and the input and returns an object', async () => {
    const text = 'a,b\n"quoted ""é"" é",日本語\n';
    const result = value(await run(fixture('echo.js'), 'parse', [text, input]));
    expect(result).toEqual({ operations: [], warnings: [text], input });
  });

  it('a plugin that uses globalThis.generate = … is found', async () => {
    const source = 'globalThis.generate = function (input) { return "from globalThis"; };';
    expect(value(await run(source, 'generate', [input]))).toBe('from globalThis');
  });

  it('console.log, console.warn and console.error exist and do nothing', async () => {
    const source =
      'function generate() { console.log(1); console.warn(2); console.error(3); return "ok"; }';
    expect(value(await run(source, 'generate', [input]))).toBe('ok');
  });

  it('two calls share no state', async () => {
    const source = [
      'var counter = 0;',
      'function generate() { counter += 1; globalThis.leak = (globalThis.leak || 0) + 1; return counter + ":" + globalThis.leak; }',
    ].join('\n');
    expect(value(await run(source, 'generate', [input]))).toBe('1:1');
    expect(value(await run(source, 'generate', [input]))).toBe('1:1');
  });
});

describe('runPlugin: the plugin fails', () => {
  it('throws.js: plugin-failed with the message and line:column', async () => {
    const result = failure(
      await run(fixture('throws.js'), 'generate', [input], {
        format: 'data-model/csv',
        pluginPath: 'plugins/csv.js',
      }),
      'plugin-failed',
    );
    expect(result.message).toContain('boom from the plugin: csv');
    expect(result.message).toContain('plugins/csv.js:8:');
    expect(result.details).toMatchObject({ plugin: 'plugins/csv.js', line: 8 });
    expect(result.details.column).toEqual(expect.any(Number));
  });

  it('module.js: an ES module is a syntax error, plugin-failed', async () => {
    const result = failure(
      await run(fixture('module.js'), 'generate', [input], { pluginPath: 'plugins/csv.js' }),
      'plugin-failed',
    );
    expect(result.message).toContain('SyntaxError');
    expect(result.message).toContain('plugins/csv.js:');
    expect(result.details).toMatchObject({ plugin: 'plugins/csv.js' });
  });

  it('a missing function is plugin-failed: "does not define parse"', async () => {
    const result = failure(
      await run('function generate() { return "x"; }', 'parse', ['text', input], {
        format: 'data-model/csv',
      }),
      'plugin-failed',
    );
    expect(result.message).toBe('the plugin of data-model/csv does not define parse');
  });

  it('a name that is not a function is plugin-failed too', async () => {
    const result = failure(await run('var generate = 3;', 'generate', [input]), 'plugin-failed');
    expect(result.message).toBe('the plugin does not define generate');
  });

  it('a throw of a value that is not an Error keeps its text', async () => {
    const result = failure(
      await run('function generate() { throw "plain text"; }', 'generate', [input]),
      'plugin-failed',
    );
    expect(result.message).toContain('plain text');
  });
});

describe('runPlugin: the output does not fit the contract', () => {
  it('promise.js: a Promise is plugin-output-invalid, in generate and in parse', async () => {
    const generate = failure(
      await run(fixture('promise.js'), 'generate', [input]),
      'plugin-output-invalid',
    );
    expect(generate.message).toContain('Promise');
    failure(await run(fixture('promise.js'), 'parse', ['text', input]), 'plugin-output-invalid');
  });

  it('an async function is plugin-output-invalid', async () => {
    failure(
      await run('async function generate() { return "x"; }', 'generate', [input]),
      'plugin-output-invalid',
    );
  });

  it.each([
    ['undefined', 'function generate() {}'],
    ['a function', 'function generate() { return function () {}; }'],
    ['a cycle', 'function generate() { var a = {}; a.self = a; return a; }'],
    ['a BigInt', 'function generate() { return { n: 10n }; }'],
  ])('an output that is not JSON (%s) is plugin-output-invalid', async (_name, source) => {
    failure(await run(source, 'parse', ['text', input]), 'plugin-output-invalid');
  });

  it('generate must return a text', async () => {
    const result = failure(
      await run('function generate() { return { a: 1 }; }', 'generate', [input]),
      'plugin-output-invalid',
    );
    expect(result.message).toContain('generate must return a string');
  });
});

describe('runPlugin: the limits', () => {
  it('loop.js: plugin-timeout within the limit plus a margin, and the next call works', async () => {
    const started = Date.now();
    const result = failure(
      await run(fixture('loop.js'), 'generate', [input], { limits: { timeoutMs: 300 } }),
      'plugin-timeout',
    );
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(300);
    expect(elapsed).toBeLessThan(2500);
    expect(result.details).toMatchObject({ timeoutMs: 300 });
    expect(value(await run(fixture('echo.js'), 'generate', [input]))).toEqual(
      expect.any(String),
    );
  });

  it('loop.js with the limit of the contract (5 s) ends in 5 s plus a margin', async () => {
    const started = Date.now();
    failure(await run(fixture('loop.js'), 'generate', [input]), 'plugin-timeout');
    const elapsed = Date.now() - started;
    expect(FORMAT_PLUGIN_LIMITS.timeoutMs).toBe(5000);
    expect(elapsed).toBeGreaterThanOrEqual(5000);
    expect(elapsed).toBeLessThan(8000);
  }, 20000);

  it('a regular expression that backtracks forever also hits the time limit', async () => {
    failure(
      await run(
        'function generate() { return String(/(a+)+b/.test("a".repeat(60))); }',
        'generate',
        [input],
        { limits: { timeoutMs: 300 } },
      ),
      'plugin-timeout',
    );
  });

  it('memory.js: plugin-limit (memory) without taking the process down', async () => {
    const result = failure(
      await run(fixture('memory.js'), 'generate', [input], {
        limits: { timeoutMs: 20000 },
      }),
      'plugin-limit',
    );
    expect(result.message).toContain('memory');
    expect(result.details).toMatchObject({
      limit: 'memoryBytes',
      max: FORMAT_PLUGIN_LIMITS.memoryBytes,
    });
    expect(value(await run('function generate() { return "alive"; }', 'generate', [input]))).toBe(
      'alive',
    );
  }, 30000);

  it('a text too long for QuickJS is plugin-limit (memory)', async () => {
    const result = failure(
      await run('function generate() { var s = "x"; for (;;) s += s; }', 'generate', [input]),
      'plugin-limit',
    );
    expect(result.details).toMatchObject({ limit: 'memoryBytes' });
  });

  it('a recursion without end is plugin-limit (stack) and the next call works', async () => {
    const result = failure(
      await run('function generate() { function f() { return f() + 1; } return f(); }', 'generate', [
        input,
      ]),
      'plugin-limit',
    );
    expect(result.message).toContain('stack');
    expect(result.details).toMatchObject({ limit: 'stackBytes' });
    expect(value(await run('function generate() { return "alive"; }', 'generate', [input]))).toBe(
      'alive',
    );
  });

  it('a structure nested deeper than the stack lets the host throw: plugin-limit (stack) too', async () => {
    const source = [
      'function generate() {',
      '  var root = []; var node = root;',
      '  for (var i = 0; i < 200000; i++) { var next = []; node.push(next); node = next; }',
      '  return JSON.stringify(root);',
      '}',
    ].join('\n');
    failure(await run(source, 'generate', [input]), 'plugin-limit');
    expect(value(await run('function generate() { return "alive"; }', 'generate', [input]))).toBe(
      'alive',
    );
  });

  it('big-output.js: plugin-limit (size) for a text over 4 MiB', async () => {
    const result = failure(
      await run(fixture('big-output.js'), 'generate', [input]),
      'plugin-limit',
    );
    expect(result.details).toMatchObject({
      limit: 'generatedTextBytes',
      max: FORMAT_PLUGIN_LIMITS.generatedTextBytes,
    });
  });

  it('a text of exactly 4 MiB is accepted', async () => {
    const source = `function generate() { return 'x'.repeat(${FORMAT_PLUGIN_LIMITS.generatedTextBytes}); }`;
    const text = value(await run(source, 'generate', [input])) as string;
    expect(text.length).toBe(FORMAT_PLUGIN_LIMITS.generatedTextBytes);
  });

  it('a plugin file over 1 MiB is plugin-limit, without running', async () => {
    const source = `function generate() { return "x"; }\n// ${'x'.repeat(FORMAT_PLUGIN_LIMITS.pluginBytes)}`;
    const result = failure(await run(source, 'generate', [input]), 'plugin-limit');
    expect(result.details).toMatchObject({ limit: 'pluginBytes' });
  });

  it('a text for parse over 4 MiB is plugin-limit', async () => {
    const text = 'x'.repeat(FORMAT_PLUGIN_LIMITS.parseTextBytes + 1);
    const result = failure(await run(fixture('echo.js'), 'parse', [text, input]), 'plugin-limit');
    expect(result.details).toMatchObject({ limit: 'parseTextBytes' });
  });

  it('a projection over 16 MiB is plugin-limit', async () => {
    const big = { ...input, filler: 'x'.repeat(FORMAT_PLUGIN_LIMITS.projectionBytes) };
    const result = failure(await run(fixture('echo.js'), 'generate', [big]), 'plugin-limit');
    expect(result.details).toMatchObject({ limit: 'projectionBytes' });
  });

  it('the limits of the options replace the ones of the contract', async () => {
    const result = failure(
      await run(fixture('big-output.js'), 'generate', [input], {
        limits: { generatedTextBytes: 10 },
      }),
      'plugin-limit',
    );
    expect(result.details).toMatchObject({ limit: 'generatedTextBytes', max: 10 });
  });
});

describe('runPlugin: the sandbox', () => {
  it('escape.js finds none of fetch, require, import(), process, setTimeout and the like', async () => {
    const text = value(await run(fixture('escape.js'), 'generate', [input])) as string;
    const report = JSON.parse(text) as { found: string[]; imported: string; console: string[] };
    expect(report.found).toEqual([]);
    expect(report.imported).not.toBe('loaded');
    expect(report.console).toEqual(['function', 'function', 'function']);
  });

  it('the plugin does not see the arguments as a global', async () => {
    const source =
      'function generate() { return JSON.stringify(Object.getOwnPropertyNames(globalThis).filter(function (n) { return /arg|input/i.test(n); })); }';
    expect(value(await run(source, 'generate', [input]))).toBe('[]');
  });

  it('a plugin that tampers with JSON.stringify still cannot forge the result', async () => {
    const source = 'JSON.stringify = function () { return "not json {"; }; function generate() { return "x"; }';
    failure(await run(source, 'generate', [input]), 'plugin-output-invalid');
  });
});

describe('pluginToolError', () => {
  it('turns a failure into a ToolError with the code, the message and the details', async () => {
    const result = failure(
      await run(fixture('big-output.js'), 'generate', [input]),
      'plugin-limit',
    );
    const error = pluginToolError(result);
    expect(error).toBeInstanceOf(ToolError);
    expect(error.code).toBe('plugin-limit');
    expect(error.message).toBe(result.message);
    expect(error.details).toMatchObject({ limit: 'generatedTextBytes' });
  });
});
