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
  /** Texto curto da aba (janela inferior e faixa do celular); sem ele vale o título. */
  tab?(): string;
}

const META: Readonly<Record<ToolWindowId, ToolWindowMeta>> = {
  tree: { icon: 'tree', title: () => t('panel.treeTitle'), tab: () => t('panel.tree') },
  layers: { icon: 'layers', title: () => t('layer.title') },
  details: { icon: 'panelRight', title: () => t('panel.details') },
  list: { icon: 'list', title: () => t('list.title'), tab: () => t('view.list') },
  incomplete: { icon: 'checklist', title: () => t('incomplete.title') },
  diagnostics: { icon: 'diagnostics', title: () => t('diagnostics.title') },
  proposals: { icon: 'proposal', title: () => t('proposals.title') },
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

/**
 * Contador da aba de uma janela: as pendências na Incompletas e as propostas novas
 * (informativo, em destaque) na Propostas.
 */
export function windowBadge(
  id: ToolWindowId,
  incomplete: number,
  freshProposals: number,
): { readonly badge?: string; readonly badgeTone?: 'muted' | 'info' } {
  if (id === 'incomplete' && incomplete > 0) return { badge: String(incomplete) };
  if (id === 'proposals' && freshProposals > 0) {
    return { badge: String(freshProposals), badgeTone: 'info' };
  }
  return {};
}
