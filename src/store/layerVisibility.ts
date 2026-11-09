import type { ReadonlySignal } from '@preact/signals';
import type { Perspective } from '../model';
import type { PerspectiveActions } from './perspectiveActions';
import { showAllLayers, showLayer, toggleLayerVisible, type EditorUi } from './ui';

// Visibilidade das camadas que conhece a perspectiva (etapa #956, CE2; decisão 11 da #659):
// com uma perspectiva aberta, as camadas escondidas são as dela e mudam no projeto (uma entrada
// de desfazer por mudança); na Principal, as da interface (`ui.hiddenLayers`). É o único
// caminho de escrita dos componentes: Camadas, Lista, painéis e a navegação passam por aqui.

export interface LayerVisibility {
  /** As camadas escondidas à vista: as da perspectiva aberta, ou as da interface. */
  hidden(): ReadonlySet<string>;
  toggle(layerId: string): void;
  /** Tira a camada das escondidas; camada que já está visível não grava nada. */
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
