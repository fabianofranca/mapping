import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { t } from '../../i18n';
import { deleteImpact, type Thread } from '../../model';
import { identity } from '../../store/identity';
import { Button } from '../controls';
import { Dialog } from '../Dialog';
import { useEditor } from '../EditorContext';
import { impactText } from './deleteText';

// Apagar uma conversa (decisão 23): direto quando todas as mensagens são da própria pessoa; com o
// diálogo (alerta) quando há mensagem de outra pessoa ou de agente. Quem usa põe `dialog` na
// árvore e chama `request(thread)` do menu ⋯. O foco volta ao controle que abriu (o `Dialog`).

export interface DeleteThread {
  readonly request: (thread: Thread) => void;
  readonly dialog: ComponentChildren;
}

export function useDeleteThread(): DeleteThread {
  const { session } = useEditor();
  const [pending, setPending] = useState<Thread | null>(null);
  const run = (thread: Thread) => void session.threadActions.remove(thread.id);
  const request = (thread: Thread) => {
    if (deleteImpact(thread, identity.peek()).direct) run(thread);
    else setPending(thread);
  };
  const close = () => setPending(null);
  const dialog = pending && (
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
              run(pending);
              close();
            }}
          >
            {t('comments.delete.confirm')}
          </Button>
        </>
      }
    >
      <p>{impactText(deleteImpact(pending, identity.peek()))}</p>
      <p>{t('comments.delete.noUndo')}</p>
    </Dialog>
  );
  return { request, dialog };
}
