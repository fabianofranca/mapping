import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../../i18n';
import type { ThreadAnchor } from '../../model';
import {
  draftOf,
  newDraftKey,
  replyDraftKey,
  selectThread,
  setDraft,
} from '../../store/threadUi';
import { Button, TextArea } from '../controls';
import { useEditor } from '../EditorContext';
import { threadErrorText, useThreadAccess } from './threadAccess';

export type ComposerTarget =
  | { readonly kind: 'new'; readonly anchor: ThreadAnchor }
  | { readonly kind: 'reply'; readonly threadId: string };

interface ComposerProps {
  readonly target: ComposerTarget;
  /** Abre as Configurações (o aviso sem identidade leva até lá). */
  readonly onOpenSettings?: () => void;
  /** Foca o campo ao montar (a conversa nova pedida pelo botão Nova). */
  readonly autoFocus?: boolean;
  /** Descarta o rascunho de conversa nova ainda não enviada. */
  readonly onCancel?: () => void;
}

const isSend = (e: KeyboardEvent) => e.key === 'Enter' && (e.ctrlKey || e.metaKey);

/**
 * Compositor das conversas: um campo de várias linhas com o rascunho guardado por conversa
 * (`ui.threadDrafts`), Enter quebra a linha e Ctrl/Cmd+Enter envia. Sem identidade mostra o
 * aviso com o atalho para as Configurações; só leitura e revisão não mostram nada.
 */
export function Composer({ target, onOpenSettings, autoFocus, onCancel }: ComposerProps) {
  const { ui, session, review } = useEditor();
  const { writable, me } = useThreadAccess();
  const key =
    target.kind === 'new' ? newDraftKey(target.anchor) : replyDraftKey(target.threadId);
  const text = draftOf(ui, key);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (autoFocus) field.current?.focus();
  }, [autoFocus]);

  if (!writable) return null;
  if (me === null) {
    return (
      <div class="thread-no-identity">
        <p>{t('thread.noIdentity')}</p>
        {onOpenSettings && (
          <Button onClick={onOpenSettings}>{t('thread.openSettings')}</Button>
        )}
      </div>
    );
  }

  const send = async () => {
    const project = review.derived.shownProject.peek();
    if (busy || text.trim() === '' || !project) return;
    setBusy(true);
    setError(null);
    const actions = session.threadActions;
    const result =
      target.kind === 'new'
        ? await actions.open(target.anchor, text)
        : await actions.post(target.threadId, text);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setDraft(ui, key, '');
    if (target.kind === 'new') selectThread(ui, project, result.thread);
  };

  return (
    <div class="thread-composer">
      <TextArea
        label={t(target.kind === 'new' ? 'thread.composeAs' : 'thread.replyAs', {
          name: me.name,
        })}
        textAreaRef={field}
        value={text}
        onInput={(value) => {
          setError(null);
          setDraft(ui, key, value);
        }}
        onKeyDown={(e) => {
          if (!isSend(e)) return;
          e.preventDefault();
          void send();
        }}
      />
      {error !== null && (
        <p class="field-error" role="alert">
          {threadErrorText(error)}
        </p>
      )}
      <div class="thread-composer-actions">
        {onCancel && <Button onClick={onCancel}>{t('common.cancel')}</Button>}
        <Button
          variant="primary"
          title={t('thread.sendHint')}
          disabled={busy || text.trim() === ''}
          onClick={() => void send()}
        >
          {t('thread.send')}
        </Button>
      </div>
    </div>
  );
}
