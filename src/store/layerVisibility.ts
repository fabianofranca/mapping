import type { ReadonlySignal } from '@preact/signals';
import type { Perspective } from '../model';
import type { PerspectiveActions } from './perspectiveActions';
import { showAllLayers, showLayer, toggleLayerVisible, type EditorUi } from './ui';

// Visibility of the layers known to the perspective (stage #956, CE2; decision 11 of #659):
// with a perspective open, the hidden layers are its own and change in the project (one undo entry
// per change); in the Main one, the interface's (`ui.hiddenLayers`). It is the only write
// path for components: Layers, List, panels and navigation go through here.

export interface LayerVisibility {
  /** The hidden layers in view: the open perspective's, or the interface's. */
  hidden(): ReadonlySet<string>;
  toggle(layerId: string): void;
  /** Removes the layer from the hidden ones; a layer already visible writes nothing. */
  show(layerId: string): void;
  showAll(): void;
}

export interface LayerVisibilityDeps {
  readonly ui: EditorUi;
  readonly perspective: ReadonlySignal<Perspective | null>;
  readonly perspectiveActions: Pick<PerspectiveActions, 'setPerspectiveHiddenLayers'>;
}

export function createLayerVisibility(deps: LayerVisibilityDeps): LayerVisibility {
  const { ui, perspective, perspectiveActions } = deps;
  const setHidden = (open: Perspective, next: Set<string>): void => {
    perspectiveActions.setPerspectiveHiddenLayers(open.id, [...next]);
  };
  return {
    hidden() {
      const open = perspective.value;
      return open ? new Set(open.hiddenLayers) : ui.hiddenLayers.value;
    },
    toggle(layerId) {
      const open = perspective.peek();
      if (!open) return toggleLayerVisible(ui, layerId);
      const next = new Set(open.hiddenLayers);
      if (!next.delete(layerId)) next.add(layerId);
      setHidden(open, next);
    },
    show(layerId) {
      const open = perspective.peek();
      if (!open) return showLayer(ui, layerId);
      if (!open.hiddenLayers.includes(layerId)) return;
      setHidden(open, new Set(open.hiddenLayers.filter((id) => id !== layerId)));
    },
    showAll() {
      const open = perspective.peek();
      if (!open) return showAllLayers(ui);
      if (open.hiddenLayers.length > 0) setHidden(open, new Set());
    },
  };
}
