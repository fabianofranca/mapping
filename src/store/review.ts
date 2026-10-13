import { batch, computed, effect, signal, type ReadonlySignal } from '@preact/signals';
import { z } from 'zod';
import {
  CHANGE_TYPES,
  NO_FILTERS,
  hasActiveFilters,
  proposalIndex,
  reviewKey,
  stepChange,
  type ChangeType,
  type Proposal,
  type ProposalDecisions,
  type ReviewFilters,
  type ReviewTarget,
} from '../model';
import type { ProjectStorage } from '../storage/types';
import { reportError } from '../utils/report';
import { readSetting, writeSetting } from '../utils/safeStorage';
import { createReviewDerived, type ReviewDerived, type ReviewView } from './derived';
import type { ApplyResult, DecisionResult, NoteResult } from './proposalActions';
import type { ProjectSession } from './session';

// Estado da revisão de uma proposta (etapa 4): qual proposta está aberta, o item
// selecionado, os filtros, a visão Atual/Proposto e o "Desfazer" dos lotes de decisão.
// É estado de UI: as decisões e notas moram na proposta (gravadas pela sessão) e o que é
// calculado a partir delas, em `derived`. Retomar a revisão (último item, filtros, visão e
// conflitos conhecidos) e "vista" ficam no `localStorage` por dispositivo e por cópia do
// projeto (`ProjectStorage.copyId`), com try/catch, fora da proposta e do desfazer.

export type { ReviewView };

/** O que volta ao reabrir uma proposta nesta cópia do projeto, neste dispositivo. */
export interface ReviewResume {
  /** Último item visto. */
  readonly selected: ReviewTarget | null;
  readonly view: ReviewView;
  readonly filters: ReviewFilters;
  /**
   * Conflitos que a pessoa já conhecia nesta cópia do projeto (os que viu ao abrir e os
   * que decidiu), para marcar só os novos ("Conflito novo").
   */
  readonly knownConflicts: readonly string[];
}

/** A última decisão, com o que ela mudou: o aviso "Desfazer" (HANDOFF 8.3). */
export interface DecisionUndo {
  readonly proposalId: string;
  /** Decisões de antes: o "Desfazer" as regrava numa única escrita. */
  readonly previous: ProposalDecisions;
  /** Decisões de depois: o "Desfazer" só vale enquanto ainda são estas. */
  readonly decisions: ProposalDecisions;
  /** Mudanças pedidas que mudaram de estado. */
  readonly changed: readonly string[];
  /** Mudanças que mudaram junto, pelas dependências ("4 mudanças rejeitadas junto"). */
  readonly cascaded: readonly string[];
  /** Quem decidiu: o estado aplicado ao alvo (`null` = limpou). */
  readonly state: 'accepted' | 'rejected' | null;
}

export type OpenReviewResult =
  | {
      readonly ok: true;
      /** `'full'`: voltou ao ponto onde parou (havia estado desta cópia neste dispositivo). */
      readonly resumed: 'full' | 'none';
      /** Conflitos que apareceram desde a última abertura nesta cópia. */
      readonly newConflicts: number;
    }
  | {
      readonly ok: false;
      readonly error: 'unknown-proposal' | 'withdrawn' | 'no-project';
    };

export interface ReviewState {
  /** Proposta aberta na revisão; `null` fora dela. */
  readonly proposalId: ReadonlySignal<string | null>;
  /** Alvo selecionado (proposta, projeto, imagem, item ou mudança). */
  readonly selected: ReadonlySignal<ReviewTarget | null>;
  readonly view: ReadonlySignal<ReviewView>;
  readonly filters: ReadonlySignal<ReviewFilters>;
  /** Propostas já abertas nesta cópia do projeto, neste dispositivo (ids). */
  readonly seen: ReadonlySignal<ReadonlySet<string>>;
  /**
   * Mudanças em conflito que a pessoa não conhecia ao abrir a revisão: as que já estavam
   * em conflito na abertura e não eram conhecidas, e as que surgiram durante a revisão
   * (projeto recarregado por fora). Vazio fora da revisão.
   */
  readonly newConflicts: ReadonlySignal<ReadonlySet<string>>;
  /** A última decisão, enquanto o "Desfazer" vale; `null` depois de outra ação. */
  readonly undoable: ReadonlySignal<DecisionUndo | null>;
  /** Estado derivado (níveis, contagens, "como ficaria", pendências, conflitos). */
  readonly derived: ReviewDerived;

  /** Abre a revisão (projeto somente leitura) e volta ao ponto onde parou. */
  open(proposalId: string): OpenReviewResult;
  /** Sai da revisão, guardando o ponto onde parou. As decisões ficam na proposta. */
  close(): void;
  select(target: ReviewTarget | null): void;
  setView(view: ReviewView): void;
  setFilters(patch: Partial<ReviewFilters>): void;
  clearFilters(): void;

  decide(
    target: ReviewTarget,
    state: 'accepted' | 'rejected' | null,
  ): Promise<DecisionResult>;
  /** Decide o que a lista mostra (com filtros ativos, só as visíveis; sem filtros, a proposta toda). */
  decideVisible(state: 'accepted' | 'rejected' | null): Promise<DecisionResult | null>;
  /** Desfaz a última decisão numa única escrita. `false` se já não vale (alguém decidiu depois). */
  undoLastDecision(): Promise<boolean>;
  dismissUndo(): void;

  addNote(target: ReviewTarget, text: string): Promise<NoteResult | null>;
  editNote(noteId: string, text: string): Promise<NoteResult | null>;
  removeNote(noteId: string): Promise<NoteResult | null>;
  /** "Aplicar aceitas". */
  apply(): Promise<ApplyResult | null>;

  /**
   * Seleciona a mudança pendente (sem decisão) ou em conflito seguinte/anterior à
   * selecionada, dentre as que passam pelos filtros, dando a volta. Devolve o alvo.
   */
  step(kind: 'pending' | 'conflict', direction: 1 | -1): ReviewTarget | null;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Retomar a revisão: estado por dispositivo (fase 8.2, blob v2)
//
// Um blob só no `localStorage` (`mapping.reviewResume`), versionado: `seen`, as propostas
// já abertas (chaves `copyId|proposalId`, sem limite: só ids) e `resume`, a posição, a
// visão, os filtros e os conflitos conhecidos por proposta (as mesmas chaves, as 12 mais
// recentes por cópia). "Vista" e "retomar" são separados de propósito: evictar uma entrada
// do resume nunca devolve a proposta a "Nova". Versão desconhecida, texto corrompido ou o
// formato antigo (um `Record` plano) são descartados, não migrados.

const RESUME_KEY = 'mapping.reviewResume';
const RESUME_VERSION = 2;
/** Propostas com posição lembrada, por cópia do projeto (as mais recentes). */
const MAX_RESUME_PER_COPY = 12;
/** Conflitos guardados por proposta. */
const MAX_KNOWN_CONFLICTS = 500;

const targetSchema = z.object({
  level: z.enum(['proposal', 'project', 'image', 'item', 'change']),
  id: z.string().nullable(),
});

const resumeSchema = z.object({
  selected: targetSchema.nullable(),
  view: z.enum(['current', 'proposed']),
  filters: z.object({
    types: z.array(z.enum(CHANGE_TYPES as [ChangeType, ...ChangeType[]])),
    imageId: z.string().nullable(),
    layerId: z.string().nullable(),
    decision: z.enum(['all', 'undecided', 'accepted', 'rejected']),
    onlyConflicts: z.boolean(),
  }),
  knownConflicts: z.array(z.string()),
});

const blobSchema = z.object({
  v: z.literal(RESUME_VERSION),
  seen: z.array(z.string()),
  resume: z.record(z.string(), resumeSchema),
});

interface ResumeBlob {
  readonly v: typeof RESUME_VERSION;
  readonly seen: readonly string[];
  readonly resume: Readonly<Record<string, ReviewResume>>;
}

const EMPTY_BLOB: ResumeBlob = { v: RESUME_VERSION, seen: [], resume: {} };

function readBlob(): ResumeBlob {
  const text = readSetting(RESUME_KEY);
  if (text === null) return EMPTY_BLOB;
  try {
    const parsed = blobSchema.safeParse(JSON.parse(text));
    return parsed.success ? (parsed.data as ResumeBlob) : EMPTY_BLOB;
  } catch {
    // Texto corrompido: a revisão volta ao começo, nada mais.
    return EMPTY_BLOB;
  }
}

function writeBlob(blob: ResumeBlob): void {
  writeSetting(RESUME_KEY, JSON.stringify(blob));
}

/** Separa a cópia do id da proposta (o id nunca tem `|`: `PROPOSAL_ID_RE`). */
const KEY_SEPARATOR = '|';

/**
 * A cópia do projeto a que o estado guardado pertence: `ProjectStorage.copyId` (fase 8.4;
 * local: o id do projeto; pasta: o id da entrada dos recentes). A mesma proposta (mesmo
 * id) em duas cópias (o zip importado e a pasta descompactada dele, duas pastas com o
 * mesmo nome) tem conflitos e posição diferentes. Toda sessão recebe um storage com
 * `copyId`; sem ele, as cópias dividiriam o estado, então o Diagnóstico registra.
 */
function resumeScope(storage: ProjectStorage): string {
  const id = storage.copyId;
  if (id !== undefined && id !== '') return id;
  reportError('review.scope', new Error(`storage sem copyId (${storage.kind})`));
  return '';
}

const keyOf = (scope: string, proposalId: string) =>
  `${scope}${KEY_SEPARATOR}${proposalId}`;

/** Ids das propostas desta cópia em `seen`. */
function seenOf(blob: ResumeBlob, scope: string): Set<string> {
  const prefix = `${scope}${KEY_SEPARATOR}`;
  const result = new Set<string>();
  for (const key of blob.seen) {
    if (key.startsWith(prefix)) result.add(key.slice(prefix.length));
  }
  return result;
}

/**
 * O blob com a entrada desta proposta trocada (a mais recente por último) e só as
 * `MAX_RESUME_PER_COPY` mais recentes **desta cópia**; as de outras cópias ficam como
 * estão. `seen` só cresce.
 */
function withEntry(
  blob: ResumeBlob,
  scope: string,
  key: string,
  entry: ReviewResume,
): ResumeBlob {
  const prefix = `${scope}${KEY_SEPARATOR}`;
  const others: [string, ReviewResume][] = [];
  const own: [string, ReviewResume][] = [];
  for (const pair of Object.entries(blob.resume)) {
    if (pair[0] === key) continue;
    (pair[0].startsWith(prefix) ? own : others).push(pair);
  }
  own.push([key, entry]);
  return {
    v: RESUME_VERSION,
    seen: blob.seen.includes(key) ? blob.seen : [...blob.seen, key],
    resume: Object.fromEntries([...others, ...own.slice(-MAX_RESUME_PER_COPY)]),
  };
}

const START_VIEW: ReviewView = 'proposed';
const NO_CONFLICTS: ReadonlySet<string> = new Set();
/** Decidir sem revisão aberta: não há proposta a que a decisão se aplique. */
const NOT_OPEN: DecisionResult = { ok: false, error: 'unknown-proposal' };

function sameTarget(a: ReviewTarget | null, b: ReviewTarget | null): boolean {
  return a === b || (a !== null && b !== null && a.level === b.level && a.id === b.id);
}

export function createReviewState(session: ProjectSession): ReviewState {
  const { store, proposals, proposalActions } = session;
  const scope = resumeScope(session.storage);
  const proposalId = signal<string | null>(null);
  const selected = signal<ReviewTarget | null>(null);
  const view = signal<ReviewView>(START_VIEW);
  const filters = signal<ReviewFilters>(NO_FILTERS);
  const undoable = signal<DecisionUndo | null>(null);
  // Os conflitos que a pessoa conhecia ao abrir: o que estiver fora deles é "novo". E os
  // que estavam à vista na abertura (anunciados pelo aviso), que ao fechar ficam conhecidos.
  const knownAtOpen = signal<ReadonlySet<string>>(NO_CONFLICTS);
  let conflictsAtOpen: ReadonlySet<string> = NO_CONFLICTS;
  // Só as propostas desta cópia contam como vistas (a de uma cópia nova é nova, G1).
  const seen = signal<ReadonlySet<string>>(seenOf(readBlob(), scope));

  /**
   * Junta ao `seen` em memória o que o blob tem agora (outra aba pode ter aberto uma
   * proposta) mais `extra`, reatribuindo o signal só se entrou algum id: `derived.rows`
   * depende dele e `remember` roda a cada seleção.
   */
  const mergeSeen = (blob: ResumeBlob, extra?: string) => {
    const current = seen.peek();
    const next = seenOf(blob, scope);
    for (const id of current) next.add(id);
    if (extra !== undefined) next.add(extra);
    if (next.size !== current.size) seen.value = next;
  };

  const derived = createReviewDerived(store, {
    proposals: proposals.list,
    proposalId,
    view,
    filters,
    seen,
  });

  const newConflicts = computed((): ReadonlySet<string> => {
    if (proposalId.value === null) return NO_CONFLICTS;
    const known = knownAtOpen.value;
    const fresh = new Set<string>();
    for (const id of derived.conflictIds.value) if (!known.has(id)) fresh.add(id);
    return fresh.size === 0 ? NO_CONFLICTS : fresh;
  });

  /** O alvo existe na proposta aberta? */
  const exists = (target: ReviewTarget, p: Proposal): boolean => {
    if (target.level === 'proposal' || target.level === 'project') return true;
    if (target.id === null) return false;
    if (target.level === 'change') return proposalIndex(p).changes.has(target.id);
    return derived.tree.peek()?.nodes.has(reviewKey(target)) ?? false;
  };

  const firstPending = (): ReviewTarget => {
    const id = derived.pendingIds.peek()[0];
    return id === undefined ? { level: 'proposal', id: null } : { level: 'change', id };
  };

  /**
   * Grava o ponto onde a revisão está. Relê o blob e troca só a entrada desta proposta
   * nesta cópia (o que outra aba ou outra cópia gravou fica). `known`: os conflitos que
   * passam a ser conhecidos; sem ele, os que a entrada já tinha. Se o `localStorage`
   * estiver bloqueado, a gravação é engolida e o `seen` em memória vale mesmo assim.
   */
  const remember = (known?: readonly string[]) => {
    const id = proposalId.peek();
    if (id === null) return;
    const blob = readBlob();
    const key = keyOf(scope, id);
    const entry: ReviewResume = {
      selected: selected.peek(),
      view: view.peek(),
      filters: filters.peek(),
      knownConflicts: known ?? blob.resume[key]?.knownConflicts ?? [],
    };
    writeBlob(withEntry(blob, scope, key, entry));
    mergeSeen(blob, id);
  };

  // A proposta apagada por fora fecha a revisão; uma alteração externa que tira o item
  // selecionado da proposta volta à primeira pendente.
  const stopWatching = effect(() => {
    const id = proposalId.value;
    if (id === null) return;
    const p = derived.proposal.value;
    if (p === null) {
      closeReview();
      return;
    }
    const target = selected.peek();
    if (target !== null && !exists(target, p)) selected.value = firstPending();
  });

  function closeReview() {
    if (proposalId.peek() === null) return;
    // Passam a conhecidos os conflitos que a pessoa conhecia ou viu anunciados ao abrir
    // mais os que ela decidiu (decidir é a prova de que viu); um conflito que surgiu
    // durante a revisão (recarga externa) e ficou sem decisão volta como novo na próxima
    // abertura (P6). A proposta apagada por fora não ganha entrada (P11).
    const p = derived.proposal.peek();
    if (p) {
      const known = new Set([...knownAtOpen.peek(), ...conflictsAtOpen]);
      for (const id of derived.conflictIds.peek()) {
        if (p.decisions[id] !== undefined) known.add(id);
      }
      remember([...known].slice(0, MAX_KNOWN_CONFLICTS));
    }
    batch(() => {
      proposalId.value = null;
      selected.value = null;
      knownAtOpen.value = NO_CONFLICTS;
      conflictsAtOpen = NO_CONFLICTS;
      undoable.value = null;
      view.value = START_VIEW;
      filters.value = NO_FILTERS;
      store.setReviewing(false);
    });
  }

  const record = (
    id: string,
    result: DecisionResult,
    state: DecisionUndo['state'],
  ): DecisionResult => {
    if (result.ok && result.changed.length + result.cascaded.length > 0) {
      undoable.value = {
        proposalId: id,
        previous: result.previous,
        decisions: result.decisions,
        changed: result.changed,
        cascaded: result.cascaded,
        state,
      };
    }
    return result;
  };

  const withOpen = <T>(run: (id: string) => Promise<T>): Promise<T | null> => {
    const id = proposalId.peek();
    return id === null ? Promise.resolve(null) : run(id);
  };

  return {
    proposalId,
    selected,
    view,
    filters,
    seen,
    newConflicts,
    undoable,
    derived,

    open(id) {
      const p = proposals.get(id);
      if (!p) return { ok: false, error: 'unknown-proposal' };
      if (p.status === 'withdrawn') return { ok: false, error: 'withdrawn' };
      if (!store.committed.peek()) return { ok: false, error: 'no-project' };
      if (proposalId.peek() !== null && proposalId.peek() !== id) closeReview();
      // Relido agora: outra aba pode ter gravado depois de esta abrir.
      const blob = readBlob();
      const entry = blob.resume[keyOf(scope, id)];
      batch(() => {
        proposalId.value = id;
        store.setReviewing(true);
        undoable.value = null;
      });
      const conflicts = derived.conflictIds.peek();
      // Sem entrada (primeira abertura nesta cópia) não há com o que comparar: nada é novo.
      const known: ReadonlySet<string> = entry
        ? new Set(entry.knownConflicts)
        : conflicts;
      // Os conflitos à vista na abertura são anunciados ("N conflito(s) novo(s)") e passam
      // a conhecidos ao fechar; os que surgirem durante a revisão, só se forem decididos.
      conflictsAtOpen = conflicts;
      let target = entry?.selected ?? null;
      if (target === null || !exists(target, p)) target = firstPending();
      // Filtros de uma imagem ou camada que não existem mais não podem esconder tudo. A
      // camada vale se existe no projeto atual ou na prévia (criada pela proposta).
      const savedFilters = entry?.filters ?? NO_FILTERS;
      const tree = derived.tree.peek();
      const layers = [
        ...(store.committed.peek()?.layers ?? []),
        ...(derived.preview.peek()?.project.layers ?? []),
      ];
      const cleanFilters: ReviewFilters = {
        ...savedFilters,
        imageId:
          savedFilters.imageId !== null &&
          tree?.nodes.has(`image:${savedFilters.imageId}`)
            ? savedFilters.imageId
            : null,
        layerId:
          savedFilters.layerId !== null &&
          layers.some((l) => l.id === savedFilters.layerId)
            ? savedFilters.layerId
            : null,
      };
      batch(() => {
        selected.value = target;
        view.value = entry?.view ?? START_VIEW;
        filters.value = cleanFilters;
        knownAtOpen.value = known;
      });
      // Abrir tira o aviso "Nova proposta" desta proposta para sempre (P4).
      proposals.dismissNotice(id, 'added');
      remember([...known].slice(0, MAX_KNOWN_CONFLICTS));
      return {
        ok: true,
        resumed: entry ? 'full' : 'none',
        newConflicts: newConflicts.peek().size,
      };
    },

    close: closeReview,

    select(target) {
      if (sameTarget(selected.peek(), target)) return;
      selected.value = target;
      remember();
    },

    setView(next) {
      if (view.peek() === next) return;
      view.value = next;
      remember();
    },

    setFilters(patch) {
      filters.value = { ...filters.peek(), ...patch };
      remember();
    },

    clearFilters() {
      if (!hasActiveFilters(filters.peek())) return;
      filters.value = NO_FILTERS;
      remember();
    },

    decide: (target, state) =>
      withOpen((id) =>
        proposalActions.decide(id, target, state).then((r) => record(id, r, state)),
      ).then((result) => result ?? NOT_OPEN),

    decideVisible: (state) =>
      withOpen(async (id) => {
        const active = hasActiveFilters(filters.peek());
        const targets: ReviewTarget[] = active
          ? derived.visibleIds
              .peek()
              .map((changeId) => ({ level: 'change', id: changeId }))
          : [{ level: 'proposal', id: null }];
        if (targets.length === 0) return { ok: false, error: 'unknown-target' } as const;
        return record(id, await proposalActions.decideMany(id, targets, state), state);
      }),

    async undoLastDecision() {
      const last = undoable.peek();
      if (!last) return false;
      undoable.value = null;
      const result = await proposalActions.restoreDecisions(
        last.proposalId,
        last.previous,
        last.decisions,
      );
      return result.ok;
    },

    dismissUndo() {
      undoable.value = null;
    },

    addNote: (target, text) =>
      withOpen((id) => proposalActions.addNote(id, target, text)),
    editNote: (noteId, text) =>
      withOpen((id) => proposalActions.editNote(id, noteId, text)),
    removeNote: (noteId) => withOpen((id) => proposalActions.removeNote(id, noteId)),

    apply: () =>
      withOpen(async (id) => {
        // Aplicar fecha o que se pode desfazer da revisão: o projeto muda de base.
        undoable.value = null;
        return proposalActions.applyAccepted(id);
      }),

    step(kind, direction) {
      const visible = new Set(derived.visibleIds.peek());
      const candidates =
        kind === 'pending'
          ? derived.pendingIds.peek().filter((id) => visible.has(id))
          : [...derived.conflictIds.peek()].filter((id) => visible.has(id));
      const order = derived.order.peek();
      const sorted = [...candidates].sort(
        (a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0),
      );
      const current = selected.peek();
      const tree = derived.tree.peek();
      // De um item ou imagem, parte da primeira mudança dele.
      const from =
        current === null
          ? null
          : current.level === 'change'
            ? current.id
            : (tree?.changeIdsOf(current)[0] ?? null);
      const next = stepChange(sorted, order, from, direction);
      if (next === null) return null;
      const target: ReviewTarget = { level: 'change', id: next };
      selected.value = target;
      remember();
      return target;
    },

    dispose() {
      stopWatching();
      closeReview();
    },
  };
}
