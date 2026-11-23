import variant from '@jitl/quickjs-wasmfile-release-sync';
import {
  newQuickJSWASMModuleFromVariant,
  newVariant,
  type QuickJSContext,
  type QuickJSHandle,
  type QuickJSWASMModule,
} from 'quickjs-emscripten-core';
import wasmBytes from 'wasm:quickjs';
import {
  FORMAT_PLUGIN_LIMITS,
  type FormatOutcome,
  type FormatRunner,
} from '../src/model';
import { ToolError } from './errors';

// The executor of the format plugins (`fileFormats`, stage #1923, decisions 11, 15, 16 and 18).
// The code of a specialization only runs here, inside QuickJS compiled to WebAssembly: a new runtime
// and context per call (nothing stays between calls), no host function (not even `console`: the
// plugin gets a silent one written in JavaScript), the input in as a JSON text parsed inside and
// the output out as a JSON text parsed outside. It never uses `eval`, `new Function` or `node:vm`
// on the plugin, and it receives the plugin's text instead of reading a file. Every failure comes
// back as a typed `PluginFailure`; nothing here throws, so no plugin brings the server down.

export type PluginFunction = 'generate' | 'parse';

export type PluginFailureCode =
  'plugin-failed' | 'plugin-timeout' | 'plugin-limit' | 'plugin-output-invalid';

/** A failed call: the code is one of the server's, `details` goes to the `ToolError`. */
export interface PluginFailure {
  readonly code: PluginFailureCode;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
}

export type PluginRun =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly failure: PluginFailure };

export interface PluginRunOptions {
  /** `<specId>/<formatId>`, for the messages ("the plugin of data-model/csv …"). */
  readonly format?: string;
  /** The plugin's path in the package, for the messages and the `line:column` of an error. */
  readonly pluginPath?: string;
  /** Replaces limits of the contract (`FORMAT_PLUGIN_LIMITS`); the tests use it to be quick. */
  readonly limits?: Partial<Record<keyof typeof FORMAT_PLUGIN_LIMITS, number>>;
}

type Limits = Record<keyof typeof FORMAT_PLUGIN_LIMITS, number>;

interface Call {
  readonly fn: PluginFunction;
  readonly subject: string;
  readonly path: string;
  readonly limits: Limits;
}

/**
 * The stack the QuickJS check allows. The decision of the contract is 1 MiB (`stackBytes`), but
 * QuickJS in WebAssembly runs on the host's own call stack (V8's, about 1 MB): at 1 MiB the host
 * overflows first and throws a `RangeError` through the WebAssembly frames. A quarter of it lets
 * QuickJS's own check fire first; the `RangeError` that still gets through (a very deep JSON, for
 * example) is caught as the same `plugin-limit` and the module is dropped.
 */
const QUICKJS_STACK_CAP_BYTES = 256 * 1024;

/** The name of the global that carries the arguments in; deleted by the driver before the call. */
const ARGS_GLOBAL = '__mappingPluginArgs';

/** `console` for the plugin: the three methods exist and do nothing, with no host function. */
const CONSOLE_PRELUDE =
  'globalThis.console = { log: function () {}, warn: function () {}, error: function () {} };';

/**
 * Calls the function and answers with a text whose first character says what came out: `O` + JSON
 * (the value), `M` (the function is missing), `P` (a Promise) or `U` + why (not JSON). The name is
 * one of the two fixed ones, never text from the plugin.
 */
function driverSource(fn: PluginFunction): string {
  return `(function () {
  var raw = globalThis.${ARGS_GLOBAL};
  delete globalThis.${ARGS_GLOBAL};
  if (typeof ${fn} !== 'function') return 'M';
  var out = ${fn}.apply(undefined, JSON.parse(raw));
  if (out !== null && (typeof out === 'object' || typeof out === 'function') && typeof out.then === 'function') return 'P';
  var json;
  try {
    json = JSON.stringify(out);
  } catch (error) {
    return 'U' + String(error && error.message);
  }
  return json === undefined ? 'Uthe function returned ' + typeof out : 'O' + json;
})()`;
}

// ------------------------------------------------------------------------------------ the module

let quickJsModule: Promise<QuickJSWASMModule> | null = null;

/**
 * The variant of the package. In the bundle (CommonJS) esbuild hands over the package's `.js` as the
 * `{ default: variant }` object, not the variant itself (in Node and Vitest the import is the variant).
 */
function baseVariant(): typeof variant {
  const imported = variant as typeof variant & { default?: typeof variant };
  return imported.default ?? imported;
}

/**
 * The QuickJS module, loaded once (a runtime per call is cheap; compiling the `.wasm` is not). The
 * module goes in compiled (`wasmModule`, the `instantiateWasm` hook of Emscripten) so nothing is
 * read from disk: the same in the tests, where the bytes come from the package, and in the bundle,
 * where they are embedded.
 */
function loadQuickJs(): Promise<QuickJSWASMModule> {
  quickJsModule ??= newQuickJSWASMModuleFromVariant(
    newVariant(baseVariant(), {
      wasmModule: () => WebAssembly.compile(wasmBytes.slice()),
    }),
  ).catch((error: unknown) => {
    quickJsModule = null;
    throw error;
  });
  return quickJsModule;
}

/**
 * The module as it is right after the wait: a call that was waiting while another one dropped the
 * module (`hostFailure`) loads a fresh one instead of running on the dropped one.
 */
async function currentModule(): Promise<QuickJSWASMModule> {
  for (;;) {
    const loading = loadQuickJs();
    const quickjs = await loading;
    if (loading === quickJsModule) return quickjs;
  }
}

// ----------------------------------------------------------------------------------- the failures

function failed(
  code: PluginFailureCode,
  message: string,
  details: Record<string, unknown> = {},
): PluginRun {
  return { ok: false, failure: { code, message, details } };
}

function limitFailure(
  call: Call,
  limit: keyof Limits,
  what: string,
  detail = {},
): PluginRun {
  const max = call.limits[limit];
  return failed('plugin-limit', `${call.subject}: ${what} (limit ${limit}: ${max})`, {
    plugin: call.path,
    limit,
    max,
    ...detail,
  });
}

/** What QuickJS says when a limit of the runtime stops the plugin. */
function limitOfError(error: JsError): 'memoryBytes' | 'stackBytes' | null {
  if (error.name !== 'InternalError') return null;
  if (error.message === 'out of memory' || error.message === 'string too long')
    return 'memoryBytes';
  return error.message === 'stack overflow' ? 'stackBytes' : null;
}

// ------------------------------------------------------------------------------------- the errors

interface JsError {
  readonly name?: string;
  readonly message: string;
  readonly stack?: string;
  readonly lineNumber?: number;
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

/** The error of QuickJS as a plain object (the handle is disposed). */
function readError(context: QuickJSContext, handle: QuickJSHandle): JsError {
  const dumped: unknown = context.dump(handle);
  handle.dispose();
  if (typeof dumped !== 'object' || dumped === null) return { message: String(dumped) };
  const record = dumped as Record<string, unknown>;
  return {
    name: text(record.name),
    message: text(record.message) ?? JSON.stringify(dumped),
    stack: text(record.stack),
    lineNumber: typeof record.lineNumber === 'number' ? record.lineNumber : undefined,
  };
}

/** `line:column` of the first frame in the plugin's file (`at generate (plugins/a.js:8:9)`). */
function positionOf(
  error: JsError,
  path: string,
): { line: number; column: number } | null {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}:(\\d+):(\\d+)`).exec(error.stack ?? '');
  if (match) return { line: Number(match[1]), column: Number(match[2]) };
  return error.lineNumber === undefined ? null : { line: error.lineNumber, column: 1 };
}

function errorFailure(call: Call, phase: 'load' | 'call', error: JsError): PluginRun {
  const position = positionOf(error, call.path);
  const where = position ? ` (${call.path}:${position.line}:${position.column})` : '';
  const what = error.name ? `${error.name}: ${error.message}` : error.message;
  const lead =
    phase === 'load'
      ? `${call.subject} could not be loaded`
      : `${call.subject} failed in ${call.fn}`;
  return failed('plugin-failed', `${lead}: ${what}${where}`, {
    plugin: call.path,
    function: call.fn,
    ...position,
  });
}

/** A failure of the evaluation, with the phase (`load` or `call`) in its `details`, so a caller can tell them apart. */
function evalFailure(
  call: Call,
  phase: 'load' | 'call',
  error: JsError,
  timedOut: boolean,
): PluginRun {
  const run = evalFailureOf(call, phase, error, timedOut);
  return run.ok
    ? run
    : {
        ok: false,
        failure: { ...run.failure, details: { ...run.failure.details, phase } },
      };
}

/** A failure of the evaluation, in order: the time limit, a limit of the runtime, then the plugin's. */
function evalFailureOf(
  call: Call,
  phase: 'load' | 'call',
  error: JsError,
  timedOut: boolean,
): PluginRun {
  if (timedOut) {
    const ms = call.limits.timeoutMs;
    return failed(
      'plugin-timeout',
      `${call.subject} went past the time limit of ${ms} ms`,
      {
        plugin: call.path,
        function: call.fn,
        timeoutMs: ms,
      },
    );
  }
  const limit = limitOfError(error);
  if (limit === 'memoryBytes')
    return limitFailure(call, limit, 'went past the memory limit');
  if (limit === 'stackBytes')
    return limitFailure(call, limit, 'went past the stack limit');
  return errorFailure(call, phase, error);
}

// --------------------------------------------------------------------------------- the evaluation

type Evaluated =
  | { readonly ok: true; readonly handle: QuickJSHandle }
  | { readonly ok: false; readonly error: JsError };

function evaluate(context: QuickJSContext, code: string, name: string): Evaluated {
  // `type: 'global'`: a classic script. Without it QuickJS detects an ES module by its `export`.
  const result = context.evalCode(code, name, { type: 'global' });
  if (result.error) return { ok: false, error: readError(context, result.error) };
  return { ok: true, handle: result.value };
}

/** Evaluates a script whose value does not matter (the prelude and the plugin's own text). */
function evaluateScript(
  context: QuickJSContext,
  code: string,
  name: string,
): JsError | null {
  const result = evaluate(context, code, name);
  if (!result.ok) return result.error;
  result.handle.dispose();
  return null;
}

function setArguments(context: QuickJSContext, payload: string): void {
  const handle = context.newString(payload);
  context.setProp(context.global, ARGS_GLOBAL, handle);
  handle.dispose();
}

interface Session {
  readonly context: QuickJSContext;
  readonly timedOut: () => boolean;
}

/** The three scripts, in order: the prelude, the plugin (it defines the functions) and the call. */
function runScripts(
  session: Session,
  call: Call,
  source: string,
  payload: string,
): PluginRun {
  const { context, timedOut } = session;
  const loadError =
    evaluateScript(context, CONSOLE_PRELUDE, '<prelude>') ??
    evaluateScript(context, source, call.path);
  if (loadError) return evalFailure(call, 'load', loadError, timedOut());
  setArguments(context, payload);
  const driver = evaluate(context, driverSource(call.fn), '<driver>');
  if (!driver.ok) return evalFailure(call, 'call', driver.error, timedOut());
  const answer = context.getString(driver.handle);
  driver.handle.dispose();
  return timedOut()
    ? evalFailure(call, 'call', { message: 'interrupted' }, true)
    : readAnswer(call, answer);
}

// ----------------------------------------------------------------------------------- the answer

function readAnswer(call: Call, answer: string): PluginRun {
  const tag = answer.charAt(0);
  if (tag === 'M') {
    return failed('plugin-failed', `${call.subject} does not define ${call.fn}`, {
      plugin: call.path,
      function: call.fn,
    });
  }
  if (tag === 'P') {
    return outputInvalid(
      call,
      `${call.fn} returned a Promise: the functions of a plugin are synchronous`,
    );
  }
  if (tag === 'U')
    return outputInvalid(
      call,
      `${call.fn} returned something that is not JSON (${answer.slice(1)})`,
    );
  return readValue(call, answer.slice(1));
}

function outputInvalid(call: Call, message: string): PluginRun {
  return failed('plugin-output-invalid', `${call.subject}: ${message}`, {
    plugin: call.path,
    function: call.fn,
  });
}

function readValue(call: Call, json: string): PluginRun {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return outputInvalid(call, `${call.fn} returned a text that is not JSON`);
  }
  return call.fn === 'generate' ? checkGenerated(call, value) : { ok: true, value };
}

function checkGenerated(call: Call, value: unknown): PluginRun {
  if (typeof value !== 'string') {
    const kind =
      value === null ? 'null' : Array.isArray(value) ? 'an array' : typeof value;
    return outputInvalid(call, `generate must return a string, not ${kind}`);
  }
  const bytes = Buffer.byteLength(value, 'utf8');
  if (bytes > call.limits.generatedTextBytes) {
    return limitFailure(call, 'generatedTextBytes', `generated ${bytes} bytes of text`, {
      bytes,
    });
  }
  return { ok: true, value };
}

// ------------------------------------------------------------------------------------- the input

/** The size limits of what goes in: the plugin file, the text `parse` reads and the projection. */
function checkInput(
  call: Call,
  source: string,
  parts: { readonly text: string | null; readonly projection: string },
): PluginRun | null {
  const sizes: [keyof Limits, string, number][] = [
    ['pluginBytes', 'the plugin file is', Buffer.byteLength(source, 'utf8')],
    [
      'parseTextBytes',
      'the text to read is',
      parts.text === null ? 0 : Buffer.byteLength(parts.text, 'utf8'),
    ],
    ['projectionBytes', 'the projection is', Buffer.byteLength(parts.projection, 'utf8')],
  ];
  for (const [limit, what, bytes] of sizes) {
    if (bytes > call.limits[limit])
      return limitFailure(call, limit, `${what} ${bytes} bytes`, { bytes });
  }
  return null;
}

/** `generate(projection)` and `parse(text, projection)`: the arguments as one JSON array text. */
function serializeArguments(
  fn: PluginFunction,
  args: readonly unknown[],
): { payload: string; text: string | null; projection: string } {
  const json = (value: unknown): string => JSON.stringify(value) ?? 'null';
  const projection = json(args[fn === 'parse' ? 1 : 0]);
  const readText = fn === 'parse' && typeof args[0] === 'string' ? args[0] : null;
  const parts = fn === 'parse' ? [json(args[0]), projection] : [projection];
  return { payload: `[${parts.join(',')}]`, text: readText, projection };
}

// ------------------------------------------------------------------------------------- the call

/** A fault of the host while QuickJS was running (WebAssembly trap, host stack): the module is dropped. */
function hostFailure(call: Call, error: unknown): PluginRun {
  quickJsModule = null;
  if (error instanceof RangeError && /call stack/i.test(error.message)) {
    return limitFailure(call, 'stackBytes', 'went past the stack limit');
  }
  const detail = error instanceof Error ? error.message : String(error);
  return failed('plugin-failed', `${call.subject}: the plugin runner failed: ${detail}`, {
    plugin: call.path,
  });
}

/** A new runtime and context, with the limits; they are disposed on every ordinary way out. */
function runInSandbox(
  quickjs: QuickJSWASMModule,
  call: Call,
  source: string,
  payload: string,
): PluginRun {
  const runtime = quickjs.newRuntime();
  runtime.setMemoryLimit(call.limits.memoryBytes);
  runtime.setMaxStackSize(Math.min(call.limits.stackBytes, QUICKJS_STACK_CAP_BYTES));
  const deadline = Date.now() + call.limits.timeoutMs;
  let timedOut = false;
  runtime.setInterruptHandler(() => {
    if (Date.now() < deadline) return false;
    timedOut = true;
    return true;
  });
  const context = runtime.newContext();
  const result = runScripts({ context, timedOut: () => timedOut }, call, source, payload);
  context.dispose();
  runtime.dispose();
  // QuickJS asks the handler only every few thousand instructions, so a long native call
  // (`indexOf` on a huge string, `sort`) can pass the deadline unseen: a late answer is a timeout.
  return result.ok && Date.now() >= deadline
    ? evalFailure(call, 'call', { message: 'interrupted' }, true)
    : result;
}

/**
 * Runs `fn` of the plugin's `source` with `args` (`[projection]` for `generate`, `[text,
 * projection]` for `parse`) and gives back the JSON value it returned, or the typed failure. The
 * result of `parse` is not checked here (`checkFormatResult` does it); `generate` must return a
 * string within `generatedTextBytes`.
 */
export async function runPlugin(
  source: string,
  fn: PluginFunction,
  args: readonly unknown[],
  options: PluginRunOptions = {},
): Promise<PluginRun> {
  const call: Call = {
    fn,
    subject: options.format ? `the plugin of ${options.format}` : 'the plugin',
    path: options.pluginPath ?? 'plugin.js',
    limits: { ...FORMAT_PLUGIN_LIMITS, ...options.limits },
  };
  const input = serializeArguments(fn, args);
  const refused = checkInput(call, source, input);
  if (refused) return refused;
  try {
    return runInSandbox(await currentModule(), call, source, input.payload);
  } catch (error) {
    return hostFailure(call, error);
  }
}

/** The failure as the `ToolError` that the tools throw (`plugin-failed`, `plugin-timeout`, …). */
export function pluginToolError(failure: PluginFailure): ToolError {
  return new ToolError(failure.code, failure.message, failure.details);
}

/**
 * `runPlugin` as the model's `FormatRunner` (the shape the shared format checks and the app's executor
 * have): the failure keeps its code and message and says whether the plugin failed while loading.
 */
export const quickJsRunner: FormatRunner = async (source, fn, args, context) => {
  const run = await runPlugin(source, fn, args, {
    ...(context === undefined
      ? {}
      : { format: context.format, pluginPath: context.pluginPath }),
  });
  if (run.ok) return run satisfies FormatOutcome;
  const { code, message, details } = run.failure;
  const phase = details['phase'];
  return {
    ok: false,
    failure: {
      code,
      message,
      ...(phase === 'load' || phase === 'call' ? { phase } : {}),
    },
  };
};
