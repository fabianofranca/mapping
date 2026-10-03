import { t } from '../i18n';
import { AddImagesButton, HistoryButtons, ModeButtons } from './EditorTools';

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
        <div class="tabs" role="tablist" aria-label={t('view.tabsLabel')}>
          {(['canvas', 'list'] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              class="tab"
              aria-selected={view === id}
              onClick={() => onViewChange(id)}
            >
              {t(id === 'canvas' ? 'view.canvas' : 'view.list')}
            </button>
          ))}
        </div>
      </div>
      <nav class="bottombar">
        <ModeButtons />
        <AddImagesButton desktop={false} busy={busy} onAdd={onAdd} />
        <HistoryButtons />
      </nav>
    </>
  );
}
