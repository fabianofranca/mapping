import { t } from '../i18n';
import type { ProjectImage } from '../model';
import { imageLabel } from './labels';
import type { DisplayImage } from '../store/displayImages';
import { useEditor } from './EditorContext';
import { Button, TextField } from './controls';
import { IdField } from './IdField';
import { MarkingColorField } from './MarkingColorField';

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
  const { actions } = useEditor();
  if (!image) return <p class="muted">{t('panel.empty')}</p>;
  const missing = display?.status === 'missing';
  const broken = missing || display?.status === 'error';
  const disabled = readOnly || busy;

  return (
    <div class="panel-details">
      <div class="panel-heading">
        <strong class="panel-name">{imageLabel(image)}</strong>
        <span class="muted">
          {image.file} ·{' '}
          {t('image.dimensions', { width: image.width, height: image.height })}
        </span>
      </div>
      <TextField
        label={t('image.name')}
        value={image.name ?? ''}
        placeholder={image.file}
        disabled={disabled}
        onCommit={(text) => {
          // Espaços em volta não contam como alteração.
          if ((text.trim() || null) === image.name) return false;
          return actions.renameImage(image.id, text).ok;
        }}
      />
      <MarkingColorField image={image} disabled={disabled} />
      <IdField id={image.id} />
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
        <Button
          variant={broken ? 'primary' : 'default'}
          disabled={disabled}
          onClick={() => onReplace(image)}
        >
          {t(missing ? 'image.repoint' : 'image.replace')}
        </Button>
        <Button variant="danger" disabled={disabled} onClick={() => onDelete(image)}>
          {t('image.delete')}
        </Button>
      </div>
    </div>
  );
}
