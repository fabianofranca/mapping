import { useState } from 'preact/hooks';
import { t } from '../i18n';
import { canShareFile, downloadFile, shareFile } from '../storage/share';
import { Dialog } from '../ui/Dialog';
import { formatBytes } from '../ui/formatBytes';
import { Icon } from '../ui/icons';
import { markExported } from './controller';
import { Button } from '../ui/controls';

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
      {error && (
        <p class="notice notice-error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
