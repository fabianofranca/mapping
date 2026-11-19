// @vitest-environment node
// Thread watcher of the workspace (`examples/workspace/watch-comments.mjs`, stage #645, phase CM6,
// decision 39): watches `projetos/*/comments/`, waits for quiet and runs ONE command at a time,
// only when some open thread awaits the agent. The tests start the real watcher, with a fake
// command that records each run, and wait by polling with a deadline (no long sleeps).
import { spawn, type ChildProcess } from 'node:child_process';
import {
  copyFileSync,
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const SCRIPT = join(ROOT, 'examples', 'workspace', 'watch-comments.mjs');
const QUIET = '0.3';

interface Run {
  readonly start: number;
  readonly end: number | null;
  readonly awaiting: { project: string; thread: string; path: string }[];
}

interface Harness {
  readonly dir: string;
  readonly root: string;
  readonly mark: string;
  child: ChildProcess | null;
  stderr: string;
}

let h: Harness;

const FAKE = `
import { appendFileSync } from 'node:fs';
const mark = process.env.MARK_FILE;
const line = (o) => appendFileSync(mark, JSON.stringify(o) + '\\n');
line({ event: 'start', at: Date.now(), awaiting: process.env.MAPPING_AWAITING });
setTimeout(() => line({ event: 'end', at: Date.now() }), Number(process.env.FAKE_SLEEP_MS ?? 0));
`;

function author(kind: 'human' | 'agent') {
  return kind === 'human'
    ? { kind, name: 'Marina', email: 'marina@example.com' }
    : { kind, name: 'Claude Code', email: null };
}

/** A thread in the `mapping-thread` format; `kinds` are the authors of the messages, in order. */
function threadJson(id: string, kinds: ('human' | 'agent')[], resolved = false): string {
  return JSON.stringify({
    format: 'mapping-thread',
    formatVersion: 1,
    id,
    anchor: { kind: 'layer', id: 'layer-1' },
    createdAt: '2026-11-07T09:00:00.000Z',
    revision: kinds.length,
    resolved: resolved
      ? {
          by: { name: 'Marina', email: 'marina@example.com' },
          at: '2026-11-07T12:00:00.000Z',
        }
      : null,
    messages: kinds.map((kind, i) => ({
      id: `m${id}-${i}`,
      author: author(kind),
      at: `2026-11-07T09:0${i}:00.000Z`,
      text: `mensagem ${i}`,
      proposal: null,
    })),
  });
}

function putThread(
  id: string,
  kinds: ('human' | 'agent')[],
  opts: { resolvedDir?: boolean; project?: string } = {},
): string {
  const base = join(h.root, opts.project ?? 'p1', 'comments');
  const dir = opts.resolvedDir ? join(base, 'resolved') : base;
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${id}.json`);
  writeFileSync(file, threadJson(id, kinds, opts.resolvedDir === true));
  return file;
}

function runs(): Run[] {
  if (!existsSync(h.mark)) return [];
  const out: { start: number; end: number | null; awaiting: Run['awaiting'] }[] = [];
  for (const line of readFileSync(h.mark, 'utf8').split('\n').filter(Boolean)) {
    const o = JSON.parse(line) as { event: string; at: number; awaiting?: string };
    if (o.event === 'start') {
      out.push({ start: o.at, end: null, awaiting: JSON.parse(o.awaiting ?? '[]') });
    } else {
      const last = out[out.length - 1];
      if (last) last.end = o.at;
    }
  }
  return out;
}

async function waitFor(pred: () => boolean, what: string, timeout = 8000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (pred()) return;
    if (h.child && h.child.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`prazo esgotado esperando: ${what}\nstderr:\n${h.stderr}`);
}

const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Starts the watcher with the fake command and waits for it to begin watching. */
async function startWatcher(env: Record<string, string> = {}): Promise<void> {
  const fake = join(h.dir, 'fake.mjs');
  writeFileSync(fake, FAKE);
  const child = spawn(
    process.execPath,
    [SCRIPT, '--root', h.root, '--quiet', QUIET, '--', process.execPath, fake],
    {
      env: { ...process.env, MARK_FILE: h.mark, ...env },
      stdio: ['ignore', 'ignore', 'pipe'],
    },
  );
  child.stderr?.on('data', (d: Buffer) => {
    h.stderr += d.toString();
  });
  h.child = child;
  await waitFor(
    () => h.stderr.includes('watch-comments: observing'),
    'o watcher observar',
  );
}

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), 'watch-comments-'));
  const root = join(dir, 'projects');
  mkdirSync(join(root, 'p1', 'comments'), { recursive: true });
  h = { dir, root, mark: join(dir, 'mark.log'), child: null, stderr: '' };
});

afterEach(async () => {
  const child = h.child;
  if (child && child.exitCode === null) {
    // SIGTERM: the watcher kills the running command; SIGKILL only if it does not exit in time.
    const closed = new Promise((resolve) => child.once('close', resolve));
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 2000);
    await closed;
    clearTimeout(timer);
  }
  rmSync(h.dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

describe('examples/workspace/watch-comments.mjs', { timeout: 20000 }, () => {
  it('a thread that already awaits the agent at startup triggers a run', async () => {
    putThread('t1', ['human']);
    await startWatcher();
    await waitFor(() => runs().length === 1, 'the first run');
    await pause(700);
    expect(runs()).toHaveLength(1);
  });

  it('only open threads that await the agent get in; human, resolved and invalid ones stay out', async () => {
    putThread('espera-humano', ['human', 'agent']);
    putThread('resolvida', ['human'], { resolvedDir: true });
    const awaiting = putThread('awaits-agent', ['human', 'agent', 'human']);
    writeFileSync(join(h.root, 'p1', 'comments', 'broken.json'), '{ not json');
    await startWatcher();
    await waitFor(() => runs().length === 1, 'the run');
    const [run] = runs();
    expect(run?.awaiting).toEqual([
      { project: 'p1', thread: 'awaits-agent', path: awaiting },
    ]);
    expect(h.stderr).toContain('broken.json');
  });

  it('does not trigger when no thread awaits the agent', async () => {
    putThread('espera-humano', ['human', 'agent']);
    await startWatcher();
    // The positive control proves the watcher was up and had already evaluated the initial state.
    await pause(800);
    putThread('controle', ['human']);
    await waitFor(() => runs().length === 1, 'the control run');
    expect(runs()[0]?.awaiting.map((a) => a.thread)).toEqual(['controle']);
  });

  it('a new thread whose last message is from a person triggers after the quiet period, once only', async () => {
    await startWatcher();
    const file = putThread('t1', ['human']);
    for (let i = 0; i < 3; i++) {
      await pause(60);
      writeFileSync(file, threadJson('t1', ['human']));
    }
    await waitFor(() => runs().length === 1, 'the run');
    await pause(700);
    expect(runs()).toHaveLength(1);
  });

  it('runs one command at a time: the second run only starts after the first one ends', async () => {
    putThread('t1', ['human']);
    await startWatcher({ FAKE_SLEEP_MS: '1000' });
    await waitFor(() => runs().length === 1, 'the first run');
    putThread('t2', ['human']);
    await waitFor(() => runs().length === 2, 'the second run', 10000);
    const [first, second] = runs();
    expect(first?.end).not.toBeNull();
    expect(second?.start).toBeGreaterThanOrEqual(first?.end ?? Infinity);
    expect(second?.awaiting.map((a) => a.thread)).toEqual(['t2']);
  });

  it('the same thread:message pair does not repeat, but a new message from a person creates another', async () => {
    const file = putThread('t1', ['human']);
    await startWatcher();
    await waitFor(() => runs().length === 1, 'the first run');
    // Rewrites the same thread (the agent ignored it): it must not turn into a loop.
    writeFileSync(file, threadJson('t1', ['human']));
    putThread('t2', ['human']);
    await waitFor(() => runs().length === 2, 'the run of the new thread');
    expect(runs()[1]?.awaiting.map((a) => a.thread)).toEqual(['t2']);
    // New message from a person in t1: another pair.
    writeFileSync(file, threadJson('t1', ['human', 'agent', 'human']));
    await waitFor(() => runs().length === 3, 'the run of the new message');
    expect(runs()[2]?.awaiting.map((a) => a.thread)).toEqual(['t1']);
  });

  it('MAPPING_AWAITING brings project, thread and absolute path', async () => {
    mkdirSync(join(h.root, 'p2'), { recursive: true });
    const file = putThread('abc-123', ['human'], { project: 'p2' });
    await startWatcher();
    await waitFor(() => runs().length === 1, 'the run');
    expect(runs()[0]?.awaiting).toEqual([
      { project: 'p2', thread: 'abc-123', path: file },
    ]);
  });

  it('without "--" and a command, prints the usage on stderr and exits with 2', async () => {
    const child = spawn(process.execPath, [SCRIPT, '--root', h.root], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let err = '';
    child.stderr.on('data', (d: Buffer) => {
      err += d.toString();
    });
    const code = await new Promise<number | null>((resolve) =>
      child.on('close', resolve),
    );
    expect(code).toBe(2);
    expect(err).toContain('watch-comments:');
    expect(err).toContain('usage');
  });

  describe('default root (stage #1879, decision 5)', () => {
    /** Copies the script into a new folder with the given subfolders and starts it without --root. */
    async function startDefault(
      folders: string[],
    ): Promise<{ err: string; root: string }> {
      const dir = join(h.dir, 'ws');
      mkdirSync(dir, { recursive: true });
      const script = join(dir, 'watch-comments.mjs');
      copyFileSync(SCRIPT, script);
      for (const f of folders) mkdirSync(join(dir, f), { recursive: true });
      const fake = join(h.dir, 'fake.mjs');
      writeFileSync(fake, FAKE);
      const child = spawn(
        process.execPath,
        [script, '--quiet', QUIET, '--', process.execPath, fake],
        {
          env: { ...process.env, MARK_FILE: h.mark },
          stdio: ['ignore', 'ignore', 'pipe'],
        },
      );
      let err = '';
      child.stderr?.on('data', (d: Buffer) => {
        err += d.toString();
      });
      h.child = child;
      await waitFor(() => err.includes('watch-comments: observing'), 'the watcher');
      return { err, root: dir };
    }

    it('uses projects/ next to the script', async () => {
      const { err, root } = await startDefault(['projects']);
      expect(err).toContain(`observing ${join(root, 'projects')}`);
      expect(err).not.toContain('projetos');
    });

    it('uses projetos/ only when it is the only one, and says so in the start log', async () => {
      const { err, root } = await startDefault(['projetos']);
      expect(err).toContain(`observing ${join(root, 'projetos')}`);
      expect(err).toContain('projetos/');
      expect(err).toContain('legacy');
    });

    it('prefers projects/ when both exist', async () => {
      const { err, root } = await startDefault(['projects', 'projetos']);
      expect(err).toContain(`observing ${join(root, 'projects')}`);
      expect(err).not.toContain('legacy');
    });
  });

  describe('--emit and --state (stage #1879, decisions 1 and 2)', () => {
    interface Emitter {
      child: ChildProcess;
      out: () => string;
      err: () => string;
      code: Promise<number | null>;
    }

    /** Starts the watcher in `--emit` mode (or with the given arguments); stdout is captured. */
    function spawnWatcher(args: string[]): Emitter {
      const child = spawn(process.execPath, [SCRIPT, ...args], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let out = '';
      child.stdout?.on('data', (d: Buffer) => {
        out += d.toString();
      });
      child.stderr?.on('data', (d: Buffer) => {
        h.stderr += d.toString();
      });
      h.child = child;
      const code = new Promise<number | null>((resolve) => child.on('close', resolve));
      return { child, out: () => out, err: () => h.stderr, code };
    }

    async function startEmit(extra: string[] = []): Promise<Emitter> {
      h.stderr = '';
      const e = spawnWatcher(['--emit', '--root', h.root, '--quiet', QUIET, ...extra]);
      await waitFor(() => h.stderr.includes('watch-comments: observing'), 'the watcher');
      return e;
    }

    async function stop(e: Emitter): Promise<void> {
      e.child.kill('SIGTERM');
      await e.code;
    }

    const wakes = (e: Emitter): { project: string; thread: string; path: string }[][] =>
      e
        .out()
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          expect(line.startsWith('MAPPING_WAKE ')).toBe(true);
          return JSON.parse(line.slice('MAPPING_WAKE '.length));
        });

    it('prints exactly one MAPPING_WAKE line per batch on stdout, with the logs on stderr', async () => {
      const a = putThread('t1', ['human']);
      const b = putThread('t2', ['human'], { project: 'p2' });
      const e = await startEmit();
      await waitFor(() => e.out().includes('\n'), 'the wake line');
      await pause(500);
      expect(e.out().split('\n').filter(Boolean)).toHaveLength(1);
      expect(e.out()).toMatch(/^MAPPING_WAKE \[/);
      expect(wakes(e)[0]).toEqual([
        { project: 'p1', thread: 't1', path: a },
        { project: 'p2', thread: 't2', path: b },
      ]);
      expect(e.err()).toContain('watch-comments:');
      await stop(e);
    });

    it('a second batch carries only the new pairs', async () => {
      putThread('t1', ['human']);
      const e = await startEmit();
      await waitFor(() => wakes(e).length === 1, 'the first wake');
      const file = putThread('t2', ['human']);
      await waitFor(() => wakes(e).length === 2, 'the second wake');
      expect(wakes(e)[1]).toEqual([{ project: 'p1', thread: 't2', path: file }]);
      await stop(e);
    });

    it('--emit together with a command, or without --emit and a command, exits with 2 and the usage', async () => {
      for (const args of [
        ['--emit', '--root', h.root, '--', process.execPath, '-e', ''],
        ['--root', h.root],
      ]) {
        h.stderr = '';
        const e = spawnWatcher(args);
        expect(await e.code).toBe(2);
        expect(e.err()).toContain('usage');
        expect(e.out()).toBe('');
      }
    });

    describe('--state', () => {
      const statePath = (): string => join(h.dir, 'sub', 'state.json');

      it('a restart with the same file does not repeat a pair, and a new message fires', async () => {
        putThread('t1', ['human']);
        const first = await startEmit(['--state', statePath()]);
        await waitFor(() => wakes(first).length === 1, 'the first wake');
        await stop(first);
        expect(existsSync(statePath())).toBe(true);
        const second = await startEmit(['--state', statePath()]);
        await pause(800);
        expect(wakes(second)).toHaveLength(0);
        putThread('t2', ['human']);
        await waitFor(() => wakes(second).length === 1, 'the wake of the new pair');
        expect(wakes(second)[0]?.map((i) => i.thread)).toEqual(['t2']);
        await stop(second);
      });

      it('a pair that appeared while the watcher was stopped fires on start', async () => {
        putThread('t1', ['human']);
        const first = await startEmit(['--state', statePath()]);
        await waitFor(() => wakes(first).length === 1, 'the first wake');
        await stop(first);
        putThread('t2', ['human']);
        const second = await startEmit(['--state', statePath()]);
        await waitFor(() => wakes(second).length === 1, 'the wake on start');
        expect(wakes(second)[0]?.map((i) => i.thread)).toEqual(['t2']);
        await stop(second);
      });

      it('a pair that stopped awaiting leaves the file', async () => {
        putThread('t1', ['human']);
        const e = await startEmit(['--state', statePath()]);
        await waitFor(() => wakes(e).length === 1, 'the first wake');
        const saved = readFileSync(statePath(), 'utf8');
        expect(saved).toContain('t1');
        putThread('t1', ['human', 'agent']);
        putThread('t2', ['human']);
        await waitFor(() => wakes(e).length === 2, 'the second wake');
        const after = readFileSync(statePath(), 'utf8');
        expect(after).toContain('t2');
        expect(after).not.toContain('mt1-0');
        await stop(e);
      });

      it('a missing file starts empty without a warning', async () => {
        putThread('t1', ['human']);
        const e = await startEmit(['--state', statePath()]);
        await waitFor(() => wakes(e).length === 1, 'the wake');
        expect(e.err()).not.toContain('state file');
        await stop(e);
      });

      it('an invalid file starts empty with a warning and is overwritten', async () => {
        mkdirSync(join(h.dir, 'sub'), { recursive: true });
        writeFileSync(statePath(), '{ not json');
        putThread('t1', ['human']);
        const e = await startEmit(['--state', statePath()]);
        await waitFor(() => wakes(e).length === 1, 'the wake');
        expect(e.err()).toContain('state file');
        expect(() => JSON.parse(readFileSync(statePath(), 'utf8'))).not.toThrow();
        expect(readFileSync(statePath(), 'utf8')).toContain('t1');
        await stop(e);
      });
    });

    it('the start log names the root and the number of project folders', async () => {
      mkdirSync(join(h.root, 'p2'), { recursive: true });
      const e = await startEmit();
      expect(e.err()).toContain(`observing ${h.root} (2 project folders`);
      await stop(e);
    });
  });

  it('exits cleanly on SIGTERM', async () => {
    await startWatcher();
    const child = h.child as ChildProcess;
    const closed = new Promise<number | null>((resolve) => child.on('close', resolve));
    child.kill('SIGTERM');
    expect(await closed).toBe(0);
  });
});

describe('awaitingAgent e scanAwaiting', () => {
  async function load(): Promise<Record<string, (...args: never[]) => unknown>> {
    const path = '../../examples/workspace/watch-comments.mjs';
    return (await import(/* @vite-ignore */ path)) as Record<
      string,
      (...args: never[]) => unknown
    >;
  }

  it('looks at the last message by at and, on a tie, by id; only an open thread awaits', async () => {
    const { awaitingAgent } = await load();
    const msg = (id: string, at: string, kind: string) => ({ id, at, author: { kind } });
    const call = awaitingAgent as (t: unknown) => unknown;
    const base = { resolved: null };
    expect(
      call({
        ...base,
        messages: [
          msg('b', '2026-11-07T09:00:00Z', 'agent'),
          msg('a', '2026-11-07T08:00:00Z', 'human'),
        ],
      }),
    ).toBeNull();
    expect(
      call({
        ...base,
        messages: [
          msg('1', '2026-11-07T09:00:00Z', 'agent'),
          msg('2', '2026-11-07T09:00:00Z', 'human'),
        ],
      }),
    ).toBe('2');
    expect(
      call({
        ...base,
        messages: [
          msg('1', '2026-11-07T09:00:00Z', 'human'),
          msg('2', '2026-11-07T09:00:00Z', 'agent'),
        ],
      }),
    ).toBeNull();
    expect(
      call({
        resolved: { by: {}, at: 'x' },
        messages: [msg('1', '2026-11-07T09:00:00Z', 'human')],
      }),
    ).toBeNull();
    expect(call({ resolved: null, messages: [] })).toBeNull();
  });

  it('scanAwaiting reads only comments/*.json of each project', async () => {
    const { scanAwaiting } = await load();
    putThread('t1', ['human']);
    putThread('t2', ['human'], { resolvedDir: true });
    appendFileSync(join(h.root, 'p1', 'comments', 'nota.txt'), 'x');
    const found = (await (scanAwaiting as (r: string) => Promise<unknown>)(h.root)) as {
      project: string;
      thread: string;
      messageId: string;
    }[];
    expect(found.map((f) => `${f.project}/${f.thread}:${f.messageId}`)).toEqual([
      'p1/t1:mt1-0',
    ]);
  });
});
