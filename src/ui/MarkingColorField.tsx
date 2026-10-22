import type { ComponentChildren } from 'preact';
import { useId } from 'preact/hooks';
import { t } from '../i18n';
import { MARKING_COLOR_PALETTE, type ProjectContainer } from '../model';
import { useEditor } from './EditorContext';

interface MarkingColorFieldProps {
  readonly image: ProjectContainer;
  readonly disabled: boolean;
  /** Peça depois do rótulo (o marcador da revisão). */
  readonly mark?: ComponentChildren;
  /** Linha embaixo do campo (a nota da mudança, na revisão). */
  readonly below?: ComponentChildren;
}

/**
 * Cor da borda das marcações da imagem: grupo de rádios (a neutra do tema e a paleta,
 * alvos de 24px) e uma cor livre.
 */
export function MarkingColorField({
  image,
  disabled,
  mark,
  below,
}: MarkingColorFieldProps) {
  const { actions } = useEditor();
  const labelId = useId();
  const current = image.markingColor?.toUpperCase() ?? null;
  const set = (color: string | null) => actions.setContainerMarkingColor(image.id, color);
  const name = `marking-color-${image.id}`;
  return (
    <div class="color-field">
      {mark ? (
        <div class="color-field-head">
          <span id={labelId} class="props-label">
            {t('image.markingColor')}
          </span>
          {mark}
        </div>
      ) : (
        <span id={labelId} class="props-label">
          {t('image.markingColor')}
        </span>
      )}
      <div class="swatches" role="radiogroup" aria-labelledby={labelId}>
        <label class="swatch-theme">
          <input
            type="radio"
            name={name}
            checked={current === null}
            disabled={disabled}
            onChange={() => set(null)}
          />
          <span>{t('image.markingColorTheme')}</span>
        </label>
        {MARKING_COLOR_PALETTE.map((color) => (
          <label key={color} class="swatch" title={color}>
            <input
              type="radio"
              name={name}
              aria-label={color}
              checked={current === color}
              disabled={disabled}
              onChange={() => set(color)}
            />
            <span class="swatch-color" style={{ background: color }} aria-hidden="true" />
          </label>
        ))}
        <label class="swatch-custom">
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
      {below}
    </div>
  );
}
