import { useComputed } from '@preact/signals';
import { t } from '../i18n';
import { SCHEMA_VERSION } from '../model';
import { resolveSelection } from '../store/ui';
import { CHANNEL } from '../utils/channel';
import { useEditor } from './EditorContext';
import { Icon } from './icons';
import { imageLabel, markingLabel } from './labels';
import { ZoomField } from './ZoomField';
import { showAndFocusToolWindow } from './toolWindowLayout';
import { awaitingText } from './review/ProposalRow';

// Barra de status do desktop (B8; no celular, o resumo `StatusSummary`): salvamento, destino e "não exportado" à esquerda;
// seleção, cursor, zoom, schema e canal à direita. O cursor vem do canvas num signal
// de UI próprio, atualizado no máximo uma vez por quadro (HANDOFF, seção 6).

function SaveItem() {
  const { session } = useEditor();
  if (session.store.readOnly.value) {
    return <span class="status-item">{t('status.readOnly')}</span>;
  }
  const status = session.saveStatus.value;
  if (status === 'error') {
    return (
      <span class="status-item status-item-error" role="alert">
        {t('status.error')}
        <button type="button" class="link" onClick={() => void session.flush()}>
          {t('status.retry')}
        </button>
      </span>
    );
  }
  if (status === 'saving') {
    return (
      <span class="status-item" aria-live="polite">
        <Icon name="refresh" />
        {t('status.saving')}
      </span>
    );
  }
  return (
    <span class="status-item status-item-ok" aria-live="polite">
      <Icon name="check" />
      {t('status.saved')}
    </span>
  );
}

function SelectionItem() {
  const { store, ui } = useEditor();
  const name = useComputed(() => {
    const selected = resolveSelection(store.committed.value, ui.selection.value);
    if (selected?.kind === 'marking') return markingLabel(selected.marking);
    return selected?.kind === 'image' ? imageLabel(selected.image) : null;
  });
  const label = name.value ?? t('panel.nothingSelected');
  return (
    <span class="status-item" title={t('status.selectionLabel', { name: label })}>
      {label}
    </span>
  );
}

function CursorItem() {
  const { view } = useEditor();
  const cursor = view.cursor.value;
  const position = cursor ? `${cursor.x}, ${cursor.y}` : t('status.empty');
  return (
    <span
      class="status-item status-item-mono"
      title={t('status.cursorLabel', { position })}
    >
      {position}
    </span>
  );
}

const Separator = () => <span class="status-sep" aria-hidden="true" />;

/**
 * Propostas: na revisão, "Somente leitura" e as aceitas aguardando aplicação; fora dela, as
 * propostas novas (abre a janela Propostas).
 */
function ProposalsItem() {
  const { review } = useEditor();
  if (review.proposalId.value !== null) {
    const pending = review.derived.counts.value.acceptedPending;
    return (
      <>
        <span class="status-item" title={t('review.readOnlyTip')}>
          <Icon name="lock" />
          {t('review.readOnlyFlag')}
        </span>
        {pending > 0 && (
          <span class="status-item status-item-ok">
            <Icon name="check" />
            {awaitingText(pending)}
          </span>
        )}
      </>
    );
  }
  const fresh = review.derived.freshIds.value.length;
  if (fresh === 0) return null;
  return (
    <button
      type="button"
      class="status-item status-item-button status-item-info"
      onClick={() => showAndFocusToolWindow('proposals')}
    >
      <Icon name="proposal" />
      {t('proposals.statusNew', { count: fresh })}
    </button>
  );
}

/** Destino do salvamento, "não exportado", schema e canal: comuns às duas barras. */
function useStatusTexts() {
  const { open } = useEditor();
  return {
    target: t(open.kind === 'folder' ? 'status.targetFolder' : 'status.targetLocal'),
    unexported: open.kind === 'local' && open.unexported.value,
    channel: t(CHANNEL === 'preview' ? 'status.channelPreview' : 'status.channelMain'),
  };
}

export function StatusBar() {
  const { target, unexported, channel } = useStatusTexts();
  return (
    <footer class="statusbar" aria-label={t('statusbar.label')}>
      <SaveItem />
      <span class="status-item" title={t('status.targetLabel', { target })}>
        {target}
      </span>
      {unexported && (
        <span class="status-item status-item-warn">{t('status.unexported')}</span>
      )}
      <ProposalsItem />
      <span class="statusbar-gap" />
      <SelectionItem />
      <Separator />
      <CursorItem />
      <Separator />
      <ZoomField class="status-item" />
      <Separator />
      <span
        class="status-item"
        title={t('status.schemaLabel', { version: SCHEMA_VERSION })}
      >
        {t('status.schema', { version: SCHEMA_VERSION })}
      </span>
      <Separator />
      <span class="status-item" title={t('status.channelLabel', { channel })}>
        {channel}
      </span>
    </footer>
  );
}

/**
 * Celular: o resumo da barra de status (salvamento, destino, não exportado, schema e
 * canal), no rodapé do menu Painéis. Seleção e zoom já estão à vista no canvas.
 */
export function StatusSummary() {
  const { target, unexported, channel } = useStatusTexts();
  return (
    <footer class="status-summary" aria-label={t('statusbar.label')}>
      <SaveItem />
      <span class="status-item">{t('status.targetLabel', { target })}</span>
      {unexported && (
        <span class="status-item status-item-warn">{t('status.unexported')}</span>
      )}
      <span class="status-item">{t('status.schema', { version: SCHEMA_VERSION })}</span>
      <span class="status-item">{t('status.channelLabel', { channel })}</span>
    </footer>
  );
}
