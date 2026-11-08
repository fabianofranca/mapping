import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { t } from '../../i18n';
import { deleteImpact, type Thread } from '../../model';
import { identity } from '../../store/identity';
import { Button } from '../controls';
import { Dialog } from '../Dialog';
import { useEditor } from '../EditorContext';
import { actionErrorText } from './commentsText';
import { impactText } from './deleteText';

// Apagar uma conversa (decisão 23): direto quando todas as mensagens são da própria pessoa; com o
// diálogo (alerta) quando há mensagem de outra pessoa ou de agente. Quem usa põe `dialog` na
// árvore e chama `request(thread)` do menu ⋯. O foco volta ao controle que abriu (o `Dialog`).
// Se a gravação falha (#959), o erro aparece: no diálogo, que fica aberto, ou, no caminho direto,
// como aviso no próprio `dialog`. O diálogo só fecha no sucesso.

export interface DeleteThread {
  readonly request: (thread: Thread) => void;
  readonly dialog: ComponentChildren;
}

export function useDeleteThread(): DeleteThread {
  const { session } = useEditor();
  const [pending, setPending] = useState<Thread | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Apaga e devolve se deu certo; o erro, se houve, fica em `error`. */
  const run = async (thread: Thread): Promise<boolean> => {
    const result = await session.threadActions.remove(thread.id);
    setError(result.ok ? null : actionErrorText(result.error));
    return result.ok;
  };
  const request = (thread: Thread) => {
    setError(null);
    if (deleteImpact(thread, identity.peek()).direct) void run(thread);
    else setPending(thread);
  };
  const close = () => {
    setPending(null);
    setError(null);
  };
  const alert = error !== null && (
    <p class="field-error" role="alert">
      {error}
    </p>
  );
  const dialog = pending ? (
    <Dialog
      title={t('comments.delete.title')}
      alert
      onCancel={close}
      actions={
        <>
          <Button onClick={close}>{t('common.cancel')}</Button>
          <Button
            variant="danger"
            onClick={() => {
              void run(pending).then((ok) => {
                if (ok) close();
              });
            }}
          >
            {t('comments.delete.confirm')}
          </Button>
        </>
      }
    >
      <p>{impactText(deleteImpact(pending, identity.peek()))}</p>
      <p>{t('comments.delete.noUndo')}</p>
      {alert}
    </Dialog>
  ) : (
    alert
  );
  return { request, dialog };
}
