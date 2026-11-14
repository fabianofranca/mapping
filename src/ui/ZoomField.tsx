import { t } from '../i18n';
import { useEditor } from './EditorContext';

// Zoom field (proposal P4): shows the current zoom and, on click, goes back to 100%.

/** Zoom as a whole percentage (0.42 → 42). */
export function zoomPercent(scale: number): number {
  return Math.round(scale * 100);
}

export function ZoomField({ class: extra }: { readonly class?: string }) {
  const { view, canvas } = useEditor();
  const percent = zoomPercent(view.viewport.value.scale);
  return (
    /* Exception to Button: zoom field (shows the value and goes back to 100%) (docs/DESIGN-SYSTEM.md, "Standalone buttons") */
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
