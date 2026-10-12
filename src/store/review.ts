import { batch, effect, signal, type ReadonlySignal } from '@preact/signals';
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
import { readSetting, writeSetting } from '../utils/safeStorage';
import { createReviewDerived, type ReviewDerived, type ReviewView } from './derived';
import type { ApplyResult, DecisionResult, NoteResult } from './proposalActions';
import type { ProjectSession } from './session';

// Estado da revisão de uma proposta (etapa 4): qual proposta está aberta, o item
// selecionado, os filtros, a visão Atual/Proposto e o "Desfazer" dos lotes de decisão.
// É estado de UI: as decisões e notas moram na proposta (gravadas pela sessão) e o que é
// calculado a partir delas, em `derived`. Retomar a revisão (último item, filtros e visão)
// fica no `localStorage` por dispositivo, com try/catch, fora da proposta e do desfazer.

export type { ReviewView };

/** O que volta ao reabrir uma proposta neste dispositivo. */
export interface ReviewResume {
  /** Último item visto. */
  readonly selected: ReviewTarget | null;
  readonly view: ReviewView;
  readonly filters: ReviewFilters;
  /**
   * Conflitos que a pessoa já viu nesta cópia do projeto (os da última abertura e os que
   * apareceram até fechar), para marcar só os novos ("Conflito novo").
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
      /** Voltou ao ponto onde parou (havia estado deste dispositivo). */
      readonly resumed: boolean;
      /** Conflitos que apareceram desde a última abertura neste dispositivo. */
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
  /** Propostas já abertas neste dispositivo. */
  readonly seen: ReadonlySignal<ReadonlySet<string>>;
  /** Mudanças em conflito que não eram conhecidas na última abertura (só vale na abertura). */
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
// Retomar a revisão: estado por dispositivo

const RESUME_KEY = 'mapping.reviewResume';
/** Propostas lembradas neste dispositivo (as mais recentes). */
const MAX_RESUME = 12;
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

const storedResumeSchema = z.record(z.string(), resumeSchema);

type StoredResume = Record<string, ReviewResume>;

function readResume(): StoredResume {
  const text = readSetting(RESUME_KEY);
  if (text === null) return {};
  try {
    const parsed = storedResumeSchema.safeParse(JSON.parse(text));
    return parsed.success ? (parsed.data as StoredResume) : {};
  } catch {
    // Texto corrompido: a revisão volta ao começo, nada mais.
    return {};
  }
}

function writeResume(all: StoredResume): void {
  writeSetting(RESUME_KEY, JSON.stringify(all));
}

/**
 * A cópia do projeto a que o estado guardado pertence: o projeto local pelo id, a pasta
 * pelo nome. A mesma proposta (mesmo id) em duas cópias (o zip importado e a pasta
 * descompactada dele) tem conflitos diferentes; guardá-los numa entrada só fazia a abertura
 * de uma cópia apagar o que a outra já conhecia (achado 11 do relato de 2026-10-11).
 */
function resumeScope(storage: ProjectStorage): string {
  const id = 'id' in storage && typeof storage.id === 'string' ? storage.id : null;
  return `${storage.kind}:${id ?? storage.folderName ?? ''}`;
}

/** Separa a cópia do id da proposta (o id nunca tem `|`: `PROPOSAL_ID_RE`). */
const KEY_SEPARATOR = '|';

/** As entradas desta cópia, por id da proposta, e as de antes da cópia na chave (legado). */
function entriesOf(all: StoredResume, scope: string) {
  const prefix = `${scope}${KEY_SEPARATOR}`;
  const own = new Map<string, ReviewResume>();
  const legacy = new Map<string, ReviewResume>();
  for (const [key, entry] of Object.entries(all)) {
    if (key.startsWith(prefix)) own.set(key.slice(prefix.length), entry);
    else if (!key.includes(KEY_SEPARATOR)) legacy.set(key, entry);
  }
  return { own, legacy };
}

const START_VIEW: ReviewView = 'proposed';

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
  const newConflicts = signal<ReadonlySet<string>>(new Set());
  const undoable = signal<DecisionUndo | null>(null);
  const initial = entriesOf(readResume(), scope);
  const seen = signal<ReadonlySet<string>>(
    new Set([...initial.own.keys(), ...initial.legacy.keys()]),
  );

  const derived = createReviewDerived(store, {
    proposals: proposals.list,
    proposalId,
    view,
    filters,
    seen,
  });

  /**
   * O estado guardado da proposta nesta cópia do projeto, relido agora (outra aba pode ter
   * gravado depois de esta abrir). `known: null`: entrada de antes de a chave levar a cópia
   * (legado); a posição e os filtros valem, os conflitos dela não.
   */
  const storedOf = (
    id: string,
  ): {
    readonly entry: ReviewResume;
    readonly known: ReadonlySet<string> | null;
  } | null => {
    const { own, legacy } = entriesOf(readResume(), scope);
    const mine = own.get(id);
    if (mine) return { entry: mine, known: new Set(mine.knownConflicts) };
    const old = legacy.get(id);
    return old ? { entry: old, known: null } : null;
  };

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

  const remember = (known?: readonly string[]) => {
    const id = proposalId.peek();
    if (id === null) return;
    // Relê o que está gravado e troca só a entrada desta proposta nesta cópia: o que outra
    // aba (ou outra cópia do projeto) gravou fica. A entrada legada (sem a cópia na chave)
    // vira esta, e sai.
    const all = readResume();
    const key = `${scope}${KEY_SEPARATOR}${id}`;
    const previous = all[key] ?? all[id];
    const entry: ReviewResume = {
      selected: selected.peek(),
      view: view.peek(),
      filters: filters.peek(),
      knownConflicts: known ?? previous?.knownConflicts ?? [],
    };
    // O mais recente por último; só as últimas `MAX_RESUME` ficam.
    const others = Object.entries(all).filter(([k]) => k !== key && k !== id);
    writeResume(Object.fromEntries([...others, [key, entry]].slice(-MAX_RESUME)));
    if (!seen.peek().has(id)) seen.value = new Set([...seen.peek(), id]);
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
    // Os conflitos à vista ao fechar passam a ser conhecidos: um projeto recarregado por
    // fora durante a revisão pode ter trazido novos, e a pessoa já os viu.
    remember(
      derived.proposal.peek()
        ? [...derived.conflictIds.peek()].slice(0, MAX_KNOWN_CONFLICTS)
        : undefined,
    );
    batch(() => {
      proposalId.value = null;
      selected.value = null;
      newConflicts.value = new Set();
      undoable.value = null;
      view.value = START_VIEW;
      filters.value = NO_FILTERS;
      store.setReviewing(false);
    });
  }

  const record = (
    result: DecisionResult,
    state: DecisionUndo['state'],
  ): DecisionResult => {
    if (result.ok && result.changed.length + result.cascaded.length > 0) {
      undoable.value = {
        proposalId: proposalId.peek() ?? '',
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
      const stored = storedOf(id);
      batch(() => {
        proposalId.value = id;
        store.setReviewing(true);
        undoable.value = null;
      });
      const project = store.committed.peek();
      const conflicts = [...derived.conflictIds.peek()];
      const known = stored?.known ?? null;
      const fresh = known ? conflicts.filter((c) => !known.has(c)) : [];
      let target = stored?.entry.selected ?? null;
      if (target === null || !exists(target, p)) target = firstPending();
      // Filtros de uma imagem ou camada que não existem mais não podem esconder tudo.
      const savedFilters = stored?.entry.filters ?? NO_FILTERS;
      const tree = derived.tree.peek();
      const cleanFilters: ReviewFilters = {
        ...savedFilters,
        imageId:
          savedFilters.imageId !== null &&
          tree?.nodes.has(`image:${savedFilters.imageId}`)
            ? savedFilters.imageId
            : null,
        layerId:
          savedFilters.layerId !== null &&
          project?.layers.some((l) => l.id === savedFilters.layerId)
            ? savedFilters.layerId
            : null,
      };
      batch(() => {
        selected.value = target;
        view.value = stored?.entry.view ?? START_VIEW;
        filters.value = cleanFilters;
        newConflicts.value = new Set(fresh);
      });
      remember(conflicts.slice(0, MAX_KNOWN_CONFLICTS));
      return { ok: true, resumed: stored !== null, newConflicts: fresh.length };
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
      proposalActions
        .decide(proposalId.peek() ?? '', target, state)
        .then((result) => record(result, state)),

    decideVisible: (state) =>
      withOpen(async (id) => {
        const active = hasActiveFilters(filters.peek());
        const targets: ReviewTarget[] = active
          ? derived.visibleIds
              .peek()
              .map((changeId) => ({ level: 'change', id: changeId }))
          : [{ level: 'proposal', id: null }];
        if (targets.length === 0) return { ok: false, error: 'unknown-target' } as const;
        return record(await proposalActions.decideMany(id, targets, state), state);
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
