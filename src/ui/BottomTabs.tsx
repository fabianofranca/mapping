import { t } from '../i18n';
import { diagnosticsUnseen } from '../store/diagnostics';
import type { ToolWindowId } from '../store/toolWindows';
import { Tabs, type TabItem } from './controls';
import { useEditor } from './EditorContext';
import { openToolWindow } from './toolWindowLayout';
import { toolWindowMeta, windowBadge, windowsOfSide } from './toolWindowMeta';

/**
 * Tabs of the bottom window (List | Incomplete | Notices | Diagnostics | Proposals | Comments).
 * Incomplete shows how many annotations are pending; Notices, how many have an accessibility
 * warning; Diagnostics, the new-error alert dot (B4).
 */
export function BottomTabs({ active }: { readonly active: ToolWindowId }) {
  const { derived, review } = useEditor();
  const incomplete = derived.incompleteCount.value;
  const audited = derived.auditedCount.value;
  const fresh = review.derived.freshIds.value.length;
  const openThreads = derived.threads.openCount.value;
  const unseen = diagnosticsUnseen.value;

  const tabs: TabItem<ToolWindowId>[] = windowsOfSide('bottom').map((id) => {
    const meta = toolWindowMeta(id);
    const title = meta.title();
    // Comments is the sixth tab: only the icon and the count at every width. Notices and
    // Diagnostics are compact: label when the bottom window is wide, icon only in a narrow one
    // (`@container bottom-window`), so the six fit in the canvas's minimum width with a gap.
    const iconOnly = id === 'comments';
    const compact = id === 'notices' || id === 'diagnostics';
    return {
      id,
      label: iconOnly ? '' : (meta.tab?.() ?? title),
      ...(iconOnly ? { icon: meta.icon, ariaLabel: title } : {}),
      ...(compact ? { icon: meta.icon, compact } : {}),
      title,
      ...windowBadge(id, incomplete, fresh, audited, openThreads),
      alert: id === 'diagnostics' && unseen,
    };
  });

  return (
    <Tabs
      label={t('window.bottomTabs')}
      value={active}
      onChange={openToolWindow}
      tabs={tabs}
    />
  );
}
