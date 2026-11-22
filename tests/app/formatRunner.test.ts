import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FORMAT_PLUGIN_LIMITS } from '../../src/model';
import {
  createFormatRunner,
  type FormatRunnerDeps,
  type SandboxFrame,
} from '../../src/app/formatRunner';

// The protocol of the app's executor with a fake frame: what is checked before sending, the
// serialized calls, the messages accepted only from the frame's window, the time limit plus the
// margin that removes the frame and the JSON that comes out. The real sandbox (iframe + Worker)
// runs in `tests/e2e/formatPlugins.spec.ts`.

interface Posted {
  readonly id: number;
  readonly source: string;
  readonly fn: string;
  readonly args: string;
  readonly timeoutMs: number;
}

class FakeFrame implements SandboxFrame {
  readonly window = { name: 'frame' };
  readonly posted: Posted[] = [];
  removed = false;
  post(message: unknown): void {
    this.posted.push(message as Posted);
  }
  remove(): void {
    this.removed = true;
  }
}

function harness(options: { autoReady?: boolean } = {}) {
  const frames: FakeFrame[] = [];
  let handler: ((event: { source: unknown; data: unknown }) => void) | null = null;
  let listeners = 0;
  const emit = (source: unknown, data: unknown) => handler?.({ source, data });
  const deps: FormatRunnerDeps = {
    createFrame: () => {
      const frame = new FakeFrame();
      frames.push(frame);
      if (options.autoReady !== false)
        queueMicrotask(() => emit(frame.window, { ready: true }));
      return frame;
    },
    listen: (next) => {
      handler = next;
      listeners += 1;
      return () => {
        handler = null;
      };
    },
  };
  const last = () => {
    const frame = frames.at(-1);
    if (!frame) throw new Error('no frame');
    return frame;
  };
  /** The `count`-th post of the last frame (the runner sends after the ready message). */
  const posted = async (count = 1): Promise<Posted> => {
    for (let i = 0; i < 20 && (frames.at(-1)?.posted.length ?? 0) < count; i++) {
      await Promise.resolve();
    }
    const post = last().posted[count - 1];
    if (!post) throw new Error('no post');
    return post;
  };
  const answer = (post: Posted, data: Record<string, unknown>) =>
    emit(last().window, { id: post.id, ...data });
  return { deps, frames, emit, last, posted, answer, listeners: () => listeners };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('the limits are checked before anything is sent', () => {
  it('a plugin over 1 MiB is plugin-limit and no frame is created', async () => {
    const h = harness();
    const run = createFormatRunner(h.deps);
    const outcome = await run(
      'x'.repeat(FORMAT_PLUGIN_LIMITS.pluginBytes + 1),
      'generate',
      [{}],
    );
    expect(outcome).toMatchObject({ ok: false, failure: { code: 'plugin-limit' } });
    expect(outcome.ok === false && outcome.failure.message).toContain('pluginBytes');
    expect(h.frames).toHaveLength(0);
  });

  it('a text to read over 4 MiB and a projection over 16 MiB are plugin-limit', async () => {
    const h = harness();
    const run = createFormatRunner(h.deps);
    const text = 'a'.repeat(FORMAT_PLUGIN_LIMITS.parseTextBytes + 1);
    const tooBig = await run('function parse(){}', 'parse', [text, {}]);
    expect(tooBig).toMatchObject({ ok: false, failure: { code: 'plugin-limit' } });
    expect(tooBig.ok === false && tooBig.failure.message).toContain('parseTextBytes');
    const projection = { big: 'a'.repeat(FORMAT_PLUGIN_LIMITS.projectionBytes) };
    const generate = await run('function generate(){}', 'generate', [projection]);
    expect(generate.ok === false && generate.failure.message).toContain(
      'projectionBytes',
    );
    expect(h.frames).toHaveLength(0);
  });

  it('the size is counted in UTF-8 bytes, not in characters', async () => {
    const h = harness();
    const run = createFormatRunner(h.deps);
    // '€' is 3 bytes: 400,000 of them are over 1 MiB, but only 400,000 characters.
    const source = '€'.repeat(400_000);
    const outcome = await run(source, 'generate', [{}]);
    expect(outcome).toMatchObject({ ok: false, failure: { code: 'plugin-limit' } });
  });
});

describe('a call', () => {
  it('sends the source, the function, the arguments as one JSON text and the time limit', async () => {
    const h = harness();
    const run = createFormatRunner(h.deps);
    const result = run('function parse(){}', 'parse', ['text', { a: 1 }]);
    const post = await h.posted();
    expect(post).toMatchObject({
      source: 'function parse(){}',
      fn: 'parse',
      args: '["text",{"a":1}]',
      timeoutMs: FORMAT_PLUGIN_LIMITS.timeoutMs,
    });
    h.answer(post, { status: 'ok', output: '{"operations":[]}' });
    expect(await result).toEqual({ ok: true, value: { operations: [] } });
  });

  it('the JSON that comes out is parsed, and generate gives a string', async () => {
    const h = harness();
    const run = createFormatRunner(h.deps);
    const result = run('function generate(){}', 'generate', [{}]);
    h.answer(await h.posted(), { status: 'ok', output: '"hello\\nworld"' });
    expect(await result).toEqual({ ok: true, value: 'hello\nworld' });
  });

  it('generate returning something other than a string is plugin-output-invalid', async () => {
    const h = harness();
    const run = createFormatRunner(h.deps);
    const result = run('function generate(){}', 'generate', [{}]);
    h.answer(await h.posted(), { status: 'ok', output: '{"a":1}' });
    expect(await result).toMatchObject({
      ok: false,
      failure: { code: 'plugin-output-invalid' },
    });
  });

  it('a generated text over 4 MiB is plugin-limit; an output that is not JSON is invalid', async () => {
    const h = harness();
    const run = createFormatRunner(h.deps);
    const big = run('function generate(){}', 'generate', [{}]);
    const text = 'x'.repeat(FORMAT_PLUGIN_LIMITS.generatedTextBytes + 1);
    h.answer(await h.posted(), { status: 'ok', output: JSON.stringify(text) });
    const outcome = await big;
    expect(outcome).toMatchObject({ ok: false, failure: { code: 'plugin-limit' } });
    expect(outcome.ok === false && outcome.failure.message).toContain(
      'generatedTextBytes',
    );

    const notJson = run('function parse(){}', 'parse', ['t', {}]);
    h.answer(await h.posted(2), { status: 'ok', output: '{nope' });
    expect(await notJson).toMatchObject({
      ok: false,
      failure: { code: 'plugin-output-invalid' },
    });
  });

  it('an error of the plugin keeps its message and the line and column', async () => {
    const h = harness();
    const run = createFormatRunner(h.deps);
    const result = run('function generate(){}', 'generate', [{}]);
    h.answer(await h.posted(), {
      status: 'error',
      message: 'Error: boom',
      line: 8,
      column: 9,
    });
    expect(await result).toEqual({
      ok: false,
      failure: { code: 'plugin-failed', message: 'Error: boom', line: 8, column: 9 },
    });
  });

  it('a missing function is plugin-failed and a Promise or non-JSON is plugin-output-invalid', async () => {
    const h = harness();
    const run = createFormatRunner(h.deps);
    const missing = run('x', 'parse', ['t', {}]);
    h.answer(await h.posted(), { status: 'missing' });
    expect(await missing).toMatchObject({
      ok: false,
      failure: { code: 'plugin-failed', message: expect.stringContaining('parse') },
    });
    const invalid = run('x', 'generate', [{}]);
    h.answer(await h.posted(2), {
      status: 'invalid',
      message: 'generate returned a Promise',
    });
    expect(await invalid).toEqual({
      ok: false,
      failure: { code: 'plugin-output-invalid', message: 'generate returned a Promise' },
    });
  });

  it('a timeout reported by the frame is plugin-timeout and the frame stays', async () => {
    const h = harness();
    const run = createFormatRunner(h.deps);
    const result = run('x', 'generate', [{}]);
    h.answer(await h.posted(), { status: 'timeout' });
    expect(await result).toMatchObject({
      ok: false,
      failure: { code: 'plugin-timeout' },
    });
    expect(h.last().removed).toBe(false);
  });
});

describe('the frame', () => {
  it('is created at the first call and kept for the next ones', async () => {
    const h = harness();
    const run = createFormatRunner(h.deps);
    const first = run('x', 'generate', [{}]);
    h.answer(await h.posted(), { status: 'ok', output: '"a"' });
    await first;
    const second = run('x', 'generate', [{}]);
    h.answer(await h.posted(2), { status: 'ok', output: '"b"' });
    expect(await second).toEqual({ ok: true, value: 'b' });
    expect(h.frames).toHaveLength(1);
  });

  it('serializes the calls: the second is sent only after the first answered', async () => {
    const h = harness();
    const run = createFormatRunner(h.deps);
    const first = run('one', 'generate', [{}]);
    const second = run('two', 'generate', [{}]);
    const post = await h.posted();
    expect(post.source).toBe('one');
    await Promise.resolve();
    await Promise.resolve();
    expect(h.last().posted).toHaveLength(1);
    h.answer(post, { status: 'ok', output: '"1"' });
    expect(await first).toEqual({ ok: true, value: '1' });
    const next = await h.posted(2);
    expect(next.source).toBe('two');
    expect(next.id).not.toBe(post.id);
    h.answer(next, { status: 'ok', output: '"2"' });
    expect(await second).toEqual({ ok: true, value: '2' });
  });

  it('without an answer within the limit plus 1 s it is removed and the call is plugin-timeout', async () => {
    const h = harness();
    const run = createFormatRunner(h.deps);
    const result = run('x', 'generate', [{}]);
    await h.posted();
    await vi.advanceTimersByTimeAsync(FORMAT_PLUGIN_LIMITS.timeoutMs + 999);
    expect(h.last().removed).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(await result).toMatchObject({
      ok: false,
      failure: { code: 'plugin-timeout' },
    });
    expect(h.last().removed).toBe(true);
  });

  it('the next call after a removal creates another frame', async () => {
    const h = harness();
    const run = createFormatRunner(h.deps);
    const first = run('x', 'generate', [{}]);
    await h.posted();
    await vi.advanceTimersByTimeAsync(FORMAT_PLUGIN_LIMITS.timeoutMs + 1001);
    await first;
    const second = run('x', 'generate', [{}]);
    for (let i = 0; i < 20; i++) await Promise.resolve();
    const post = await h.posted();
    expect(h.frames).toHaveLength(2);
    h.answer(post, { status: 'ok', output: '"again"' });
    expect(await second).toEqual({ ok: true, value: 'again' });
  });

  it('that never gets ready is plugin-failed and removed', async () => {
    const h = harness({ autoReady: false });
    const run = createFormatRunner(h.deps);
    const result = run('x', 'generate', [{}]);
    await vi.advanceTimersByTimeAsync(FORMAT_PLUGIN_LIMITS.timeoutMs + 1);
    expect(await result).toMatchObject({ ok: false, failure: { code: 'plugin-failed' } });
    expect(h.last().removed).toBe(true);
  });

  it('an answer that carries a `ready` key is still the answer (the plugin can post anything)', async () => {
    const h = harness();
    const run = createFormatRunner(h.deps);
    const result = run('x', 'generate', [{}]);
    h.answer(await h.posted(), { status: 'ok', output: '"text"', ready: true });
    expect(await result).toEqual({ ok: true, value: 'text' });
  });

  it('arguments JSON cannot serialize give an outcome, never a throw', async () => {
    const h = harness();
    const run = createFormatRunner(h.deps);
    const outcome = await run('x', 'generate', [{ big: 1n }]);
    expect(outcome).toMatchObject({ ok: false, failure: { code: 'plugin-failed' } });
  });

  it('only messages from the frame window count: another window is ignored', async () => {
    const h = harness();
    const run = createFormatRunner(h.deps);
    const result = run('x', 'generate', [{}]);
    const post = await h.posted();
    h.emit({ name: 'other' }, { id: post.id, status: 'ok', output: '"forged"' });
    h.emit(null, { id: post.id, status: 'ok', output: '"forged"' });
    let settled = false;
    void result.then(() => {
      settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    h.answer(post, { status: 'ok', output: '"real"' });
    expect(await result).toEqual({ ok: true, value: 'real' });
  });

  it('a message with another id or a shape it does not know is ignored', async () => {
    const h = harness();
    const run = createFormatRunner(h.deps);
    const result = run('x', 'generate', [{}]);
    const post = await h.posted();
    h.emit(h.last().window, { id: post.id + 100, status: 'ok', output: '"old"' });
    h.emit(h.last().window, 'a string');
    h.emit(h.last().window, null);
    h.emit(h.last().window, { id: post.id, status: 'surprise' });
    let settled = false;
    void result.then(() => {
      settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    h.answer(post, { status: 'ok', output: '"fine"' });
    expect(await result).toEqual({ ok: true, value: 'fine' });
  });

  it('dispose removes the frame and the listener and ends a call in progress', async () => {
    const h = harness();
    const run = createFormatRunner(h.deps);
    const result = run('x', 'generate', [{}]);
    await h.posted();
    run.dispose();
    expect(await result).toMatchObject({ ok: false, failure: { code: 'plugin-failed' } });
    expect(h.last().removed).toBe(true);
  });
});
