// Orquestra a tela inicial e o projeto aberto: detecção de recursos, abertura e criação de
// projetos (pasta, local, zip), exportação e fechamento. Os recentes ficam em `recents.ts`,
// gravar ao sair da página em `pageLifecycle.ts` e os tipos de resultado em `appResult.ts`
// (fase 8.4); este módulo re-exporta o que a `Home` e os testes usam deles.
import { signal, type Signal } from '@preact/signals';
import { t } from '../i18n';
import {
  DEFAULT_LAYER_COLOR,
  createProject,
  deserialize,
  migrations,
  serialize,
  SCHEMA_VERSION,
  type DiscardedUrlTemplate,
  type Project,
  type RepairRecord,
} from '../model';
import { importExistingImages } from '../storage/existingImages';
import {
  createFolderStorage,
  ensureGitignore,
  findExistingImages,
  hasMappingFile,
  isFolderModeSupported,
  pickDirectory,
  type DirectoryHandleLike,
  type ExistingImage,
} from '../storage/folder';
import { createDisplayBitmap, prepareImage, readImageSize } from '../storage/imageImport';
import { loadProject, type InconsistentLoad } from '../storage/loadProject';
import { loadProposals } from '../storage/loadProposals';
import { loadLibraryIssues, type LibraryIssues } from '../storage/specPackage';
import { requestPersistentStorage } from '../storage/local';
import type { ProjectStorage, StorageKind } from '../storage/types';
import { readProjectZip, writeProjectZip, zipFileName } from '../storage/zip';
import { createDisplayImages, type DisplayImages } from '../store/displayImages';
import { openLibraryPreview, type LibraryPreview } from '../store/libraryPreview';
import { openSession, type ProjectSession } from '../store/session';
import {
  pickPackageDirectory,
  readPackageFromDirectory,
  readPackageFromZip,
  type PackageReadResult,
} from '../ui/specPackageImport';
import { reportError } from '../utils/report';
import { err, guarded, inconsistentResult, ok, type AppResult } from './appResult';
import { bindPageLifecycle } from './pageLifecycle';
import * as recents from './recents';
import { localLibrary, touchFolder } from './recents';

export type { AppErrorCode, AppResult, InconsistentProject } from './appResult';
export {
  deleteLocalProject,
  forgetFolder,
  localProjects,
  recentProjects,
  refreshLocalProjects,
  type FolderRelocation,
  type RecentFolderOpen,
  type RecentProject,
} from './recents';

export interface Features {
  /** File System Access API disponível (modo Pasta). */
  readonly folder: boolean;
  /** IndexedDB disponível (modo Local + Zip). */
  readonly local: boolean;
  /** Página aberta como arquivo: o IndexedDB pode não ser confiável. */
  readonly fileProtocol: boolean;
}

export interface OpenProject {
  readonly kind: StorageKind;
  readonly session: ProjectSession;
  readonly display: DisplayImages<ImageBitmap>;
  /** Id no IndexedDB (modo local). */
  readonly localId: string | null;
  /**
   * Entrada dos recentes da pasta aberta (nome e data atualizados a cada gravação e ao
   * fechar). Ausente fora do modo pasta ou com a pasta fora dos recentes.
   */
  readonly folderId?: string;
  /** Modo local: há alterações desde a última exportação. */
  readonly unexported: Signal<boolean>;
  /** Reparos feitos ao abrir um projeto inconsistente (vazio ou ausente no caso normal). */
  readonly repaired?: readonly RepairRecord[];
}

export const features = signal<Features | null>(null);
export const openProject = signal<OpenProject | null>(null);

function newProject(name: string): Project {
  return createProject({
    name,
    now: new Date().toISOString(),
    firstLayer: {
      id: crypto.randomUUID(),
      name: t('layer.defaultName'),
      color: DEFAULT_LAYER_COLOR,
    },
  });
}

/** Detecta os recursos e carrega as listas dos recentes. Chamar uma vez. */
export async function initApp(): Promise<void> {
  const folder = isFolderModeSupported();
  await recents.initRecents(folder);
  features.value = {
    folder,
    local: localLibrary() !== null,
    fileProtocol: location.protocol === 'file:',
  };
  bindPageLifecycle(() => openProject.value?.session);
}

/** O storage que a sessão usa (com `copyId`) e a entrada dos recentes da pasta. */
interface Bound {
  readonly storage: ProjectStorage;
  readonly folderId?: string;
}

/**
 * O que abrir. `storage` é o de leitura; `bind` roda depois de ler e antes de a sessão abrir,
 * no caminho normal e no "Reparar e abrir": guarda a pasta nos recentes (e dá o `copyId`) ou
 * marca o uso do projeto local. Sem `bind`, a sessão usa o próprio `storage`.
 */
interface OpenTarget {
  readonly storage: ProjectStorage;
  readonly localId: string | null;
  readonly bind?: (project: Project) => Promise<Bound>;
}

async function openFromStorage(target: OpenTarget): Promise<AppResult> {
  const loaded = await loadProject(target.storage);
  if (loaded.ok) return openLoaded(target, loaded.project, loaded);
  const { inconsistent } = loaded;
  if (!inconsistent) return err(loaded.error);
  return inconsistentResult(inconsistent.issues, inconsistent.repair, () =>
    openRepaired(target, inconsistent),
  );
}

/**
 * Vincula (recentes, `copyId`) e abre a sessão do projeto já lido. `text`: o `mapping.json`
 * como foi lido (`SessionOptions.loadedText`); `migratedFrom`: schema antigo (ou reparo), o
 * original vai para `backups/` antes do primeiro salvamento.
 */
async function openLoaded(
  target: OpenTarget,
  project: Project,
  loaded: {
    readonly readOnly: boolean;
    readonly text: string;
    readonly migratedFrom: number | null;
    /** `urlTemplate` que a migração para o schema 11 descartou; vão para o Diagnóstico. */
    readonly discardedUrlTemplates?: readonly DiscardedUrlTemplate[];
    readonly repaired?: readonly RepairRecord[];
    /** Problemas do pacote da biblioteca (Diagnóstico); sem o campo, a sessão começa sem. */
    readonly libraryIssues?: LibraryIssues;
  },
): Promise<AppResult> {
  const { localId } = target;
  reportDiscardedUrlTemplates(loaded.discardedUrlTemplates ?? []);
  const meta = localId ? await localLibrary()?.get(localId) : undefined;
  const { storage, folderId } = target.bind
    ? await target.bind(project)
    : { storage: target.storage, folderId: undefined };
  const unexported = signal(meta?.unexported ?? false);
  const session = openSession({
    storage,
    project,
    readOnly: loaded.readOnly,
    loadedText: loaded.text,
    ...(loaded.migratedFrom === null
      ? {}
      : { migratedFrom: { version: loaded.migratedFrom, text: loaded.text } }),
    ...(loaded.libraryIssues === undefined
      ? {}
      : { libraryIssues: loaded.libraryIssues }),
    proposals: await loadProposals(storage),
    prepareImage,
    // Gravou o `mapping.json` (com conteúdo que ainda não saiu num zip) ou um `proposal.json`:
    // há trabalho a exportar. `markExported` zera; o IndexedDB guarda o mesmo flag. Na pasta,
    // a linha dos recentes acompanha o nome e o último uso, como a do projeto local (R2).
    onChanged: () => {
      unexported.value = true;
      const name = session.store.project.peek()?.project.name;
      if (folderId !== undefined && name !== undefined) void touchFolder(folderId, name);
    },
    // Arquivos trocados por fora: o bitmap guardado é do conteúdo antigo.
    onImagesChanged: (paths) => {
      for (const path of paths) display.invalidate(path);
    },
  });
  const display = createDisplayImages(async (path) => {
    const blob = await session.readImage(path);
    if (!blob) return null;
    const image = session.store.project.peek()?.containers.find((i) => i.file === path);
    return createDisplayBitmap(
      blob,
      image && { width: image.width, height: image.height },
    );
  });
  openProject.value = {
    kind: storage.kind,
    session,
    display,
    localId,
    ...(folderId === undefined ? {} : { folderId }),
    unexported,
    repaired: loaded.repaired ?? [],
  };
  return ok(undefined);
}

/**
 * Registra no Diagnóstico o que a migração para o schema 11 descartou: o endereço dos
 * arquivos saiu do projeto e passou a ser da especialização (`platforms[].repo`). Uma
 * entrada só, com as plataformas e os modelos descartados.
 */
function reportDiscardedUrlTemplates(discarded: readonly DiscardedUrlTemplate[]): void {
  if (discarded.length === 0) return;
  reportError(
    'open.migration',
    t('migration.v11.discardedUrlTemplate', {
      platforms: discarded.map((d) => d.platform).join(', '),
      templates: discarded.map((d) => d.urlTemplate).join(', '),
    }),
  );
}

/** Uma linha por reparo, para o Diagnóstico (ex.: `made-root marking MN "Nome" (missing-parent)`). */
function describeRepairs(records: readonly RepairRecord[]): string {
  return records
    .map(
      (r) =>
        `${r.action} ${r.entity} ${r.id}${r.name === undefined ? '' : ` "${r.name}"`} (${r.code})`,
    )
    .join('; ');
}

/**
 * Abre o projeto reparado. Nada é gravado agora: a sessão guarda o original em `backups/`
 * (mesmo mecanismo da migração) e grava o reparado na primeira gravação.
 */
async function openRepaired(target: OpenTarget, { repair, text }: InconsistentLoad) {
  reportError(
    'open.repair',
    `${repair.repaired.length} reparo(s): ${describeRepairs(repair.repaired)}`,
  );
  return openLoaded(target, repair.project, {
    readOnly: repair.readOnly,
    text,
    migratedFrom: repair.migratedFrom ?? SCHEMA_VERSION,
    discardedUrlTemplates: repair.discardedUrlTemplates,
    repaired: repair.repaired,
    libraryIssues: await loadLibraryIssues(target.storage, repair.project),
  });
}

// ---- Modo local (IndexedDB) ----

export function createLocalProject(name: string): Promise<AppResult> {
  return guarded(async () => {
    const library = localLibrary();
    if (!library) return err('storage-failed');
    const id = crypto.randomUUID();
    const project = newProject(name.trim() || t('project.untitled'));
    await library.create(id, {
      mapping: serialize(project),
      images: new Map(),
      specs: new Map(),
      proposals: new Map(),
      proposalImages: new Map(),
    });
    void requestPersistentStorage();
    return openFromStorage({ storage: library.open(id), localId: id });
  });
}

export function openLocalProject(id: string): Promise<AppResult> {
  return guarded(async () => {
    const library = localLibrary();
    if (!library) return err('storage-failed');
    void requestPersistentStorage();
    const storage = library.open(id);
    // Abrir conta como uso, para a ordem dos recentes (também o "Reparar e abrir", R4).
    return openFromStorage({
      storage,
      localId: id,
      bind: async () => {
        await recents.markLocalOpened(id);
        return { storage };
      },
    });
  });
}

/** Importa um zip para o IndexedDB como um novo projeto local e o abre. */
export function importZip(file: Blob): Promise<AppResult> {
  return guarded(async () => {
    const target = localLibrary();
    if (!target) return err('storage-failed');
    const read = await readProjectZip(file);
    if (!read.ok) return err(read.error);
    const parsed = deserialize(read.files.mapping, migrations, read.files.specs);
    const create = async () => {
      const id = crypto.randomUUID();
      await target.create(id, read.files, { unexported: false });
      void requestPersistentStorage();
      return openFromStorage({ storage: target.open(id), localId: id });
    };
    if (!parsed.ok) {
      const { error, repair } = parsed;
      if (error.code !== 'invariant-violation' || !repair) return err(error.code);
      // O projeto local só é criado se o reparo for aceito; recusar não deixa rastro.
      return inconsistentResult(error.issues, repair, async () => {
        const opened = await create();
        return opened.ok || !opened.inconsistent?.repair
          ? opened
          : opened.inconsistent.repair();
      });
    }
    return create();
  });
}

// ---- Modo pasta (File System Access API) ----

export type FolderInspection =
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'opened' }
  | {
      readonly kind: 'needs-setup';
      readonly handle: DirectoryHandleLike;
      readonly images: readonly ExistingImage[];
    };

/** Escolhe uma pasta: abre o projeto dela ou pede para criar um (sem `mapping.json`). */
export function openFolder(): Promise<AppResult<FolderInspection>> {
  return guarded<FolderInspection>(async () => {
    const handle = await pickDirectory();
    if (!handle) return ok({ kind: 'cancelled' });
    if (!(await hasMappingFile(handle))) {
      return ok({
        kind: 'needs-setup',
        handle,
        images: await findExistingImages(handle),
      });
    }
    const opened = await openFolderHandle(handle);
    return opened.ok ? ok({ kind: 'opened' }) : opened;
  });
}

/**
 * A pasta como alvo da abertura: lida sem `copyId`; antes de a sessão abrir (também no
 * "Reparar e abrir"), é guardada nos recentes e a sessão recebe o storage com a cópia.
 * `replaceId`: a entrada dos recentes que passa a apontar para esta pasta ("Localizar").
 */
const folderTarget = (handle: DirectoryHandleLike, replaceId?: string): OpenTarget => ({
  storage: createFolderStorage(handle),
  localId: null,
  bind: async (project) => {
    const { folderId, copyId } = await recents.rememberFolder(
      handle,
      project.project.name,
      replaceId,
    );
    return {
      storage: createFolderStorage(handle, { copyId }),
      ...(folderId === null ? {} : { folderId }),
    };
  },
});

const openFolderHandle = (handle: DirectoryHandleLike, replaceId?: string) =>
  openFromStorage(folderTarget(handle, replaceId));

/** Reabre uma pasta dos recentes. Chamar direto do clique (ver `recents.openRecentFolder`). */
export const openRecentFolder = (id: string, trace?: recents.ReopenSteps) =>
  recents.openRecentFolder(id, openFolderHandle, trace);

/** "Localizar pasta…" (ver `recents.relocateFolder`). */
export const relocateFolder = (id: string) =>
  recents.relocateFolder(id, openFolderHandle);

/** Cria o projeto na pasta, importando as imagens que já estavam nela. */
export function createFolderProject(
  handle: DirectoryHandleLike,
  name: string,
  images: readonly ExistingImage[],
): Promise<AppResult<{ skipped: readonly string[] }>> {
  return guarded(async () => {
    const storage = createFolderStorage(handle);
    const imported = await importExistingImages(
      storage,
      newProject(name.trim() || handle.name),
      images,
      { readSize: readImageSize, newId: () => crypto.randomUUID() },
    );
    const mappingText = serialize(imported.project);
    await storage.saveMapping(mappingText);
    // Para quem versiona a pasta com git: os backups de migração não entram no repositório.
    await ensureGitignore(handle).catch((e: unknown) =>
      reportError('folder.gitignore', e),
    );
    // A pasta pode já ter propostas (ex: restauradas do git sem o mapping.json): a abertura
    // as lê, como em qualquer pasta.
    await openLoaded(folderTarget(handle), imported.project, {
      readOnly: false,
      text: mappingText,
      migratedFrom: null,
    });
    return ok({ skipped: imported.skipped });
  });
}

// ---- Projeto aberto ----

export interface ExportedProject {
  readonly file: File;
  /** Imagens do projeto que não estavam no armazenamento e ficaram fora do zip. */
  readonly missingImages: readonly string[];
  /** `false` com a gravação em erro: o zip leva o que o armazenamento ainda não tem. */
  readonly saved: boolean;
}

// Último zip gerado: só conta como exportado em `markExported`, quando o arquivo saiu (8.7).
let pendingExport: { session: ProjectSession; snapshot: Project } | null = null;

/** Gera o zip do projeto aberto. */
export function buildExport(): Promise<AppResult<ExportedProject>> {
  return guarded(async () => {
    const current = openProject.value;
    const project = current?.session.store.project.value;
    if (!current || !project) return err('not-found');
    const files = await current.session.collectFiles();
    pendingExport = { session: current.session, snapshot: files.snapshot };
    const blob = await writeProjectZip(files);
    return ok({
      file: new File([blob], zipFileName(project.project.name), {
        type: 'application/zip',
      }),
      missingImages: files.missingImages,
      saved: files.saved,
    });
  });
}

/** O zip gerado por `buildExport` saiu (salvo ou compartilhado). */
export async function markExported(): Promise<void> {
  const current = openProject.value;
  if (!current) return;
  if (pendingExport?.session === current.session) {
    current.session.noteExported(pendingExport.snapshot);
    pendingExport = null;
  }
  if (!current.localId) return;
  current.unexported.value = false;
  try {
    await localLibrary()?.setUnexported(current.localId, false);
  } catch (e) {
    // O indicador volta a aparecer na próxima abertura; nada se perde.
    reportError('local.setUnexported', e);
  }
}

export async function closeProject(): Promise<void> {
  const current = openProject.value;
  if (!current) return;
  const name = current.session.store.project.peek()?.project.name;
  openProject.value = null;
  pendingExport = null;
  current.display.dispose();
  try {
    await current.session.close();
  } finally {
    if (current.folderId !== undefined && name !== undefined) {
      await touchFolder(current.folderId, name);
    }
    await Promise.all([recents.refreshLocalProjects(), recents.refreshRecentFolders()]);
  }
}

// ---- Catálogo de uma biblioteca, sem projeto (etapa Biblioteca, B5) ----

/** A biblioteca aberta na tela do Catálogo; `null` quando não há. Nada dela é gravado. */
export const openLibrary = signal<LibraryPreview | null>(null);

export type LibrarySource =
  { readonly kind: 'folder' } | { readonly kind: 'zip'; readonly file: Blob };

export type LibraryOpenResult =
  | { readonly kind: 'opened' }
  /** O usuário cancelou o seletor de pasta. */
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'failed'; readonly reason: 'too-big' | 'empty' | 'unreadable' };

/**
 * Lê o pacote (pasta ou zip) para a memória e abre o Catálogo. Um pacote com erros de
 * validação abre mesmo assim (os problemas aparecem no topo da tela); só o que não se
 * consegue ler (grande demais, vazio, zip inválido) falha.
 */
export async function openLibraryPackage(
  source: LibrarySource,
): Promise<LibraryOpenResult> {
  let read: PackageReadResult;
  try {
    if (source.kind === 'folder') {
      const handle = await pickPackageDirectory();
      if (!handle) return { kind: 'cancelled' };
      read = await readPackageFromDirectory(handle);
    } else {
      read = await readPackageFromZip(source.file);
    }
  } catch (e) {
    reportError('library.read', e);
    return { kind: 'failed', reason: 'unreadable' };
  }
  if (!read.ok) return { kind: 'failed', reason: read.reason };
  try {
    const preview = openLibraryPreview(read.files);
    openLibrary.value?.dispose();
    openLibrary.value = preview;
    return { kind: 'opened' };
  } catch (e) {
    reportError('library.open', e);
    return { kind: 'failed', reason: 'unreadable' };
  }
}

/** Fecha o Catálogo da biblioteca e tira as fontes do pacote do documento. */
export function closeLibrary(): void {
  openLibrary.value?.dispose();
  openLibrary.value = null;
}
