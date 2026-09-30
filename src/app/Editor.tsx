import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import type { ProjectImage } from '../model';
import { canShareFile, downloadFile, shareFile } from '../storage/share';
import { Dialog } from '../ui/Dialog';
import { ImageThumb } from '../ui/ImageThumb';
import { SaveStatus } from '../ui/SaveStatus';
import { buildExport, closeProject, markExported, type OpenProject } from './controller';

/**
 * Editor provisório da Fase 2: lista as imagens do projeto e permite
 * adicionar mais. O canvas chega na Fase 3.
 */
export function Editor({ open }: { readonly open: OpenProject }) {
  const { session } = open;
  const project = session.store.project.value;
  const readOnly = session.store.readOnly.value;
  const imageInput = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [exportFile, setExportFile] = useState<File | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  if (!project) return null;

  const onImagesChosen = async (input: HTMLInputElement) => {
    const files = [...(input.files ?? [])];
    input.value = '';
    if (files.length === 0) return;
    setMessage(null);
    const failed: string[] = [];
    // Uma chamada por arquivo para mostrar o progresso.
    for (const [index, file] of files.entries()) {
      setProgress(t('editor.importing', { current: index + 1, total: files.length }));
      const result = await session.addImages([file]);
      failed.push(...result.failed);
    }
    setProgress(null);
    if (failed.length > 0)
      setMessage(t('editor.importFailed', { names: failed.join(', ') }));
  };

  const onExport = async () => {
    setMessage(null);
    setProgress(t('editor.exporting'));
    const result = await buildExport();
    setProgress(null);
    if (result.ok) setExportFile(result.value);
    else setMessage(t(`error.${result.error}`));
  };

  const onClose = async () => {
    await session.flush();
    if (session.saveStatus.value === 'error') setConfirmClose(true);
    else await closeProject();
  };

  return (
    <div class="editor">
      <header class="topbar editor-bar">
        <button type="button" class="button bar-close" onClick={() => void onClose()}>
          {t('common.close')}
        </button>
        <h1 class="project-title">{project.project.name}</h1>
        <SaveStatus open={open} />
        <button
          type="button"
          class="button bar-export"
          disabled={progress !== null}
          onClick={() => void onExport()}
        >
          {t('editor.export')}
        </button>
      </header>

      <main class="editor-content">
        {readOnly && <p class="notice">{t('editor.readOnlyNotice')}</p>}
        <p class="muted">{t('editor.provisional')}</p>
        {message && (
          <p class="notice notice-error" role="alert">
            {message}
          </p>
        )}

        <div class="row">
          <button
            type="button"
            class="button button-primary"
            disabled={readOnly || progress !== null}
            onClick={() => imageInput.current?.click()}
          >
            {t('editor.addImages')}
          </button>
          {progress && <span aria-live="polite">{progress}</span>}
          <input
            ref={imageInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => void onImagesChosen(e.currentTarget)}
          />
        </div>

        <h2>{t('editor.images')}</h2>
        {project.images.length === 0 ? (
          <p class="muted">{t('editor.noImages')}</p>
        ) : (
          <ul class="image-list">
            {project.images.map((image) => (
              <ImageRow key={image.id} open={open} image={image} />
            ))}
          </ul>
        )}
      </main>

      {exportFile && (
        <ExportDialog file={exportFile} onDone={() => setExportFile(null)} />
      )}

      {confirmClose && (
        <Dialog
          title={t('editor.closeUnsavedTitle')}
          onCancel={() => setConfirmClose(false)}
          actions={
            <>
              <button type="button" class="button" onClick={() => setConfirmClose(false)}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                class="button button-danger"
                onClick={() => void closeProject()}
              >
                {t('editor.closeAnyway')}
              </button>
            </>
          }
        >
          <p>{t('editor.closeUnsavedMessage')}</p>
        </Dialog>
      )}
    </div>
  );
}

function ImageRow({
  open,
  image,
}: {
  readonly open: OpenProject;
  readonly image: ProjectImage;
}) {
  const { display } = open;
  useEffect(() => display.ensure(image.file), [display, image.file]);
  const state = display.images.value.get(image.file);

  return (
    <li class="image-item">
      {state?.status === 'ready' ? (
        <ImageThumb bitmap={state.bitmap} />
      ) : (
        <div class="thumb thumb-placeholder" aria-hidden="true" />
      )}
      <div class="image-info">
        <strong>{image.file}</strong>
        <span class="muted">
          {t('editor.dimensions', { width: image.width, height: image.height })}
        </span>
        {state?.status === 'missing' && (
          <span class="status status-error">{t('editor.imageMissing')}</span>
        )}
        {state?.status === 'error' && (
          <span class="status status-error">{t('editor.imageError')}</span>
        )}
      </div>
    </li>
  );
}

/**
 * O zip é gerado antes de abrir este diálogo; o toque em "Compartilhar" é um
 * gesto novo do usuário, que o navegador exige para `navigator.share`.
 */
function ExportDialog({
  file,
  onDone,
}: {
  readonly file: File;
  readonly onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const shareable = canShareFile(file);

  const onShare = async () => {
    const result = await shareFile(file, file.name);
    if (result === 'shared') {
      await markExported();
      onDone();
    } else if (result === 'failed') {
      setError(t('export.shareFailed'));
    }
  };

  const onDownload = async () => {
    downloadFile(file);
    await markExported();
    onDone();
  };

  return (
    <Dialog
      title={t('export.title')}
      onCancel={onDone}
      actions={
        <>
          <button type="button" class="button" onClick={onDone}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            class={shareable ? 'button' : 'button button-primary'}
            onClick={() => void onDownload()}
          >
            {t('export.download')}
          </button>
          {shareable && (
            <button
              type="button"
              class="button button-primary"
              onClick={() => void onShare()}
            >
              {t('export.share')}
            </button>
          )}
        </>
      }
    >
      <p>{t('export.ready', { file: file.name })}</p>
      {error && (
        <p class="notice notice-error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
