import { t } from '../i18n';
import type { ProjectImage } from '../model';
import type { DisplayImage } from '../store/displayImages';

interface SelectionPanelProps {
  readonly image: ProjectImage | null;
  readonly display: DisplayImage<unknown> | undefined;
  readonly readOnly: boolean;
  readonly busy: boolean;
  readonly onReplace: (image: ProjectImage) => void;
  readonly onDelete: (image: ProjectImage) => void;
}

/** Detalhes do item selecionado (por enquanto, imagens). */
export function SelectionPanel({
  image,
  display,
  readOnly,
  busy,
  onReplace,
  onDelete,
}: SelectionPanelProps) {
  if (!image) return <p class="muted">{t('panel.empty')}</p>;
  const missing = display?.status === 'missing';
  const broken = missing || display?.status === 'error';
  const disabled = readOnly || busy;

  return (
    <div class="panel-details">
      <div class="panel-heading">
        <strong class="panel-name">{image.file}</strong>
        <span class="muted">
          {t('image.dimensions', { width: image.width, height: image.height })}
        </span>
      </div>
      {broken && (
        <p class="notice" role="status">
          <strong>{t(missing ? 'image.missingTitle' : 'canvas.imageError')}</strong>
          <br />
          {missing
            ? t('image.missingMessage', { file: image.file })
            : t('image.errorMessage')}
        </p>
      )}
      <div class="row">
        <button
          type="button"
          class={broken ? 'button button-primary' : 'button'}
          disabled={disabled}
          onClick={() => onReplace(image)}
        >
          {t(missing ? 'image.repoint' : 'image.replace')}
        </button>
        <button
          type="button"
          class="button button-danger"
          disabled={disabled}
          onClick={() => onDelete(image)}
        >
          {t('image.delete')}
        </button>
      </div>
    </div>
  );
}
