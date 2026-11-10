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

// O painel "Mostrar no canvas" do modo visualização (decisão 8 da etapa #656): o botão que o
// reabre e o popover com os elementos, as camadas com desenho e os dois atalhos do rodapé.

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

/** O conteúdo do painel; ao montar, leva o foco ao primeiro controle. */
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

/** O botão Visualizar (a barra o liga a este ref), para devolver o foco a ele. */
export const viewModeButton: { current: HTMLButtonElement | null } = { current: null };

/** O "⋯" da barra do canvas (`OverflowMenu`), que guarda o lugar dos botões escondidos. */
export const overflowButton: { current: HTMLButtonElement | null } = { current: null };

/** A barra estreita escondeu os controles de vista (`.canvas-bar-low` sem caixa)? */
function lowHidden(): boolean {
  const low = viewModeButton.current?.closest('[data-canvas-low]');
  return !!low && getComputedStyle(low).display === 'none';
}

/** Para onde o foco volta: o Visualizar, ou o "⋯" se a barra estreita escondeu o botão. */
export function viewControl(): HTMLElement | null {
  return lowHidden() ? overflowButton.current : viewModeButton.current;
}

/**
 * O botão "Mostrar no canvas" (só habilitado no modo) e o painel que ele abre. O painel que
 * abriu ao ligar o modo devolve o foco, ao fechar, ao Visualizar (o botão ativo na barra); o
 * aberto pelo próprio "Mostrar no canvas" devolve a ele.
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
        // Só o botão cede na barra estreita; o painel (fora do grupo) segue renderizável.
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
