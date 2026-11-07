import { useState } from 'preact/hooks';
import { t } from '../../i18n';
import { bulkDeleteCandidates, type Thread } from '../../model';
import { Button, Choice, TextField } from '../controls';
import { Dialog } from '../Dialog';
import { useEditor } from '../EditorContext';
import { actionErrorText } from './commentsText';
import { impactText } from './deleteText';

// Apagar conversas em lote (decisão 23): "Só as resolvidas" (marcado) e, opcional, "Com a última
// mensagem antes de". Os critérios são só esses dois; o filtro da janela não entra. O foco volta
// ao ⋯ que abriu (o `Dialog`).

interface BulkDeleteDialogProps {
  readonly threads: readonly Thread[];
  readonly onClose: () => void;
}

export function BulkDeleteDialog({ threads, onClose }: BulkDeleteDialogProps) {
  const { session } = useEditor();
  const [onlyResolved, setOnlyResolved] = useState(true);
  const [before, setBefore] = useState('');
  const [error, setError] = useState<string | null>(null);
  const found = bulkDeleteCandidates(threads, {
    onlyResolved,
    ...(before === '' ? {} : { lastMessageBefore: before }),
  });
  const count = found.threads.length;

  const confirm = async () => {
    const out = await session.threadActions.removeMany(found.threads.map((th) => th.id));
    if (!out.ok) return setError(actionErrorText(out.error));
    if (out.failed.length > 0) {
      return setError(t('comments.error.partial', { count: out.failed.length }));
    }
    onClose();
  };

  return (
    <Dialog
      title={t('comments.bulk.title')}
      alert
      onCancel={onClose}
      actions={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="danger" disabled={count === 0} onClick={() => void confirm()}>
            {t('comments.delete.confirm')}
          </Button>
        </>
      }
    >
      <Choice
        checked={onlyResolved}
        label={t('comments.bulk.onlyResolved')}
        onChange={(e) => setOnlyResolved(e.currentTarget.checked)}
      />
      <TextField
        type="date"
        label={t('comments.bulk.before')}
        value={before}
        onInput={(e) => setBefore(e.currentTarget.value)}
      />
      {count === 0 ? (
        <p>{t('comments.bulk.none')}</p>
      ) : (
        <>
          <p>
            {count === 1
              ? t('comments.bulk.threadsOne')
              : t('comments.bulk.threads', { count })}
          </p>
          <p>{impactText(found)}</p>
          <p>{t('comments.delete.noUndo')}</p>
        </>
      )}
      {error !== null && <p role="alert">{error}</p>}
    </Dialog>
  );
}
