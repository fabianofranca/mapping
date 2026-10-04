import { t } from '../i18n';
import { Tabs } from './controls';

export type PanelTab = 'details' | 'tree';

interface PanelTabsProps {
  readonly tab: PanelTab;
  readonly onChange: (tab: PanelTab) => void;
}

/** Abas do painel: Detalhes | Árvore de marcações. */
export function PanelTabs({ tab, onChange }: PanelTabsProps) {
  return (
    <Tabs
      label={t('panel.tabsLabel')}
      value={tab}
      onChange={onChange}
      tabs={[
        { id: 'details', label: t('panel.details') },
        { id: 'tree', label: t('panel.tree'), title: t('panel.treeTitle') },
      ]}
    />
  );
}
