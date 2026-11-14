import { useState } from 'preact/hooks';
import { t } from '../i18n';
import {
  canSaveWithPicker,
  canShareFile,
  downloadFile,
  saveFileWithPicker,
  shareFile,
} from '../storage/share';
import { Dialog, type FocusReturn } from '../ui/Dialog';
import { formatBytes } from '../ui/formatBytes';
import { Icon } from '../ui/icons';
import { markExported } from './controller';
import { Button } from '../ui/controls';

/**
 * The zip is generated before this dialog opens; the tap on "Download" or "Share" is a
 * new user gesture, which the browser requires for `showSaveFilePicker` and `navigator.share`.
 *
 * The project only counts as exported when the file went out: through "Save as"
 * (`showSaveFilePicker`), after it is written; through sharing, when the promise
 * resolves. Cancelling changes nothing. Without the picker, the `<a download>` does not say whether the person
 * saved: the notice goes out on the click and the dialog text warns to export again if they
 * cancel.
 */
export function ExportDialog({
  file,
  saved = true,
  onDone,
  returnFocus,
}: {
  readonly file: File;
  /**
   * `false` with the write in error: the zip carries the latest changes, which the project's
   * storage does not have yet (`collectFiles().saved`).
   */
  readonly saved?: boolean;
  readonly onDone: () => void;
  /**
   * The bar's Export button (`buttonRef`): the zip is generated with it disabled, so the
   * focus may have already left it when the dialog opened.
   */
  readonly returnFocus?: FocusReturn;
}) {
  const [error, setError] = useState<string | null>(null);
  const shareable = canShareFile(file);
  const picker = canSaveWithPicker();

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
    setError(null);
    if (picker) {
      const result = await saveFileWithPicker(file);
      if (result === 'cancelled') return;
      if (result === 'failed') {
        setError(t('export.saveFailed'));
        return;
      }
    } else {
      downloadFile(file);
    }
    await markExported();
    onDone();
  };

  return (
    <Dialog
      title={t('export.title')}
      onCancel={onDone}
      returnFocus={returnFocus}
      actions={
        <>
          <Button onClick={onDone}>{t('common.cancel')}</Button>
          <Button
            variant={shareable ? 'default' : 'primary'}
            onClick={() => void onDownload()}
          >
            {t('export.download')}
          </Button>
          {shareable && (
            <Button variant="primary" onClick={() => void onShare()}>
              {t('export.share')}
            </Button>
          )}
        </>
      }
    >
      <p>{t('export.ready', { file: file.name })}</p>
      <div class="file-card">
        <span class="file-card-icon" aria-hidden="true">
          <Icon name="file" />
        </span>
        <span class="file-card-info">
          <strong class="file-card-name">{file.name}</strong>
          <span class="muted">
            {t('export.fileMeta', { size: formatBytes(file.size) })}
          </span>
        </span>
      </div>
      {!saved && (
        <p class="notice" role="status">
          {t('export.unsaved')}
        </p>
      )}
      {!picker && <p class="muted">{t('export.downloadHint')}</p>}
      {error && (
        <p class="notice notice-error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
