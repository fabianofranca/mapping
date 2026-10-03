import { t } from '../i18n';
import { MARKING_COLOR_PALETTE, type ProjectImage } from '../model';
import { useEditor } from './EditorContext';

interface MarkingColorFieldProps {
  readonly image: ProjectImage;
  readonly disabled: boolean;
}

/** Cor da borda das marcações da imagem: paleta, cor livre ou a neutra do tema. */
export function MarkingColorField({ image, disabled }: MarkingColorFieldProps) {
  const { actions } = useEditor();
  const current = image.markingColor;
  const set = (color: string | null) => actions.setImageMarkingColor(image.id, color);
  return (
    <div class="field">
      <span>{t('image.markingColor')}</span>
      <div class="palette" role="group" aria-label={t('image.markingColor')}>
        <button
          type="button"
          class={current === null ? 'button button-primary' : 'button'}
          aria-pressed={current === null}
          disabled={disabled}
          onClick={() => set(null)}
        >
          {t('image.markingColorTheme')}
        </button>
        {MARKING_COLOR_PALETTE.map((color) => (
          <button
            key={color}
            type="button"
            class="palette-color"
            style={{ background: color }}
            aria-label={color}
            aria-pressed={current?.toUpperCase() === color}
            disabled={disabled}
            onClick={() => set(color)}
          />
        ))}
        <label class="palette-custom">
          <span>{t('layer.customColor')}</span>
          <input
            type="color"
            value={(current ?? MARKING_COLOR_PALETTE[0] ?? '#FFFFFF').toLowerCase()}
            disabled={disabled}
            onChange={(e) => set(e.currentTarget.value)}
          />
        </label>
      </div>
      <small class="muted">{t('image.markingColorHint')}</small>
    </div>
  );
}
