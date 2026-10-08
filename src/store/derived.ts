import { computed, type ReadonlySignal } from '@preact/signals';
import {
  buildIncompleteList,
  buildListing,
  layerDotsByMarking,
  markingLockStates,
  markingVisibility,
  platformRepoWarnings,
  projectIndex,
  projectIssues,
  type Annotation,
  type AnnotationIssue,
  type IncompleteImage,
  type Layer,
  type LayerDot,
  type ListedImage,
  type MarkingLockState,
  type MarkingVisibility,
  type PlatformRepoWarning,
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
