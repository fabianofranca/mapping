import { effect, signal, type ReadonlySignal } from '@preact/signals';
import {
  isSameAspect,
  serialize,
  specFiles,
  uniqueImageFile,
  type Project,
} from '../model';
import { createAutoSaver, type SaveStatus } from '../storage/autosave';
import type { PreparedImage } from '../storage/imageImport';
import { backupFileName, type ProjectStorage } from '../storage/types';
import type { ProjectFiles } from '../storage/zip';
import { reportError } from '../utils/report';
import { createProjectStore, type ProjectStore } from './history';
import { createProjectActions, type ProjectActions } from './project';

export interface SessionOptions {
  readonly storage: ProjectStorage;
  readonly project: Project;
  readonly readOnly?: boolean;
  /** Lê e normaliza uma imagem escolhida pelo usuário (ver `storage/imageImport`). */
  readonly prepareImage: (file: File) => Promise<PreparedImage>;
  /** Chamado após cada gravação bem-sucedida do `mapping.json`. */
  readonly onSaved?: () => void;
  /**
   * O projeto foi migrado de um schema antigo: `text` é o `mapping.json` original,
   * guardado com `writeBackup` antes do primeiro salvamento (que o sobrescreve).
   */
  readonly migratedFrom?: { readonly version: number; readonly text: string };
  readonly autosaveDelay?: number;
  readonly now?: () => string;
  readonly newId?: () => string;
}

export interface AddImagesResult {
  readonly added: readonly string[];
  /** Nomes dos arquivos que não puderam ser lidos ou gravados. */
  readonly failed: readonly string[];
}

export interface AspectChange {
  readonly from: { readonly width: number; readonly height: number };
  readonly to: { readonly width: number; readonly height: number };
}

export type ReplaceImageResult = 'replaced' | 'cancelled' | 'failed';

export interface AddImagesOptions {
  /** Ponto do canvas onde o centro de cada imagem deve ficar (espaço livre mais próximo). */
  readonly center?: { readonly x: number; readonly y: number };
}

/** Um projeto aberto: store com undo/redo ligado ao armazenamento. */
export interface ProjectSession {
  readonly storage: ProjectStorage;
  readonly store: ProjectStore;
  readonly actions: ProjectActions;
  readonly saveStatus: ReadonlySignal<SaveStatus>;
  /** Versão de origem, depois que o backup do original pré-migração foi gravado. */
  readonly backupSaved: ReadonlySignal<number | null>;
  /** Importa as imagens: grava cada arquivo e o adiciona ao projeto (uma entrada de undo cada). */
  addImages(files: readonly File[], options?: AddImagesOptions): Promise<AddImagesResult>;
  /**
   * Troca o arquivo da imagem (ou reaponta uma imagem ausente) mantendo as
   * marcações. Com proporção diferente, pergunta antes via `confirmAspectChange`.
   */
  replaceImage(
    imageId: string,
    file: File,
    confirmAspectChange: (change: AspectChange) => Promise<boolean>,
  ): Promise<ReplaceImageResult>;
  readImage(path: string): Promise<Blob | null>;
  /** Grava agora o que estiver pendente (também serve para "tentar de novo"). */
  flush(): Promise<void>;
  /** `mapping.json` atual, as imagens existentes e as cópias de `specs/`, para exportar. */
  collectFiles(): Promise<ProjectFiles>;
  close(): Promise<void>;
}

function currentProject(store: ProjectStore): Project {
  const p = store.project.value;
  if (!p) throw new Error('session closed');
  return p;
}

/** Nome de arquivo sem separadores de pasta. */
function safeFileName(name: string): string {
  const cleaned = name.replace(/[\\/]/g, '-').trim();
  return cleaned === '' ? 'imagem.jpg' : cleaned;
}

const reportCleanupFailure = (e: unknown) => reportError('session.cleanup', e);

export function openSession(options: SessionOptions): ProjectSession {
  const { storage, prepareImage } = options;
  const store = createProjectStore({ now: options.now });
  const actions = createProjectActions(store, { newId: options.newId });
  store.load(options.project, { readOnly: options.readOnly });

  // Arquivos de imagem que a sessão sabe estarem gravados e referenciados.
  const stored = new Set(options.project.images.map((i) => i.file));
  // Conteúdo das imagens removidas do armazenamento, para o desfazer restaurar.
  // Só guarda arquivos que algum snapshot do histórico ainda referencia.
  const trash = new Map<string, Blob>();
  // Cópias de `specs/` gravadas (caminho → texto). O conteúdo vive no projeto, então
  // o desfazer de aplicar/remover especialização só precisa regravar ou apagar.
  const writtenSpecs = specFiles(options.project);
  // Original pré-migração ainda não guardado: o primeiro salvamento grava antes.
  let pendingBackup = options.migratedFrom ?? null;
  const backupSaved = signal<number | null>(null);

  /**
   * Grava o projeto: restaura imagens que voltaram (undo) e grava as cópias de
   * `specs/` novas ou alteradas, grava o `mapping.json` e só então remove as
   * imagens e cópias que deixaram de ser usadas. Assim o `mapping.json` em disco
   * nunca aponta para um arquivo já apagado.
   */
  const persist = async () => {
    const p = store.project.value;
    if (!p) return;
    if (pendingBackup) {
      // Se o backup falhar, o salvamento falha junto: o original não é sobrescrito.
      const date = options.now ? new Date(options.now()) : new Date();
      await storage.writeBackup(
        backupFileName(pendingBackup.version, date),
        pendingBackup.text,
      );
      backupSaved.value = pendingBackup.version;
      pendingBackup = null;
    }
    const referenced = new Set(p.images.map((i) => i.file));
    for (const file of referenced) {
      const blob = trash.get(file);
      if (stored.has(file) || !blob) continue;
      await storage.writeImage(file, blob);
      stored.add(file);
      trash.delete(file);
    }
    const specs = specFiles(p);
    for (const [file, text] of specs) {
      if (writtenSpecs.get(file) === text) continue;
      await storage.writeSpec(file, text);
      writtenSpecs.set(file, text);
    }
    await storage.saveMapping(serialize(p));
    options.onSaved?.();
    const inHistory = store.referencedImageFiles();
    for (const file of [...stored]) {
      if (referenced.has(file)) continue;
      if (inHistory.has(file)) {
        const blob = await storage.readImage(file);
        if (blob) trash.set(file, blob);
      }
      await storage.removeImage(file);
      stored.delete(file);
    }
    // O histórico encolhe (limite de 100, novo gesto descarta o "refazer"): solta
    // o conteúdo dos arquivos que nenhum snapshot restauraria mais.
    const stillInHistory = store.referencedImageFiles();
    for (const file of [...trash.keys()]) {
      if (!stillInHistory.has(file)) trash.delete(file);
    }
    for (const file of [...writtenSpecs.keys()]) {
      if (specs.has(file)) continue;
      await storage.removeSpec(file);
      writtenSpecs.delete(file);
    }
  };

  const saver = createAutoSaver(persist, options.autosaveDelay);
  let lastRevision = store.revision.peek();
  const stopWatching = effect(() => {
    const revision = store.revision.value;
    if (revision !== lastRevision) {
      lastRevision = revision;
      saver.schedule();
    }
  });

  return {
    storage,
    store,
    actions,
    saveStatus: saver.status,
    backupSaved,

    async addImages(files, addOptions = {}) {
      const added: string[] = [];
      const failed: string[] = [];
      if (store.readOnly.value || !store.project.value) {
        return { added, failed: files.map((f) => f.name) };
      }
      // Uma por vez: fotos grandes decodificadas em paralelo estouram a memória do celular.
      for (const file of files) {
        let path: string | null = null;
        try {
          const prepared = await prepareImage(file);
          path = uniqueImageFile(currentProject(store), safeFileName(prepared.name));
          await storage.writeImage(path, prepared.data);
          stored.add(path);
          const result = actions.addImage(
            { file: path, width: prepared.width, height: prepared.height },
            addOptions.center,
          );
          if (!result.ok) throw new Error(result.error);
          added.push(path);
        } catch (e) {
          reportError('session.addImage', e);
          failed.push(file.name);
          if (path && stored.delete(path)) {
            await storage.removeImage(path).catch(reportCleanupFailure);
          }
        }
      }
      return { added, failed };
    },

    async replaceImage(imageId, file, confirmAspectChange) {
      if (store.readOnly.value || !store.project.value) return 'failed';
      let path: string | null = null;
      try {
        const prepared = await prepareImage(file);
        const image = currentProject(store).images.find((i) => i.id === imageId);
        if (!image) return 'failed';
        const next = { width: prepared.width, height: prepared.height };
        const sameAspect = isSameAspect(image, next);
        if (!sameAspect) {
          const from = { width: image.width, height: image.height };
          if (!(await confirmAspectChange({ from, to: next }))) return 'cancelled';
        }
        path = uniqueImageFile(currentProject(store), safeFileName(prepared.name));
        await storage.writeImage(path, prepared.data);
        stored.add(path);
        const result = actions.replaceImage(
          imageId,
          { file: path, ...next },
          { confirmAspectChange: !sameAspect },
        );
        if (!result.ok) throw new Error(result.error);
        return 'replaced';
      } catch (e) {
        reportError('session.replaceImage', e);
        if (path && stored.delete(path)) {
          await storage.removeImage(path).catch(reportCleanupFailure);
        }
        return 'failed';
      }
    },

    async readImage(path) {
      return trash.get(path) ?? storage.readImage(path);
    },

    flush: () => saver.flush(),

    async collectFiles() {
      await saver.flush();
      const p = currentProject(store);
      const images = new Map<string, Blob>();
      for (const image of p.images) {
        const blob = await storage.readImage(image.file);
        if (blob) images.set(image.file, blob);
      }
      return { mapping: serialize(p), images, specs: specFiles(p) };
    },

    async close() {
      stopWatching();
      await saver.flush();
      saver.dispose();
      store.close();
    },
  };
}
