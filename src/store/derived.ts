import { computed, untracked, type ReadonlySignal } from '@preact/signals';
import {
  acceptedPending,
  buildIncompleteList,
  buildListing,
  changeStatus,
  changeType,
  compareProposals,
  dominantChangeType,
  filterChanges,
  layerDotsByMarking,
  leftBehind,
  markingLockStates,
  markingVisibility,
  platformRepoWarnings,
  previewProject,
  projectIndex,
  projectIssues,
  reviewKey,
  reviewProgress,
  reviewTree,
  summarizeDecisions,
  validateAccepted,
  type AcceptedValidation,
  type Annotation,
  type AnnotationIssue,
  type Change,
  type ChangeComparison,
  type ChangeStatus,
  type ChangeType,
  type IncompleteImage,
  type Layer,
  type LayerDot,
  type LeftBehind,
  type LevelSummary,
  type ListedImage,
  type MarkingLockState,
  type MarkingVisibility,
  type PatchResult,
  type PlatformRepoWarning,
  type Project,
  type Proposal,
  type ProposalApplied,
  type ProposalNote,
  type ReviewFilters,
  type ReviewProgress,
  type ReviewTree,
} from '../model';
import type { ProjectStore } from './history';
import { markingDisplay } from './settings';
import { resolveActiveLayerId, visibleLayers, type EditorUi } from './ui';

// Estado derivado do editor (docs/history/PLAN-etapa-2-1.md 14.3): calculado uma vez a partir do projeto
// e da UI e lido por canvas, painel e lista. Nada aqui depende do viewport, então
// pan e zoom não recalculam nada disto.

export interface EditorDerived {
  /** Camada ativa efetiva (`resolveActiveLayerId`). */
  readonly activeLayerId: ReadonlySignal<string | null>;
  readonly activeLayer: ReadonlySignal<Layer | null>;
  /** Camadas visíveis, na ordem do projeto (a ativa sempre entre elas). */
  readonly visibleLayers: ReadonlySignal<readonly Layer[]>;
  /** Pendências por anotação (só as incompletas). */
  readonly issues: ReadonlySignal<ReadonlyMap<string, readonly AnnotationIssue[]>>;
  /** Anotações de cada marcação, na ordem do projeto. */
  readonly annotationsByMarking: ReadonlySignal<
    ReadonlyMap<string, readonly Annotation[]>
  >;
  /** Indicadores (bolinhas) de cada marcação nas camadas visíveis. */
  readonly layerDots: ReadonlySignal<ReadonlyMap<string, readonly LayerDot[]>>;
  /** Visibilidade de cada marcação segundo o modo de exibição e a camada ativa. */
  readonly markingVisibility: ReadonlySignal<ReadonlyMap<string, MarkingVisibility>>;
  /** Marcações com anotação incompleta numa camada visível (alerta no canvas). */
  readonly incompleteMarkings: ReadonlySignal<ReadonlySet<string>>;
  /** Marcações com a geometria travada (própria ou herdada do pai); as livres não aparecem. */
  readonly markingLocks: ReadonlySignal<ReadonlyMap<string, MarkingLockState>>;
  /** Há alguma imagem ou marcação com a geometria travada (atalho para não calcular à toa). */
  readonly hasLocks: ReadonlySignal<boolean>;
  /** Dados da Visão de Lista, com os filtros dela. */
  readonly listing: ReadonlySignal<readonly ListedImage[]>;
  /** Pendências agrupadas por imagem, para a janela Incompletas (B5). */
  readonly incompleteList: ReadonlySignal<readonly IncompleteImage[]>;
  /** Quantas anotações estão incompletas no projeto (todas as camadas). */
  readonly incompleteCount: ReadonlySignal<number>;
  /** Plataformas usadas em `codeRef` sem repositório configurado (aviso, não pendência). */
  readonly platformRepoWarnings: ReadonlySignal<readonly PlatformRepoWarning[]>;
}

const NO_ISSUES: ReadonlyMap<string, readonly AnnotationIssue[]> = new Map();
const NO_ANNOTATIONS: ReadonlyMap<string, readonly Annotation[]> = new Map();
const NO_DOTS: ReadonlyMap<string, readonly LayerDot[]> = new Map();
const NO_VISIBILITY: ReadonlyMap<string, MarkingVisibility> = new Map();
const NO_MARKINGS: ReadonlySet<string> = new Set();
const NO_LOCKS: ReadonlyMap<string, MarkingLockState> = new Map();
const NO_WARNINGS: readonly PlatformRepoWarning[] = [];

/** Mesmos itens na mesma ordem. */
function sameItems<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((item, i) => item === b[i]);
}

export function createEditorDerived(store: ProjectStore, ui: EditorUi): EditorDerived {
  // Projeto confirmado (sem prévia de gesto): nada daqui depende de geometria, então
  // arrastar/redimensionar não recalcula nada.
  const project = store.committed;

  const activeLayerId = computed(() =>
    resolveActiveLayerId(project.value, ui.activeLayer.value),
  );
  const activeLayer = computed(() => {
    const id = activeLayerId.value;
    return id === null ? null : (project.value?.layers.find((l) => l.id === id) ?? null);
  });

  // Devolve a lista anterior quando as camadas são as mesmas: quem depende dela
  // (indicadores, cartões do canvas) não recalcula a cada edição que não mexe nelas.
  let lastVisible: readonly Layer[] = [];
  const visible = computed(() => {
    const next = visibleLayers(project.value, ui.hiddenLayers.value, activeLayerId.value);
    if (!sameItems(next, lastVisible)) lastVisible = next;
    return lastVisible;
  });

  const issues = computed(() => {
    const p = project.value;
    return p ? projectIssues(p) : NO_ISSUES;
  });

  const annotationsByMarking = computed(() => {
    const p = project.value;
    return p ? projectIndex(p).annotationsByMarking : NO_ANNOTATIONS;
  });

  const layerDots = computed(() => {
    const p = project.value;
    return p ? layerDotsByMarking(p, visible.value) : NO_DOTS;
  });

  // "Sem anotação" (esmaecer/ocultar) é medido só pela camada ativa, própria ou herdada.
  const activeDots = computed(() => {
    const p = project.value;
    const layer = activeLayer.value;
    return p && layer ? layerDotsByMarking(p, [layer]) : NO_DOTS;
  });

  const visibility = computed(() => {
    const p = project.value;
    if (!p) return NO_VISIBILITY;
    const selection = ui.selection.value;
    return markingVisibility(
      p,
      activeDots.value,
      markingDisplay.value,
      selection?.kind === 'marking' ? selection.id : null,
    );
  });

  const incompleteMarkings = computed(() => {
    const p = project.value;
    if (!p) return NO_MARKINGS;
    const shown = new Set(visible.value.map((l) => l.id));
    const { annotations } = projectIndex(p);
    const result = new Set<string>();
    for (const id of issues.value.keys()) {
      const a = annotations.get(id);
      if (a && shown.has(a.layerId)) result.add(a.markingId);
    }
    return result;
  });

  const markingLocks = computed(() => {
    const p = project.value;
    return p ? markingLockStates(p) : NO_LOCKS;
  });

  const hasLocks = computed(() => {
    const p = project.value;
    return markingLocks.value.size > 0 || (p?.images.some((i) => i.locked) ?? false);
  });

  const listing = computed((): readonly ListedImage[] => {
    const p = project.value;
    if (!p) return [];
    return buildListing(p, visible.value, {
      showEmpty: ui.listShowEmpty.value,
      onlyAnnotations: ui.listIncompleteOnly.value
        ? new Set(issues.value.keys())
        : undefined,
    });
  });

  // Com "Só camadas visíveis" a lista acompanha o filtro de camadas do canvas.
  const incompleteList = computed((): readonly IncompleteImage[] => {
    const p = project.value;
    if (!p) return [];
    return buildIncompleteList(
      p,
      issues.value,
      ui.incompleteVisibleOnly.value ? visible.value : undefined,
    );
  });

  const incompleteCount = computed(() => issues.value.size);

  const repoWarnings = computed(() => {
    const p = project.value;
    return p ? platformRepoWarnings(p) : NO_WARNINGS;
  });

  return {
    activeLayerId,
    activeLayer,
    visibleLayers: visible,
    issues,
    annotationsByMarking,
    layerDots,
    markingVisibility: visibility,
    incompleteMarkings,
    markingLocks,
    hasLocks,
    listing,
    incompleteList,
    incompleteCount,
    platformRepoWarnings: repoWarnings,
  };
}

// ---------------------------------------------------------------------------
// Revisão de propostas (etapa 4)

/**
 * De onde o estado derivado da revisão lê: as propostas da sessão e o que a interface
 * escolheu (proposta aberta, filtros, propostas que este dispositivo já abriu).
 */
export interface ReviewSources {
  readonly proposals: ReadonlySignal<readonly Proposal[]>;
  readonly proposalId: ReadonlySignal<string | null>;
  readonly filters: ReadonlySignal<ReviewFilters>;
  /** Propostas já abertas neste dispositivo (ids), para a marca "Nova". */
  readonly seen: ReadonlySignal<ReadonlySet<string>>;
}

/** Contagens da proposta aberta (a faixa de revisão e a janela Propostas). */
export interface ReviewCounts {
  readonly total: number;
  /** Sem decisão. */
  readonly undecided: number;
  /** Aceitas (inclui as já aplicadas). */
  readonly accepted: number;
  readonly rejected: number;
  readonly applied: number;
  /** Aceitas aguardando aplicação ("5 aceitas aguardando aplicação"). */
  readonly acceptedPending: number;
  readonly conflicts: number;
}

/** O que uma mudança é no projeto atual, sem a decisão (que muda a cada clique). */
export type ChangeSituation = Omit<ChangeStatus, 'decision'>;

/** Uma proposta substituída: quem a substituiu, o que ficou para trás e como se compara. */
export interface Supersession {
  /** A proposta que a substitui; `null` se ela não está mais na pasta. */
  readonly by: Proposal | null;
  readonly leftBehind: LeftBehind;
  /** Cada mudança da antiga em relação à nova (igual, diferente ou não consta); `null` sem a nova. */
  readonly comparison: ReadonlyMap<string, ChangeComparison> | null;
}

/** Uma linha da janela Propostas. */
export interface ProposalRow {
  readonly proposal: Proposal;
  readonly progress: ReviewProgress;
  readonly conflicts: number;
  /** Aberta e ainda sem decisões, notas nem abertura neste dispositivo: a que acabou de chegar. */
  readonly fresh: boolean;
  /** Substituída: o que ficou para trás (`null` nas demais). */
  readonly leftBehind: LeftBehind | null;
  /** Id da proposta que a substituiu, se estiver na pasta. */
  readonly supersededBy: string | null;
}

export interface ReviewDerived {
  /** Proposta aberta na revisão (a versão mais recente da sessão). */
  readonly proposal: ReadonlySignal<Proposal | null>;
  /** Todas as propostas com contagens, para a janela Propostas, a mais nova primeiro. */
  readonly rows: ReadonlySignal<readonly ProposalRow[]>;
  /** Propostas novas (ainda sem decisão, nota nem abertura): o selo e o aviso. */
  readonly freshIds: ReadonlySignal<readonly string[]>;
  /** Níveis Projeto → Imagem → Item (memoizado pelas mudanças e pelo projeto, não pelas decisões). */
  readonly tree: ReadonlySignal<ReviewTree | null>;
  /** Posição de cada mudança na proposta. */
  readonly order: ReadonlySignal<ReadonlyMap<string, number>>;
  /** Tipo de cada mudança. */
  readonly changeTypes: ReadonlySignal<ReadonlyMap<string, ChangeType>>;
  /** Tipo dominante de cada nível (`reviewKey`), para os selos da Árvore e da lista. */
  readonly levelTypes: ReadonlySignal<ReadonlyMap<string, ChangeType>>;
  /** Conflito, valor atual e aviso de item trancado de cada mudança. */
  readonly situation: ReadonlySignal<ReadonlyMap<string, ChangeSituation>>;
  readonly conflictIds: ReadonlySignal<ReadonlySet<string>>;
  /** Decisões de três estados com "parcial" e contagens, por nível (`reviewKey`, inclui `proposal:`). */
  readonly levels: ReadonlySignal<ReadonlyMap<string, LevelSummary>>;
  readonly progress: ReadonlySignal<ReviewProgress | null>;
  readonly counts: ReadonlySignal<ReviewCounts>;
  /** Conferência do conjunto aceito (o que bloqueia "Aplicar aceitas"); `null` sem proposta. */
  readonly validation: ReadonlySignal<AcceptedValidation | null>;
  /** Mudanças aceitas que causam o problema e as sem decisão que podem resolvê-lo. */
  readonly invalid: ReadonlySignal<{
    readonly changeIds: ReadonlySet<string>;
    readonly related: ReadonlySet<string>;
  }>;
  /** Dá para aplicar agora: há aceitas pendentes, o conjunto é válido e o projeto não é só leitura. */
  readonly canApply: ReadonlySignal<boolean>;
  /** O projeto "como ficaria" (atual + mudanças não rejeitadas e não aplicadas); lido só quando a interface pede. */
  readonly preview: ReadonlySignal<PatchResult | null>;
  /** Mudanças que passam pelos filtros, na ordem da proposta. */
  readonly visibleIds: ReadonlySignal<readonly string[]>;
  /** Sem decisão (todas, na ordem da proposta). */
  readonly pendingIds: ReadonlySignal<readonly string[]>;
  /** Notas por alvo (`reviewKey`). */
  readonly notes: ReadonlySignal<ReadonlyMap<string, readonly ProposalNote[]>>;
  /** Se a proposta aberta foi substituída: o que ficou para trás. */
  readonly supersession: ReadonlySignal<Supersession | null>;
}

const NO_SITUATIONS: ReadonlyMap<string, ChangeSituation> = new Map();
const NO_IDS: readonly string[] = [];
const NO_ID_SET: ReadonlySet<string> = new Set();
const NO_ORDER: ReadonlyMap<string, number> = new Map();
const NO_TYPES: ReadonlyMap<string, ChangeType> = new Map();
const NO_LEVELS: ReadonlyMap<string, LevelSummary> = new Map();
const NO_NOTES: ReadonlyMap<string, readonly ProposalNote[]> = new Map();
const NO_COUNTS: ReviewCounts = {
  total: 0,
  undecided: 0,
  accepted: 0,
  rejected: 0,
  applied: 0,
  acceptedPending: 0,
  conflicts: 0,
};
const NO_INVALID = { changeIds: NO_ID_SET, related: NO_ID_SET };
const NO_DECISIONS: Proposal['decisions'] = {};

/** Conflitos de cada proposta por (mudanças, aplicadas, projeto): decidir não os recalcula. */
const conflictCache = new WeakMap<
  readonly Change[],
  { project: Project; applied: ProposalApplied; ids: ReadonlySet<string> }
>();

function conflictsOf(p: Proposal, project: Project): ReadonlySet<string> {
  const cached = conflictCache.get(p.changes);
  if (cached && cached.project === project && cached.applied === p.applied) {
    return cached.ids;
  }
  const stub: Proposal = { ...p, decisions: NO_DECISIONS };
  const ids = new Set<string>();
  for (const c of p.changes) {
    if (changeStatus(stub, c, project).conflict) ids.add(c.id);
  }
  conflictCache.set(p.changes, { project, applied: p.applied, ids });
  return ids;
}

/**
 * Estado derivado da revisão de propostas: níveis, contagens, conflitos, "como ficaria",
 * aceitas aguardando aplicação e proposta substituída. Memoizado pela versão do projeto
 * (`store.committed`) e da proposta: o que só depende das mudanças e do projeto (níveis,
 * conflitos, tipos) não é recalculado a cada decisão. Nada aqui depende do viewport.
 */
export function createReviewDerived(
  store: ProjectStore,
  sources: ReviewSources,
): ReviewDerived {
  const project = store.committed;

  const proposal = computed(() => {
    const id = sources.proposalId.value;
    return id === null
      ? null
      : (sources.proposals.value.find((p) => p.id === id) ?? null);
  });
  // Signals derivados só notificam quando o valor muda: decidir não troca `changes` nem `applied`.
  const changesOf = computed(() => proposal.value?.changes ?? null);
  const appliedOf = computed(() => proposal.value?.applied ?? null);

  const supersededBy = computed(() => {
    const map = new Map<string, Proposal>();
    for (const p of sources.proposals.value) {
      if (p.supersedes !== null && !map.has(p.supersedes)) map.set(p.supersedes, p);
    }
    return map;
  });

  const rows = computed((): readonly ProposalRow[] => {
    const current = project.value;
    const successors = supersededBy.value;
    const seen = sources.seen.value;
    return sources.proposals.value.map((p) => ({
      proposal: p,
      progress: reviewProgress(p),
      conflicts: current ? conflictsOf(p, current).size : 0,
      fresh:
        p.status === 'open' &&
        Object.keys(p.decisions).length === 0 &&
        p.notes.length === 0 &&
        !seen.has(p.id),
      leftBehind: p.status === 'superseded' ? leftBehind(p) : null,
      supersededBy: successors.get(p.id)?.id ?? null,
    }));
  });

  const freshIds = computed(() =>
    rows.value.filter((r) => r.fresh).map((r) => r.proposal.id),
  );

  const tree = computed((): ReviewTree | null => {
    const changes = changesOf.value;
    const current = project.value;
    const p = untracked(() => proposal.value);
    return changes && current && p ? reviewTree(p, current) : null;
  });

  const order = computed(() => {
    const changes = changesOf.value;
    return changes ? new Map(changes.map((c, i) => [c.id, i])) : NO_ORDER;
  });

  const changeTypes = computed(() => {
    const changes = changesOf.value;
    return changes ? new Map(changes.map((c) => [c.id, changeType(c)])) : NO_TYPES;
  });

  // Tipo de cada nível. Item e imagem: o da própria entidade (a marcação, a imagem),
  // na ordem criada > removida > trocada > alterada; "movida" só se a posição é a única
  // coisa que muda. Sem mudança na própria entidade, o que muda dentro (uma anotação
  // criada, uma marcação da imagem) faz o nível "alterado". Proposta e Projeto: o
  // dominante de tudo.
  const levelTypes = computed((): ReadonlyMap<string, ChangeType> => {
    const t = tree.value;
    const types = changeTypes.value;
    const changes = changesOf.value;
    const result = new Map<string, ChangeType>();
    if (!t || !changes) return result;
    const byId = new Map(changes.map((c) => [c.id, c]));
    for (const [key, node] of t.nodes) {
      const all = t.changeIdsOf({ level: node.level, id: node.id });
      if (all.length === 0) continue;
      const entity =
        node.level === 'item' ? 'marking' : node.level === 'image' ? 'image' : null;
      const typesOf = (ids: readonly string[]) =>
        ids.map((id) => types.get(id)).filter((x): x is ChangeType => x !== undefined);
      if (entity === null) {
        const type = dominantChangeType(typesOf(all));
        if (type !== null) result.set(key, type);
        continue;
      }
      const own = all.filter((id) => {
        const c = byId.get(id);
        return c?.entity === entity && c.entityId === node.id;
      });
      const type = dominantChangeType(typesOf(own));
      result.set(
        key,
        type === null || (type === 'moved' && own.length < all.length) ? 'changed' : type,
      );
    }
    return result;
  });

  const situation = computed((): ReadonlyMap<string, ChangeSituation> => {
    const changes = changesOf.value;
    void appliedOf.value;
    const current = project.value;
    const p = untracked(() => proposal.value);
    if (!changes || !current || !p) return NO_SITUATIONS;
    const stub: Proposal = { ...p, decisions: NO_DECISIONS };
    const result = new Map<string, ChangeSituation>();
    for (const c of changes) {
      const {
        applied,
        conflict,
        current: value,
        locked,
      } = changeStatus(stub, c, current);
      result.set(c.id, { applied, conflict, current: value, locked });
    }
    return result;
  });

  const conflictIds = computed((): ReadonlySet<string> => {
    const changes = changesOf.value;
    void appliedOf.value;
    const current = project.value;
    const p = untracked(() => proposal.value);
    return changes && current && p ? conflictsOf(p, current) : NO_ID_SET;
  });

  const levels = computed((): ReadonlyMap<string, LevelSummary> => {
    const p = proposal.value;
    const t = tree.value;
    if (!p || !t) return NO_LEVELS;
    const result = new Map<string, LevelSummary>();
    for (const [key, node] of t.nodes) {
      result.set(
        key,
        summarizeDecisions(p, t.changeIdsOf({ level: node.level, id: node.id })),
      );
    }
    return result;
  });

  const progress = computed(() => {
    const p = proposal.value;
    return p ? reviewProgress(p) : null;
  });

  const counts = computed((): ReviewCounts => {
    const p = progress.value;
    if (!p) return NO_COUNTS;
    return {
      total: p.total,
      undecided: p.undecided,
      accepted: p.accepted,
      rejected: p.rejected,
      applied: p.applied,
      acceptedPending: p.acceptedPending,
      conflicts: conflictIds.value.size,
    };
  });

  const validation = computed((): AcceptedValidation | null => {
    const p = proposal.value;
    const current = project.value;
    if (!p || !current) return null;
    // Sem aceitas pendentes não há o que validar (e `validateProject` custa).
    if (
      acceptedPending(p).length === 0 &&
      (p.status === 'open' || p.status === 'superseded')
    ) {
      return { ok: true, changeIds: NO_IDS, issues: [], project: current };
    }
    return validateAccepted(current, p);
  });

  const invalid = computed(() => {
    const v = validation.value;
    if (!v || v.ok) return NO_INVALID;
    return {
      changeIds: new Set(v.issues.flatMap((i) => i.changeIds)),
      related: new Set(v.issues.flatMap((i) => i.related)),
    };
  });

  const canApply = computed(() => {
    const v = validation.value;
    return v !== null && v.ok && v.changeIds.length > 0 && !store.readOnly.value;
  });

  const preview = computed((): PatchResult | null => {
    const p = proposal.value;
    const current = project.value;
    return p && current ? previewProject(current, p) : null;
  });

  const visibleIds = computed((): readonly string[] => {
    const p = proposal.value;
    const current = project.value;
    if (!p || !current) return NO_IDS;
    return filterChanges(p, current, sources.filters.value, conflictIds.value).map(
      (c) => c.id,
    );
  });

  const pendingIds = computed((): readonly string[] => {
    const p = proposal.value;
    if (!p) return NO_IDS;
    return p.changes.filter((c) => p.decisions[c.id] === undefined).map((c) => c.id);
  });

  const notes = computed((): ReadonlyMap<string, readonly ProposalNote[]> => {
    const p = proposal.value;
    if (!p || p.notes.length === 0) return NO_NOTES;
    const result = new Map<string, ProposalNote[]>();
    for (const note of p.notes) {
      const key = reviewKey(note.target);
      const list = result.get(key);
      if (list) list.push(note);
      else result.set(key, [note]);
    }
    return result;
  });

  const supersession = computed((): Supersession | null => {
    const p = proposal.value;
    if (!p || p.status !== 'superseded') return null;
    const by = supersededBy.value.get(p.id) ?? null;
    return {
      by,
      leftBehind: leftBehind(p),
      comparison: by ? compareProposals(p, by) : null,
    };
  });

  return {
    proposal,
    rows,
    freshIds,
    tree,
    order,
    changeTypes,
    levelTypes,
    situation,
    conflictIds,
    levels,
    progress,
    counts,
    validation,
    invalid,
    canApply,
    preview,
    visibleIds,
    pendingIds,
    notes,
    supersession,
  };
}
