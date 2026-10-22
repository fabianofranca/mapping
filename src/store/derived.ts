import { computed, signal, untracked, type ReadonlySignal } from '@preact/signals';
import {
  EMPTY_CATALOG,
  NO_DRAWINGS,
  acceptedPending,
  buildIncompleteList,
  buildListing,
  changeStatus,
  changeType,
  compareProposals,
  componentMinSize,
  componentTypes,
  createDrawingCache,
  filterChanges,
  layerDotsByMarking,
  leftBehind,
  levelType,
  markingLockStates,
  markingVisibility,
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
  type ChangeEntity,
  type ChangeComparison,
  type ChangeStatus,
  type ChangeType,
  type ComponentCatalog,
  type ComponentDrawings,
  type ComponentType,
  type IncompleteImage,
  type Layer,
  type LayerDot,
  type LeftBehind,
  type LevelSummary,
  type ListedImage,
  type MarkingLockState,
  type MarkingVisibility,
  type PatchResult,
  type Project,
  type Proposal,
  type ProposalApplied,
  type ProposalNote,
  type ReviewFilters,
  type ReviewProgress,
  type ReviewTree,
} from '../model';
import type { ProjectStore } from './history';
import { markingDisplay, showComponentsOnPhotos } from './settings';
import { textMeasurer } from './textMeasure';
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
  /** Componentes das especializações aplicadas ao projeto (vazio enquanto não carregam). */
  readonly catalog: ReadonlySignal<ComponentCatalog>;
  /**
   * Desenhos dos componentes do projeto à vista, por marcação, em ordem de desenho. Uma edição
   * reinstancia só a marcação mudada; as demais mantêm o mesmo objeto (o canvas compara por
   * identidade). Segue o desfazer, a recarga externa e a visão Proposto da revisão.
   */
  readonly componentScenes: ReadonlySignal<ComponentDrawings>;
  /**
   * Desenhos de `p` (o canvas desenha o projeto com a prévia do gesto). O projeto à vista
   * devolve `componentScenes`; outro projeto usa o mesmo cache, e só a marcação que mudou
   * é reinstanciada. Lê os mesmos sinais: pode ser chamada dentro de um `computed`.
   */
  drawingsOf(p: Project | null): ComponentDrawings;
  /**
   * Marcações cujo desenho está visível: têm desenho, a imagem é um container sem arquivo ou a pessoa
   * ligou "desenhar sobre fotos", e a visibilidade delas não é `hidden`.
   */
  readonly drawnMarkings: ReadonlySignal<ReadonlySet<string>>;
  /** Tamanho mínimo (`minSize`) do componente de cada marcação que tem desenho e mínimo. */
  readonly componentMinSizes: ReadonlySignal<
    ReadonlyMap<string, { readonly width: number; readonly height: number }>
  >;
  /**
   * Marcações flutuantes do projeto à vista (v13): desenhadas acima de tudo. O mesmo conjunto
   * enquanto nenhuma muda, para o canvas não refazer a camada de componentes à toa.
   */
  readonly floatingMarkings: ReadonlySignal<ReadonlySet<string>>;
  /** Tipos com componente das especializações aplicadas, para a paleta. */
  readonly componentTypes: ReadonlySignal<readonly ComponentType[]>;
  /** Avisos do desenho de cada marcação que tem algum (Diagnóstico). */
  readonly componentWarnings: ReadonlySignal<
    readonly { readonly markingId: string; readonly warnings: readonly string[] }[]
  >;
}

/** O que a sessão entrega ao derivado sobre os componentes (`session.components`). */
export interface ComponentSources {
  readonly catalog: ReadonlySignal<ComponentCatalog>;
  /** Sobe a cada registro de fontes: os desenhos remedem. */
  readonly fontsEpoch: ReadonlySignal<number>;
}

const NO_ISSUES: ReadonlyMap<string, readonly AnnotationIssue[]> = new Map();
const NO_ANNOTATIONS: ReadonlyMap<string, readonly Annotation[]> = new Map();
const NO_DOTS: ReadonlyMap<string, readonly LayerDot[]> = new Map();
const NO_VISIBILITY: ReadonlyMap<string, MarkingVisibility> = new Map();

function hiddenVisibility(p: Project): ReadonlyMap<string, MarkingVisibility> {
  return new Map(p.markings.map((m) => [m.id, 'hidden' as const]));
}
const NO_MARKINGS: ReadonlySet<string> = new Set();
const NO_LOCKS: ReadonlyMap<string, MarkingLockState> = new Map();
const NO_DRAWN: ReadonlySet<string> = new Set();
const NO_MIN_SIZES: ReadonlyMap<
  string,
  { readonly width: number; readonly height: number }
> = new Map();
const NO_COMPONENT_TYPES: readonly ComponentType[] = [];
const NO_COMPONENT_WARNINGS: readonly {
  readonly markingId: string;
  readonly warnings: readonly string[];
}[] = [];
const NO_COMPONENTS: ComponentSources = {
  catalog: signal<ComponentCatalog>(EMPTY_CATALOG),
  fontsEpoch: signal(0),
};

function sameIssueList(
  a: readonly AnnotationIssue[],
  b: readonly AnnotationIssue[],
): boolean {
  return (
    a.length === b.length &&
    a.every(
      (x, i) =>
        x.code === b[i]?.code &&
        x.key === b[i]?.key &&
        x.rowId === b[i]?.rowId &&
        x.column === b[i]?.column,
    )
  );
}

function sameIssues(
  a: ReadonlyMap<string, readonly AnnotationIssue[]>,
  b: ReadonlyMap<string, readonly AnnotationIssue[]>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [id, list] of a) {
    const other = b.get(id);
    if (other === undefined || !sameIssueList(list, other)) return false;
  }
  return true;
}

function sameComponentTypes(
  a: readonly ComponentType[],
  b: readonly ComponentType[],
): boolean {
  return (
    a.length === b.length &&
    a.every(
      (x, i) =>
        x.specId === b[i]?.specId &&
        x.typeId === b[i]?.typeId &&
        x.name === b[i]?.name &&
        x.layerId === b[i]?.layerId &&
        x.container === b[i]?.container &&
        x.component === b[i]?.component,
    )
  );
}

/** Mesmos itens na mesma ordem. */
function sameItems<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((item, i) => item === b[i]);
}

/**
 * `shown`: o projeto à vista (`review.derived.shownProject`): na visão Proposto da revisão,
 * o "como ficaria"; senão, o confirmado. Sem ele (testes do editor sem revisão), o
 * confirmado. Nunca o projeto com a prévia do gesto: nada daqui depende de geometria,
 * então arrastar/redimensionar não recalcula nada (`drawingsOf` é a exceção: o canvas pede os
 * desenhos do projeto com a prévia do gesto). `components`: catálogo e época das fontes da
 * sessão; sem ele, o catálogo é vazio e nenhuma marcação tem desenho.
 */
export function createEditorDerived(
  store: ProjectStore,
  ui: EditorUi,
  shown: ReadonlySignal<Project | null> = store.committed,
  components: ComponentSources = NO_COMPONENTS,
): EditorDerived {
  const project = shown;

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

  // Um só cache para os desenhos do projeto à vista e os do projeto com a prévia do gesto:
  // a marcação arrastada é a única reinstanciada, e as demais mantêm o mesmo objeto.
  const drawingCache = createDrawingCache();
  const drawings = (p: Project | null): ComponentDrawings => {
    const catalog = components.catalog.value;
    // Sem componentes (a maioria dos projetos) não há o que percorrer a cada edição.
    if (catalog.size === 0) return NO_DRAWINGS;
    return drawingCache(p, catalog, textMeasurer.value, components.fontsEpoch.value);
  };
  const scenes = computed((): ComponentDrawings => drawings(project.value));
  const drawingsOf = (p: Project | null): ComponentDrawings =>
    p === project.value ? scenes.value : drawings(p);

  // Pendências do modelo mais "o componente não cabe" (só o desenho sabe). Sem desenho que
  // transborde, é o mapa do modelo; com ele, o mapa anterior se nada mudou.
  let lastIssues: ReadonlyMap<string, readonly AnnotationIssue[]> = NO_ISSUES;
  const issues = computed(() => {
    const p = project.value;
    const base = p ? projectIssues(p) : NO_ISSUES;
    const overflowing = [...scenes.value.values()].filter((d) => d.overflow);
    if (overflowing.length === 0) return base;
    const merged = new Map(base);
    for (const d of overflowing) {
      merged.set(d.annotationId, [
        ...(merged.get(d.annotationId) ?? []),
        { code: 'component-overflow' } satisfies AnnotationIssue,
      ]);
    }
    if (sameIssues(merged, lastIssues)) return lastIssues;
    lastIssues = merged;
    return merged;
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

  // Marcações cujo desenho pode aparecer: container sem arquivo, ou foto com a opção ligada. Não depende
  // da visibilidade: ao contrário, o filtro "sem anotação" não esconde o que desenha.
  const drawn = computed((): ReadonlySet<string> => {
    const all = scenes.value;
    const p = project.value;
    if (!p || all.size === 0) return NO_DRAWN;
    const { containers: images } = projectIndex(p);
    const onPhotos = showComponentsOnPhotos.value;
    const result = new Set<string>();
    for (const [id, drawing] of all) {
      // Marcação do canvas (v13): sem foto por baixo do espaço dela, o desenho aparece sempre
      // (a flutuante, em especial, "sobre tudo, inclusive sobre fotos").
      if (drawing.containerId === null) {
        result.add(id);
        continue;
      }
      const image = images.get(drawing.containerId);
      if (!image || (image.file !== null && !onPhotos)) continue;
      result.add(id);
    }
    return result;
  });

  let lastFloating: ReadonlySet<string> = NO_DRAWN;
  const floatingMarkings = computed((): ReadonlySet<string> => {
    const next = new Set<string>();
    for (const m of project.value?.markings ?? []) if (m.floating) next.add(m.id);
    if (next.size === lastFloating.size && [...next].every((id) => lastFloating.has(id))) {
      return lastFloating;
    }
    lastFloating = next.size === 0 ? NO_DRAWN : next;
    return lastFloating;
  });

  let lastDrawn: ReadonlySet<string> = NO_DRAWN;
  const drawnMarkings = computed(() => {
    const next = drawn.value;
    if (next.size === lastDrawn.size && [...next].every((id) => lastDrawn.has(id))) {
      return lastDrawn;
    }
    lastDrawn = next;
    return next;
  });

  const visibility = computed(() => {
    const p = project.value;
    if (!p) return NO_VISIBILITY;
    // Ver limpo: nenhuma marcação aparece (os componentes desenhados seguem em `drawn`).
    if (ui.cleanView.value) return hiddenVisibility(p);
    const selection = ui.selection.value;
    return markingVisibility(
      p,
      activeDots.value,
      markingDisplay.value,
      selection?.kind === 'marking' ? selection.id : null,
      drawnMarkings.value,
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
    return markingLocks.value.size > 0 || (p?.containers.some((i) => i.locked) ?? false);
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

  let lastMinSizes = NO_MIN_SIZES;
  const componentMinSizes = computed(() => {
    const p = project.value;
    const all = scenes.value;
    if (!p || all.size === 0) return NO_MIN_SIZES;
    const next = new Map<string, { readonly width: number; readonly height: number }>();
    for (const id of all.keys()) {
      const min = componentMinSize(p, components.catalog.value, id);
      if (min !== null) next.set(id, min);
    }
    const same =
      next.size === lastMinSizes.size &&
      [...next].every(([id, min]) => {
        const before = lastMinSizes.get(id);
        return before?.width === min.width && before.height === min.height;
      });
    if (same) return lastMinSizes;
    lastMinSizes = next.size === 0 ? NO_MIN_SIZES : next;
    return lastMinSizes;
  });

  let lastTypes = NO_COMPONENT_TYPES;
  const types = computed(() => {
    const p = project.value;
    const next = p ? componentTypes(p, components.catalog.value) : NO_COMPONENT_TYPES;
    if (sameComponentTypes(next, lastTypes)) return lastTypes;
    lastTypes = next.length === 0 ? NO_COMPONENT_TYPES : next;
    return lastTypes;
  });

  let lastComponentWarnings = NO_COMPONENT_WARNINGS;
  const componentWarnings = computed(() => {
    const next: { markingId: string; warnings: readonly string[] }[] = [];
    for (const [markingId, drawing] of scenes.value) {
      if (drawing.warnings.length > 0)
        next.push({ markingId, warnings: drawing.warnings });
    }
    const same =
      next.length === lastComponentWarnings.length &&
      next.every(
        (item, i) =>
          item.markingId === lastComponentWarnings[i]?.markingId &&
          item.warnings === lastComponentWarnings[i]?.warnings,
      );
    if (same) return lastComponentWarnings;
    lastComponentWarnings = next.length === 0 ? NO_COMPONENT_WARNINGS : next;
    return lastComponentWarnings;
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
    catalog: components.catalog,
    componentScenes: scenes,
    floatingMarkings,
    drawingsOf,
    drawnMarkings,
    componentMinSizes,
    componentTypes: types,
    componentWarnings,
  };
}

// ---------------------------------------------------------------------------
// Revisão de propostas (etapa 4)

/** Visão do canvas (e da Árvore) na revisão: o projeto como está ou "como ficaria". */
export type ReviewView = 'current' | 'proposed';

/**
 * De onde o estado derivado da revisão lê: as propostas da sessão e o que a interface
 * escolheu (proposta aberta, visão, filtros, propostas que este dispositivo já abriu).
 */
export interface ReviewSources {
  readonly proposals: ReadonlySignal<readonly Proposal[]>;
  readonly proposalId: ReadonlySignal<string | null>;
  readonly view: ReadonlySignal<ReviewView>;
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
  /**
   * A proposta que aponta `supersedes` para esta, se estiver na pasta: derivado da nova,
   * qualquer que seja o status desta (uma aplicada é histórico e não muda de status).
   */
  readonly supersededBy: Proposal | null;
}

/**
 * Mudanças de uma entidade (marcação, imagem, anotação ou camada), para os marcadores dos
 * Detalhes na revisão: a criação ou a remoção dela inteira e as alterações por campo.
 */
export interface EntityChanges {
  readonly entity: ChangeEntity;
  /** Criação ou remoção da entidade inteira; `null` se só há alterações de campo. */
  readonly whole: Change | null;
  /**
   * Alterações por campo, como em `Change.field`: `name`, `rect`, `parentId`, `file`,
   * `markingColor`, `parentAnnotationId`, `markingId`, `layerId`, `type`,
   * `values.<chave>` (campo da tipada) e `entries.<id>` (par da livre).
   */
  readonly fields: ReadonlyMap<string, Change>;
}

/**
 * Índice "mudanças por entidade e campo" da proposta aberta (fase 9.5): só depende das
 * mudanças, então decidir não o recalcula. Especialização e repositório (sem painel nos
 * Detalhes) ficam de fora.
 */
export interface FieldChangeIndex {
  /** Por id da entidade. */
  readonly entities: ReadonlyMap<string, EntityChanges>;
  /** Mudanças de anotação de cada marcação em que aparecem (`Change.markingId`), na ordem da proposta. */
  readonly annotationsOf: ReadonlyMap<string, readonly Change[]>;
  /**
   * Anotações que saem de cada marcação (pelo id da marcação de antes): a remoção e a troca
   * de marcação (`markingId`). São os "fantasmas" da visão Proposto.
   */
  readonly leaving: ReadonlyMap<string, readonly Change[]>;
}

const PANEL_ENTITIES: ReadonlySet<ChangeEntity> = new Set([
  'marking',
  'image',
  'annotation',
  'layer',
]);

const NO_FIELD_INDEX: FieldChangeIndex = {
  entities: new Map(),
  annotationsOf: new Map(),
  leaving: new Map(),
};

/** Acrescenta `item` à lista de `key` no mapa. */
function pushTo<K, V>(map: Map<K, V[]>, key: K, item: V): void {
  const list = map.get(key);
  if (list) list.push(item);
  else map.set(key, [item]);
}

/** Monta o índice "mudanças por entidade e campo" (função pura das mudanças). */
export function fieldChangeIndex(changes: readonly Change[]): FieldChangeIndex {
  const entities = new Map<
    string,
    { entity: ChangeEntity; whole: Change | null; fields: Map<string, Change> }
  >();
  const annotationsOf = new Map<string, Change[]>();
  const leaving = new Map<string, Change[]>();
  for (const c of changes) {
    if (!PANEL_ENTITIES.has(c.entity)) continue;
    let entry = entities.get(c.entityId);
    if (!entry) {
      entry = { entity: c.entity, whole: null, fields: new Map() };
      entities.set(c.entityId, entry);
    }
    if (c.kind === 'update' && c.field !== null) {
      // Um campo, uma mudança: a primeira vale (uma proposta editada à mão pode repetir).
      if (!entry.fields.has(c.field)) entry.fields.set(c.field, c);
    } else if (entry.whole === null) {
      entry.whole = c;
    }
    if (c.entity !== 'annotation') continue;
    if (c.markingId !== null) pushTo(annotationsOf, c.markingId, c);
    if (c.kind === 'remove' && c.markingId !== null) pushTo(leaving, c.markingId, c);
    if (c.kind === 'update' && c.field === 'markingId' && typeof c.from === 'string') {
      pushTo(leaving, c.from, c);
    }
  }
  return { entities, annotationsOf, leaving };
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
  /**
   * Dá para aplicar agora: há aceitas pendentes, o conjunto é válido, o projeto não é só
   * leitura e nenhum aplicar desta proposta está em curso.
   */
  readonly canApply: ReadonlySignal<boolean>;
  /** Um aplicar da proposta aberta está em curso (`hold`): a revisão não reavalia. */
  readonly applying: ReadonlySignal<boolean>;
  /**
   * Segura a reavaliação da proposta aberta enquanto o aplicar dela roda: `validation`,
   * `conflictIds` e `situation` (e o que deriva deles) ficam com o valor de agora, só
   * enquanto ela é a proposta aberta. Devolve a função que solta (as chamadas se somam).
   */
  hold(): () => void;
  /** O projeto "como ficaria" (atual + mudanças não rejeitadas e não aplicadas); lido só quando a interface pede. */
  readonly preview: ReadonlySignal<PatchResult | null>;
  /**
   * O projeto que a interface mostra: o "como ficaria" na visão Proposto da revisão; o
   * atual (`store.committed`) na visão Atual e fora da revisão. A Árvore e o estado vazio
   * do canvas leem daqui (uma importação nova tem imagens só na prévia).
   */
  readonly shownProject: ReadonlySignal<Project | null>;
  /**
   * O "como ficaria" com todas as mudanças ainda não aplicadas, sem olhar as decisões: o
   * que uma criação rejeitada propunha (os Detalhes a mostram mesmo fora das duas visões).
   * Memoizado pelas mudanças, pelas aplicadas e pelo projeto; lido só quando a interface pede.
   */
  readonly fullPreview: ReadonlySignal<Project | null>;
  /** Mudanças por entidade e campo (os marcadores dos Detalhes); memoizado pelas mudanças. */
  readonly fieldIndex: ReadonlySignal<FieldChangeIndex>;
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

/** O retrato da revisão de uma proposta enquanto o aplicar dela roda (`hold`). */
interface HeldReview {
  readonly count: number;
  readonly situation: ReadonlyMap<string, ChangeSituation>;
  readonly conflictIds: ReadonlySet<string>;
  readonly validation: AcceptedValidation | null;
}
const NO_HOLDS: ReadonlyMap<string, HeldReview> = new Map();
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
      supersededBy: successors.get(p.id) ?? null,
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

  // Tipo de cada nível (a regra é `levelType`, do modelo); memoizado pela árvore.
  const levelTypes = computed((): ReadonlyMap<string, ChangeType> => {
    const t = tree.value;
    const changes = changesOf.value;
    const result = new Map<string, ChangeType>();
    if (!t || !changes) return result;
    const byId = new Map(changes.map((c) => [c.id, c]));
    for (const [key, node] of t.nodes) {
      const own = t
        .changeIdsOf({ level: node.level, id: node.id })
        .map((id) => byId.get(id))
        .filter((c): c is Change => c !== undefined);
      const type = levelType(node.level, node.id, own);
      if (type !== null) result.set(key, type);
    }
    return result;
  });

  const liveSituation = computed((): ReadonlyMap<string, ChangeSituation> => {
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

  const liveConflictIds = computed((): ReadonlySet<string> => {
    const changes = changesOf.value;
    void appliedOf.value;
    const current = project.value;
    const p = untracked(() => proposal.value);
    return changes && current && p ? conflictsOf(p, current) : NO_ID_SET;
  });

  // Aplicar em curso (devolução do portão da 8.2): entre o `store.apply` e a publicação do
  // `proposal.json` com `applied`, o projeto já tem as aceitas e a proposta ainda não as dá
  // como aplicadas. Reavaliar nessa janela acusaria conflitos e um conjunto inválido que
  // não existem. `hold()` guarda o retrato de antes, preso à proposta aberta: os valores
  // exportados só o usam enquanto ela é a aberta, e o retrato some ao soltar (nada dele
  // fica guardado), então um conflito real surgido na janela aparece ao soltar.
  const held = signal<ReadonlyMap<string, HeldReview>>(NO_HOLDS);
  const heldNow = computed((): HeldReview | null => {
    const id = sources.proposalId.value;
    return id === null ? null : (held.value.get(id) ?? null);
  });
  const applying = computed(() => heldNow.value !== null);
  const situation = computed(
    (): ReadonlyMap<string, ChangeSituation> =>
      heldNow.value?.situation ?? liveSituation.value,
  );
  const conflictIds = computed(
    (): ReadonlySet<string> => heldNow.value?.conflictIds ?? liveConflictIds.value,
  );

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

  const liveValidation = computed((): AcceptedValidation | null => {
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

  const validation = computed((): AcceptedValidation | null => {
    const frozen = heldNow.value;
    return frozen ? frozen.validation : liveValidation.value;
  });

  const hold = (): (() => void) => {
    const id = sources.proposalId.peek();
    if (id === null) return () => undefined;
    const current = held.peek().get(id);
    const next = new Map(held.peek());
    next.set(
      id,
      current
        ? { ...current, count: current.count + 1 }
        : {
            count: 1,
            situation: liveSituation.peek(),
            conflictIds: liveConflictIds.peek(),
            validation: liveValidation.peek(),
          },
    );
    held.value = next;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const entry = held.peek().get(id);
      if (!entry) return;
      const rest = new Map(held.peek());
      if (entry.count > 1) rest.set(id, { ...entry, count: entry.count - 1 });
      else rest.delete(id);
      held.value = rest;
    };
  };

  const invalid = computed(() => {
    const v = validation.value;
    if (!v || v.ok) return NO_INVALID;
    return {
      changeIds: new Set(v.issues.flatMap((i) => i.changeIds)),
      related: new Set(v.issues.flatMap((i) => i.related)),
    };
  });

  const canApply = computed(() => {
    // Enquanto aplica, o retrato diz "válido": não deixa aplicar de novo.
    if (applying.value) return false;
    const v = validation.value;
    return v !== null && v.ok && v.changeIds.length > 0 && !store.readOnly.value;
  });

  const preview = computed((): PatchResult | null => {
    const p = proposal.value;
    const current = project.value;
    return p && current ? previewProject(current, p) : null;
  });

  const shownProject = computed((): Project | null => {
    if (sources.proposalId.value === null || sources.view.value === 'current') {
      return project.value;
    }
    return preview.value?.project ?? project.value;
  });

  const fullPreview = computed((): Project | null => {
    const changes = changesOf.value;
    const applied = appliedOf.value;
    const current = project.value;
    const p = untracked(() => proposal.value);
    if (!changes || !applied || !current || !p) return null;
    return previewProject(current, { ...p, decisions: NO_DECISIONS }).project;
  });

  const fieldIndex = computed((): FieldChangeIndex => {
    const changes = changesOf.value;
    return changes ? fieldChangeIndex(changes) : NO_FIELD_INDEX;
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
    applying,
    hold,
    preview,
    shownProject,
    fullPreview,
    fieldIndex,
    visibleIds,
    pendingIds,
    notes,
    supersession,
  };
}
