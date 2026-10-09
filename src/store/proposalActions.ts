import {
  addNote as addProposalNote,
  applyAccepted,
  decide,
  editNote as editProposalNote,
  proposalIndex,
  removeNote as removeProposalNote,
  reviewKey,
  reviewTree,
  type Proposal,
  type ProposalDecisions,
  type ProposalIssue,
  type ProposalStatus,
  type ReviewTarget,
} from '../model';
import { imageMimeType, type ProjectStorage } from '../storage/types';
import { reportError } from '../utils/report';
import type { HistoryLink, ProjectStore } from './history';
import type { ProposalErrorCode, ProposalStore } from './proposals';

// Ações da revisão sobre as propostas (etapa 4): decidir, anotar e aplicar as aceitas.
// São as únicas que mudam uma proposta; a gravação é de `ProposalStore.mutate`. Cada
// ação é uma função pura da proposta (do `src/model/`), então, se o arquivo mudou por
// fora, ela é refeita sobre a versão nova do disco.

export type DecisionError =
  'not-open' | 'unknown-target' | 'no-project' | ProposalErrorCode;

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

/** Todos os motivos de recusa das ações da revisão (para a mensagem ao usuário). */
export type ProposalActionError = DecisionError | NoteError | RestoreError | ApplyError;

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
   * desfazer do projeto, move as imagens de `proposals/<id>/` para `images/` e grava
   * `applied` (e `status`, se tudo foi decidido) na proposta. Desfazer e refazer essa
   * entrada também desfazem e refazem o `applied` e a posição das imagens.
   */
  applyAccepted(proposalId: string): Promise<ApplyResult>;
}

export interface ProposalActionsDeps {
  readonly store: ProjectStore;
  readonly proposals: ProposalStore;
  readonly storage: ProjectStorage;
  readonly now: () => string;
  readonly newId: () => string;
  /** Grava a imagem no projeto e a registra como gravada pela sessão (`stored`). */
  readonly putProjectImage: (path: string, data: Blob) => Promise<void>;
  /** Desfaz `putProjectImage` (a aplicação falhou no meio). */
  readonly dropProjectImage: (path: string) => Promise<void>;
  /** Grava agora o que o projeto tem pendente (o `mapping.json` antes da proposta). */
  readonly flush: () => Promise<void>;
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

export function createProposalActions(deps: ProposalActionsDeps): ProposalActions {
  const { store, proposals, storage, now } = deps;

  const decideMany: ProposalActions['decideMany'] = async (id, targets, state) => {
    const result = await proposals.mutate<DecisionOutcome, DecisionError>(id, (p) => {
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
    });
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
    proposals
      .mutate<string | null, NoteError>(id, (p) => {
        const next = mutation(p);
        if (typeof next === 'string') return { ok: false, error: next };
        return { ok: true, proposal: next, value: noteIdOf(p, next) };
      })
      .then((result) =>
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

  const applyAcceptedChanges: ProposalActions['applyAccepted'] = async (id) => {
    let issues: readonly ProposalIssue[] | undefined;
    let failedPath: string | undefined;
    const outcome = await proposals.mutate<
      { applied: number; files: number },
      ApplyError
    >(id, (p) => {
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

      // Desfazer a entrada: a proposta volta a ter as mudanças como aceitas sem aplicar e
      // as imagens voltam para `proposals/<id>/`. Refazer: o contrário.
      const link: HistoryLink = {
        tag: id,
        undo: () => {
          void proposals
            .mutate<void, never>(id, (current) => {
              const rest = { ...current.applied };
              for (const changeId of appliedIds) delete rest[changeId];
              return {
                ok: true,
                value: undefined,
                proposal: {
                  ...current,
                  applied: rest,
                  status: current.status === statusAfter ? statusBefore : current.status,
                },
                before: async () => {
                  for (const m of moved) await storage.writeImage(m.from, m.blob);
                  return null;
                },
              };
            })
            .then((r) => {
              if (!r.ok) reportError('proposals.undoApply', new Error(r.error));
            });
        },
        redo: () => {
          void proposals
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
                  status: current.status === statusBefore ? statusAfter : current.status,
                },
                after: async () => {
                  for (const m of moved) await storage.removeImage(m.from);
                },
              };
            })
            .then((r) => {
              if (!r.ok) reportError('proposals.redoApply', new Error(r.error));
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

      const unchanged =
        applying.applied.length === 0 && applying.proposal.status === p.status;
      return {
        ok: true,
        proposal: unchanged ? p : applying.proposal,
        value: { applied: applying.applied.length, files: applying.files.length },
        before: async () => {
          // 1. As imagens vão para o lugar definitivo (copiadas; a origem só sai no fim).
          for (const move of applying.files) {
            if (base.images.some((image) => image.file === move.to)) {
              failedPath = move.to;
              await rollback();
              return 'image-exists';
            }
            const source = await storage.readImage(move.from);
            if (!source) {
              failedPath = move.from;
              await rollback();
              return 'image-missing';
            }
            // Cópia em memória: ler de novo depois de apagar a origem, no desfazer, não pode falhar.
            const blob = new Blob([await source.arrayBuffer()], {
              type: source.type || imageMimeType(move.to),
            });
            await deps.putProjectImage(move.to, blob);
            moved.push({ from: move.from, to: move.to, blob });
          }
          // 2. O projeto, numa entrada de desfazer. Se mudou enquanto copiávamos, desiste.
          if (store.project.peek() !== base) {
            await rollback();
            return 'stale';
          }
          if (applying.applied.length > 0) {
            const applied = store.apply(() => applying.project, { link });
            if (!applied.ok) {
              await rollback();
              return applied.error === 'read-only' ? 'read-only' : 'failed';
            }
          }
          // 3. O `mapping.json` primeiro: se algo falhar daqui em diante, o projeto já tem as mudanças.
          await deps.flush();
          return null;
        },
        after: async () => {
          for (const m of moved) {
            await storage
              .removeImage(m.from)
              .catch((e: unknown) => reportError('proposals.removeSource', e));
          }
        },
      };
    });
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
          if (!targetExists(p, target)) return 'unknown-target';
          return addProposalNote(p, target, text, now(), deps.newId());
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
  };
}
