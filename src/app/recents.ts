// Os recentes da tela inicial (fase 8.4: saiu do controller): os dois bancos (projetos deste
// dispositivo e pastas), a lista única, guardar a pasta aberta, reabrir, Localizar e Remover.
// A pasta é guardada ANTES de a sessão abrir (o controller chama `rememberFolder` entre ler e
// abrir): o id da entrada é a cópia do projeto (`ProjectStorage.copyId`) e vai no
// `OpenProject`, sem estado de módulo que um fechamento no meio deixaria para trás.
import { computed, signal } from '@preact/signals';
import {
  ensurePermission,
  hasMappingFile,
  isNotFound,
  isOriginPrivate,
  isReopenable,
  pickDirectory,
  type DirectoryHandleLike,
  type ReopenableDirectory,
} from '../storage/folder';
import {
  openFolderLibrary,
  openLocalLibrary,
  requestPersistentStorage,
  type FolderLibrary,
  type LocalLibrary,
  type LocalProjectMeta,
  type StoredFolder,
} from '../storage/local';
import { reportError } from '../utils/report';
import { readSessionSetting, writeSessionSetting } from '../utils/safeStorage';
import { err, guarded, ok, type AppResult } from './appResult';

/** Uma linha da lista da tela inicial: projeto deste dispositivo ou pasta. */
export type RecentProject =
  | {
      readonly kind: 'local';
      readonly id: string;
      readonly name: string;
      /** Último uso: a última alteração ou a última abertura, o que for mais recente. */
      readonly usedAt: string;
      readonly unexported: boolean;
    }
  | {
      readonly kind: 'folder';
      readonly id: string;
      readonly name: string;
      readonly folderName: string;
      /**
       * Mostrar o nome da pasta embaixo do nome do projeto: ele é diferente, ou outra pasta da
       * lista tem o mesmo nome de projeto (sem isso, as duas linhas seriam iguais).
       */
      readonly showFolderName: boolean;
      readonly usedAt: string;
    };

let library: LocalLibrary | null = null;
let folderLibrary: FolderLibrary | null = null;
/**
 * Handles já em memória nesta visita (pastas abertas agora ou já reabertas), por id da
 * entrada: o clique em Abrir vai direto ao pedido de permissão, sem ler o IndexedDB.
 */
const knownHandles = new Map<string, ReopenableDirectory>();

export const localProjects = signal<readonly LocalProjectMeta[]>([]);
/** Pastas abertas recentemente (só os dados da lista; o handle é lido no clique). */
export const recentFolders = signal<readonly StoredFolder[]>([]);

const latest = (a: string, b: string | undefined): string =>
  b !== undefined && Date.parse(b) > Date.parse(a) ? b : a;

/** A lista única, do uso mais recente ao mais antigo (função pura de `recentProjects`). */
export function toRecentProjects(
  locals: readonly LocalProjectMeta[],
  folders: readonly StoredFolder[],
): RecentProject[] {
  const names = new Map<string, number>();
  for (const f of folders) names.set(f.name, (names.get(f.name) ?? 0) + 1);
  const rows: RecentProject[] = [
    ...folders.map((f): RecentProject => ({
      kind: 'folder',
      id: f.id,
      name: f.name,
      folderName: f.folderName,
      showFolderName: f.folderName !== f.name || (names.get(f.name) ?? 0) > 1,
      usedAt: f.usedAt,
    })),
    ...locals.map((p): RecentProject => ({
      kind: 'local',
      id: p.id,
      name: p.name,
      usedAt: latest(p.updatedAt, p.openedAt),
      unexported: p.unexported,
    })),
  ];
  const time = (p: RecentProject) => Date.parse(p.usedAt) || 0;
  return rows.sort((a, b) => time(b) - time(a));
}

/**
 * A lista única da tela inicial. Sem o modo pasta (navegador sem `showDirectoryPicker`, página
 * num iframe) o banco das pastas nem abre: só os projetos deste dispositivo.
 */
export const recentProjects = computed<readonly RecentProject[]>(() =>
  toRecentProjects(localProjects.value, recentFolders.value),
);

/** Abre os bancos e carrega as listas. `folderMode`: o modo pasta existe neste navegador. */
export async function initRecents(folderMode: boolean): Promise<void> {
  [library, folderLibrary] = await Promise.all([
    openLocalLibrary(),
    folderMode ? openFolderLibrary() : null,
  ]);
  await Promise.all([refreshLocalProjects(), refreshRecentFolders()]);
}

/** O banco dos projetos deste dispositivo (`null` sem IndexedDB). */
export const localLibrary = (): LocalLibrary | null => library;

export async function refreshLocalProjects(): Promise<void> {
  try {
    localProjects.value = library ? await library.list() : [];
  } catch (e) {
    reportError('local.list', e);
    localProjects.value = [];
  }
}

export async function refreshRecentFolders(): Promise<void> {
  try {
    recentFolders.value = folderLibrary ? await folderLibrary.list() : [];
  } catch (e) {
    reportError('folders.list', e);
    recentFolders.value = [];
  }
}

export function deleteLocalProject(id: string): Promise<AppResult> {
  return guarded(async () => {
    if (!library) return err('storage-failed');
    await library.remove(id);
    await refreshLocalProjects();
    return ok(undefined);
  });
}

/** Abrir conta como uso, para a ordem dos recentes (também depois de "Reparar e abrir"). */
export async function markLocalOpened(id: string): Promise<void> {
  await library
    ?.markOpened(id, new Date().toISOString())
    .catch((e: unknown) => reportError('local.markOpened', e));
}

// ---- Pastas ----

/** A pasta do projeto que vai abrir: a entrada dos recentes (ou nenhuma) e a cópia. */
export interface FolderCopy {
  /** Id da entrada dos recentes; `null` se a pasta não foi guardada. */
  readonly folderId: string | null;
  /** `ProjectStorage.copyId`: o id da entrada ou, sem ela, o id desta aba. */
  readonly copyId: string;
}

const sessionCopies = new Map<string, string>();

/**
 * A cópia de uma pasta que não entrou nos recentes: um id por nome de pasta, nesta aba (o
 * `sessionStorage` sobrevive a recarregar a página; outra aba ou outro dia começam do zero,
 * e o estado de uma pasta antiga com o mesmo nome não vale para a nova). Sem
 * `sessionStorage`, só em memória.
 */
export function sessionCopyId(folderName: string): string {
  const key = `mapping.folderCopy:${folderName}`;
  const known = sessionCopies.get(key) ?? readSessionSetting(key);
  const id = known || crypto.randomUUID();
  sessionCopies.set(key, id);
  if (!known) writeSessionSetting(key, id);
  return id;
}

/**
 * Guarda a pasta do projeto que vai abrir nos recentes (ou atualiza a entrada da mesma pasta;
 * com `replaceId`, "Localizar pasta…", a entrada passa a apontar para ela) e devolve a
 * cópia. Sem o recurso no navegador (`queryPermission`, `isSameEntry`) ou sem IndexedDB, não
 * guarda; uma falha não impede o projeto de abrir (vai para o Diagnóstico). Uma pasta do
 * armazenamento privado da origem (OPFS) nunca é guardada: o seletor de pastas não a devolve,
 * e o Chromium derruba a página ao ler de volta do IndexedDB um handle do OPFS.
 */
export async function rememberFolder(
  handle: DirectoryHandleLike,
  name: string,
  replaceId?: string,
): Promise<FolderCopy> {
  const unlisted = (): FolderCopy => ({
    folderId: null,
    copyId: sessionCopyId(handle.name),
  });
  if (!folderLibrary || !isReopenable(handle) || (await isOriginPrivate(handle))) {
    return unlisted();
  }
  let copy: FolderCopy;
  try {
    const id = await folderLibrary.remember(
      handle,
      { name, usedAt: new Date().toISOString() },
      replaceId,
    );
    knownHandles.set(id, handle);
    // Quem só usa pastas também não quer perder a lista sob pressão de espaço.
    void requestPersistentStorage();
    copy = { folderId: id, copyId: id };
  } catch (e) {
    reportError('folders.remember', e);
    copy = unlisted();
  }
  await refreshRecentFolders();
  return copy;
}

/** Nome do projeto (pode ter sido renomeado) e último uso de uma entrada. */
export async function touchFolder(id: string, name: string): Promise<void> {
  try {
    await folderLibrary?.touch(id, { name, usedAt: new Date().toISOString() });
  } catch (e) {
    reportError('folders.touch', e);
  }
}

/** O handle de uma entrada: o da memória ou, numa visita nova, o do IndexedDB. */
async function handleOf(id: string): Promise<ReopenableDirectory | null> {
  try {
    const handle = (await folderLibrary?.handle(id)) ?? null;
    if (handle) knownHandles.set(id, handle);
    return handle;
  } catch (e) {
    // Um handle que o navegador não consegue reconstruir: a pasta fica indisponível.
    reportError('folders.handle', e);
    return null;
  }
}

/** Abre o projeto de uma pasta; `replaceId`: a entrada que passa a apontar para ela. */
export type OpenFolder = (
  handle: DirectoryHandleLike,
  replaceId?: string,
) => Promise<AppResult>;

export type RecentFolderOpen =
  | { readonly kind: 'opened' }
  /** Permissão negada (ou falhou), ou a pasta (ou o `mapping.json` dela) não está mais lá. */
  | { readonly kind: 'unavailable'; readonly reason: 'denied' | 'missing' };

/**
 * Reabre uma pasta dos recentes. Chamar direto do clique: o navegador só mostra o pedido de
 * permissão dentro do gesto. Com o handle já em memória, a consulta começa no próprio clique;
 * numa visita nova, a única espera antes dela é ler o handle do IndexedDB (milissegundos,
 * dentro da ativação do gesto, que vale alguns segundos). A lista em si não lê handles.
 */
export function openRecentFolder(
  id: string,
  open: OpenFolder,
): Promise<AppResult<RecentFolderOpen>> {
  const entry = recentFolders.value.find((f) => f.id === id);
  const known = knownHandles.get(id);
  return guarded<RecentFolderOpen>(async () => {
    if (!entry) return err('not-found');
    const unavailable = (reason: 'denied' | 'missing') =>
      ok<RecentFolderOpen>({ kind: 'unavailable', reason });
    const handle = known ?? (await handleOf(id));
    if (!handle || !isReopenable(handle)) return unavailable('missing');
    try {
      if (!(await ensurePermission(handle))) return unavailable('denied');
    } catch (e) {
      if (isNotFound(e)) return unavailable('missing');
      // Ativação expirada (`SecurityError`), volume desmontado: o aviso oferece Localizar e
      // Remover da lista, em vez de só "Não foi possível acessar os arquivos" (R5).
      reportError('folders.permission', e);
      return unavailable('denied');
    }
    if (!(await hasMappingFile(handle))) return unavailable('missing');
    const opened = await open(handle, id);
    return opened.ok ? ok({ kind: 'opened' }) : opened;
  });
}

export type FolderRelocation =
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'opened' }
  /** A pasta escolhida não tem `mapping.json`: a entrada continua como estava. */
  | { readonly kind: 'no-project' };

/** "Localizar pasta…": escolhe a pasta de novo; ela substitui a entrada e o projeto abre. */
export function relocateFolder(
  id: string,
  open: OpenFolder,
): Promise<AppResult<FolderRelocation>> {
  return guarded<FolderRelocation>(async () => {
    const handle = await pickDirectory();
    if (!handle) return ok({ kind: 'cancelled' });
    if (!(await hasMappingFile(handle))) return ok({ kind: 'no-project' });
    const opened = await open(handle, id);
    return opened.ok ? ok({ kind: 'opened' }) : opened;
  });
}

/** "Remover da lista": esquece a pasta. Nada no disco muda. */
export function forgetFolder(id: string): Promise<AppResult> {
  return guarded(async () => {
    if (!folderLibrary) return err('storage-failed');
    knownHandles.delete(id);
    await folderLibrary.remove(id);
    await refreshRecentFolders();
    return ok(undefined);
  });
}
