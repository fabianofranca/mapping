import { useState } from 'preact/hooks';
import { t } from '../i18n';
import { canShareFile, downloadFile, shareFile } from '../storage/share';
import { Dialog } from '../ui/Dialog';
import { markExported } from './controller';

/**
 * O zip é gerado antes de abrir este diálogo; o toque em "Compartilhar" é um
 * gesto novo do usuário, que o navegador exige para `navigator.share`.
 */
export function ExportDialog({
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
