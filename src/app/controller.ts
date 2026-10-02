// Orquestra a tela inicial e o projeto aberto: detecção de recursos, abertura
// e criação de projetos (pasta, local, zip), exportação e fechamento.
import { signal, type Signal } from '@preact/signals';
import { t } from '../i18n';
import {
  DEFAULT_LAYER_COLOR,
  createProject,
  deserialize,
  migrations,
  referencedSpecFiles,
  serialize,
  type DeserializeError,
  type Project,
} from '../model';
import { importExistingImages } from '../storage/existingImages';
import {
  createFolderStorage,
  findExistingImages,
  isFolderModeSupported,
  pickDirectory,
  type DirectoryHandleLike,
  type ExistingImage,
} from '../storage/folder';
import { createDisplayBitmap, prepareImage, readImageSize } from '../storage/imageImport';
import {
  openLocalLibrary,
  requestPersistentStorage,
  type LocalLibrary,
  type LocalProjectMeta,
} from '../storage/local';
import type { ProjectStorage, StorageKind } from '../storage/types';
import { readProjectZip, writeProjectZip, zipFileName } from '../storage/zip';
import { createDisplayImages, type DisplayImages } from '../store/displayImages';
import { openSession, type ProjectSession } from '../store/session';

export interface Features {
  /** File System Access API disponível (modo Pasta). */
  readonly folder: boolean;
  /** IndexedDB disponível (modo Local + Zip). */
  readonly local: boolean;
  /** Página aberta como arquivo: o IndexedDB pode não ser confiável. */
  readonly fileProtocol: boolean;
}

export type AppErrorCode =
  | DeserializeError['code']
  | 'invalid-zip'
  | 'missing-mapping'
  | 'not-found'
  | 'storage-failed';

export type AppResult<T = void> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: AppErrorCode };

export interface OpenProject {
  readonly kind: StorageKind;
  readonly session: ProjectSession;
  readonly display: DisplayImages<ImageBitmap>;
  /** Id no IndexedDB (modo local). */
  readonly localId: string | null;
  /** Modo local: há alterações desde a última exportação. */
  readonly unexported: Signal<boolean>;
}

export const features = signal<Features | null>(null);
export const localProjects = signal<readonly LocalProjectMeta[]>([]);
export const openProject = signal<OpenProject | null>(null);

let library: LocalLibrary | null = null;

const ok = <T>(value: T): AppResult<T> => ({ ok: true, value });
const err = (error: AppErrorCode): AppResult<never> => ({ ok: false, error });

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

/** Detecta os recursos e carrega a lista de projetos locais. Chamar uma vez. */
export async function initApp(): Promise<void> {
  library = await openLocalLibrary();
  features.value = {
    folder: isFolderModeSupported(),
    local: library !== null,
    fileProtocol: location.protocol === 'file:',
  };
  await refreshLocalProjects();
  bindPageLifecycle();
}

export async function refreshLocalProjects(): Promise<void> {
  try {
    localProjects.value = library ? await library.list() : [];
  } catch {
    localProjects.value = [];
  }
}

function start(
  storage: ProjectStorage,
  project: Project,
  options: { readOnly: boolean; localId: string | null; unexported: boolean },
): void {
  const unexported = signal(options.unexported);
  const session = openSession({
    storage,
    project,
    readOnly: options.readOnly,
    prepareImage,
    onSaved: () => {
      unexported.value = true;
    },
  });
  const display = createDisplayImages(async (path) => {
    const blob = await session.readImage(path);
    if (!blob) return null;
    const image = session.store.project.peek()?.images.find((i) => i.file === path);
    return createDisplayBitmap(
      blob,
      image && { width: image.width, height: image.height },
    );
  });
  openProject.value = {
    kind: storage.kind,
    session,
    display,
    localId: options.localId,
    unexported,
  };
}

async function openFromStorage(
  storage: ProjectStorage,
  localId: string | null,
): Promise<AppResult> {
  const text = await storage.loadMapping();
  if (text === null) return err('not-found');
  const specs = new Map<string, string>();
  for (const file of referencedSpecFiles(text)) {
    const spec = await storage.readSpec(file).catch(() => null);
    if (spec !== null) specs.set(file, spec);
  }
  const result = deserialize(text, migrations, specs);
  if (!result.ok) return err(result.error.code);
  const meta = localId ? await library?.get(localId) : undefined;
  start(storage, result.project, {
    readOnly: result.readOnly,
    localId,
    unexported: meta?.unexported ?? false,
  });
  return ok(undefined);
}

async function guarded<T>(action: () => Promise<AppResult<T>>): Promise<AppResult<T>> {
  try {
    return await action();
  } catch {
    return err('storage-failed');
  }
}

// ---- Modo local (IndexedDB) ----

export function createLocalProject(name: string): Promise<AppResult> {
  return guarded(async () => {
    if (!library) return err('storage-failed');
    const id = crypto.randomUUID();
    const project = newProject(name.trim() || t('project.untitled'));
    await library.create(id, {
      mapping: serialize(project),
      images: new Map(),
      specs: new Map(),
    });
    void requestPersistentStorage();
    return openFromStorage(library.open(id), id);
  });
}

export function openLocalProject(id: string): Promise<AppResult> {
  return guarded(async () => {
    if (!library) return err('storage-failed');
    void requestPersistentStorage();
    return openFromStorage(library.open(id), id);
  });
}

export function deleteLocalProject(id: string): Promise<AppResult> {
  return guarded(async () => {
    if (!library) return err('storage-failed');
    await library.remove(id);
    await refreshLocalProjects();
    return ok(undefined);
  });
}

/** Importa um zip para o IndexedDB como um novo projeto local e o abre. */
export function importZip(file: Blob): Promise<AppResult> {
  return guarded(async () => {
    if (!library) return err('storage-failed');
    const read = await readProjectZip(file);
    if (!read.ok) return err(read.error);
    const parsed = deserialize(read.files.mapping, migrations, read.files.specs);
    if (!parsed.ok) return err(parsed.error.code);
    const id = crypto.randomUUID();
    await library.create(id, read.files, { unexported: false });
    void requestPersistentStorage();
    return openFromStorage(library.open(id), id);
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
    const storage = createFolderStorage(handle);
    if ((await storage.loadMapping()) === null) {
      return ok({
        kind: 'needs-setup',
        handle,
        images: await findExistingImages(handle),
      });
    }
    const opened = await openFromStorage(storage, null);
    return opened.ok ? ok({ kind: 'opened' }) : opened;
  });
}

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
    await storage.saveMapping(serialize(imported.project));
    start(storage, imported.project, {
      readOnly: false,
      localId: null,
      unexported: false,
    });
    return ok({ skipped: imported.skipped });
  });
}

// ---- Projeto aberto ----

/** Gera o zip do projeto aberto. */
export function buildExport(): Promise<AppResult<File>> {
  return guarded(async () => {
    const current = openProject.value;
    const project = current?.session.store.project.value;
    if (!current || !project) return err('not-found');
    const blob = await writeProjectZip(await current.session.collectFiles());
    return ok(
      new File([blob], zipFileName(project.project.name), { type: 'application/zip' }),
    );
  });
}

export async function markExported(): Promise<void> {
  const current = openProject.value;
  if (!current?.localId) return;
  current.unexported.value = false;
  try {
    await library?.setUnexported(current.localId, false);
  } catch {
    // O indicador volta a aparecer na próxima abertura; nada se perde.
  }
}

export async function closeProject(): Promise<void> {
  const current = openProject.value;
  if (!current) return;
  openProject.value = null;
  current.display.dispose();
  try {
    await current.session.close();
  } finally {
    await refreshLocalProjects();
  }
}

let lifecycleBound = false;

/** Grava ao sair da página e avisa antes de fechar com alterações não gravadas. */
function bindPageLifecycle(): void {
  if (lifecycleBound) return;
  lifecycleBound = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void openProject.value?.session.flush();
  });
  window.addEventListener('beforeunload', (event) => {
    const status = openProject.value?.session.saveStatus.value;
    if (status && status !== 'saved') {
      void openProject.value?.session.flush();
      event.preventDefault();
    }
  });
}
