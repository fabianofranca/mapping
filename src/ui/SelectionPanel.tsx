import { useId } from 'preact/hooks';
import { SHORTCUT_LABELS } from '../app/shortcuts';
import { t } from '../i18n';
import { canDeleteImage, type Project, type ProjectImage } from '../model';
import { imageLabel } from './labels';
import type { DisplayImage } from '../store/displayImages';
import { useEditor } from './EditorContext';
import { Button, IconButton, TextField } from './controls';
import { CopyButtons } from './CopyActions';
import { useDetailsExtension } from './DetailsExtension';
import { DetailsIdentity } from './DetailsIdentity';
import { Section } from './DetailsSection';
import { Icon } from './icons';
import { MarkingColorField } from './MarkingColorField';
import { Property, PropertyGrid } from './PropertyGrid';

interface SelectionPanelProps {
  readonly image: ProjectImage | null;
  /**
   * Projeto de onde a imagem veio (as marcações dela, a trava). Padrão: o projeto à vista
   * (`review.derived.shownProject`, que fora da revisão é o confirmado).
   */
  readonly project?: Project | null;
  readonly display: DisplayImage<unknown> | undefined;
  readonly readOnly: boolean;
  readonly busy: boolean;
  readonly onReplace: (image: ProjectImage) => void;
  readonly onDelete: (image: ProjectImage) => void;
}

/** Detalhes da imagem selecionada (ou o estado vazio, sem seleção). */
export function SelectionPanel({
  image,
  project: given,
  display,
  readOnly,
  busy,
  onReplace,
  onDelete,
}: SelectionPanelProps) {
  const { actions, review } = useEditor();
  const shown = review.derived.shownProject.value;
  const project = given === undefined ? shown : given;
  const ext = useDetailsExtension();
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
  // Trava: a da imagem e a das marcações dela ("trancar todas" vira "destrancar todas").
  const own = project?.markings.filter((m) => m.imageId === image.id) ?? [];
  const allMarkingsLocked = own.length > 0 && own.every((m) => m.locked);
  const deletable = project ? canDeleteImage(project, image.id) : true;
  const identity = ext?.identity(image.id) ?? null;

  return (
    <div class="panel-details">
      <DetailsIdentity
        icon="image"
        name={imageLabel(image)}
        sub={`${image.file} · ${dimensions}`}
        id={image.id}
        flags={identity?.flags}
        struck={identity?.struck}
        actions={
          <>
            <CopyButtons target={{ kind: 'i', id: image.id }} />
            <IconButton
              icon={image.locked ? 'lock' : 'unlock'}
              label={t('lock.imageLock')}
              tooltip={t(image.locked ? 'lock.imageUnlock' : 'lock.imageLock')}
              shortcut={SHORTCUT_LABELS.toggleLock}
              pressed={image.locked}
              disabled={readOnly}
              onClick={() => actions.setImageLocked(image.id, !image.locked)}
            />
          </>
        }
      />
      {ext?.header(image.id)}
      {image.locked && (
        <p class="notice notice-info" role="status">
          {t('lock.imageNotice')}
        </p>
      )}
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
          <Property
            label={t('image.name')}
            for={nameId}
            mark={ext?.mark(image.id, 'name')}
            below={ext?.below(image.id, 'name')}
          >
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
          <Property
            label={t('image.file')}
            mark={ext?.mark(image.id, 'file')}
            below={ext?.below(image.id, 'file')}
          >
            <code class="props-text">{image.file}</code>
          </Property>
          <Property label={t('image.size')}>
            <span class="props-text">{dimensions}</span>
          </Property>
        </PropertyGrid>
        <MarkingColorField
          image={image}
          disabled={disabled}
          mark={ext?.mark(image.id, 'markingColor')}
          below={ext?.below(image.id, 'markingColor')}
        />
      </Section>
      {ext?.others(image.id)}
      {own.length > 0 && (
        <div class="row">
          <Button
            disabled={readOnly}
            onClick={() => actions.setImageMarkingsLocked(image.id, !allMarkingsLocked)}
          >
            {t(allMarkingsLocked ? 'lock.unlockAll' : 'lock.lockAll')}
          </Button>
        </div>
      )}
      <div class="row">
        {!broken && (
          <Button disabled={disabled} onClick={() => onReplace(image)}>
            {t('image.replace')}
          </Button>
        )}
        <Button
          variant="danger"
          disabled={disabled || !deletable}
          title={deletable ? undefined : t('lock.deleteBlocked')}
          onClick={() => onDelete(image)}
        >
          {t('image.delete')}
        </Button>
      </div>
    </div>
  );
}
