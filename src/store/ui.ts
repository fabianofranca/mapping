import { batch, signal, type Signal } from '@preact/signals';
import {
  projectIndex,
  spaceOf,
  type Annotation,
  type Layer,
  type Marking,
  type Project,
  type ProjectContainer,
  type Space,
} from '../model';

/**
 * Item **primário** da seleção (o último clicado): o que Detalhes, a trilha, as alças e os
 * atalhos de um item só usam. `null` = nada selecionado. A seleção inteira (ME2) é
 * `selectedItems(ui)`: o primário mais os outros de `selectionGroup`.
 */
export type Selection =
  | { readonly kind: 'image'; readonly id: string }
  | { readonly kind: 'marking'; readonly id: string }
  | null;

/** Um item da seleção: um container (`image`) ou uma marcação. */
export type SelectionItem = NonNullable<Selection>;

/**
 * Os outros itens da seleção múltipla, presos ao primário em que foram juntados. Vale só
 * enquanto `primary` é **o mesmo objeto** que `selection`: qualquer escrita direta em
 * `ui.selection` (clique simples, criar, ir até uma anotação) desfaz o grupo sozinha, sem que
 * cada escritor precise saber da seleção múltipla.
 */
export interface SelectionGroup {
  readonly primary: SelectionItem;
  /** Na ordem em que entraram; nunca contém o primário. */
  readonly others: readonly SelectionItem[];
}

/** Navegar: tocar seleciona, arrastar move ou faz pan. Desenhar: arrastar cria marcações. */
export type EditorMode = 'navigate' | 'draw';

/**
 * Estado da UI do editor: não vai para o JSON nem entra no desfazer.
 * O viewport fica com o `CanvasController`, que é quem o altera.
 */
export interface EditorUi {
  readonly selection: Signal<Selection>;
  /** Seleção múltipla: os outros itens além do primário (ver `SelectionGroup`). */
  readonly selectionGroup: Signal<SelectionGroup | null>;
  readonly mode: Signal<EditorMode>;
  /**
   * Ver limpo (Alt+H): o canvas mostra só as imagens e os componentes. Não é preferência:
   * nasce desligado com o editor de cada projeto e não é gravado.
   */
  readonly cleanView: Signal<boolean>;
  /**
   * Camadas escondidas. Guardar as escondidas (e não as visíveis) faz camadas
   * novas, ou restauradas pelo desfazer, aparecerem visíveis por padrão.
   */
  readonly hiddenLayers: Signal<ReadonlySet<string>>;
  /** Camada ativa escolhida (use `resolveActiveLayerId`: ela pode não existir mais). */
  readonly activeLayer: Signal<string | null>;
  /** Visão de Lista: mostrar também marcações sem anotação nas camadas visíveis. */
  readonly listShowEmpty: Signal<boolean>;
  /** Visão de Lista: só anotações incompletas (docs/history/PLAN-etapas-1-2.md 13.5). */
  readonly listIncompleteOnly: Signal<boolean>;
  /** Janela Incompletas: só as pendências das camadas visíveis (B5). */
  readonly incompleteVisibleOnly: Signal<boolean>;
  /** Anotação para rolar até (e focar) no painel assim que ela aparecer. */
  readonly focusAnnotation: Signal<string | null>;
  /** Nós recolhidos da janela Árvore (`treeKey`); vazio = tudo aberto. */
  readonly collapsedTree: Signal<ReadonlySet<string>>;
  /**
   * Campo da anotação em `focusAnnotation` que recebe o foco (link de uma pendência):
   * o `data-focus` do campo (`owner`, a chave do campo ou `chave:linha:coluna`).
   */
  readonly focusField: Signal<string | null>;
  /**
   * Seções recolhidas de Detalhes (B15): a da marcação, a das anotações, cada camada
   * e cada anotação (`sectionKey`). Vale para a sessão: recolher uma camada vale em
   * todas as marcações.
   */
  readonly collapsed: Signal<ReadonlySet<string>>;
  /** Aviso curto sobre o canvas ("Referência copiada"); some sozinho (`showToast`). */
  readonly toast: Signal<string | null>;
  /** Menu de contexto do canvas (botão direito): onde abrir (tela) e o item sob o cursor. */
  readonly canvasMenu: Signal<CanvasMenu | null>;
  /** Revisão de propostas: legenda das marcas do canvas aberta (atalho L). */
  readonly reviewLegend: Signal<boolean>;
  /** Revisão: comparação antes/depois da imagem trocada aberta (id da imagem). */
  readonly compareImage: Signal<string | null>;
}

export interface CanvasMenu {
  /** Posição do cursor na janela (`clientX`/`clientY`). */
  readonly x: number;
  readonly y: number;
  readonly target: { readonly kind: 'i' | 'm'; readonly id: string };
}

export function createEditorUi(): EditorUi {
  return {
    selection: signal<Selection>(null),
    selectionGroup: signal<SelectionGroup | null>(null),
    mode: signal<EditorMode>('navigate'),
    cleanView: signal<boolean>(false),
    hiddenLayers: signal<ReadonlySet<string>>(new Set()),
    activeLayer: signal<string | null>(null),
    listShowEmpty: signal<boolean>(false),
    listIncompleteOnly: signal<boolean>(false),
    incompleteVisibleOnly: signal<boolean>(false),
    focusAnnotation: signal<string | null>(null),
    collapsedTree: signal<ReadonlySet<string>>(new Set()),
    focusField: signal<string | null>(null),
    collapsed: signal<ReadonlySet<string>>(new Set()),
    toast: signal<string | null>(null),
    canvasMenu: signal<CanvasMenu | null>(null),
    reviewLegend: signal<boolean>(false),
    compareImage: signal<string | null>(null),
  };
}

// ---------------------------------------------------------------------------
// Seleção múltipla (ME2): um conjunto ordenado de itens com um primário, o último clicado.

/** Mesmo item (mesmo tipo e id). */
export function sameItem(a: SelectionItem | null, b: SelectionItem | null): boolean {
  return a !== null && b !== null && a.kind === b.kind && a.id === b.id;
}

/** A seleção inteira a partir do primário e do grupo: os outros primeiro, o primário por último. */
export function itemsOf(
  selection: Selection,
  group: SelectionGroup | null,
): readonly SelectionItem[] {
  if (!selection) return [];
  if (group === null || group.primary !== selection) return [selection];
  return [...group.others, selection];
}

/** Itens selecionados, com o primário por último. Lê os sinais com `.value` (reativo). */
export function selectedItems(ui: EditorUi): readonly SelectionItem[] {
  return itemsOf(ui.selection.value, ui.selectionGroup.value);
}

/** Como `selectedItems`, sem assinar (handlers de evento). */
export function peekSelectedItems(ui: EditorUi): readonly SelectionItem[] {
  return itemsOf(ui.selection.peek(), ui.selectionGroup.peek());
}

/** O item está na seleção? */
export function isItemSelected(
  items: readonly SelectionItem[],
  item: SelectionItem,
): boolean {
  return items.some((i) => sameItem(i, item));
}

/**
 * Troca a seleção inteira: o **último** item é o primário. Repetidos ficam uma vez só (na
 * última posição em que aparecem). Lista vazia = nada selecionado.
 */
export function selectItems(ui: EditorUi, items: readonly SelectionItem[]): void {
  const unique: SelectionItem[] = [];
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i] as SelectionItem;
    if (!isItemSelected(unique, item)) unique.unshift(item);
  }
  const primary = unique.at(-1);
  batch(() => {
    if (!primary) {
      ui.selection.value = null;
      ui.selectionGroup.value = null;
      return;
    }
    // Um objeto novo: o grupo fica preso a ele, e uma escrita direta depois o desfaz.
    const fresh: SelectionItem = { kind: primary.kind, id: primary.id };
    ui.selection.value = fresh;
    ui.selectionGroup.value =
      unique.length > 1 ? { primary: fresh, others: unique.slice(0, -1) } : null;
  });
}

/**
 * Shift+clique: tira o item da seleção se ele está nela (o primário passa a ser o último dos
 * que ficam) ou o acrescenta como primário.
 */
export function toggleSelectedItem(ui: EditorUi, item: SelectionItem): void {
  const items = peekSelectedItems(ui);
  if (isItemSelected(items, item)) {
    selectItems(
      ui,
      items.filter((i) => !sameItem(i, item)),
    );
  } else {
    selectItems(ui, [...items, item]);
  }
}

/** Esc com vários itens: fica só o primário. Devolve `true` se havia outros itens. */
export function collapseToPrimary(ui: EditorUi): boolean {
  if (peekSelectedItems(ui).length < 2) return false;
  ui.selectionGroup.value = null;
  return true;
}

/** Os itens que ainda existem no projeto (depois de desfazer, um pode ter sumido). */
export function existingItems(
  project: Project | null,
  items: readonly SelectionItem[],
): readonly SelectionItem[] {
  if (!project) return [];
  const index = projectIndex(project);
  return items.filter((i) =>
    i.kind === 'image' ? index.containers.has(i.id) : index.markings.has(i.id),
  );
}

/** Liga ou desliga o Ver limpo. Ligar volta ao modo Navegar; desligar não mexe no modo. */
export function setCleanView(ui: EditorUi, on: boolean): void {
  if (on && ui.mode.peek() === 'draw') ui.mode.value = 'navigate';
  ui.cleanView.value = on;
}

/** Quanto tempo o aviso curto fica na tela. */
export const TOAST_MS = 2500;

const toastTimers = new WeakMap<EditorUi, ReturnType<typeof setTimeout>>();

/** Mostra um aviso curto sobre o canvas; um novo aviso substitui o anterior. */
export function showToast(ui: EditorUi, text: string, duration = TOAST_MS): void {
  clearTimeout(toastTimers.get(ui));
  ui.toast.value = text;
  toastTimers.set(
    ui,
    setTimeout(() => {
      ui.toast.value = null;
      toastTimers.delete(ui);
    }, duration),
  );
}

/** Seções recolhíveis de Detalhes. */
export type DetailsSection =
  | { readonly kind: 'marking' | 'image' | 'annotations' | 'others' | 'images' }
  | { readonly kind: 'layer' | 'annotation'; readonly id: string };

/** Chave da seção no conjunto `collapsed`. */
export function sectionKey(section: DetailsSection): string {
  return 'id' in section ? `${section.kind}:${section.id}` : section.kind;
}

export function isSectionCollapsed(ui: EditorUi, section: DetailsSection): boolean {
  return ui.collapsed.value.has(sectionKey(section));
}

/** Recolhe ou abre a seção. */
export function toggleSection(ui: EditorUi, section: DetailsSection): void {
  const next = new Set(ui.collapsed.peek());
  const key = sectionKey(section);
  if (!next.delete(key)) next.add(key);
  ui.collapsed.value = next;
}

/** Abre as seções (ex.: para mostrar uma anotação pedida por um link). */
export function expandSections(ui: EditorUi, sections: readonly DetailsSection[]): void {
  const current = ui.collapsed.peek();
  const keys = sections.map(sectionKey).filter((key) => current.has(key));
  if (keys.length === 0) return;
  const next = new Set(current);
  for (const key of keys) next.delete(key);
  ui.collapsed.value = next;
}

/** Recolhe as seções (ex.: um grupo grande que a revisão mostra só pelos cabeçalhos). */
export function collapseSections(
  ui: EditorUi,
  sections: readonly DetailsSection[],
): void {
  const current = ui.collapsed.peek();
  const keys = sections.map(sectionKey).filter((key) => !current.has(key));
  if (keys.length === 0) return;
  const next = new Set(current);
  for (const key of keys) next.add(key);
  ui.collapsed.value = next;
}

/** Camada ativa efetiva: a escolhida, se ainda existir; senão a primeira do projeto. */
export function resolveActiveLayerId(
  project: Project | null,
  activeLayer: string | null,
): string | null {
  if (!project) return null;
  const chosen = project.layers.find((l) => l.id === activeLayer);
  return (chosen ?? project.layers[0])?.id ?? null;
}

/** Camadas visíveis, na ordem do projeto. A ativa está sempre visível. */
export function visibleLayers(
  project: Project | null,
  hidden: ReadonlySet<string>,
  activeLayerId: string | null,
): Layer[] {
  return (project?.layers ?? []).filter(
    (l) => l.id === activeLayerId || !hidden.has(l.id),
  );
}

/** Torna a camada ativa (e, com isso, visível). */
export function setActiveLayer(ui: EditorUi, layerId: string): void {
  ui.activeLayer.value = layerId;
  if (ui.hiddenLayers.peek().has(layerId)) {
    const hidden = new Set(ui.hiddenLayers.peek());
    hidden.delete(layerId);
    ui.hiddenLayers.value = hidden;
  }
}

/** Liga/desliga a visibilidade. A camada ativa não pode ser escondida. */
export function toggleLayerVisible(
  ui: EditorUi,
  project: Project | null,
  layerId: string,
): void {
  if (layerId === resolveActiveLayerId(project, ui.activeLayer.peek())) return;
  const hidden = new Set(ui.hiddenLayers.peek());
  if (!hidden.delete(layerId)) hidden.add(layerId);
  ui.hiddenLayers.value = hidden;
}

/** Torna a camada visível (sem mudar a ativa). */
export function showLayer(ui: EditorUi, layerId: string): void {
  if (!ui.hiddenLayers.peek().has(layerId)) return;
  const hidden = new Set(ui.hiddenLayers.peek());
  hidden.delete(layerId);
  ui.hiddenLayers.value = hidden;
}

/** O bastante para ir até uma anotação. */
export type AnnotationLocation = Pick<Annotation, 'id' | 'markingId' | 'layerId'>;

/**
 * Vai até a anotação (backlinks, "Ir para o alvo", vinculadas, pendências): mostra a
 * camada dela, abre as seções recolhidas que a escondem, seleciona a marcação e pede
 * ao painel para rolar até ela (e focar `field`, se houver).
 */
export function goToAnnotation(
  ui: EditorUi,
  annotation: AnnotationLocation,
  field: string | null = null,
): void {
  showLayer(ui, annotation.layerId);
  expandSections(ui, [
    { kind: 'annotations' },
    { kind: 'layer', id: annotation.layerId },
    { kind: 'annotation', id: annotation.id },
  ]);
  ui.selection.value = { kind: 'marking', id: annotation.markingId };
  ui.focusField.value = field;
  ui.focusAnnotation.value = annotation.id;
}

export function showAllLayers(ui: EditorUi): void {
  ui.hiddenLayers.value = new Set();
}

export type ResolvedSelection =
  | { readonly kind: 'image'; readonly image: ProjectContainer }
  | {
      readonly kind: 'marking';
      readonly marking: Marking;
      /** Container da marcação; `null` na marcação do canvas (v13). */
      readonly image: ProjectContainer | null;
      /** Espaço do `rect`: o container (pixels dele) ou o canvas (`placement` identidade). */
      readonly space: Space;
    }
  | null;

/** Item selecionado no projeto atual (`null` se ele não existe mais, ex.: após desfazer). */
export function resolveSelection(
  project: Project | null,
  selection: Selection,
): ResolvedSelection {
  if (!project || !selection) return null;
  if (selection.kind === 'image') {
    const image = project.containers.find((i) => i.id === selection.id);
    return image ? { kind: 'image', image } : null;
  }
  const index = projectIndex(project);
  const marking = index.markings.get(selection.id);
  if (!marking) return null;
  if (marking.containerId === null) {
    return { kind: 'marking', marking, image: null, space: spaceOf(project, marking) };
  }
  const image = index.containers.get(marking.containerId);
  return image
    ? { kind: 'marking', marking, image, space: spaceOf(project, marking) }
    : null;
}

// Árvore de marcações: quais nós estão recolhidos. Estado de UI, fora do projeto e do
// desfazer. As chaves levam o tipo do nó porque ids de imagem e de marcação vêm de
// geradores diferentes. A raiz Canvas (v13) é `treeKey('canvas', '')`.

export function treeKey(kind: 'image' | 'marking' | 'canvas', id: string): string {
  return `${kind}:${id}`;
}

/** Recolhe ou abre um nó da árvore. */
export function toggleTreeNode(ui: EditorUi, key: string): void {
  const next = new Set(ui.collapsedTree.peek());
  if (!next.delete(key)) next.add(key);
  ui.collapsedTree.value = next;
}

/**
 * Recolhe todos os nós que têm filhos: a raiz Canvas, os containers com marcações e as
 * marcações com filhas ou com containers membros.
 */
export function collapseTree(ui: EditorUi, project: Project | null): void {
  if (!project) return;
  const next = new Set<string>();
  const parents = new Set<string>();
  const floating = new Set(project.markings.filter((m) => m.floating).map((m) => m.id));
  for (const m of project.markings) {
    next.add(
      m.containerId === null ? treeKey('canvas', '') : treeKey('image', m.containerId),
    );
    if (m.parentId !== null) parents.add(m.parentId);
  }
  // Uma flutuante não tem filhos na árvore: não há o que recolher nela.
  for (const c of project.containers) {
    if (c.parentId !== null && !floating.has(c.parentId)) parents.add(c.parentId);
  }
  for (const id of parents) next.add(treeKey('marking', id));
  ui.collapsedTree.value = next;
}

/**
 * Abre os ancestrais do item para ele aparecer na árvore: a cadeia inteira (marcação de
 * container → container → marcações do canvas que o contêm → Canvas). Devolve se algo
 * mudou, para não regravar o signal à toa.
 */
export function revealInTree(
  ui: EditorUi,
  project: Project | null,
  selection: Selection,
): boolean {
  const collapsed = ui.collapsedTree.peek();
  if (collapsed.size === 0 || !project || !selection) return false;
  const index = projectIndex(project);
  const byId = index.markings;
  const next = new Set(collapsed);

  /** Abre a marcação `startId` e as marcações acima dela (o limite evita laço em dados corrompidos). */
  const openMarkings = (startId: string | null): void => {
    let current = startId === null ? undefined : byId.get(startId);
    for (let guard = byId.size; current && guard > 0; guard--) {
      next.delete(treeKey('marking', current.id));
      current = current.parentId === null ? undefined : byId.get(current.parentId);
    }
  };
  /** Abre o container e, se uma marcação do canvas o contém, a cadeia dela até o Canvas. */
  const openContainer = (container: ProjectContainer): void => {
    next.delete(treeKey('image', container.id));
    if (container.parentId !== null) {
      openMarkings(container.parentId);
      next.delete(treeKey('canvas', ''));
    }
  };

  if (selection.kind === 'image') {
    const container = index.containers.get(selection.id);
    if (!container) return false;
    if (container.parentId !== null) {
      openMarkings(container.parentId);
      next.delete(treeKey('canvas', ''));
    }
  } else {
    const marking = byId.get(selection.id);
    if (!marking) return false;
    openMarkings(marking.parentId);
    if (marking.containerId === null) {
      next.delete(treeKey('canvas', ''));
    } else {
      const container = index.containers.get(marking.containerId);
      if (container) openContainer(container);
    }
  }
  if (next.size === collapsed.size) return false;
  ui.collapsedTree.value = next;
  return true;
}
