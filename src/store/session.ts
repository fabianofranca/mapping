import { effect, signal, type ReadonlySignal } from '@preact/signals';
import {
  canReplaceImage,
  isSameAspect,
  readRevision,
  serialize,
  specFiles,
  uniqueImageFile,
  type Project,
} from '../model';
import {
  AUTOSAVE_DELAY_MS,
  createAutoSaver,
  type FlushResult,
  type SaveStatus,
} from '../storage/autosave';
import type { PreparedImage } from '../storage/imageImport';
import { loadProject, type LoadProjectResult } from '../storage/loadProject';
import type { LoadedProposals } from '../storage/loadProposals';
import { backupFileName, imageMimeType, type ProjectStorage } from '../storage/types';
import type { ProjectFiles } from '../storage/zip';
import { reportError } from '../utils/report';
import { createProjectStore, type ProjectStore } from './history';
import { createProjectActions, type ProjectActions } from './project';
import { createProposalActions, type ProposalActions } from './proposalActions';
import { createProposalStore, type ProposalStore } from './proposals';

// A sessão é o único escritor do `mapping.json` de um projeto aberto e o único lugar que o lê
// depois de aberto (regra ESLint em `eslint.config.js`; desenho em `docs/ARCHITECTURE.md`,
// "Sessão e gravação"). Gravação, conferência de alteração externa, recarga e decisão do
// conflito são trabalhos de UMA fila (a do `AutoSaver`): nunca se cruzam.

/**
 * Um `mapping.json` vazio no instante da gravação é alguém escrevendo (um editor que trunca e
 * depois escreve): a gravação espera `EMPTY_RETRY_DELAY_MS` e relê, até `EMPTY_RETRY_ATTEMPTS`
 * vezes, antes de desistir com `EmptyMappingError`. Os testes usam estas constantes com
 * relógio falso.
 */
export const EMPTY_RETRY_ATTEMPTS = 4;
export const EMPTY_RETRY_DELAY_MS = AUTOSAVE_DELAY_MS;

export interface SessionOptions {
  readonly storage: ProjectStorage;
  readonly project: Project;
  readonly readOnly?: boolean;
  /** Lê e normaliza uma imagem escolhida pelo usuário (ver `storage/imageImport`). */
  readonly prepareImage: (file: File) => Promise<PreparedImage>;
  /**
   * Algo deste projeto mudou no armazenamento desta sessão: gravou o `mapping.json` com um
   * conteúdo que ainda não saiu num zip (`collectFiles`), ou gravou um `proposal.json`.
   */
  readonly onChanged?: () => void;
  /**
   * O projeto foi migrado de um schema antigo: `text` é o `mapping.json` original,
   * guardado com `writeBackup` antes do primeiro salvamento (que o sobrescreve).
   */
  readonly migratedFrom?: { readonly version: number; readonly text: string };
  /**
   * O `mapping.json` como foi lido do armazenamento. Com ele, qualquer diferença entre o
   * arquivo e o que a sessão conhece conta como alteração externa, mesmo sem mudar `revision`
   * (alguém editou o JSON à mão). Sem ele, só a `revision` é conferida.
   */
  readonly loadedText?: string;
  /** As propostas de alteração lidas do armazenamento ao abrir (ver `loadProposals`). */
  readonly proposals?: LoadedProposals;
  /**
   * Arquivos de imagem trocados ou adicionados por fora (ao recarregar o projeto ou ao
   * conferir os arquivos): quem guarda os bitmaps os descarta para carregar de novo.
   */
  readonly onImagesChanged?: (paths: readonly string[]) => void;
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

/** `locked`: a imagem (ou uma marcação dela) está trancada e o arquivo novo mudaria a geometria. */
export type ReplaceImageResult = 'replaced' | 'cancelled' | 'failed' | 'locked';

export interface AddImagesOptions {
  /** Ponto do canvas onde o centro de cada imagem deve ficar (espaço livre mais próximo). */
  readonly center?: { readonly x: number; readonly y: number };
}

/**
 * A gravação foi recusada porque o `mapping.json` mudou por fora (outro processo, como o
 * servidor MCP, ou um editor de texto) desde que a sessão o leu ou gravou.
 */
export class ExternalChangeError extends Error {
  constructor() {
    super('mapping.json changed outside the app');
    this.name = 'ExternalChangeError';
  }
}

/**
 * O `mapping.json` continuou vazio durante todas as tentativas de gravar: alguém o truncou e
 * não terminou de escrever (ferramenta que morreu no meio, sincronizador). A gravação desiste;
 * a pessoa resolve exportando, apagando o arquivo por fora, ou pelo diálogo de conflito que a
 * conferência abre ("Manter as minhas" grava por cima).
 */
export class EmptyMappingError extends Error {
  constructor() {
    super('mapping.json is empty on disk');
    this.name = 'EmptyMappingError';
  }
}

/** Há uma alteração externa esperando a decisão do usuário (diálogo "Projeto alterado fora da app"). */
export interface ExternalConflict {
  /** "Recarregar" falhou (arquivo sumiu ou ilegível): a decisão continua pendente. */
  readonly reloadFailed: boolean;
}

/**
 * `unchanged`: nada mudou por fora (ou o arquivo está ilegível por um instante). `reloaded`: o
 * projeto foi recarregado do disco. `conflict`: mudou por fora com a gravação em erro (há
 * pendência que não chega ao disco sozinha): abriu o `conflict`. `busy`: há um gesto em
 * andamento ou uma gravação agendada ou na fila (`saveStatus === 'saving'`): ela confere.
 */
export type SyncResult = 'unchanged' | 'reloaded' | 'conflict' | 'busy';

export interface CollectedFiles extends ProjectFiles {
  /** Imagens do projeto cujo arquivo não está no armazenamento (ficam fora do zip). */
  readonly missingImages: readonly string[];
  /**
   * O que vai no zip está também no armazenamento. `false` com a gravação em erro: o zip leva
   * o confirmado (é o resgate), mas o disco ainda não o tem.
   */
  readonly saved: boolean;
}

/** Um projeto aberto: store com undo/redo ligado ao armazenamento. */
export interface ProjectSession {
  readonly storage: ProjectStorage;
  readonly store: ProjectStore;
  readonly actions: ProjectActions;
  /** Propostas de alteração do projeto (etapa 4): lista, problemas, avisos e conferência da pasta. */
  readonly proposals: ProposalStore;
  /** Decidir, anotar e aplicar as aceitas: as únicas ações que mudam uma proposta. */
  readonly proposalActions: ProposalActions;
  readonly saveStatus: ReadonlySignal<SaveStatus>;
  /** Versão de origem, depois que o backup do original pré-migração foi gravado. */
  readonly backupSaved: ReadonlySignal<number | null>;
  /** Alteração externa que impediu uma gravação; `null` quando não há decisão pendente. */
  readonly conflict: ReadonlySignal<ExternalConflict | null>;
  /** Quantas vezes o projeto foi recarregado do disco (a interface ajusta a seleção). */
  readonly reloads: ReadonlySignal<number>;
  /** O armazenamento permite perceber mudanças externas (hoje, só a pasta). */
  readonly watchable: boolean;
  /**
   * Confere o `mapping.json` (e, com `images`, os arquivos de imagem) e a pasta `proposals/`
   * (propostas novas, alteradas ou apagadas por fora: `proposals.notices`). Sem alterações
   * locais pendentes, recarrega o projeto do disco se ele mudou por fora. Com a gravação em
   * erro (a pendência não chega ao disco), não recarrega: abre o `conflict`. Com um gesto em
   * andamento ou uma gravação agendada ou na fila, devolve `busy`. A conferência é um trabalho
   * da fila da sessão; chamadas concorrentes são juntadas (uma em curso e no máximo uma
   * esperando, com `images` acumulado).
   */
  sync(options?: { readonly images?: boolean }): Promise<SyncResult>;
  /**
   * Decide o conflito: `reload` descarta as alterações locais ainda não gravadas e carrega o
   * arquivo; `keep` grava as minhas por cima, com a revisão nova. Nunca rejeita: uma falha de
   * leitura vira `conflict.reloadFailed` (no `reload`) ou `saveStatus === 'error'` (no `keep`).
   */
  resolveConflict(choice: 'reload' | 'keep'): Promise<void>;
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
  /**
   * Grava agora o que estiver pendente (também serve para "tentar de novo") e diz se gravou.
   * Entra na fila (espera a gravação, a conferência ou a recarga em curso) e nunca rejeita.
   * `ok: true` ⇔ o projeto confirmado do instante da chamada está no disco; `ok: false` ⇔ a
   * pendência continua (`saveStatus === 'error'`), com a causa em `error` (`ExternalChangeError`
   * ⇔ `conflict` aberto). Quem desfaz uma mudança depois de um `ok` (a compensação de aplicar
   * aceitas) faz a sessão agendar sozinha a gravação do projeto restaurado.
   */
  flush(): Promise<FlushResult>;
  /**
   * `mapping.json` confirmado (nunca a prévia de um gesto), as imagens existentes, as cópias
   * de `specs/` e as propostas (com as imagens que aguardam aceitação), para exportar.
   */
  collectFiles(): Promise<CollectedFiles>;
  close(): Promise<void>;
}

/** O projeto confirmado: durante um gesto, o do início dele (a prévia não é gravada). */
function committedProject(store: ProjectStore): Project {
  const p = store.committed.peek();
  if (!p) throw new Error('session closed');
  return p;
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

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * O arquivo é exatamente a serialização do projeto em memória? Só então o projeto conta como
 * "o que o disco tem" (`written`): um projeto migrado, reparado ao abrir ou gravado por outro
 * programa em formato não canônico difere do disco, e a primeira mudança precisa gravar.
 */
function sameAsDisk(project: Project, text: string | null | undefined): boolean {
  if (text === null || text === undefined) return false;
  return (
    serialize({ ...project, revision: readRevision(text) ?? project.revision }) === text
  );
}

/** O que a sessão sabe do `mapping.json` em disco (ver `openSession`). */
interface DiskState {
  readonly revision: number;
  /** Texto lido ou gravado por último; `null` se a sessão não o conhece. */
  readonly text: string | null;
  readonly lastModified: number | null;
}

export function openSession(options: SessionOptions): ProjectSession {
  const { storage, prepareImage } = options;
  const store = createProjectStore({ now: options.now });
  const baseActions = createProjectActions(store, { newId: options.newId });
  store.load(options.project, { readOnly: options.readOnly });
  const now = options.now ?? (() => new Date().toISOString());
  const proposals = createProposalStore({
    storage,
    initial: options.proposals,
    now,
    onChanged: () => options.onChanged?.(),
  });

  // Arquivos de imagem que a sessão sabe estarem gravados e referenciados.
  const stored = new Set(options.project.images.map((i) => i.file));
  // Arquivos de imagem que a sessão gravou e que nenhum `mapping.json` gravado cita ainda: se
  // o projeto for recarregado do disco antes de a gravação citá-los, são órfãos e saem.
  const pendingFiles = new Set<string>();
  // Conteúdo das imagens removidas do armazenamento, para o desfazer restaurar.
  // Só guarda arquivos que algum snapshot do histórico ainda referencia.
  const trash = new Map<string, Blob>();
  // Cópias de `specs/` gravadas (caminho → texto). O conteúdo vive no projeto, então
  // o desfazer de aplicar/remover especialização só precisa regravar ou apagar.
  const writtenSpecs = specFiles(options.project);
  // Original pré-migração ainda não guardado: o primeiro salvamento grava antes.
  let pendingBackup = options.migratedFrom ?? null;
  const backupSaved = signal<number | null>(null);

  // O que a sessão sabe do `mapping.json` em disco: a revisão e o texto que leu (ou gravou por
  // último) e o `lastModified` visto. A revisão mora aqui, não no projeto do store: cada gravação
  // a incrementa sem criar entrada de desfazer nem renderizar a interface.
  let disk: DiskState = {
    revision: options.project.revision,
    text: options.loadedText ?? null,
    lastModified: null,
  };
  // O snapshot confirmado que o disco tem (por identidade): decide se há algo a gravar. Nasce
  // igual ao projeto aberto só quando o arquivo é exatamente a serialização dele.
  let written: Project | null = sameAsDisk(options.project, options.loadedText)
    ? store.committed.peek()
    : null;
  // O snapshot confirmado que o último `collectFiles` levou: gravá-lo depois não é "mudança".
  let exported: Project | null = null;
  const conflict = signal<ExternalConflict | null>(null);
  const reloads = signal(0);
  const watchable = typeof storage.statMapping === 'function';
  // Carimbo (tamanho + data) de cada arquivo de imagem como a sessão o conhece.
  const imageStamps = new Map<string, string | null>();
  const stampOf = (path: string): Promise<string | null> =>
    storage.statImage ? storage.statImage(path).catch(() => null) : Promise.resolve(null);
  const stampImages = async (paths: readonly string[]) => {
    for (const path of paths) imageStamps.set(path, await stampOf(path));
  };
  const initialStamps = watchable
    ? stampImages(options.project.images.map((i) => i.file)).catch(reportCleanupFailure)
    : Promise.resolve();
  const putImage = async (path: string, data: Blob) => {
    await storage.writeImage(path, data);
    pendingFiles.add(path);
    if (watchable) imageStamps.set(path, await stampOf(path));
  };
  const statMapping = (): Promise<number | null> =>
    storage.statMapping ? storage.statMapping().catch(() => null) : Promise.resolve(null);
  /** O único ponto em que a sessão lê o `mapping.json` depois de aberto (regra ESLint). */
  const readMapping = () => storage.loadMapping();

  /**
   * O disco difere do que a sessão leu ou gravou? Com o texto conhecido, qualquer diferença
   * conta (a `revision` faz parte dele, e assim a edição à mão, que não a muda, também é
   * percebida); sem o texto, só a `revision` pode dizer.
   */
  const changedExternally = (text: string): boolean =>
    disk.text !== null ? text !== disk.text : readRevision(text) !== disk.revision;

  // A data do arquivo como estava ao abrir, para a primeira conferência não precisar lê-lo.
  // O `stat` vem depois da leitura que abriu o projeto, então só vale se o arquivo ainda é o
  // conhecido (lido aqui uma vez); se já mudou, a primeira conferência o trata como sempre.
  const initialStat = watchable
    ? (async () => {
        const modified = await statMapping();
        if (modified === null || disk.lastModified !== null) return;
        const text = await readMapping().catch(() => null);
        if (text !== null && !changedExternally(text) && disk.lastModified === null) {
          disk = { ...disk, lastModified: modified };
        }
      })()
    : Promise.resolve();

  /**
   * Pode gravar? Sem arquivo (apagado por fora) ou com o arquivo igual ao conhecido, sim. Vazio
   * e diferente é alguém escrevendo: espera e relê, até `EMPTY_RETRY_ATTEMPTS` vezes, e então
   * desiste (`EmptyMappingError`). Diferente de verdade: abre o conflito e recusa
   * (`ExternalChangeError`). Sem o texto conhecido (`loadedText` ausente; a app sempre o passa)
   * a sessão só compara revisões, e um arquivo vazio não tem revisão: não há como saber se é
   * de alguém, então grava, como antes.
   */
  const assertWritable = async () => {
    for (let attempt = 1; ; attempt++) {
      const text = await readMapping();
      if (text === null || !changedExternally(text)) return;
      if (text.trim() === '' && disk.text === null) return;
      if (text.trim() !== '') {
        conflict.value = { reloadFailed: false };
        throw new ExternalChangeError();
      }
      if (attempt >= EMPTY_RETRY_ATTEMPTS) throw new EmptyMappingError();
      await sleep(EMPTY_RETRY_DELAY_MS);
    }
  };

  /**
   * Grava o projeto: restaura imagens que voltaram (undo) e grava as cópias de
   * `specs/` novas ou alteradas, grava o `mapping.json` e só então remove as
   * imagens e cópias que deixaram de ser usadas. Assim o `mapping.json` em disco
   * nunca aponta para um arquivo já apagado. Grava o projeto confirmado: um gesto em
   * andamento só chega ao disco quando confirmado (`commitGesture` sobe a revisão e agenda).
   * Gravado o `mapping.json`, a gravação conta como feita: uma falha na limpeza vai para o
   * Diagnóstico (`session.cleanup`) e a próxima gravação tenta de novo.
   */
  const writeProject = async (p: Project) => {
    await assertWritable();
    let wrote = false;
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
      await putImage(file, blob);
      stored.add(file);
      trash.delete(file);
      wrote = true;
    }
    const specs = specFiles(p);
    for (const [file, text] of specs) {
      if (writtenSpecs.get(file) === text) continue;
      await storage.writeSpec(file, text);
      writtenSpecs.set(file, text);
      wrote = true;
    }
    // As gravações acima levam tempo: confere de novo antes de sobrescrever o arquivo.
    if (wrote) await assertWritable();
    const revision = disk.revision + 1;
    const text = serialize({ ...p, revision });
    await storage.saveMapping(text);
    disk = { revision, text, lastModified: await statMapping() };
    written = p;
    // Só o que este `mapping.json` cita deixa de ser pendente: uma imagem posta durante esta
    // gravação (não citada por `p`) continua pendente até a gravação que a citar.
    for (const file of referenced) pendingFiles.delete(file);
    if (p !== exported) options.onChanged?.();
    await cleanUp(referenced, specs).catch(reportCleanupFailure);
  };

  /**
   * O disco já tem `p`? Pela identidade (o atalho) ou pelo conteúdo a menos do `updatedAt`
   * do projeto: o desfazer carimba um `updatedAt` novo no snapshot restaurado, e voltar ao que
   * o disco tem não é mudança a gravar (S5). Só vale com `written` conhecido (ver `sameAsDisk`).
   */
  const onDisk = (p: Project): boolean => {
    if (p === written) return true;
    if (written === null || disk.text === null) return false;
    return (
      serialize({
        ...p,
        revision: disk.revision,
        project: { ...p.project, updatedAt: written.project.updatedAt },
      }) === disk.text
    );
  };

  /** A gravação do autosave (o `save()` da fila): nada a fazer se o disco já tem o confirmado. */
  const persist = async () => {
    const p = store.committed.peek();
    if (!p || onDisk(p)) return;
    try {
      await writeProject(p);
    } catch (e) {
      if (e instanceof EmptyMappingError) reportError('session.emptyMapping', e);
      throw e;
    }
  };

  /** Remove as imagens e cópias de `specs/` que o `mapping.json` gravado deixou de usar. */
  const cleanUp = async (
    referenced: ReadonlySet<string>,
    specs: ReadonlyMap<string, string>,
  ) => {
    const inHistory = store.referencedImageFiles();
    for (const file of [...stored]) {
      if (referenced.has(file)) continue;
      if (inHistory.has(file)) {
        const blob = await storage.readImage(file);
        // Cópia em memória: numa pasta, o `File` lido deixa de ser legível quando o arquivo
        // é removido logo abaixo, e o "refazer" precisa regravar a imagem.
        if (blob)
          trash.set(
            file,
            new Blob([await blob.arrayBuffer()], {
              type: blob.type || imageMimeType(file),
            }),
          );
      }
      await storage.removeImage(file);
      imageStamps.delete(file);
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
  /**
   * Operações caras (imagens e especializações) gravam sem esperar o debounce: o trabalho
   * de refazê-las é grande demais para ficar só em memória até o fim do debounce. A gravação entra na
   * mesma fila do autosave, então duas seguidas não correm em paralelo.
   */
  const saveNow = <R extends { readonly ok: boolean }>(result: R): R => {
    if (result.ok) void saver.flush();
    return result;
  };
  const actions: ProjectActions = {
    ...baseActions,
    removeImage: (imageId) => saveNow(baseActions.removeImage(imageId)),
    applySpecialization: (spec) => saveNow(baseActions.applySpecialization(spec)),
    updateSpecialization: (spec, texts) =>
      saveNow(baseActions.updateSpecialization(spec, texts)),
    removeSpecialization: (specId, mode, texts) =>
      saveNow(baseActions.removeSpecialization(specId, mode, texts)),
  };
  const proposalActions = createProposalActions({
    store,
    proposals,
    storage,
    now,
    newId: options.newId ?? (() => crypto.randomUUID()),
    // A imagem aceita entra no projeto como as da importação: a sessão passa a geri-la
    // (e o desfazer a remove e restaura pelo mesmo caminho das demais imagens).
    putProjectImage: async (path, data) => {
      await putImage(path, data);
      stored.add(path);
    },
    dropProjectImage: async (path) => {
      if (stored.delete(path)) await storage.removeImage(path);
      pendingFiles.delete(path);
      imageStamps.delete(path);
    },
    flush: () => saver.flush(),
  });
  let lastRevision = store.revision.peek();
  const stopWatching = effect(() => {
    const revision = store.revision.value;
    if (revision === lastRevision) return;
    lastRevision = revision;
    // Pela identidade (barato, a cada edição); a gravação confere o conteúdo (`onDisk`) e,
    // se o desfazer voltou ao que o disco tem, só acerta o status, sem ler nem gravar.
    if (store.committed.peek() !== written) {
      saver.schedule();
    } else if (saver.status.peek() !== 'saved') {
      void saver.flush();
    }
  });

  /**
   * Troca o projeto em memória pelo que veio do disco, descartando histórico e pendências. Só
   * de dentro de um trabalho da fila, logo depois da guarda (`idle()`), sem `await` antes de
   * trocar o projeto. Apaga os arquivos de imagem que a sessão gravou e nenhum `mapping.json`
   * gravado cita (`pendingFiles`): sem isso ficariam órfãos na pasta para sempre.
   */
  const adopt = async (
    loaded: Extract<LoadProjectResult, { ok: true }>,
    modified: number | null,
  ) => {
    const { project } = loaded;
    store.load(project, { readOnly: loaded.readOnly });
    // O `load` zera o contador de revisão do store, o que agendaria uma gravação: descarta.
    lastRevision = store.revision.peek();
    saver.reset();
    const referenced = new Set(project.images.map((i) => i.file));
    const orphans = [...pendingFiles].filter((file) => !referenced.has(file));
    pendingFiles.clear();
    stored.clear();
    for (const file of referenced) stored.add(file);
    trash.clear();
    writtenSpecs.clear();
    for (const [file, text] of specFiles(project)) writtenSpecs.set(file, text);
    if (loaded.migratedFrom !== null) {
      pendingBackup = { version: loaded.migratedFrom, text: loaded.text };
    }
    disk = {
      revision: readRevision(loaded.text) ?? 0,
      text: loaded.text,
      lastModified: modified,
    };
    written = sameAsDisk(project, loaded.text) ? store.committed.peek() : null;
    reloads.value++;
    for (const file of orphans) {
      await storage.removeImage(file).catch(reportCleanupFailure);
      imageStamps.delete(file);
    }
  };

  /**
   * Compara os arquivos de imagem com o que a sessão conhece e avisa os trocados ou
   * novos (`all`: depois de recarregar o projeto, em que as imagens novas também contam).
   */
  const checkImages = async (all: boolean) => {
    const project = store.project.peek();
    if (!project || !storage.statImage) return;
    await initialStamps;
    const changed: string[] = [];
    const current = new Set<string>();
    for (const image of project.images) {
      current.add(image.file);
      const stamp = await stampOf(image.file);
      const known = imageStamps.has(image.file);
      if (known ? imageStamps.get(image.file) !== stamp : all) changed.push(image.file);
      imageStamps.set(image.file, stamp);
    }
    for (const path of [...imageStamps.keys()]) {
      if (!current.has(path)) imageStamps.delete(path);
    }
    if (changed.length > 0) options.onImagesChanged?.(changed);
  };

  let closed = false;
  /** Sem nada local a perder: nenhuma gravação pendente e nenhum gesto em andamento. */
  const idle = () => saver.status.peek() === 'saved' && !store.gestureActive.peek();

  /**
   * O trabalho de conferência (na fila: nenhuma gravação corre junto). Edições do usuário
   * continuam acontecendo entre os `await` (são síncronas), por isso a guarda `idle()` é relida
   * logo antes de trocar o projeto.
   */
  const syncProject = async (images: boolean): Promise<SyncResult> => {
    if (closed || !store.project.peek() || conflict.peek()) return 'unchanged';
    if (store.gestureActive.peek()) return 'busy';
    // Gravação agendada ou na fila: ela mesma confere o arquivo antes de gravar.
    if (saver.status.peek() === 'saving') return 'busy';
    await initialStat;
    const modified = await statMapping();
    let result: SyncResult = 'unchanged';
    if (modified !== null && modified !== disk.lastModified) {
      const text = await readMapping();
      if (text !== null && changedExternally(text)) {
        const erroring = saver.status.peek() === 'error';
        if (text.trim() === '' && !erroring) {
          // Um editor ainda escrevendo; sem pendência, nada a proteger: tenta no próximo ciclo.
        } else if (erroring) {
          // A pendência não chega ao disco sozinha: a pessoa decide (um arquivo que ficou vazio
          // de vez também cai aqui, e "Manter as minhas" é a saída).
          conflict.value = { reloadFailed: false };
          result = 'conflict';
        } else {
          const loaded = await loadProject(storage);
          // Ilegível (um editor ainda escrevendo): tenta de novo no próximo ciclo.
          if (loaded.ok) {
            if (closed) return 'unchanged';
            // Uma edição entrou durante as leituras: a gravação dela decide.
            if (!idle()) return 'busy';
            await adopt(loaded, modified);
            result = 'reloaded';
          }
        }
      } else if (text !== null) {
        // Só a data mudou (um `touch`, a sincronização de uma nuvem): o conteúdo é o mesmo.
        disk = { ...disk, lastModified: modified };
      }
    }
    if (result === 'reloaded' || images) await checkImages(result === 'reloaded');
    return result;
  };

  // A conferência enfileirada e ainda não iniciada: chamadas concorrentes acumulam `images`
  // nela e recebem a mesma promessa (uma em curso e no máximo uma esperando).
  let pendingSync: { promise: Promise<SyncResult>; images: boolean } | null = null;
  const sync = (syncOptions: { readonly images?: boolean } = {}): Promise<SyncResult> => {
    if (!watchable || closed || !store.project.peek())
      return Promise.resolve('unchanged');
    if (pendingSync) {
      pendingSync.images ||= syncOptions.images === true;
      return pendingSync.promise;
    }
    const entry = {
      images: syncOptions.images === true,
      promise: Promise.resolve<SyncResult>('unchanged'),
    };
    entry.promise = saver
      .enqueue(() => {
        pendingSync = null;
        return syncProject(entry.images);
      })
      .then(async (result) => {
        // As propostas não esperam o projeto: decisões e notas são gravadas na hora e
        // refeitas sobre a versão do disco, então não há "alteração local pendente" a proteger.
        // Fora da fila da sessão: a fila das propostas pode esperar por ela (`flush`), nunca o
        // contrário.
        if (!closed && storage.statProposal) {
          await proposals.scan().catch((e: unknown) => reportError('proposals.scan', e));
        }
        return result;
      });
    pendingSync = entry;
    return entry.promise;
  };

  const resolveConflict = async (choice: 'reload' | 'keep') => {
    if (!conflict.peek()) return;
    if (choice === 'keep') {
      await saver.enqueue(async () => {
        if (!conflict.peek()) return;
        let text: string | null = null;
        try {
          text = await readMapping();
        } catch (e) {
          // Ilegível (permissão revogada): segue como se o arquivo tivesse sumido; se a
          // gravação também falhar, o status diz.
          reportError('session.keep', e);
        }
        disk = {
          revision: (text === null ? null : readRevision(text)) ?? disk.revision,
          text,
          lastModified: await statMapping(),
        };
        // O disco passou a ter o arquivo de fora: as minhas vão por cima, mesmo que a pendência
        // tenha sido desfeita no meio.
        written = null;
        conflict.value = null;
        saver.schedule();
      });
      await saver.flush();
      return;
    }
    await saver.enqueue(async () => {
      if (!conflict.peek()) return;
      const modified = await statMapping();
      let loaded: LoadProjectResult;
      try {
        loaded = await loadProject(storage);
      } catch (e) {
        reportError('session.reload', e);
        conflict.value = { reloadFailed: true };
        return;
      }
      if (!loaded.ok) {
        reportError('session.reload', new Error(loaded.error));
        conflict.value = { reloadFailed: true };
        return;
      }
      await adopt(loaded, modified);
      conflict.value = null;
      await checkImages(true);
    });
  };

  return {
    storage,
    store,
    actions,
    proposals,
    proposalActions,
    saveStatus: saver.status,
    backupSaved,
    conflict,
    reloads,
    watchable,
    sync,
    resolveConflict,

    async addImages(files, addOptions = {}) {
      const added: string[] = [];
      const failed: string[] = [];
      if (store.readOnly.value || store.reviewing.value || !store.project.value) {
        return { added, failed: files.map((f) => f.name) };
      }
      // Uma por vez: fotos grandes decodificadas em paralelo estouram a memória.
      for (const file of files) {
        let path: string | null = null;
        try {
          const prepared = await prepareImage(file);
          path = uniqueImageFile(currentProject(store), safeFileName(prepared.name));
          await putImage(path, prepared.data);
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
            pendingFiles.delete(path);
            await storage.removeImage(path).catch(reportCleanupFailure);
          }
        }
      }
      // Operação cara: grava sem esperar o debounce (ver `saveNow`).
      if (added.length > 0) await saver.flush();
      return { added, failed };
    },

    async replaceImage(imageId, file, confirmAspectChange) {
      if (store.readOnly.value || store.reviewing.value || !store.project.value) {
        return 'failed';
      }
      let path: string | null = null;
      try {
        const prepared = await prepareImage(file);
        const image = currentProject(store).images.find((i) => i.id === imageId);
        if (!image) return 'failed';
        const next = { width: prepared.width, height: prepared.height };
        if (!canReplaceImage(currentProject(store), imageId, next)) return 'locked';
        const sameAspect = isSameAspect(image, next);
        if (!sameAspect) {
          const from = { width: image.width, height: image.height };
          if (!(await confirmAspectChange({ from, to: next }))) return 'cancelled';
        }
        path = uniqueImageFile(currentProject(store), safeFileName(prepared.name));
        await putImage(path, prepared.data);
        stored.add(path);
        const result = actions.replaceImage(
          imageId,
          { file: path, ...next },
          { confirmAspectChange: !sameAspect },
        );
        if (!result.ok) throw new Error(result.error);
        await saver.flush();
        return 'replaced';
      } catch (e) {
        reportError('session.replaceImage', e);
        if (path && stored.delete(path)) {
          pendingFiles.delete(path);
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
      const saved = (await saver.flush()).ok;
      const p = committedProject(store);
      // Gravar este snapshot depois (a gravação em erro que enfim passa) não é mudança nova.
      exported = p;
      const images = new Map<string, Blob>();
      const missingImages: string[] = [];
      for (const image of p.images) {
        const blob = await storage.readImage(image.file);
        if (blob) images.set(image.file, blob);
        else missingImages.push(image.file);
      }
      const withProposals = await proposals.collect();
      return {
        mapping: serialize({ ...p, revision: disk.revision }),
        images,
        specs: specFiles(p),
        proposals: withProposals.proposals,
        proposalImages: withProposals.images,
        missingImages,
        saved,
      };
    },

    async close() {
      closed = true;
      stopWatching();
      await proposals.settled();
      // Na fila: espera a conferência ou a recarga em curso e grava o pendente.
      await saver.flush();
      saver.dispose();
      store.close();
    },
  };
}
