import { t } from '../i18n';
import {
  TOOL_WINDOWS,
  WINDOW_NUMBER,
  WINDOW_SIDE,
  type ToolWindowId,
  type ToolWindowSide,
} from '../store/toolWindows';
import type { IconName } from './icons';

// Ícone, título e atalho de cada janela de ferramenta. O título vem de `t()` na hora
// de desenhar (nunca guardado), para acompanhar a troca de idioma.

export interface ToolWindowMeta {
  readonly icon: IconName;
  /** Título mostrado no cabeçalho e no botão da faixa. */
  title(): string;
}

const META: Readonly<Record<ToolWindowId, ToolWindowMeta>> = {
  tree: { icon: 'tree', title: () => t('panel.treeTitle') },
  layers: { icon: 'layers', title: () => t('layer.title') },
  details: { icon: 'panelRight', title: () => t('panel.details') },
  list: { icon: 'list', title: () => t('list.title') },
};

export function toolWindowMeta(id: ToolWindowId): ToolWindowMeta {
  return META[id];
}

/** Atalho oficial da janela (decisão 1 da seção 5: Ctrl+Shift+N, Ctrl também no macOS). */
export function toolWindowShortcut(id: ToolWindowId): string {
  return `Ctrl+Shift+${WINDOW_NUMBER[id]}`;
}

/** Janelas de um lado, na ordem dos atalhos. */
export function windowsOfSide(side: ToolWindowSide): readonly ToolWindowId[] {
  return TOOL_WINDOWS.filter((id) => WINDOW_SIDE[id] === side).sort(
    (a, b) => WINDOW_NUMBER[a] - WINDOW_NUMBER[b],
  );
}
