import { t } from '../i18n';
import {
  TOOL_WINDOWS,
  WINDOW_NUMBER,
  WINDOW_SIDE,
  type ToolWindowId,
  type ToolWindowSide,
} from '../store/toolWindows';
import type { IconName } from './icons';

// Icon, title and shortcut of each tool window. The title comes from `t()` at draw time
// (never stored), to follow a language switch.

export interface ToolWindowMeta {
  readonly icon: IconName;
  /** Title shown in the header and in the strip button. */
  title(): string;
  /** Short text of the tab (bottom window); without it the title applies. */
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

/** The window's official shortcut (Ctrl+Shift+N, Ctrl also on macOS). */
export function toolWindowShortcut(id: ToolWindowId): string {
  return `Ctrl+Shift+${WINDOW_NUMBER[id]}`;
}

/**
 * Windows of one side, in the order of `TOOL_WINDOWS` (that of the tabs: Notices sits between
 * Incomplete and Diagnostics, although its shortcut is 8).
 */
export function windowsOfSide(side: ToolWindowSide): readonly ToolWindowId[] {
  return TOOL_WINDOWS.filter((id) => WINDOW_SIDE[id] === side);
}

/**
 * Counter of a window's tab: the pending items in Incomplete, the annotations with a notice in
 * Notices, the new proposals (informational, highlighted) in Proposals and the open threads in
 * Comments.
 */
export function windowBadge(
  id: ToolWindowId,
  incomplete: number,
  freshProposals: number,
  noticed = 0,
  openThreads = 0,
): { readonly badge?: string; readonly badgeTone?: 'muted' | 'info' } {
  const counts: Partial<Record<ToolWindowId, number>> = {
    incomplete,
    notices: noticed,
    comments: openThreads,
  };
  const count = counts[id] ?? 0;
  if (count > 0) return { badge: String(count) };
  if (id === 'proposals' && freshProposals > 0) {
    return { badge: String(freshProposals), badgeTone: 'info' };
  }
  return {};
}
