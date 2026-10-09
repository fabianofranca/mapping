import { t } from '../i18n';
import { diagnosticsUnseen } from '../store/diagnostics';
import { showToolWindow, type ToolWindowId } from '../store/toolWindows';
import { Tabs, type TabItem } from './controls';
import { useEditor } from './EditorContext';
import { toolWindowMeta, windowBadge, windowsOfSide } from './toolWindowMeta';

/**
 * Abas da janela inferior (Lista | Incompletas | Diagnóstico). Incompletas mostra
 * quantas anotações estão pendentes; Diagnóstico, o ponto de alerta de erro novo (B4).
 */
export function BottomTabs({ active }: { readonly active: ToolWindowId }) {
  const { derived, review } = useEditor();
  const incomplete = derived.incompleteCount.value;
  const fresh = review.derived.freshIds.value.length;
  const unseen = diagnosticsUnseen.value;

  const tabs: TabItem<ToolWindowId>[] = windowsOfSide('bottom').map((id) => {
    const meta = toolWindowMeta(id);
    const title = meta.title();
    return {
      id,
      label: meta.tab?.() ?? title,
      title,
      ...windowBadge(id, incomplete, fresh),
      alert: id === 'diagnostics' && unseen,
    };
  });

  return (
    <Tabs
      label={t('window.bottomTabs')}
      value={active}
      onChange={showToolWindow}
      tabs={tabs}
    />
  );
}
