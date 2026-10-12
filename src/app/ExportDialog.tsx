import { useState } from 'preact/hooks';
import { t } from '../i18n';
import {
  canSaveWithPicker,
  canShareFile,
  downloadFile,
  saveFileWithPicker,
  shareFile,
} from '../storage/share';
import { Dialog } from '../ui/Dialog';
import { formatBytes } from '../ui/formatBytes';
import { Icon } from '../ui/icons';
import { markExported } from './controller';
import { Button } from '../ui/controls';
import { SHORTCUT_LABELS } from './shortcuts';

/**
 * O botão Exportar da barra principal, achado pelo atalho (não muda com o idioma). O zip é
 * gerado com ele desabilitado, então o foco já tinha saído dele quando o diálogo abriu.
 */
const exportButton = () =>
  document.querySelector<HTMLElement>(
    `.main-bar button[aria-keyshortcuts="${SHORTCUT_LABELS.export}"]`,
  );

/**
 * O zip é gerado antes de abrir este diálogo; o toque em "Baixar" ou "Compartilhar" é um
 * gesto novo do usuário, que o navegador exige para `showSaveFilePicker` e `navigator.share`.
 *
 * O projeto só conta como exportado quando o arquivo saiu: pelo "Salvar como"
 * (`showSaveFilePicker`), depois de gravado; pelo compartilhamento, quando a promessa
 * resolve. Cancelar não muda nada. Sem o seletor, o `<a download>` não diz se a pessoa
 * salvou: o aviso sai no clique e o texto do diálogo avisa para exportar de novo se ela
 * cancelar.
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
      returnFocus={exportButton}
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
      {!picker && <p class="muted">{t('export.downloadHint')}</p>}
      {error && (
        <p class="notice notice-error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
