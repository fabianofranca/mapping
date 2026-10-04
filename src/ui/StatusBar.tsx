import { useComputed } from '@preact/signals';
import { t } from '../i18n';
import { SCHEMA_VERSION } from '../model';
import { resolveSelection } from '../store/ui';
import { CHANNEL } from '../utils/channel';
import { useEditor } from './EditorContext';
import { Icon } from './icons';
import { imageLabel, markingLabel } from './labels';
import { ZoomField } from './ZoomField';

// Barra de status do desktop (B8): salvamento, destino e "não exportado" à esquerda;
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

export function StatusBar() {
  const { open } = useEditor();
  const target = t(open.kind === 'folder' ? 'status.targetFolder' : 'status.targetLocal');
  const channel = t(
    CHANNEL === 'preview' ? 'status.channelPreview' : 'status.channelMain',
  );
  return (
    <footer class="statusbar" aria-label={t('statusbar.label')}>
      <SaveItem />
      <span class="status-item" title={t('status.targetLabel', { target })}>
        {target}
      </span>
      {open.kind === 'local' && open.unexported.value && (
        <span class="status-item status-item-warn">{t('status.unexported')}</span>
      )}
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
