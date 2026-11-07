// @vitest-environment node
// Watcher de conversas do workspace (`examples/workspace/watch-comments.mjs`, etapa #645, fase CM6,
// decisão 39): observa `projetos/*/comments/`, espera a quietude e roda UM comando por vez, só
// quando alguma conversa aberta aguarda o agente. Os testes sobem o watcher de verdade, com um
// comando falso que anota cada execução, e esperam por polling com prazo (sem sleeps longos).
import { spawn, type ChildProcess } from 'node:child_process';
import {
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
    ? { kind, name: 'Marina', email: 'marina@exemplo.com' }
    : { kind, name: 'Claude Code', email: null };
}

/** Uma conversa no formato `mapping-thread`; `kinds` são os autores das mensagens, em ordem. */
function threadJson(id: string, kinds: ('human' | 'agent')[], resolved = false): string {
  return JSON.stringify({
    format: 'mapping-thread',
    formatVersion: 1,
    id,
    anchor: { kind: 'layer', id: 'camada-1' },
    createdAt: '2026-11-07T09:00:00.000Z',
    revision: kinds.length,
    resolved: resolved
      ? {
          by: { name: 'Marina', email: 'marina@exemplo.com' },
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

/** Sobe o watcher com o comando falso e espera ele começar a observar. */
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
    () => h.stderr.includes('watch-comments: observando'),
    'o watcher observar',
  );
}

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), 'watch-comments-'));
  const root = join(dir, 'projetos');
  mkdirSync(join(root, 'p1', 'comments'), { recursive: true });
  h = { dir, root, mark: join(dir, 'mark.log'), child: null, stderr: '' };
});

afterEach(async () => {
  const child = h.child;
  if (child && child.exitCode === null) {
    // SIGTERM: o watcher mata o comando em andamento; SIGKILL só se ele não sair a tempo.
    const closed = new Promise((resolve) => child.once('close', resolve));
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 2000);
    await closed;
    clearTimeout(timer);
  }
  rmSync(h.dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

describe('examples/workspace/watch-comments.mjs', { timeout: 20000 }, () => {
  it('uma conversa que já aguarda o agente ao iniciar dispara uma execução', async () => {
    putThread('t1', ['human']);
    await startWatcher();
    await waitFor(() => runs().length === 1, 'a primeira execução');
    await pause(700);
    expect(runs()).toHaveLength(1);
  });

  it('só as conversas abertas que aguardam o agente entram; humano, resolvida e inválida ficam de fora', async () => {
    putThread('espera-humano', ['human', 'agent']);
    putThread('resolvida', ['human'], { resolvedDir: true });
    const aguarda = putThread('aguarda-agente', ['human', 'agent', 'human']);
    writeFileSync(join(h.root, 'p1', 'comments', 'quebrada.json'), '{ não é json');
    await startWatcher();
    await waitFor(() => runs().length === 1, 'a execução');
    const [run] = runs();
    expect(run?.awaiting).toEqual([
      { project: 'p1', thread: 'aguarda-agente', path: aguarda },
    ]);
    expect(h.stderr).toContain('quebrada.json');
  });

  it('não dispara quando nenhuma conversa aguarda o agente', async () => {
    putThread('espera-humano', ['human', 'agent']);
    await startWatcher();
    // O controle positivo prova que o watcher estava de pé e já tinha avaliado o estado inicial.
    await pause(800);
    putThread('controle', ['human']);
    await waitFor(() => runs().length === 1, 'a execução do controle');
    expect(runs()[0]?.awaiting.map((a) => a.thread)).toEqual(['controle']);
  });

  it('uma conversa nova com a última mensagem de pessoa dispara depois da quietude, uma vez só', async () => {
    await startWatcher();
    const file = putThread('t1', ['human']);
    for (let i = 0; i < 3; i++) {
      await pause(60);
      writeFileSync(file, threadJson('t1', ['human']));
    }
    await waitFor(() => runs().length === 1, 'a execução');
    await pause(700);
    expect(runs()).toHaveLength(1);
  });

  it('roda um comando de cada vez: a segunda execução só começa depois que a primeira termina', async () => {
    putThread('t1', ['human']);
    await startWatcher({ FAKE_SLEEP_MS: '1000' });
    await waitFor(() => runs().length === 1, 'a primeira execução');
    putThread('t2', ['human']);
    await waitFor(() => runs().length === 2, 'a segunda execução', 10000);
    const [first, second] = runs();
    expect(first?.end).not.toBeNull();
    expect(second?.start).toBeGreaterThanOrEqual(first?.end ?? Infinity);
    expect(second?.awaiting.map((a) => a.thread)).toEqual(['t2']);
  });

  it('o mesmo par conversa:mensagem não repete, mas uma mensagem nova de pessoa gera outro', async () => {
    const file = putThread('t1', ['human']);
    await startWatcher();
    await waitFor(() => runs().length === 1, 'a primeira execução');
    // Regrava a mesma conversa (o agente ignorou): não pode virar laço.
    writeFileSync(file, threadJson('t1', ['human']));
    putThread('t2', ['human']);
    await waitFor(() => runs().length === 2, 'a execução da conversa nova');
    expect(runs()[1]?.awaiting.map((a) => a.thread)).toEqual(['t2']);
    // Mensagem nova de pessoa na t1: outro par.
    writeFileSync(file, threadJson('t1', ['human', 'agent', 'human']));
    await waitFor(() => runs().length === 3, 'a execução da mensagem nova');
    expect(runs()[2]?.awaiting.map((a) => a.thread)).toEqual(['t1']);
  });

  it('MAPPING_AWAITING traz projeto, conversa e caminho absoluto', async () => {
    mkdirSync(join(h.root, 'p2'), { recursive: true });
    const file = putThread('abc-123', ['human'], { project: 'p2' });
    await startWatcher();
    await waitFor(() => runs().length === 1, 'a execução');
    expect(runs()[0]?.awaiting).toEqual([
      { project: 'p2', thread: 'abc-123', path: file },
    ]);
  });

  it('sem "--" e comando, mostra o uso no stderr e sai com 2', async () => {
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
    expect(err).toContain('uso');
  });

  it('encerra limpo em SIGTERM', async () => {
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

  it('olha a última mensagem por at e, no empate, por id; só conversa aberta aguarda', async () => {
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

  it('scanAwaiting lê só comments/*.json de cada projeto', async () => {
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
