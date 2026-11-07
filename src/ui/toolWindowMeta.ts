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
  /** Texto curto da aba (janela inferior); sem ele vale o título. */
  tab?(): string;
}

const META: Readonly<Record<ToolWindowId, ToolWindowMeta>> = {
  tree: { icon: 'tree', title: () => t('panel.treeTitle'), tab: () => t('panel.tree') },
  layers: { icon: 'layers', title: () => t('layer.title') },
  details: { icon: 'panelRight', title: () => t('panel.details') },
  list: { icon: 'list', title: () => t('list.title'), tab: () => t('view.list') },
  incomplete: { icon: 'checklist', title: () => t('incomplete.title') },
  notices: { icon: 'warning', title: () => t('notices.title') },
  diagnostics: { icon: 'diagnostics', title: () => t('diagnostics.title') },
  proposals: { icon: 'proposal', title: () => t('proposals.title') },
  comments: { icon: 'chat', title: () => t('comments.title') },
  catalog: { icon: 'library', title: () => t('catalog.window.title') },
};

export function toolWindowMeta(id: ToolWindowId): ToolWindowMeta {
  return META[id];
}

/** Atalho oficial da janela (Ctrl+Shift+N, Ctrl também no macOS). */
export function toolWindowShortcut(id: ToolWindowId): string {
  return `Ctrl+Shift+${WINDOW_NUMBER[id]}`;
}

/**
 * Janelas de um lado, na ordem de `TOOL_WINDOWS` (a das abas: Avisos fica entre Incompletas e
 * Diagnóstico, embora o atalho dela seja o 8).
 */
export function windowsOfSide(side: ToolWindowSide): readonly ToolWindowId[] {
  return TOOL_WINDOWS.filter((id) => WINDOW_SIDE[id] === side);
}

/**
 * Contador da aba de uma janela: as pendências na Incompletas, as anotações com aviso na
 * Avisos e as propostas novas (informativo, em destaque) na Propostas.
 */
export function windowBadge(
  id: ToolWindowId,
  incomplete: number,
  freshProposals: number,
  noticed = 0,
  openThreads = 0,
): { readonly badge?: string; readonly badgeTone?: 'muted' | 'info' } {
  if (id === 'incomplete' && incomplete > 0) return { badge: String(incomplete) };
  if (id === 'notices' && noticed > 0) return { badge: String(noticed) };
  if (id === 'comments' && openThreads > 0) return { badge: String(openThreads) };
  if (id === 'proposals' && freshProposals > 0) {
    return { badge: String(freshProposals), badgeTone: 'info' };
  }
  return {};
}
