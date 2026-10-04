import { signal, type Signal } from '@preact/signals';
import {
  projectIndex,
  type Annotation,
  type Layer,
  type Marking,
  type Project,
  type ProjectImage,
} from '../model';

/** Item selecionado no editor. */
export type Selection =
  | { readonly kind: 'image'; readonly id: string }
  | { readonly kind: 'marking'; readonly id: string }
  | null;

/** Navegar: tocar seleciona, arrastar move ou faz pan. Desenhar: arrastar cria marcações. */
export type EditorMode = 'navigate' | 'draw';

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
  /** Anotação para rolar até (e focar) no painel assim que ela aparecer. */
  readonly focusAnnotation: Signal<string | null>;
  /** Nós recolhidos da janela Árvore (`treeKey`); vazio = tudo aberto. */
  readonly collapsedTree: Signal<ReadonlySet<string>>;
}

export function createEditorUi(): EditorUi {
  return {
    selection: signal<Selection>(null),
    mode: signal<EditorMode>('navigate'),
    hiddenLayers: signal<ReadonlySet<string>>(new Set()),
    activeLayer: signal<string | null>(null),
    listShowEmpty: signal<boolean>(false),
    listIncompleteOnly: signal<boolean>(false),
    focusAnnotation: signal<string | null>(null),
    collapsedTree: signal<ReadonlySet<string>>(new Set()),
  };
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
 * Vai até a anotação (backlinks, "Ir para o alvo", vinculadas): mostra a camada
 * dela, seleciona a marcação e pede ao painel para rolar até ela.
 */
export function goToAnnotation(ui: EditorUi, annotation: AnnotationLocation): void {
  showLayer(ui, annotation.layerId);
  ui.selection.value = { kind: 'marking', id: annotation.markingId };
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
