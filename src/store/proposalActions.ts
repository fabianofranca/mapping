import {
  addNote as addProposalNote,
  applyAccepted,
  decide,
  editNote as editProposalNote,
  isTextPackageFile,
  packageWithinLimits,
  proposalIndex,
  removeNote as removeProposalNote,
  reviewKey,
  reviewTree,
  serializeSpec,
  type Project,
  type Proposal,
  type ProposalPackage,
  type ProposalDecisions,
  type ProposalIssue,
  type ProposalStatus,
  type ReviewTarget,
  droppedEntryOf,
  fileNameKey,
  unseenRevisedIds,
  withDroppedNote,
} from '../model';
import type { FlushResult } from '../storage/autosave';
import type { FolderOp } from '../storage/folderCalls';
import { FOLDER_CONCURRENCY } from '../storage/folderConcurrency';
import { imageMimeType, type ProjectStorage } from '../storage/types';
import { mapLimit } from '../utils/mapLimit';
import { reportError } from '../utils/report';
import type { HistoryLink, LinkResult, ProjectStore } from './history';
import { validatePackage } from './packageValidation';
import type { SpecPackageFiles } from './project';
import type { ProposalErrorCode, ProposalStore, RemoveProposalError } from './proposals';

// Ações da revisão sobre as propostas (etapa 4): decidir, anotar e aplicar as aceitas.
// São as únicas que mudam uma proposta; a gravação é de `ProposalStore.mutate`. Cada
// ação é uma função pura da proposta (do `src/model/`), então, se o arquivo mudou por
// fora, ela é refeita sobre a versão nova do disco.

export type DecisionError =
  /** O agente revisou esta mudança enquanto a pessoa olhava a versão antiga (decisão 8). */
  'revised' | 'not-open' | 'unknown-target' | 'no-project' | ProposalErrorCode;

/** O que uma decisão mudou, para explicar ("4 mudanças rejeitadas junto") e para o "Desfazer" dos lotes. */
export interface DecisionOutcome {
  readonly proposal: Proposal;
  /** Decisões antes e depois (o "Desfazer" regrava `previous` numa única escrita). */
  readonly previous: ProposalDecisions;
  readonly decisions: ProposalDecisions;
  /** Mudanças pedidas cujo estado mudou. */
  readonly changed: readonly string[];
  /** Mudanças fora do pedido que mudaram pelas dependências. */
  readonly cascaded: readonly string[];
}

export type DecisionResult =
  | ({ readonly ok: true } & DecisionOutcome)
  | { readonly ok: false; readonly error: DecisionError };

export type NoteError =
  'unknown-target' | 'empty-note' | 'unknown-note' | ProposalErrorCode;

export type NoteResult =
  | { readonly ok: true; readonly proposal: Proposal; readonly noteId: string | null }
  | { readonly ok: false; readonly error: NoteError };

export type RestoreError = 'not-open' | 'stale' | ProposalErrorCode;

export type ApplyError =
  | 'no-project'
  | 'read-only'
  /** O conjunto aceito deixaria o projeto inválido (`issues`) ou não cabe nele. */
  | 'blocked'
  /** O projeto mudou durante a aplicação (recarregado por fora). */
  | 'stale'
  /** A imagem nova não está em `proposals/<id>/…` (`path`). */
  | 'image-missing'
  /** O arquivo de destino já é de outra imagem do projeto (`path`). */
  | 'image-exists'
  /** Nenhum arquivo do pacote de biblioteca em `proposals/<id>/specs/<pasta>/` (`path`). */
  | 'package-missing'
  /** O pacote da proposta não passa na validação da biblioteca (ou passa dos limites) (`path`). */
  | 'package-invalid'
  /**
   * O `mapping.json` não gravou (alteração externa, quota, permissão): as mudanças foram
   * desfeitas e a proposta continua como estava (alteração externa abre o diálogo de conflito).
   */
  | 'save-failed'
  | 'failed'
  | ProposalErrorCode;

export type ApplyResult =
  | {
      readonly ok: true;
      readonly proposal: Proposal;
      /** Mudanças efetivadas agora. */
      readonly applied: number;
      /** Imagens movidas para `images/`. */
      readonly files: number;
    }
  | {
      readonly ok: false;
      readonly error: ApplyError;
      readonly issues?: readonly ProposalIssue[];
      readonly path?: string;
    };

export type RemoveError =
  /** Projeto somente leitura: nada do armazenamento muda. */
  | 'read-only'
  /** Há uma proposta em revisão: apagar é da lista, fora da revisão. */
  | 'reviewing'
  | RemoveProposalError;

export type RemoveResult =
  | { readonly ok: true; readonly proposal: Proposal }
  | { readonly ok: false; readonly error: RemoveError };

/** Todos os motivos de recusa das ações da revisão (para a mensagem ao usuário). */
export type ProposalActionError =
  DecisionError | NoteError | RestoreError | ApplyError | RemoveError;

export interface ProposalActions {
  /** Decide um nível (aceita, rejeita ou limpa) resolvendo as dependências. */
  decide(
    proposalId: string,
    target: ReviewTarget,
    state: 'accepted' | 'rejected' | null,
  ): Promise<DecisionResult>;
  /**
   * Decide vários alvos numa única gravação (os lotes: "Aceitar 12 visíveis" com filtros).
   * Pelo menos um alvo existente.
   */
  decideMany(
    proposalId: string,
    targets: readonly ReviewTarget[],
    state: 'accepted' | 'rejected' | null,
  ): Promise<DecisionResult>;
  /**
   * Regrava `previous` como as decisões, numa única escrita ("Desfazer" do lote). Só vale
   * enquanto as decisões ainda são `expected` (ninguém decidiu nada depois).
   */
  restoreDecisions(
    proposalId: string,
    previous: ProposalDecisions,
    expected: ProposalDecisions,
  ): Promise<
    | { readonly ok: true; readonly proposal: Proposal }
    | { readonly ok: false; readonly error: RestoreError }
  >;
  addNote(proposalId: string, target: ReviewTarget, text: string): Promise<NoteResult>;
  /** Texto vazio remove a nota. */
  editNote(proposalId: string, noteId: string, text: string): Promise<NoteResult>;
  removeNote(proposalId: string, noteId: string): Promise<NoteResult>;
  /**
   * "Aplicar aceitas": efetiva as aceitas ainda não aplicadas numa única entrada de
   * desfazer do projeto, move as imagens de `proposals/<id>/` para `images/`, copia os
   * pacotes de biblioteca de `proposals/<id>/specs/` para `specs/` (pela sessão; os arquivos
   * ficam na proposta) e grava `applied` (e `status`, se tudo foi decidido) na proposta. Desfazer e refazer essa
   * entrada também desfazem e refazem o `applied` e a posição das imagens.
   */
  applyAccepted(proposalId: string): Promise<ApplyResult>;
  /**
   * Apaga uma proposta fechada (retirada, substituída ou aplicada) do armazenamento, com as
   * imagens que esperavam a aceitação. Sem desfazer. A entrada de "Aplicar aceitas" dela no
   * histórico perde o vínculo (`detachLinks`): o desfazer e o refazer do projeto continuam
   * valendo, sem mexer em proposta nenhuma. As imagens que a aplicação copiou para
   * `images/` são do projeto e seguem a limpeza normal da sessão.
   */
  removeProposal(proposalId: string): Promise<RemoveResult>;
}

export interface ProposalActionsDeps {
  readonly store: ProjectStore;
  readonly proposals: ProposalStore;
  readonly storage: ProjectStorage;
  readonly now: () => string;
  readonly newId: () => string;
  /** Grava a imagem no projeto e a registra como gravada pela sessão (`stored`). */
  readonly putProjectImage: (path: string, data: Blob) => Promise<void>;
  /**
   * Tudo que ocupa um nome em `images/` agora: os arquivos da pasta (citados ou não) e o que a
   * sessão guarda (histórico de desfazer, lixeira, gravações em curso). Comparado por
   * `fileNameKey`, sem diferenciar maiúsculas e minúsculas.
   */
  readonly takenImageFiles: () => Promise<ReadonlySet<string>>;
  /** Desfaz `putProjectImage` (a aplicação falhou no meio). */
  readonly dropProjectImage: (path: string) => Promise<void>;
  /**
   * Entrega à sessão o pacote da especialização (já validado) que a aplicação vai pôr no
   * projeto: a gravação de `specs/<pasta>/` e o desfazer/refazer saem do cache dela.
   */
  readonly stagePackage: (
    spec: { readonly id: string; readonly version: number },
    files: SpecPackageFiles,
  ) => void;
  /** Grava agora o que o projeto tem pendente (o `mapping.json` antes da proposta) e diz se gravou. */
  readonly flush: () => Promise<FlushResult>;
  /**
   * Mede no contador de chamadas da pasta (`decide`: gravar uma decisão ou nota; `apply`:
   * aplicar as aceitas, até o `mapping.json` gravado). Sem ele, só executa.
   */
  readonly measure?: <T>(op: FolderOp, fn: () => Promise<T>) => Promise<T>;
}

/** Alguma das mudanças que vão mudar de estado foi revisada pelo agente sem a pessoa ver? */
function touchesUnseen(
  unseen: ReadonlySet<string>,
  changed: readonly string[],
  cascaded: readonly string[],
): boolean {
  return [...changed, ...cascaded].some((changeId) => unseen.has(changeId));
}

function sameDecisions(a: ProposalDecisions, b: ProposalDecisions): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((id) => {
    const other = b[id];
    return other !== undefined && other.state === a[id]?.state && other.at === a[id]?.at;
  });
}

/** Imagem copiada para `images/`: onde estava, onde está e o conteúdo (para desfazer). */
interface MovedImage {
  readonly from: string;
  readonly to: string;
  readonly blob: Blob;
}

/** Por que o pacote de uma proposta não pôde ser lido. */
type PackageReadError = 'package-missing' | 'package-invalid';

/**
 * Lê para a memória o pacote que espera em `proposals/<id>/specs/<pasta>/` (texto dos `.json`
 * e `.md`, `Blob` copiado dos demais, como o `snapshotPackage` da sessão) e o valida pelos
 * três níveis, com a versão aplicada como anterior (contrato de versão). O arquivo da
 * especialização vem de `to.spec`, a fonte da verdade: se a pasta tem o dele, é substituído.
 */
async function readProposalPackage(
  storage: ProjectStorage,
  pkg: ProposalPackage,
  base: Project,
  proposalId: string,
): Promise<SpecPackageFiles | PackageReadError> {
  const prefix = `${pkg.from}/`;
  const paths = (await storage.listProposalFiles(proposalId)).filter((path) =>
    path.startsWith(prefix),
  );
  if (paths.length === 0) return 'package-missing';
  // Leituras em paralelo com limite; a conferência e o mapa seguem a ordem dos arquivos.
  const read = await mapLimit(paths, FOLDER_CONCURRENCY, async (path) => {
    const blob = await storage.readImage(path);
    if (!blob) return null;
    const rel = path.slice(prefix.length);
    const data = isTextPackageFile(rel)
      ? await blob.text()
      : new Blob([await blob.arrayBuffer()], { type: blob.type });
    return { rel, data, size: blob.size };
  });
  const files = new Map<string, string | Blob>();
  let bytes = 0;
  for (const item of read) {
    if (!item) return 'package-missing';
    bytes += item.size;
    files.set(item.rel, item.data);
  }
  if (!packageWithinLimits(files.size, bytes) || pkg.spec === null) {
    return 'package-invalid';
  }
  files.set(pkg.file.slice(pkg.dir.length + 1), serializeSpec(pkg.spec));
  const previous = base.specializations.find((s) => s.id === pkg.specId)?.spec;
  const report = validatePackage(files, previous ?? undefined);
  return report.ok ? files : 'package-invalid';
}

/**
 * Lê as imagens de origem de uma proposta em paralelo com limite, na ordem de `moves`: `null`
 * onde o arquivo não existe. Cópia em memória: ler de novo depois de apagar a origem, no
 * desfazer, não pode falhar.
 */
async function readImageSources(
  storage: ProjectStorage,
  moves: readonly { readonly from: string; readonly to: string }[],
): Promise<(Blob | null)[]> {
  return mapLimit(moves, FOLDER_CONCURRENCY, async (move) => {
    const source = await storage.readImage(move.from);
    if (!source) return null;
    return new Blob([await source.arrayBuffer()], {
      type: source.type || imageMimeType(move.to),
    });
  });
}

export function createProposalActions(deps: ProposalActionsDeps): ProposalActions {
  const { store, proposals, storage, now } = deps;
  const measure = <T>(op: FolderOp, fn: () => Promise<T>): Promise<T> =>
    deps.measure ? deps.measure(op, fn) : fn();

  const decideMany: ProposalActions['decideMany'] = async (id, targets, state) => {
    const result = await measure('decide', () =>
      proposals.mutate<DecisionOutcome, DecisionError>(id, (p, seen) => {
        const project = store.committed.peek();
        if (!project) return { ok: false, error: 'no-project' };
        if (p.status !== 'open') return { ok: false, error: 'not-open' };
        const tree = reviewTree(p, project);
        const at = now();
        const requested = new Set<string>();
        let current = p;
        for (const target of targets) {
          const decided = decide(current, tree, target, state, at);
          if (!decided.ok) {
            // Um alvo que sumiu num lote é ignorado; sozinho, é erro.
            if (targets.length === 1) return { ok: false, error: decided.reason };
            continue;
          }
          for (const changeId of tree.changeIdsOf(target)) requested.add(changeId);
          current = { ...current, decisions: decided.decisions };
        }
        const changed: string[] = [];
        const cascaded: string[] = [];
        for (const c of p.changes) {
          if (p.decisions[c.id]?.state === current.decisions[c.id]?.state) continue;
          (requested.has(c.id) ? changed : cascaded).push(c.id);
        }
        if (touchesUnseen(unseenRevisedIds(seen, p), changed, cascaded)) {
          return { ok: false, error: 'revised' };
        }
        const outcome: DecisionOutcome = {
          proposal: current,
          previous: p.decisions,
          decisions: current.decisions,
          changed,
          cascaded,
        };
        return {
          ok: true,
          proposal: changed.length + cascaded.length === 0 ? p : current,
          value: outcome,
        };
      }),
    );
    if (!result.ok) return result;
    // Decidir é como editar: o "refazer" de uma aplicação desfeita deixaria de valer.
    if (result.value.changed.length + result.value.cascaded.length > 0) {
      store.discardRedoOf(id);
    }
    return { ok: true, ...result.value, proposal: result.proposal };
  };

  const noteMutation = (
    id: string,
    mutation: (p: Proposal) => Proposal | NoteError,
    noteIdOf: (before: Proposal, after: Proposal) => string | null,
  ): Promise<NoteResult> =>
    measure('decide', () =>
      proposals.mutate<string | null, NoteError>(id, (p) => {
        const next = mutation(p);
        if (typeof next === 'string') return { ok: false, error: next };
        return { ok: true, proposal: next, value: noteIdOf(p, next) };
      }),
    ).then((result) =>
      result.ok
        ? { ok: true, proposal: result.proposal, noteId: result.value }
        : { ok: false, error: result.error },
    );

  /** O alvo existe na proposta (para a nota não apontar para o vazio). */
  const targetExists = (p: Proposal, target: ReviewTarget): boolean => {
    if (target.level === 'proposal' || target.level === 'project') return true;
    if (target.id === null) return false;
    if (target.level === 'change') return proposalIndex(p).changes.has(target.id);
    const project = store.committed.peek();
    return project ? reviewTree(p, project).nodes.has(reviewKey(target)) : false;
  };

  /**
   * Põe a nota no alvo. Uma mudança que o agente retirou numa revisão já não existe: a nota
   * sobe ao nível da proposta e a mudança retirada a reivindica (decisão 6).
   */
  const addNoteTo = (
    p: Proposal,
    target: ReviewTarget,
    text: string,
  ): Proposal | NoteError => {
    const noteId = deps.newId();
    if (targetExists(p, target)) return addProposalNote(p, target, text, now(), noteId);
    const where =
      target.level === 'change' && target.id ? droppedEntryOf(p, target.id) : null;
    if (where === null) return 'unknown-target';
    const asProposal: ReviewTarget = { level: 'proposal', id: null };
    return withDroppedNote(
      addProposalNote(p, asProposal, text, now(), noteId),
      where,
      noteId,
    );
  };

  const applyAcceptedChanges: ProposalActions['applyAccepted'] = async (id) => {
    let issues: readonly ProposalIssue[] | undefined;
    let failedPath: string | undefined;
    const outcome = await measure('apply', () =>
      proposals.mutate<{ applied: number; files: number }, ApplyError>(id, (p) => {
        const base = store.project.peek();
        if (!base) return { ok: false, error: 'no-project' };
        if (store.readOnly.peek()) return { ok: false, error: 'read-only' };
        const applying = applyAccepted(base, p, now());
        if (!applying.ok) {
          issues = applying.issues;
          return { ok: false, error: 'blocked' };
        }
        const moved: MovedImage[] = [];
        const appliedIds = applying.applied.map((c) => c.id);
        const appliedAt = Object.fromEntries(
          appliedIds.map((changeId) => [changeId, applying.proposal.applied[changeId]]),
        );
        const statusBefore: ProposalStatus = p.status;
        const statusAfter: ProposalStatus = applying.proposal.status;
        // A gravação do `mapping.json` falhou e a entrada foi desfeita: o vínculo não faz nada.
        let abandoned = false;
        // O projeto depois do `store.apply` (para desfazer só se ainda é ele).
        let applied: Project | null = null;

        // Desfazer a entrada: a proposta volta a ter as mudanças como aceitas sem aplicar e
        // as imagens voltam para `proposals/<id>/`. Refazer: o contrário.
        const link: HistoryLink = {
          tag: id,
          undo: () => {
            if (abandoned) return undefined;
            return proposals
              .mutate<void, never>(id, (current) => {
                const rest = { ...current.applied };
                for (const changeId of appliedIds) delete rest[changeId];
                return {
                  ok: true,
                  value: undefined,
                  proposal: {
                    ...current,
                    applied: rest,
                    status:
                      current.status === statusAfter ? statusBefore : current.status,
                  },
                  before: async () => {
                    for (const m of moved) await storage.writeImage(m.from, m.blob);
                    return null;
                  },
                };
              })
              .then((r): LinkResult => {
                if (!r.ok) reportError('proposals.undoApply', new Error(r.error));
                return r.ok ? { ok: true } : { ok: false, error: r.error };
              });
          },
          redo: () => {
            if (abandoned) return undefined;
            return proposals
              .mutate<void, never>(id, (current) => {
                const again = { ...current.applied };
                for (const changeId of appliedIds) {
                  const entry = appliedAt[changeId];
                  if (entry && current.decisions[changeId]?.state === 'accepted') {
                    again[changeId] = entry;
                  }
                }
                return {
                  ok: true,
                  value: undefined,
                  proposal: {
                    ...current,
                    applied: again,
                    status:
                      current.status === statusBefore ? statusAfter : current.status,
                  },
                  after: async () => {
                    for (const m of moved) await storage.removeImage(m.from);
                  },
                };
              })
              .then((r): LinkResult => {
                if (!r.ok) reportError('proposals.redoApply', new Error(r.error));
                return r.ok ? { ok: true } : { ok: false, error: r.error };
              });
          },
        };

        const rollback = async () => {
          for (const m of moved) {
            await deps
              .dropProjectImage(m.to)
              .catch((e: unknown) => reportError('proposals.rollback', e));
          }
        };

        const prepare = async (): Promise<ApplyError | null> => {
          // 0. Os pacotes de biblioteca são lidos, validados e entregues à sessão, que os
          // grava em `specs/<pasta>/` junto com o projeto (copiados: ficam na proposta).
          for (const pkg of applying.packages) {
            const read = await readProposalPackage(storage, pkg, base, id);
            if (typeof read === 'string') {
              failedPath = pkg.from;
              return read;
            }
            deps.stagePackage({ id: pkg.specId, version: pkg.version }, read);
          }
          // 1. As imagens vão para o lugar definitivo (copiadas; a origem só sai no fim).
          const taken = new Set<string>();
          for (const file of await deps.takenImageFiles()) taken.add(fileNameKey(file));
          for (const image of base.containers) {
            if (image.file !== null) taken.add(fileNameKey(image.file));
          }
          // As origens são lidas todas de uma vez (em paralelo com limite); as verificações e as
          // gravações abaixo seguem em ordem, com os mesmos erros.
          const sources = await readImageSources(storage, applying.files);
          for (const [i, move] of applying.files.entries()) {
            if (taken.has(fileNameKey(move.to))) {
              failedPath = move.to;
              await rollback();
              return 'image-exists';
            }
            const blob = sources[i];
            if (!blob) {
              failedPath = move.from;
              await rollback();
              return 'image-missing';
            }
            await deps.putProjectImage(move.to, blob);
            moved.push({ from: move.from, to: move.to, blob });
            taken.add(fileNameKey(move.to));
          }
          // 2. O projeto, numa entrada de desfazer. Se mudou enquanto copiávamos, desiste.
          if (store.project.peek() !== base) {
            await rollback();
            return 'stale';
          }
          if (applying.applied.length > 0) {
            const result = store.apply(() => applying.project, { link });
            if (!result.ok) {
              await rollback();
              return result.error === 'read-only' ? 'read-only' : 'failed';
            }
            applied = store.project.peek();
          }
          // 3. O `mapping.json` primeiro: a proposta só diz "aplicada" se ele gravou. Senão,
          // desfaz a entrada (sem "refazer"), devolve as cópias e não grava a proposta.
          const saved = await deps.flush();
          if (!saved.ok) {
            abandoned = true;
            const undone = applied !== null && store.project.peek() === applied;
            if (undone) store.undo();
            store.discardRedoOf(id);
            // Projeto já trocado (o undo foi pulado): ele pode citar as cópias, que ficam.
            if (undone) await rollback();
            return 'save-failed';
          }
          return null;
        };

        const unchanged =
          applying.applied.length === 0 && applying.proposal.status === p.status;
        return {
          ok: true,
          proposal: unchanged ? p : applying.proposal,
          value: { applied: applying.applied.length, files: applying.files.length },
          before: async () => {
            try {
              return await prepare();
            } catch (e) {
              // Exceção de armazenamento (leitura do pacote ou da imagem, gravação da cópia):
              // vira a falha de gravação tipada e as cópias já feitas saem.
              reportError('proposals.apply', e);
              await rollback();
              return 'write-failed';
            }
          },
          // 4. O `mapping.json` gravou, mas o `proposal.json` falhou (fase 8.2, P7): o projeto
          // não pode ficar aplicado com a proposta sem `applied`. Desfaz a entrada (a sessão
          // vê o confirmado diferente do disco e agenda a regravação), confirma a regravação
          // com `flush` e só então tira as cópias de `images/`: o `mapping.json` em disco
          // ainda as cita até a regravação, e ele nunca aponta para um arquivo apagado. Se a
          // regravação falha, as cópias ficam para a limpeza da sessão quando ela passar.
          compensate: async () => {
            abandoned = true;
            const undone = applied !== null && store.project.peek() === applied;
            if (undone) store.undo();
            store.discardRedoOf(id);
            // O projeto já não é o aplicado (recarregado por fora na janela da gravação): não há
            // o que regravar, e o disco pode citar as cópias. Elas ficam.
            if (!undone) return;
            const restored = await deps.flush();
            if (restored.ok) await rollback();
          },
          after: async () => {
            for (const m of moved) {
              await storage
                .removeImage(m.from)
                .catch((e: unknown) => reportError('proposals.removeSource', e));
            }
          },
        };
      }),
    );
    if (!outcome.ok) {
      return {
        ok: false,
        error: outcome.error,
        ...(issues ? { issues } : {}),
        ...(failedPath ? { path: failedPath } : {}),
      };
    }
    store.discardRedoOf(id);
    return { ok: true, proposal: outcome.proposal, ...outcome.value };
  };

  return {
    decide: (id, target, state) => decideMany(id, [target], state),
    decideMany,

    async restoreDecisions(id, previous, expected) {
      const result = await proposals.mutate<void, 'not-open' | 'stale'>(id, (p) => {
        if (p.status !== 'open') return { ok: false, error: 'not-open' };
        if (!sameDecisions(p.decisions, expected)) return { ok: false, error: 'stale' };
        // O que já foi aplicado continua aceito.
        if (
          Object.keys(p.applied).some(
            (changeId) => previous[changeId]?.state !== 'accepted',
          )
        ) {
          return { ok: false, error: 'stale' };
        }
        return { ok: true, value: undefined, proposal: { ...p, decisions: previous } };
      });
      if (!result.ok) return result;
      store.discardRedoOf(id);
      return { ok: true, proposal: result.proposal };
    },

    addNote: (id, target, text) =>
      noteMutation(
        id,
        (p) => {
          if (text.trim() === '') return 'empty-note';
          return addNoteTo(p, target, text);
        },
        (_before, after) => after.notes.at(-1)?.id ?? null,
      ),

    editNote: (id, noteId, text) =>
      noteMutation(
        id,
        (p) =>
          p.notes.some((n) => n.id === noteId)
            ? editProposalNote(p, noteId, text, now())
            : 'unknown-note',
        () => noteId,
      ),

    removeNote: (id, noteId) =>
      noteMutation(
        id,
        (p) =>
          p.notes.some((n) => n.id === noteId)
            ? removeProposalNote(p, noteId)
            : 'unknown-note',
        () => noteId,
      ),

    applyAccepted: applyAcceptedChanges,

    async removeProposal(id) {
      if (store.readOnly.peek()) return { ok: false, error: 'read-only' };
      if (store.reviewing.peek()) return { ok: false, error: 'reviewing' };
      return proposals.remove(id, () => store.detachLinks(id));
    },
  };
}
