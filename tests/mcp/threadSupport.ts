import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  appendMessage,
  openThread,
  parseThreadText,
  resolveThread,
  serializeThread,
  threadFilePath,
  type Thread,
  type ThreadAnchor,
  type ThreadAuthor,
} from '../../src/model';

// Apoio dos testes das conversas pelo servidor MCP: grava e lê `comments/` como a app faz, com as
// mesmas funções puras de `src/model/`.

export const HUMAN: ThreadAuthor = {
  kind: 'human',
  name: 'Marina Alves',
  email: 'marina@exemplo.com',
};

export const AGENT: ThreadAuthor = { kind: 'agent', name: 'Claude Code', email: null };

/** Instante `n` minutos depois de 2026-11-01T10:00Z. */
export const at = (n: number): string =>
  new Date(Date.parse('2026-11-01T10:00:00.000Z') + n * 60_000).toISOString();

export const sha = (path: string): string =>
  createHash('sha256').update(readFileSync(path)).digest('hex');

export interface Seed {
  readonly id?: string;
  readonly anchor: ThreadAnchor;
  /** Mensagens na ordem; a primeira abre a conversa. */
  readonly messages: readonly { by: 'human' | 'agent'; text: string; proposal?: string }[];
  readonly resolved?: boolean;
  /** Minuto da primeira mensagem (cada mensagem seguinte anda 1 minuto). */
  readonly start?: number;
}

/** Grava uma conversa em `comments/` (ou `comments/resolved/`) e devolve o modelo. */
export function seedThread(projectDir: string, seed: Seed): Thread {
  const id = seed.id ?? randomUUID();
  const start = seed.start ?? 0;
  const [first, ...rest] = seed.messages;
  let thread = openThread({
    id,
    anchor: seed.anchor,
    author: first!.by === 'human' ? HUMAN : AGENT,
    text: first!.text,
    at: at(start),
    messageId: randomUUID(),
    proposal: first!.proposal ?? null,
  });
  rest.forEach((m, index) => {
    thread = appendMessage(thread, {
      id: randomUUID(),
      author: m.by === 'human' ? HUMAN : AGENT,
      at: at(start + index + 1),
      text: m.text,
      proposal: m.proposal ?? null,
    });
  });
  if (seed.resolved) {
    thread = resolveThread(
      thread,
      { name: HUMAN.name, email: HUMAN.email as string },
      at(start + seed.messages.length + 1),
    );
  }
  const file = join(projectDir, threadFilePath(id, seed.resolved === true));
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, serializeThread(thread));
  return thread;
}

/** Lê o arquivo da conversa (aberta ou resolvida) como a app: validado pelo modelo. */
export function readThread(projectDir: string, id: string): Thread {
  for (const resolved of [false, true]) {
    const path = join(projectDir, threadFilePath(id, resolved));
    if (!existsSync(path)) continue;
    const parsed = parseThreadText(readFileSync(path, 'utf8'));
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    return parsed.thread;
  }
  throw new Error(`sem arquivo da conversa ${id}`);
}

/** Imita a app: acrescenta uma mensagem de pessoa à conversa aberta (`revision + 1`). */
export function humanReplies(projectDir: string, id: string, text: string, minute: number) {
  const thread = appendMessage(readThread(projectDir, id), {
    id: randomUUID(),
    author: HUMAN,
    at: at(minute),
    text,
    proposal: null,
  });
  writeFileSync(join(projectDir, threadFilePath(id, false)), serializeThread(thread));
  return thread;
}

/** Imita a app resolvendo: grava em `resolved/` e remove o arquivo de `comments/`. */
export function humanResolves(projectDir: string, id: string, minute: number): Thread {
  const thread = resolveThread(
    readThread(projectDir, id),
    { name: HUMAN.name, email: HUMAN.email as string },
    at(minute),
  );
  mkdirSync(join(projectDir, 'comments', 'resolved'), { recursive: true });
  writeFileSync(join(projectDir, threadFilePath(id, true)), serializeThread(thread));
  rmSync(join(projectDir, threadFilePath(id, false)));
  return thread;
}

/** Nomes dos arquivos em `comments/` (sem as subpastas). */
export function commentFiles(projectDir: string): string[] {
  const dir = join(projectDir, 'comments');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .sort();
}

export function resolvedFiles(projectDir: string): string[] {
  const dir = join(projectDir, 'comments', 'resolved');
  return existsSync(dir) ? readdirSync(dir).sort() : [];
}
