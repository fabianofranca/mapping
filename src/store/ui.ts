import { signal, type Signal } from '@preact/signals';
import type { Layer, Marking, Project, ProjectImage } from '../model';

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
}

export function createEditorUi(): EditorUi {
  return {
    selection: signal<Selection>(null),
    mode: signal<EditorMode>('navigate'),
    hiddenLayers: signal<ReadonlySet<string>>(new Set()),
    activeLayer: signal<string | null>(null),
    listShowEmpty: signal<boolean>(false),
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
