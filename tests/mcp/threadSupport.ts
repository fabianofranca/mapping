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

// Support for the conversation tests through the MCP server: writes and reads `comments/` like the app does, with the
// same pure functions from `src/model/`.

export const HUMAN: ThreadAuthor = {
  kind: 'human',
  name: 'Marina Alves',
  email: 'marina@example.com',
};

export const AGENT: ThreadAuthor = { kind: 'agent', name: 'Claude Code', email: null };

/** The instant `n` minutes after 2026-11-01T10:00Z. */
export const at = (n: number): string =>
  new Date(Date.parse('2026-11-01T10:00:00.000Z') + n * 60_000).toISOString();

export const sha = (path: string): string =>
  createHash('sha256').update(readFileSync(path)).digest('hex');

export interface Seed {
  readonly id?: string;
  readonly anchor: ThreadAnchor;
  /** Messages in order; the first opens the conversation. */
  readonly messages: readonly {
    by: 'human' | 'agent';
    text: string;
    proposal?: string;
  }[];
  readonly resolved?: boolean;
  /** Minute of the first message (each following message advances 1 minute). */
  readonly start?: number;
}

/** Writes a conversation to `comments/` (or `comments/resolved/`) and returns the model. */
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

/** Reads the conversation file (open or resolved) like the app: validated by the model. */
export function readThread(projectDir: string, id: string): Thread {
  for (const resolved of [false, true]) {
    const path = join(projectDir, threadFilePath(id, resolved));
    if (!existsSync(path)) continue;
    const parsed = parseThreadText(readFileSync(path, 'utf8'));
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    return parsed.thread;
  }
  throw new Error(`no file for conversation ${id}`);
}

/** Imitates the app: appends a person's message to the open conversation (`revision + 1`). */
export function humanReplies(
  projectDir: string,
  id: string,
  text: string,
  minute: number,
) {
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

/** Imitates the app resolving: writes to `resolved/` and removes the file from `comments/`. */
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

/** Names of the files in `comments/` (without the subfolders). */
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
