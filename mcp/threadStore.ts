import { mkdir, readFile, readdir, realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  COMMENTS_DIR,
  RESOLVED_DIR,
  THREAD_ID_RE,
  ThreadError,
  mergeThreadCopies,
  parseThreadText,
  serializeThread,
  threadFilePath,
  type MergedThread,
  type Thread,
} from '../src/model';
import { ToolError } from './errors';
import { Roots, resolveProjectFile, writeFileAtomic } from './paths';
import type { ProjectLocation } from './projects';
import { writeNewFile } from './proposalStore';
import { compareByCreated } from './shared';

// Conversas em disco (etapa Comentários, CM6): `comments/<id>.json` (aberta) e
// `comments/resolved/<id>.json` (resolvida). O servidor lê as duas pastas e junta as cópias da
// mesma conversa (decisão 7); grava só o arquivo novo de `open_thread` e o acréscimo de uma
// mensagem em `comments/<id>.json`, com `revision + 1`. NUNCA grava em `comments/resolved/` nem
// resolve, reabre ou apaga: isso é da pessoa, na app. Como a proposta, a gravação confere o
// texto do arquivo imediatamente antes e, se a app mudou o arquivo no meio, relê e refaz.

/** Arquivo de conversa maior que isto é recusado, para não esgotar a memória. */
const MAX_THREAD_BYTES = 16 * 1024 * 1024;
/** Tentativas de um acréscimo quando o arquivo muda entre a leitura e a gravação. */
const MAX_ATTEMPTS = 3;

export interface StoredThread {
  readonly id: string;
  /** A conversa já com as duas cópias juntadas (`mergeThreadCopies`). */
  readonly thread: Thread;
}

export interface BrokenThread {
  readonly id: string;
  readonly error: string;
}

export interface StoredThreads {
  readonly threads: readonly StoredThread[];
  readonly broken: readonly BrokenThread[];
}

interface Copy {
  readonly real: string;
  readonly text: string;
}

interface Copies {
  readonly open: Copy | null;
  readonly resolved: Copy | null;
}

/** Ids (nomes dos arquivos `<id>.json`) de uma das duas pastas. */
async function idsIn(location: ProjectLocation, folder: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(join(location.dir, folder), { withFileTypes: true });
  } catch {
    return [];
  }
  return (
    entries
      // `isFile()` é falso para links simbólicos: nunca são seguidos.
      .filter((e) => e.isFile() && e.name.endsWith('.json') && !e.name.startsWith('.'))
      .map((e) => e.name.slice(0, -'.json'.length))
      .filter((id) => THREAD_ID_RE.test(id))
  );
}

/** Ids de todas as conversas do projeto (abertas e resolvidas), em ordem alfabética, sem ler os arquivos. */
export async function listThreadIds(location: ProjectLocation): Promise<string[]> {
  const [open, resolved] = await Promise.all([
    idsIn(location, COMMENTS_DIR),
    idsIn(location, RESOLVED_DIR),
  ]);
  return [...new Set([...open, ...resolved])].sort();
}

async function readCopy(
  roots: Roots,
  location: ProjectLocation,
  id: string,
  resolved: boolean,
): Promise<Copy | null> {
  const real = await resolveProjectFile(
    roots,
    location.dir,
    threadFilePath(id, resolved),
  );
  if (real === null) return null;
  if ((await stat(real)).size > MAX_THREAD_BYTES) {
    throw new ToolError('file-too-large', `conversa grande demais: ${id}`);
  }
  return { real, text: await readFile(real, 'utf8') };
}

async function readCopies(
  roots: Roots,
  location: ProjectLocation,
  id: string,
): Promise<Copies> {
  const open = await readCopy(roots, location, id, false);
  const resolved = await readCopy(roots, location, id, true);
  return { open, resolved };
}

type Parsed = Thread | { readonly error: string };

function parseCopy(id: string, copy: Copy | null): Parsed | null {
  if (copy === null) return null;
  const parsed = parseThreadText(copy.text);
  if (!parsed.ok) {
    const shown = parsed.errors.slice(0, 5).join('; ');
    const more = parsed.errors.length - 5;
    return { error: more > 0 ? `${shown}; …(+${more} erro(s))` : shown };
  }
  if (parsed.thread.id !== id) {
    return {
      error: `o id do arquivo ("${parsed.thread.id}") não bate com o do nome ("${id}")`,
    };
  }
  return parsed.thread;
}

const isThread = (parsed: Parsed | null): parsed is Thread =>
  parsed !== null && !('error' in parsed);

/** Junta as cópias; se alguma existe e não é legível, o erro dela (a conversa não é regravada). */
function mergeCopies(id: string, copies: Copies): MergedThread | { error: string } {
  const open = parseCopy(id, copies.open);
  const resolved = parseCopy(id, copies.resolved);
  for (const parsed of [open, resolved]) {
    if (parsed !== null && !isThread(parsed)) return parsed;
  }
  try {
    return mergeThreadCopies(
      isThread(open) ? open : null,
      isThread(resolved) ? resolved : null,
    );
  } catch (error) {
    if (error instanceof ThreadError) return { error: error.message };
    throw error;
  }
}

/** O erro de leitura de um item, com o código, para a lista `broken`. */
function readFailure(error: unknown): string {
  if (error instanceof ToolError) return `${error.code}: ${error.message}`;
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string'
    ? code
    : error instanceof Error
      ? error.message
      : String(error);
}

/** Todas as conversas do projeto; as ilegíveis vêm em `broken`. Ordem de criação. */
export async function listStoredThreads(
  roots: Roots,
  location: ProjectLocation,
  ids?: readonly string[],
): Promise<StoredThreads> {
  const threads: StoredThread[] = [];
  const broken: BrokenThread[] = [];
  for (const id of ids ?? (await listThreadIds(location))) {
    let copies: Copies;
    try {
      copies = await readCopies(roots, location, id);
    } catch (error) {
      broken.push({ id, error: readFailure(error) });
      continue;
    }
    const merged = mergeCopies(id, copies);
    if ('error' in merged) broken.push({ id, error: merged.error });
    else threads.push({ id, thread: merged.thread });
  }
  threads.sort((a, b) =>
    compareByCreated(
      { createdAt: a.thread.createdAt, id: a.id },
      { createdAt: b.thread.createdAt, id: b.id },
    ),
  );
  return { threads, broken };
}

/** Uma conversa, com as cópias juntadas; `thread-not-found` ou `invalid-thread`. */
export async function readStoredThread(
  roots: Roots,
  location: ProjectLocation,
  id: string,
): Promise<Thread> {
  const copies = await readCopies(roots, location, id);
  return mergedOrThrow(id, copies);
}

function mergedOrThrow(id: string, copies: Copies): Thread {
  if (copies.open === null && copies.resolved === null) {
    throw new ToolError('thread-not-found', `conversa não encontrada: ${id}`);
  }
  const merged = mergeCopies(id, copies);
  if ('error' in merged) {
    throw new ToolError('invalid-thread', `conversa ilegível: ${merged.error}`, {
      thread: id,
    });
  }
  return merged.thread;
}

/**
 * Grava a conversa nova em `comments/<id>.json`: arquivo temporário + `link`, que nunca
 * sobrescreve (falha com `EEXIST` se o destino já existe).
 */
export async function writeNewThread(
  roots: Roots,
  location: ProjectLocation,
  thread: Thread,
): Promise<string> {
  const parent = join(location.dir, COMMENTS_DIR);
  await mkdir(parent, { recursive: true });
  await roots.assertInside(await realpath(parent), COMMENTS_DIR);
  const relative = threadFilePath(thread.id, false);
  await writeNewFile(join(location.dir, relative), serializeThread(thread));
  return relative;
}

const sameText = (a: Copy | null, b: Copy | null): boolean => a?.text === b?.text;

/**
 * Acrescenta à conversa: lê as duas cópias, deixa `transform` calcular a conversa nova sobre a
 * versão do disco (pode recusar com um `ToolError`) e, imediatamente antes de gravar, confere que
 * os arquivos continuam como foram lidos. Se a app (ou outra pessoa) mudou algo no meio, relê e
 * refaz; sem sucesso em `MAX_ATTEMPTS`, `revision-conflict`. A gravação é sempre em
 * `comments/<id>.json` (a app move o arquivo de pasta e apaga a outra cópia na próxima gravação
 * dela). `transform` que devolve a mesma conversa não grava nada.
 */
export async function updateStoredThread(
  roots: Roots,
  location: ProjectLocation,
  id: string,
  transform: (thread: Thread) => Thread,
): Promise<Thread> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const copies = await readCopies(roots, location, id);
    const current = mergedOrThrow(id, copies);
    const next = transform(current);
    if (next === current) return next;
    const again = await readCopies(roots, location, id);
    if (
      !sameText(again.open, copies.open) ||
      !sameText(again.resolved, copies.resolved)
    ) {
      continue;
    }
    await mkdir(join(location.dir, COMMENTS_DIR), { recursive: true });
    await roots.assertInside(
      await realpath(join(location.dir, COMMENTS_DIR)),
      COMMENTS_DIR,
    );
    await writeFileAtomic(
      join(location.dir, threadFilePath(id, false)),
      serializeThread(next),
    );
    return next;
  }
  throw new ToolError(
    'revision-conflict',
    'a conversa foi alterada por outro processo enquanto era atualizada; releia e tente de novo',
    { thread: id },
  );
}

/**
 * Assinatura barata das duas pastas (nome, tamanho e data dos arquivos), para o
 * `wait_for_comment` só reler as conversas quando algo mudou.
 */
export async function commentsSignature(location: ProjectLocation): Promise<string> {
  const parts: string[] = [];
  for (const folder of [COMMENTS_DIR, RESOLVED_DIR]) {
    for (const id of await idsIn(location, folder)) {
      try {
        const info = await stat(join(location.dir, `${folder}/${id}.json`));
        parts.push(`${folder}/${id}:${info.size}:${info.mtimeMs}`);
      } catch {
        // O arquivo sumiu entre a listagem e o stat: a próxima assinatura já não o traz.
      }
    }
  }
  return parts.sort().join('|');
}
