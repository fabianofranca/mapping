import {
  FORMAT_PLUGIN_LIMITS,
  type FormatFailure,
  type FormatFailureCode,
  type FormatFunction,
  type FormatOutcome,
  type FormatRunner,
} from '../model/formatPlugin';
import { reportError } from '../utils/report';
import { SANDBOX_SRCDOC } from './formatSandbox';

// The executor of the format plugins in the app (stage #2035, decisions 7 and 9). The code of a
// specialization only runs isolated: a hidden `<iframe sandbox="allow-scripts">` (no
// `allow-same-origin`, so it has an opaque origin and sees nothing of the app) whose bootstrap
// creates one `blob:` Worker per call and terminates it at the end or at the time limit
// (`formatSandbox.ts`). The iframe is created at the first call and kept while the app is open;
// the calls are serialized; without an answer within the limit plus 1 s the page removes the
// iframe and the next call creates another. The input limits are checked before sending and the
// output limits on return; the app has no memory limit (a Worker exposes none, decision 7). The
// input goes in as a JSON text and the output comes out as one, parsed here; messages count only
// from the iframe's own window. Every failure is a typed `FormatOutcome`: nothing here rejects.

/** What the page needs of the iframe: its window (the source of its messages), a way to post and to remove it. */
export interface SandboxFrame {
  /** `event.source` of every message the frame sends. */
  readonly window: unknown;
  post(message: unknown): void;
  remove(): void;
}

export interface FormatRunnerDeps {
  createFrame(): SandboxFrame;
  /** Listens to the page's `message` events; returns the function that stops it. */
  listen(handler: (event: { source: unknown; data: unknown }) => void): () => void;
}

export interface DisposableFormatRunner extends FormatRunner {
  /** Removes the frame and the listener, and ends the call in progress. */
  dispose(): void;
}

/** The margin over the plugin's time limit before the page gives up on the frame and removes it. */
const FRAME_MARGIN_MS = 1000;
/** How long a new frame has to say it is ready. */
const FRAME_READY_MS = FORMAT_PLUGIN_LIMITS.timeoutMs;

type Limits = typeof FORMAT_PLUGIN_LIMITS;

const failure = (code: FormatFailureCode, message: string): FormatOutcome => ({
  ok: false,
  failure: { code, message },
});

const byteLength = (text: string): number => new TextEncoder().encode(text).length;

function limitFailure(limit: keyof Limits, what: string, bytes: number): FormatOutcome {
  return failure(
    'plugin-limit',
    `${what} ${bytes} bytes (limit ${limit}: ${FORMAT_PLUGIN_LIMITS[limit]})`,
  );
}

interface Serialized {
  readonly payload: string;
  readonly refused: FormatOutcome | null;
}

/** The size limits of what goes in: the plugin file, the text `parse` reads and the projection. */
function serialize(
  source: string,
  fn: FormatFunction,
  args: readonly unknown[],
): Serialized {
  const json = (value: unknown): string => JSON.stringify(value) ?? 'null';
  const projection = json(args[fn === 'parse' ? 1 : 0]);
  const text = fn === 'parse' && typeof args[0] === 'string' ? args[0] : null;
  const sizes: [keyof Limits, string, number][] = [
    ['pluginBytes', 'the plugin file is', byteLength(source)],
    ['parseTextBytes', 'the text to read is', text === null ? 0 : byteLength(text)],
    ['projectionBytes', 'the projection is', byteLength(projection)],
  ];
  for (const [limit, what, bytes] of sizes) {
    if (bytes > FORMAT_PLUGIN_LIMITS[limit]) {
      return { payload: '', refused: limitFailure(limit, what, bytes) };
    }
  }
  const parts = fn === 'parse' ? [json(args[0]), projection] : [projection];
  return { payload: `[${parts.join(',')}]`, refused: null };
}

// ------------------------------------------------------------------------------- the answer

type Answer = Readonly<Record<string, unknown>> & { readonly status: string };

const STATUSES = new Set(['ok', 'error', 'missing', 'invalid', 'timeout']);

/** The frame's `{ ready: true }`. An answer always has an `id` (the plugin can post anything, so `ready` alone is not it). */
function isReadySignal(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;
  const record = data as Record<string, unknown>;
  return record['ready'] === true && record['id'] === undefined;
}

function asAnswer(data: unknown, id: number): Answer | null {
  if (typeof data !== 'object' || data === null) return null;
  const record = data as Record<string, unknown>;
  const { status } = record;
  if (record.id !== id || typeof status !== 'string' || !STATUSES.has(status)) {
    return null;
  }
  return record as Answer;
}

const textOf = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

function positionOf(answer: Answer): Pick<FormatFailure, 'line' | 'column'> {
  const { line, column } = answer;
  return typeof line === 'number' && typeof column === 'number' ? { line, column } : {};
}

function outputOf(output: unknown, fn: FormatFunction): FormatOutcome {
  const raw = textOf(output, '');
  // The largest legitimate output is a projection-sized result; anything beyond is not parsed.
  if (raw.length > FORMAT_PLUGIN_LIMITS.projectionBytes) {
    return limitFailure('projectionBytes', 'the output is', byteLength(raw));
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return failure('plugin-output-invalid', `${fn} returned a text that is not JSON`);
  }
  if (fn !== 'generate') return { ok: true, value };
  if (typeof value !== 'string') {
    const kind =
      value === null ? 'null' : Array.isArray(value) ? 'an array' : typeof value;
    return failure('plugin-output-invalid', `generate must return a string, not ${kind}`);
  }
  const bytes = byteLength(value);
  return bytes > FORMAT_PLUGIN_LIMITS.generatedTextBytes
    ? limitFailure('generatedTextBytes', 'generated', bytes)
    : { ok: true, value };
}

function outcomeOf(answer: Answer, fn: FormatFunction): FormatOutcome {
  switch (answer.status) {
    case 'ok':
      return outputOf(answer.output, fn);
    case 'error':
      return {
        ok: false,
        failure: {
          code: 'plugin-failed',
          message: textOf(answer.message, 'the plugin failed'),
          ...positionOf(answer),
        },
      };
    case 'missing':
      return failure('plugin-failed', `the plugin does not define ${fn}`);
    case 'timeout':
      return failure('plugin-timeout', 'the plugin went past the time limit');
    default:
      return failure('plugin-output-invalid', textOf(answer.message, 'bad output'));
  }
}

// -------------------------------------------------------------------------------- the runner

interface Waiting {
  readonly id: number;
  readonly fn: FormatFunction;
  readonly settle: (outcome: FormatOutcome) => void;
}

/**
 * The runner over `deps`. The page's own (`browserDeps`) makes the real iframe; the tests pass a
 * fake frame.
 */
export function createFormatRunner(deps: FormatRunnerDeps): DisposableFormatRunner {
  let frame: SandboxFrame | null = null;
  let stopListening: (() => void) | null = null;
  let ready: (() => void) | null = null;
  let waiting: Waiting | null = null;
  let tail: Promise<unknown> = Promise.resolve();
  let nextId = 0;

  const drop = (): void => {
    frame?.remove();
    frame = null;
    stopListening?.();
    stopListening = null;
    ready = null;
  };

  const onMessage = (event: { source: unknown; data: unknown }): void => {
    if (frame === null || event.source !== frame.window) return;
    const { data } = event;
    if (isReadySignal(data)) {
      ready?.();
      return;
    }
    const current = waiting;
    if (current === null) return;
    const answer = asAnswer(data, current.id);
    if (answer !== null) current.settle(outcomeOf(answer, current.fn));
  };

  /** The frame once it said it is ready; `null` if it never did (the frame is removed). */
  const readyFrame = async (): Promise<SandboxFrame | null> => {
    if (frame !== null) return frame;
    stopListening = deps.listen(onMessage);
    const created = deps.createFrame();
    frame = created;
    const isReady = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), FRAME_READY_MS);
      ready = () => {
        clearTimeout(timer);
        resolve(true);
      };
    });
    ready = null;
    if (isReady && frame === created) return created;
    drop();
    return null;
  };

  const exchange = (
    live: SandboxFrame,
    source: string,
    fn: FormatFunction,
    payload: string,
  ): Promise<FormatOutcome> =>
    new Promise<FormatOutcome>((resolve) => {
      nextId += 1;
      const id = nextId;
      const settle = (outcome: FormatOutcome): void => {
        clearTimeout(timer);
        if (waiting?.id === id) waiting = null;
        resolve(outcome);
      };
      // The frame answers `plugin-timeout` itself at the limit; this one is for a frame that
      // does not answer at all (it is removed, and the next call creates another).
      const timer = setTimeout(() => {
        drop();
        settle(failure('plugin-timeout', 'the plugin went past the time limit'));
      }, FORMAT_PLUGIN_LIMITS.timeoutMs + FRAME_MARGIN_MS);
      waiting = { id, fn, settle };
      live.post({
        id,
        source,
        fn,
        args: payload,
        timeoutMs: FORMAT_PLUGIN_LIMITS.timeoutMs,
      });
    });

  const call = async (
    source: string,
    fn: FormatFunction,
    payload: string,
  ): Promise<FormatOutcome> => {
    try {
      const live = await readyFrame();
      if (live === null) {
        return failure('plugin-failed', 'the sandbox that runs the plugin did not start');
      }
      return await exchange(live, source, fn, payload);
    } catch (error) {
      drop();
      reportError('formatRunner.call', error);
      return failure('plugin-failed', 'the sandbox that runs the plugin failed');
    }
  };

  const run = (
    source: string,
    fn: FormatFunction,
    args: readonly unknown[],
  ): Promise<FormatOutcome> => {
    let serialized: Serialized;
    try {
      serialized = serialize(source, fn, args);
    } catch {
      return Promise.resolve(
        failure('plugin-failed', 'the arguments cannot be sent as JSON'),
      );
    }
    const { payload, refused } = serialized;
    if (refused !== null) return Promise.resolve(refused);
    const result = tail.then(() => call(source, fn, payload));
    tail = result;
    return result;
  };

  return Object.assign(run, {
    dispose: (): void => {
      const current = waiting;
      drop();
      current?.settle(failure('plugin-failed', 'the sandbox was closed'));
    },
  });
}

// ---------------------------------------------------------------------------- the real frame

/** The hidden iframe of the page. `srcdoc` is a Trusted Types sink: only `SANDBOX_SRCDOC` passes. */
function browserFrame(): SandboxFrame {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-scripts');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('tabindex', '-1');
  iframe.hidden = true;
  iframe.srcdoc = SANDBOX_SRCDOC;
  document.body.append(iframe);
  const target = iframe.contentWindow;
  return {
    window: target,
    post: (message) => target?.postMessage(message, '*'),
    remove: () => iframe.remove(),
  };
}

const browserDeps: FormatRunnerDeps = {
  createFrame: browserFrame,
  listen: (handler) => {
    const listener = (event: MessageEvent): void =>
      handler({ source: event.source, data: event.data });
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  },
};

let shared: DisposableFormatRunner | null = null;

/** The app's executor: one iframe for the whole app, created at the first call. */
export const runFormat: FormatRunner = (source, fn, args) => {
  shared ??= createFormatRunner(browserDeps);
  return shared(source, fn, args);
};
