import {
  mergeThreadCopies,
  parseThreadText,
  threadFilePath,
  type MergedThread,
  type Thread,
} from '../model';
import { reportError } from '../utils/report';
import type { ProjectStorage } from './types';

// Leitura das conversas (`comments/<id>.json` e `comments/resolved/<id>.json`, etapa Comentários):
// ao abrir o projeto, a cada conferência (só `comments/`) e sob pedido (`resolved/`). Um arquivo
// inválido não derruba nada: vira um problema listado à parte (a conversa some da lista, o resto
// continua), e o texto dele fica guardado para voltar idêntico no zip.

/** Uma cópia de conversa lida: a conversa, o texto exato, o carimbo (só na pasta) e a pasta. */
export interface LoadedThread {
  readonly thread: Thread;
  readonly text: string;
  readonly stamp: string | null;
  /** De qual pasta o arquivo veio: `comments/resolved/` (`true`) ou `comments/`. */
  readonly resolvedDir: boolean;
}

/** Arquivo de conversa que não pôde ser lido: o id do arquivo, a pasta e os erros. */
export interface ThreadProblem {
  readonly id: string;
  readonly resolvedDir: boolean;
  readonly errors: readonly string[];
}

export interface LoadedThreads {
  readonly threads: readonly LoadedThread[];
  readonly problems: readonly ThreadProblem[];
  /** Texto dos arquivos inválidos (caminho → texto), guardado para exportar sem perda. */
  readonly problemTexts?: ReadonlyMap<string, string>;
}

export const NO_THREADS: LoadedThreads = { threads: [], problems: [] };

export type ReadThreadResult =
  | ({ readonly ok: true } & LoadedThread)
  | {
      readonly ok: false;
      /** O arquivo não existe (mais). */
      readonly missing: boolean;
      readonly errors: readonly string[];
      /** O texto lido, quando o arquivo existe mas é inválido. */
      readonly text: string | null;
    };

/** Lê e valida uma cópia da conversa. O `id` do arquivo precisa ser o do nome. */
export async function readThread(
  storage: ProjectStorage,
  id: string,
  resolvedDir: boolean,
): Promise<ReadThreadResult> {
  let text: string | null;
  let stamp: string | null;
  try {
    stamp = storage.statThread ? await storage.statThread(id, resolvedDir) : null;
    text = await storage.readThread(id, resolvedDir);
  } catch (e) {
    reportError('threads.read', e);
    return {
      ok: false,
      missing: false,
      errors: [e instanceof Error ? e.message : String(e)],
      text: null,
    };
  }
  if (text === null) return { ok: false, missing: true, errors: [], text: null };
  return parseThreadFile(id, text, stamp, resolvedDir);
}

export function parseThreadFile(
  id: string,
  text: string,
  stamp: string | null,
  resolvedDir: boolean,
): ReadThreadResult {
  const parsed = parseThreadText(text);
  if (!parsed.ok) return { ok: false, missing: false, errors: parsed.errors, text };
  if (parsed.thread.id !== id) {
    return {
      ok: false,
      missing: false,
      errors: [`id: deve ser "${id}" (o nome do arquivo), mas é "${parsed.thread.id}"`],
      text,
    };
  }
  for (const warning of parsed.warnings) reportError('threads.read', `${id}: ${warning}`);
  return { ok: true, thread: parsed.thread, text, stamp, resolvedDir };
}

/** Caminho do arquivo da conversa, a chave dos textos inválidos. */
export const threadProblemPath = threadFilePath;

/** Registra um problema de leitura no Diagnóstico (uma linha por arquivo). */
export function reportThreadProblem(problem: ThreadProblem): void {
  reportError(
    'threads.invalid',
    `${threadFilePath(problem.id, problem.resolvedDir)}: ${problem.errors.join('; ')}`,
  );
}

/** Junta as duas cópias da mesma conversa, quando há. `null` se nenhuma é legível. */
export function mergeLoaded(
  open: LoadedThread | null,
  resolved: LoadedThread | null,
): MergedThread | null {
  if (open === null && resolved === null) return null;
  return mergeThreadCopies(open?.thread ?? null, resolved?.thread ?? null);
}

export interface LoadThreadsOptions {
  /** Ler também `comments/resolved/` (padrão). `false` lê só `comments/`. */
  readonly resolved?: boolean;
}

/** Lê as conversas do armazenamento (abertas e, por padrão, resolvidas). */
export async function loadThreads(
  storage: ProjectStorage,
  options: LoadThreadsOptions = {},
): Promise<LoadedThreads> {
  const dirs = options.resolved === false ? [false] : [false, true];
  const threads: LoadedThread[] = [];
  const problems: ThreadProblem[] = [];
  const problemTexts = new Map<string, string>();
  for (const resolvedDir of dirs) {
    let ids: string[];
    try {
      ids = await storage.listThreads(resolvedDir);
    } catch (e) {
      reportError('threads.list', e);
      continue;
    }
    for (const id of ids) {
      const read = await readThread(storage, id, resolvedDir);
      if (read.ok) {
        threads.push(read);
      } else if (!read.missing) {
        problems.push({ id, resolvedDir, errors: read.errors });
        if (read.text !== null)
          problemTexts.set(threadFilePath(id, resolvedDir), read.text);
      }
    }
  }
  return { threads, problems, problemTexts };
}
