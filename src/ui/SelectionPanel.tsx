import { useId, useState } from 'preact/hooks';
import { SHORTCUT_LABELS } from '../app/shortcuts';
import { t } from '../i18n';
import {
  canDeleteImage,
  type BlankImageChanges,
  type Project,
  type ProjectImage,
} from '../model';
import { blankErrorMessage, imageLabel } from './labels';
import { parseBlankColor, parseBlankSide } from './blankScreen';
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
  const widthId = useId();
  const heightId = useId();
  const backgroundId = useId();
  const [blankError, setBlankError] = useState<string | null>(null);
  if (!image) {
    return (
      <div class="details-empty">
        <Icon name="info" />
        <strong>{t('panel.nothingSelected')}</strong>
        <span>{t('panel.empty')}</span>
      </div>
    );
  }
  const blank = image.file === null;
  const missing = !blank && display?.status === 'missing';
  const broken = missing || (!blank && display?.status === 'error');
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
        sub={blank ? dimensions : `${image.file} · ${dimensions}`}
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
              ? t('image.missingMessage', { file: image.file ?? '' })
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
              placeholder={image.file ?? t('image.blankUntitled')}
              disabled={disabled}
              onCommit={(text) => {
                // Espaços em volta não contam como alteração.
                if ((text.trim() || null) === image.name) return false;
                return actions.renameImage(image.id, text).ok;
              }}
            />
          </Property>
          {image.file !== null && (
            <Property
              label={t('image.file')}
              mark={ext?.mark(image.id, 'file')}
              below={ext?.below(image.id, 'file')}
            >
              <code class="props-text">{image.file}</code>
            </Property>
          )}
          {image.file === null && image.background !== null ? (
            <BlankFields
              image={image}
              ids={{ width: widthId, height: heightId, background: backgroundId }}
              disabled={disabled}
              error={blankError}
              setError={setBlankError}
            />
          ) : (
            <Property label={t('image.size')}>
              <span class="props-text">{dimensions}</span>
            </Property>
          )}
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
        {!broken && !blank && (
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

interface BlankFieldsProps {
  readonly image: ProjectImage;
  readonly ids: {
    readonly width: string;
    readonly height: string;
    readonly background: string;
  };
  readonly disabled: boolean;
  readonly error: string | null;
  readonly setError: (message: string | null) => void;
}

/** Largura, altura e cor de fundo da tela em branco (no lugar de Arquivo e Tamanho). */
function BlankFields({ image, ids, disabled, error, setError }: BlankFieldsProps) {
  const { actions } = useEditor();
  const commit = (patch: BlankImageChanges): boolean => {
    const result = actions.setBlankImage(image.id, patch);
    setError(result.ok ? null : blankErrorMessage(result.error));
    return result.ok;
  };
  const side = (key: 'width' | 'height', id: string) => (
    <Property label={t(key === 'width' ? 'blank.width' : 'blank.height')} for={id}>
      <TextField
        id={id}
        size="sm"
        type="number"
        inputMode="numeric"
        min={1}
        step={1}
        value={String(image[key])}
        disabled={disabled}
        onCommit={(text) => {
          const value = parseBlankSide(text);
          if (value === image[key]) return false;
          if (value === null) {
            setError(blankErrorMessage('invalid-dimensions'));
            return false;
          }
          return commit(key === 'width' ? { width: value } : { height: value });
        }}
      />
    </Property>
  );
  return (
    <>
      {side('width', ids.width)}
      {side('height', ids.height)}
      <Property label={t('blank.background')} for={ids.background} error={error}>
        <TextField
          id={ids.background}
          size="sm"
          value={image.background ?? ''}
          disabled={disabled}
          onCommit={(text) => {
            const color = parseBlankColor(text);
            if (color === image.background) return false;
            if (color === null) {
              setError(blankErrorMessage('invalid-color'));
              return false;
            }
            return commit({ background: color });
          }}
        />
      </Property>
    </>
  );
}
