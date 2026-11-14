import { useLayoutEffect, useRef } from 'preact/hooks';
import { t } from '../i18n';
import {
  setViewShow,
  showEverything,
  onlyScreens,
  toggleViewDrawingLayer,
} from '../store/viewMode';
import { Button, Choice, IconButton } from './controls';
import { useEditor } from './EditorContext';
import { FOCUSABLE } from './focus';
import { Popover } from './Popover';

// The "Show on canvas" panel of view mode (decision 8 of stage #656): the button that
// reopens it and the popover with the elements, the layers with drawing and the two footer shortcuts.

type Flag = 'containers' | 'images' | 'outline' | 'names' | 'arrows';

const ELEMENTS: readonly {
  readonly flag: Flag;
  readonly label:
    | 'view.containers'
    | 'view.images'
    | 'view.outline'
    | 'view.names'
    | 'view.panelArrows';
  readonly hint?: 'view.panelArrowsHint';
}[] = [
  { flag: 'containers', label: 'view.containers' },
  { flag: 'images', label: 'view.images' },
  { flag: 'outline', label: 'view.outline' },
  { flag: 'names', label: 'view.names' },
  { flag: 'arrows', label: 'view.panelArrows', hint: 'view.panelArrowsHint' },
];

/** The panel content; on mount, takes focus to the first control. */
function PanelBody() {
  const { ui, derived } = useEditor();
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    root.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  }, []);
  const show = ui.viewShow.value;
  const layers = derived.drawingLayers.value;
  return (
    <div class="view-panel" ref={root}>
      <h2 class="view-panel-title">{t('view.panelTitle')}</h2>
      <p class="muted view-panel-hint">{t('view.panelHint')}</p>
      <div class="view-panel-group" role="group" aria-label={t('view.groupElements')}>
        <h3 class="view-panel-heading">{t('view.groupElements')}</h3>
        {ELEMENTS.map(({ flag, label, hint }) => (
          <Choice
            key={flag}
            label={t(label)}
            hint={hint ? t(hint) : undefined}
            checked={show[flag]}
            onChange={(e) => setViewShow(ui, { [flag]: e.currentTarget.checked })}
          />
        ))}
      </div>
      {layers.length > 0 && (
        <div class="view-panel-group" role="group" aria-label={t('view.groupLayers')}>
          <h3 class="view-panel-heading">{t('view.groupLayers')}</h3>
          {layers.map((layer) => (
            <Choice
              key={layer.id}
              label={
                <span class="view-panel-layer">
                  <span
                    class="layer-dot"
                    aria-hidden="true"
                    style={{ '--layer-color': layer.color }}
                  />
                  {layer.name}
                </span>
              }
              checked={!show.hiddenDrawingLayers.has(layer.id)}
              onChange={() => toggleViewDrawingLayer(ui, layer.id)}
            />
          ))}
        </div>
      )}
      <div class="view-panel-footer">
        <Button size="sm" onClick={() => showEverything(ui)}>
          {t('view.showAll')}
        </Button>
        <Button size="sm" onClick={() => onlyScreens(ui)}>
          {t('view.onlyScreens')}
        </Button>
      </div>
    </div>
  );
}

/** The View button (the bar binds it to this ref), to give focus back to it. */
export const viewModeButton: { current: HTMLButtonElement | null } = { current: null };

/** The "⋯" of the canvas bar (`OverflowMenu`), which holds the place of hidden buttons. */
export const overflowButton: { current: HTMLButtonElement | null } = { current: null };

/** Did the narrow bar hide the view controls (`.canvas-bar-low` with no box)? */
function lowHidden(): boolean {
  const low = viewModeButton.current?.closest('[data-canvas-low]');
  return !!low && getComputedStyle(low).display === 'none';
}

/** Where focus returns to: View, or the "⋯" if the narrow bar hid the button. */
export function viewControl(): HTMLElement | null {
  return lowHidden() ? overflowButton.current : viewModeButton.current;
}

/**
  * The "Show on canvas" button (only enabled in the mode) and the panel it opens. The panel that
  * opened on turning the mode on gives focus back, on closing, to View (the active button in the bar); the
  * one opened by "Show on canvas" itself gives it back to that.
 */
export function ViewModePanel() {
  const { ui } = useEditor();
  const on = ui.viewMode.value;
  const fromTrigger = useRef(false);
  if (!on) fromTrigger.current = false;
  const onOpenChange = (next: boolean) => {
    ui.viewPanel.value = next;
    if (next) return;
    if (!fromTrigger.current) {
      viewControl()?.focus();
    }
    fromTrigger.current = false;
  };
  return (
    <Popover
      class="view-panel-host"
      align="end"
      label={t('view.panelTitle')}
      panelClass="view-panel-popover"
      anchor={() => (lowHidden() ? overflowButton.current : null)}
      open={on && ui.viewPanel.value}
      onOpenChange={onOpenChange}
      trigger={({ open, toggle }) => (
        // Only the button yields in the narrow bar; the panel (outside the group) stays renderable.
        <span class="canvas-bar-low">
          <IconButton
            icon="layers"
            label={t('view.panelOpen')}
            aria-haspopup="dialog"
            aria-expanded={open}
            disabled={!on}
            onClick={() => {
              fromTrigger.current = true;
              toggle();
            }}
          />
        </span>
      )}
    >
      <PanelBody />
    </Popover>
  );
}
