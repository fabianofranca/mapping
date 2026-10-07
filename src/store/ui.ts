import { signal, type Signal } from '@preact/signals';
import {
  projectIndex,
  type Annotation,
  type Layer,
  type Marking,
  type Project,
  type ProjectImage,
} from '../model';
import type { ToolWindowId } from './toolWindows';

/** Item selecionado no editor. */
export type Selection =
  | { readonly kind: 'image'; readonly id: string }
  | { readonly kind: 'marking'; readonly id: string }
  | null;

/** Navegar: tocar seleciona, arrastar move ou faz pan. Desenhar: arrastar cria marcações. */
export type EditorMode = 'navigate' | 'draw';

/**
 * Altura da gaveta do celular (B7): recolhida (64px, só o cabeçalho) ou aberta (72%).
 * A terceira altura, tela cheia, é a janela Detalhes em tela cheia (`mobileWindow`).
 */
export type SheetHeight = 'peek' | 'open';

/**
 * Estado da UI do editor: não vai para o JSON nem entra no desfazer.
 * O viewport fica com o `CanvasController`, que é quem o altera.
 */
export interface EditorUi {
  readonly selection: Signal<Selection>;
  readonly mode: Signal<EditorMode>;
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
  /** Celular (B6): janela aberta em tela cheia; `null` mostra o canvas. */
  readonly mobileWindow: Signal<ToolWindowId | null>;
  /** Celular (B7): altura da gaveta de Detalhes sobre o canvas. */
  readonly sheet: Signal<SheetHeight>;
  /** Aviso curto sobre o canvas ("Referência copiada"); some sozinho (`showToast`). */
  readonly toast: Signal<string | null>;
  /** Menu de contexto do canvas (botão direito): onde abrir (tela) e o item sob o cursor. */
  readonly canvasMenu: Signal<CanvasMenu | null>;
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
    mode: signal<EditorMode>('navigate'),
    hiddenLayers: signal<ReadonlySet<string>>(new Set()),
    activeLayer: signal<string | null>(null),
    listShowEmpty: signal<boolean>(false),
    listIncompleteOnly: signal<boolean>(false),
    incompleteVisibleOnly: signal<boolean>(false),
    focusAnnotation: signal<string | null>(null),
    collapsedTree: signal<ReadonlySet<string>>(new Set()),
    focusField: signal<string | null>(null),
    collapsed: signal<ReadonlySet<string>>(new Set()),
    mobileWindow: signal<ToolWindowId | null>(null),
    sheet: signal<SheetHeight>('peek'),
    toast: signal<string | null>(null),
    canvasMenu: signal<CanvasMenu | null>(null),
  };
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
  | { readonly kind: 'marking' | 'image' | 'annotations' }
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
  | { readonly kind: 'image'; readonly image: ProjectImage }
  | {
      readonly kind: 'marking';
      readonly marking: Marking;
      readonly image: ProjectImage;
    }
  | null;

/** Item selecionado no projeto atual (`null` se ele não existe mais, ex.: após desfazer). */
export function resolveSelection(
  project: Project | null,
  selection: Selection,
): ResolvedSelection {
  if (!project || !selection) return null;
  if (selection.kind === 'image') {
    const image = project.images.find((i) => i.id === selection.id);
    return image ? { kind: 'image', image } : null;
  }
  const marking = project.markings.find((m) => m.id === selection.id);
  const image = marking && project.images.find((i) => i.id === marking.imageId);
  return marking && image ? { kind: 'marking', marking, image } : null;
}

// Árvore de marcações: quais nós estão recolhidos. Estado de UI, fora do projeto e do
// desfazer. As chaves levam o tipo do nó porque ids de imagem e de marcação vêm de
// geradores diferentes.

export function treeKey(kind: 'image' | 'marking', id: string): string {
  return `${kind}:${id}`;
}

/** Recolhe ou abre um nó da árvore. */
export function toggleTreeNode(ui: EditorUi, key: string): void {
  const next = new Set(ui.collapsedTree.peek());
  if (!next.delete(key)) next.add(key);
  ui.collapsedTree.value = next;
}

/** Recolhe todos os nós que têm filhos (as imagens e as marcações com filhas). */
export function collapseTree(ui: EditorUi, project: Project | null): void {
  if (!project) return;
  const next = new Set<string>();
  const parents = new Set<string>();
  for (const m of project.markings) {
    next.add(treeKey('image', m.imageId));
    if (m.parentId !== null) parents.add(m.parentId);
  }
  for (const id of parents) next.add(treeKey('marking', id));
  ui.collapsedTree.value = next;
}

/**
 * Abre os ancestrais do item para ele aparecer na árvore (a imagem e as marcações
 * acima). Devolve se algo mudou, para não regravar o signal à toa.
 */
export function revealInTree(
  ui: EditorUi,
  project: Project | null,
  selection: Selection,
): boolean {
  const collapsed = ui.collapsedTree.peek();
  if (collapsed.size === 0 || !project || !selection || selection.kind === 'image') {
    return false;
  }
  const byId = projectIndex(project).markings;
  const next = new Set(collapsed);
  let current = byId.get(selection.id);
  if (!current) return false;
  next.delete(treeKey('image', current.imageId));
  // O limite evita laço em dados corrompidos (a hierarquia é validada no modelo).
  for (let guard = byId.size; current?.parentId != null && guard > 0; guard--) {
    next.delete(treeKey('marking', current.parentId));
    current = byId.get(current.parentId);
  }
  if (next.size === collapsed.size) return false;
  ui.collapsedTree.value = next;
  return true;
}
