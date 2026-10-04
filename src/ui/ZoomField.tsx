import { t } from '../i18n';
import { useEditor } from './EditorContext';

// Campo de zoom (proposta P4): mostra o zoom atual e, ao clicar, volta a 100%.

/** Zoom em porcentagem inteira (0,42 → 42). */
export function zoomPercent(scale: number): number {
  return Math.round(scale * 100);
}

export function ZoomField({ class: extra }: { readonly class?: string }) {
  const { view, canvas } = useEditor();
  const percent = zoomPercent(view.viewport.value.scale);
  return (
    <button
      type="button"
      class={extra ? `zoom-field ${extra}` : 'zoom-field'}
      aria-label={t('zoom.reset', { percent })}
      onClick={() => canvas.current?.zoomTo(1)}
    >
      {t('zoom.value', { percent })}
    </button>
  );
}
