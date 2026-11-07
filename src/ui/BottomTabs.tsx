import { t } from '../i18n';
import { diagnosticsUnseen } from '../store/diagnostics';
import type { ToolWindowId } from '../store/toolWindows';
import { Tabs, type TabItem } from './controls';
import { useEditor } from './EditorContext';
import { openToolWindow } from './toolWindowLayout';
import { toolWindowMeta, windowBadge, windowsOfSide } from './toolWindowMeta';

/**
 * Abas da janela inferior (Lista | Incompletas | Avisos | Diagnóstico | Propostas | Comentários). Incompletas mostra
 * quantas anotações estão pendentes; Avisos, quantas têm aviso da especialização; Diagnóstico, o ponto de alerta de erro novo (B4).
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
    // Comentários é a sexta aba: só o ícone e a contagem, para as seis caberem na largura
    // mínima do canvas; o nome acessível e a dica continuam sendo o título.
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
