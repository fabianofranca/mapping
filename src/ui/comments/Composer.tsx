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
import { Button } from '../controls';
import { useEditor } from '../EditorContext';
import { CitationEditor } from './CitationEditor';
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

/** A âncora da conversa a que o compositor pertence (rascunho novo ou resposta). */
function useReplyAnchor(target: ComposerTarget): ThreadAnchor | null {
  const { session } = useEditor();
  const threads = session.threads.list.value;
  if (target.kind === 'new') return target.anchor;
  return threads.find((th) => th.id === target.threadId)?.anchor ?? null;
}

/**
 * Compositor das conversas: o editor de citações (várias linhas, chips e `@`) com o rascunho
 * guardado por conversa (`ui.threadDrafts`, sempre uma string markdown), Enter quebra a linha e
 * Ctrl/Cmd+Enter envia. Sem identidade mostra o aviso com o atalho para as Configurações; só
 * leitura e revisão não mostram nada.
 */
export function Composer({ target, onOpenSettings, autoFocus, onCancel }: ComposerProps) {
  const { ui, session, review } = useEditor();
  const { writable, me } = useThreadAccess();
  const key =
    target.kind === 'new' ? newDraftKey(target.anchor) : replyDraftKey(target.threadId);
  const text = draftOf(ui, key);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLDivElement>(null);
  // A âncora do `@` ("aqui"): a do rascunho ou a da conversa que se responde.
  const replyAnchor = useReplyAnchor(target);
  useEffect(() => {
    if (autoFocus) field.current?.focus();
  }, [autoFocus, key]);

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
    // O rascunho de agora (o atalho pode chegar antes da renderização da última tecla).
    const draft = draftOf(ui, key);
    if (busy || draft.trim() === '' || !project) return;
    setBusy(true);
    setError(null);
    const actions = session.threadActions;
    const result =
      target.kind === 'new'
        ? await actions.open(target.anchor, draft)
        : await actions.post(target.threadId, draft);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setDraft(ui, key, '');
    if (target.kind === 'new') selectThread(ui, project, result.thread);
  };

  return (
    <div class="thread-composer">
      <CitationEditor
        label={t(target.kind === 'new' ? 'thread.composeAs' : 'thread.replyAs', {
          name: me.name,
        })}
        editorRef={field}
        value={text}
        anchor={replyAnchor}
        excludeThreadId={target.kind === 'reply' ? target.threadId : undefined}
        onInput={(value) => {
          setError(null);
          setDraft(ui, key, value);
        }}
        onSubmit={() => void send()}
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
