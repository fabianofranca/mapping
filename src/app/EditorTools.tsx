import { useEffect, useRef } from 'preact/hooks';
import { t } from '../i18n';
import { useEditor } from '../ui/EditorContext';
import { viewModeButton } from '../ui/ViewModePanel';
import { IconButton, Segmented } from '../ui/controls';
import { armComment, cancelComment } from '../store/threadUi';
import { selectedItems, setViewMode, showToast } from '../store/ui';
import { proposalErrorMessage } from '../ui/labels';
import { REVIEW_ERROR_MS } from '../ui/review/useReviewCommands';
import type { ProposalActionError } from '../store/proposalActions';
import { SHORTCUT_LABELS } from './shortcuts';

// Botões de ferramenta da barra principal e da barra dos breadcrumbs.

/** Navegar | Desenhar. */
export function ModeButtons() {
  const { store, ui } = useEditor();
  return (
    <Segmented
      items={[
        { id: 'navigate', label: t('editor.modeNavigate'), icon: 'pan' },
        {
          id: 'draw',
          label: t('editor.modeDraw'),
          icon: 'draw',
          disabled: store.locked.value || ui.viewMode.value,
        },
      ]}
      value={ui.mode.value}
      onSelect={(mode) => (ui.mode.value = mode)}
    />
  );
}

export function AddImagesButton({
  busy,
  onAdd,
}: {
  readonly busy: boolean;
  readonly onAdd: () => void;
}) {
  const { store } = useEditor();
  return (
    <IconButton
      icon="addImage"
      label={t('editor.addImages')}
      text={t('editor.addImages')}
      disabled={store.locked.value || busy}
      onClick={onAdd}
    />
  );
}

/** Novo container: ao lado de "Adicionar imagens". */
export function AddContainerButton({ onAdd }: { readonly onAdd: () => void }) {
  const { store } = useEditor();
  return (
    <IconButton
      icon="container"
      label={t('container.new')}
      text={t('container.new')}
      disabled={store.locked.value}
      onClick={onAdd}
    />
  );
}

/**
 * Comentar (decisão 25), ao lado de Novo container: liga os pinos e arma um clique no canvas (num
 * item, a conversa fica no item; num lugar vazio, num ponto). Desabilitado no somente leitura, na
 * revisão e no modo visualização.
 */
export function CommentButton() {
  const { store, ui, review } = useEditor();
  const armed = ui.commentArm.value !== null;
  const blocked =
    store.locked.value || review.proposalId.value !== null || ui.viewMode.value;
  return (
    <IconButton
      icon="chatAdd"
      label={t('comments.add')}
      text={t('comments.add')}
      tooltip={blocked ? t('comments.addDisabled') : t('comments.addTip')}
      pressed={armed}
      disabled={blocked}
      onClick={() => (armed ? cancelComment(ui) : armComment(ui))}
    />
  );
}

/**
 * Conversas (decisão 24), na barra do canvas ao lado do Visualizar: liga e desliga os pinos. Desligado,
 * mostra a contagem das conversas que aguardam humano e um ponto se há mensagem não lida.
 */
export function PinsButton() {
  const { ui, derived } = useEditor();
  const on = ui.commentPins.value;
  const waiting = derived.threads.awaitingHumanCount.value;
  const unread = derived.threads.unreadIds.value.size > 0;
  const showCount = !on && waiting > 0;
  return (
    <IconButton
      icon="chat"
      label={t('comments.pins')}
      tooltip={
        showCount
          ? `${t('comments.pinsTip')} · ${t('comments.pinsAwaiting', { count: String(waiting) })}`
          : t('comments.pinsTip')
      }
      pressed={on}
      {...(showCount ? { badge: String(waiting) } : {})}
      alert={!on && unread}
      onClick={() => (ui.commentPins.value = !ui.commentPins.peek())}
    />
  );
}

/** Desfazer e refazer. */
export function HistoryButtons() {
  const { store, ui } = useEditor();
  // A gravação da proposta falhou ao desfazer/refazer uma aplicação: o passo foi revertido.
  const failure = store.linkFailure.value;
  useEffect(() => {
    if (failure) {
      showToast(
        ui,
        proposalErrorMessage(failure.error as ProposalActionError),
        REVIEW_ERROR_MS,
      );
    }
  }, [failure, ui]);
  return (
    <>
      <IconButton
        icon="undo"
        label={t('editor.undo')}
        shortcut={SHORTCUT_LABELS.undo}
        disabled={!store.canUndo.value}
        onClick={() => store.undo()}
      />
      <IconButton
        icon="redo"
        label={t('editor.redo')}
        shortcut={SHORTCUT_LABELS.redo}
        disabled={!store.canRedo.value}
        onClick={() => store.redo()}
      />
    </>
  );
}

/** Enquadrar tudo: na barra dos breadcrumbs. */
export function FitButton() {
  const { canvas } = useEditor();
  return (
    <IconButton
      icon="fit"
      label={t('editor.fitAll')}
      onClick={() => canvas.current?.fitAll()}
    />
  );
}

/** Enquadrar seleção: zoom e centro nos itens selecionados; desabilitado sem seleção. */
export function FitSelectionButton() {
  const { canvas, ui } = useEditor();
  const empty = selectedItems(ui).length === 0;
  return (
    <IconButton
      icon="fit-selection"
      label={t('editor.fitSelection')}
      shortcut={SHORTCUT_LABELS.fitSelection}
      disabled={empty || ui.viewMode.value}
      onClick={() => canvas.current?.fitSelection()}
    />
  );
}

/** Visualizar: liga o modo visualização, o canvas só para ver (Alt+H). */
export function ViewModeButton() {
  const { ui } = useEditor();
  const button = viewModeButton;
  const on = ui.viewMode.value;
  const wasOn = useRef(on);
  // Ao sair do modo o botão "Mostrar no canvas" fica desabilitado e o painel some: se o foco
  // estava neles (ou se perdeu no body), vai ao Visualizar.
  useEffect(() => {
    if (wasOn.current && !on) {
      const active = document.activeElement;
      const lost =
        !active ||
        active === document.body ||
        (active instanceof HTMLButtonElement && active.disabled);
      if (lost) button.current?.focus();
    }
    wasOn.current = on;
  }, [on, button]);
  return (
    <IconButton
      icon="eye"
      label={t('view.viewMode')}
      shortcut={SHORTCUT_LABELS.viewMode}
      tooltip={t('view.viewModeHint')}
      tooltipSuppressed={ui.viewPanel.value}
      pressed={on}
      buttonRef={button}
      onClick={() => setViewMode(ui, !ui.viewMode.peek())}
    />
  );
}
