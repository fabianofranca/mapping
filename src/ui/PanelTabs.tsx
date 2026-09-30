import { t } from '../i18n';

export type PanelTab = 'details' | 'tree';

const TABS: readonly { id: PanelTab; label: 'panel.details' | 'panel.tree' }[] = [
  { id: 'details', label: 'panel.details' },
  { id: 'tree', label: 'panel.tree' },
];

interface PanelTabsProps {
  readonly tab: PanelTab;
  readonly onChange: (tab: PanelTab) => void;
}

/** Abas do painel: Detalhes | Árvore de marcações. */
export function PanelTabs({ tab, onChange }: PanelTabsProps) {
  return (
    <div class="tabs" role="tablist" aria-label={t('panel.tabsLabel')}>
      {TABS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          role="tab"
          class="tab"
          aria-selected={tab === id}
          title={id === 'tree' ? t('panel.treeTitle') : undefined}
          onClick={() => onChange(id)}
        >
          {t(label)}
        </button>
      ))}
    </div>
  );
}
