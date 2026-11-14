import { t } from '../i18n';
import { diagnosticsUnseen } from '../store/diagnostics';
import type { ToolWindowId } from '../store/toolWindows';
import { Tabs, type TabItem } from './controls';
import { useEditor } from './EditorContext';
import { openToolWindow } from './toolWindowLayout';
import { toolWindowMeta, windowBadge, windowsOfSide } from './toolWindowMeta';

/**
 * Tabs of the bottom window (List | Incomplete | Warnings | Diagnostics | Proposals | Comments). Incomplete shows
 * how many annotations are pending; Warnings, how many have a specialization warning; Diagnostics, the new-error alert dot (B4).
 */
export function BottomTabs({ active }: { readonly active: ToolWindowId }) {
  const { derived, review } = useEditor();
  const incomplete = derived.incompleteCount.value;
  const noticed = derived.noticedCount.value;
  const fresh = review.derived.freshIds.value.length;
  const openThreads = derived.threads.openCount.value;
  const unseen = diagnosticsUnseen.value;

  const tabs: TabItem<ToolWindowId>[] = windowsOfSide('bottom').map((id) => {
    const meta = toolWindowMeta(id);
    const title = meta.title();
    // Comments is the sixth tab: only the icon and the count, so the six fit in the canvas's
    // minimum width; the accessible name and the tooltip remain the title.
    const iconOnly = id === 'comments';
    return {
      id,
      label: iconOnly ? '' : (meta.tab?.() ?? title),
      ...(iconOnly ? { icon: meta.icon, ariaLabel: title } : {}),
      title,
      ...windowBadge(id, incomplete, fresh, noticed, openThreads),
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
