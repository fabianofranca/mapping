import { t } from '../i18n';
import { Tabs } from '../ui/controls';
import { AddImagesButton, FitButton, HistoryButtons, ModeButtons } from './EditorTools';

export type EditorView = 'canvas' | 'list';

interface EditorBottomBarProps {
  readonly view: EditorView;
  readonly onViewChange: (view: EditorView) => void;
  readonly busy: boolean;
  readonly onAdd: () => void;
}

/** Celular: abas Canvas | Lista e a barra de ferramentas de baixo. */
export function EditorBottomBar({
  view,
  onViewChange,
  busy,
  onAdd,
}: EditorBottomBarProps) {
  return (
    <>
      <div class="viewtabs">
        <Tabs
          label={t('view.tabsLabel')}
          value={view}
          onChange={onViewChange}
          tabs={[
            { id: 'canvas', label: t('view.canvas') },
            { id: 'list', label: t('view.list') },
          ]}
        />
      </div>
      <nav class="bottombar">
        <ModeButtons />
        <AddImagesButton desktop={false} busy={busy} onAdd={onAdd} />
        <HistoryButtons />
        <FitButton />
      </nav>
    </>
  );
}
