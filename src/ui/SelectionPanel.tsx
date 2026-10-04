import { useId } from 'preact/hooks';
import { t } from '../i18n';
import type { ProjectImage } from '../model';
import { imageLabel } from './labels';
import type { DisplayImage } from '../store/displayImages';
import { useEditor } from './EditorContext';
import { Button, TextField } from './controls';
import { DetailsIdentity } from './DetailsIdentity';
import { Section } from './DetailsSection';
import { Icon } from './icons';
import { MarkingColorField } from './MarkingColorField';
import { Property, PropertyGrid } from './PropertyGrid';

interface SelectionPanelProps {
  readonly image: ProjectImage | null;
  readonly display: DisplayImage<unknown> | undefined;
  readonly readOnly: boolean;
  readonly busy: boolean;
  readonly onReplace: (image: ProjectImage) => void;
  readonly onDelete: (image: ProjectImage) => void;
}

/** Detalhes da imagem selecionada (ou o estado vazio, sem seleção). */
export function SelectionPanel({
  image,
  display,
  readOnly,
  busy,
  onReplace,
  onDelete,
}: SelectionPanelProps) {
  const { actions } = useEditor();
  const nameId = useId();
  if (!image) {
    return (
      <div class="details-empty">
        <Icon name="info" />
        <strong>{t('panel.nothingSelected')}</strong>
        <span>{t('panel.empty')}</span>
      </div>
    );
  }
  const missing = display?.status === 'missing';
  const broken = missing || display?.status === 'error';
  const disabled = readOnly || busy;
  const dimensions = t('image.dimensions', { width: image.width, height: image.height });

  return (
    <div class="panel-details">
      <DetailsIdentity
        icon="image"
        name={imageLabel(image)}
        sub={`${image.file} · ${dimensions}`}
        id={image.id}
      />
      {broken && (
        <div class="notice" role="status">
          <strong>{t(missing ? 'image.missingTitle' : 'canvas.imageError')}</strong>
          <p>
            {missing
              ? t('image.missingMessage', { file: image.file })
              : t('image.errorMessage')}
          </p>
          <Button variant="primary" disabled={disabled} onClick={() => onReplace(image)}>
            {t(missing ? 'image.repoint' : 'image.replace')}
          </Button>
        </div>
      )}
      <Section
        section={{ kind: 'image' }}
        title={t('image.section')}
        summary={dimensions}
      >
        <PropertyGrid>
          <Property label={t('image.name')} for={nameId}>
            <TextField
              id={nameId}
              size="sm"
              value={image.name ?? ''}
              placeholder={image.file}
              disabled={disabled}
              onCommit={(text) => {
                // Espaços em volta não contam como alteração.
                if ((text.trim() || null) === image.name) return false;
                return actions.renameImage(image.id, text).ok;
              }}
            />
          </Property>
          <Property label={t('image.file')}>
            <code class="props-text">{image.file}</code>
          </Property>
          <Property label={t('image.size')}>
            <span class="props-text">{dimensions}</span>
          </Property>
        </PropertyGrid>
        <MarkingColorField image={image} disabled={disabled} />
      </Section>
      <div class="row">
        {!broken && (
          <Button disabled={disabled} onClick={() => onReplace(image)}>
            {t('image.replace')}
          </Button>
        )}
        <Button variant="danger" disabled={disabled} onClick={() => onDelete(image)}>
          {t('image.delete')}
        </Button>
      </div>
    </div>
  );
}
