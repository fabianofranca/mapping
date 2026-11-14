import type { JSX } from 'preact';
import { useComputed } from '@preact/signals';
import { t } from '../i18n';
import { SCHEMA_VERSION } from '../model';
import { existingItems, selectedItems } from '../store/ui';
import { resolveShownSelection, selectionProject } from '../store/shownSelection';
import { BUILD_ID } from '../utils/build';
import { CHANNEL } from '../utils/channel';
import { useEditor } from './EditorContext';
import { Icon, type IconName } from './icons';
import { arrowText, imageLabel, markingLabel } from './labels';
import { ZoomField } from './ZoomField';
import { showAndFocusToolWindow } from './toolWindowLayout';
import { awaitingText } from './review/ProposalRow';
import { statusBarText } from './comments/commentsText';

// Status bar (B8): saving, destination and "not exported" on the left;
// selection, cursor, zoom, schema, channel and build on the right. The cursor comes from the canvas in a
// UI signal of its own, updated at most once per frame (HANDOFF, section 6).

interface ItemProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  readonly icon?: IconName;
}

/** A bar item: optional icon and the text in `.status-item-text` (never loose text beside the icon). */
function Item({ icon, children, ...rest }: ItemProps) {
  return (
    <span {...rest}>
      {icon && <Icon name={icon} />}
      <span class="status-item-text">{children}</span>
    </span>
  );
}

function SaveItem() {
  const { session } = useEditor();
  if (session.store.readOnly.value) {
    return <Item class="status-item">{t('status.readOnly')}</Item>;
  }
  const status = session.saveStatus.value;
  if (status === 'error') {
    return (
      <span class="status-item status-item-error" role="alert">
        <span class="status-item-text">{t('status.error')}</span>
        {/* Exception to Button: text link in the save error message (docs/DESIGN-SYSTEM.md, "Standalone buttons") */}
        <button type="button" class="link" onClick={() => void session.flush()}>
          {t('status.retry')}
        </button>
      </span>
    );
  }
  const saving = status === 'saving';
  return (
    <Item
      class={saving ? 'status-item' : 'status-item status-item-ok'}
      aria-live="polite"
      icon={saving ? 'refresh' : 'check'}
    >
      {t(saving ? 'status.saving' : 'status.saved')}
    </Item>
  );
}

function SelectionItem() {
  const { review, ui } = useEditor();
  const name = useComputed(() => {
    // The project in view (preview in the Proposed view of the review), never the confirmed one directly.
    const count = existingItems(
      review.derived.shownProject.value,
      selectedItems(ui),
    ).length;
    if (count > 1) return t('multi.title', { count });
    const selected = resolveShownSelection(review, ui.selection.value);
    if (selected?.kind === 'marking' || selected?.kind === 'arrow') {
      const project = selectionProject(review, ui.selection.value);
      if (!project) return null;
      return selected.kind === 'marking'
        ? markingLabel(project, selected.marking)
        : arrowText(project, selected.arrow);
    }
    return selected?.kind === 'image' ? imageLabel(selected.image) : null;
  });
  const label = name.value ?? t('panel.nothingSelected');
  return (
    <Item
      class="status-item status-item-sel"
      title={t('status.selectionLabel', { name: label })}
    >
      {label}
    </Item>
  );
}

function CursorItem() {
  const { view } = useEditor();
  const cursor = view.cursor.value;
  const position = cursor ? `${cursor.x}, ${cursor.y}` : t('status.empty');
  return (
    <Item
      class="status-item status-item-mono"
      title={t('status.cursorLabel', { position })}
    >
      {position}
    </Item>
  );
}

const Separator = () => <span class="status-sep" aria-hidden="true" />;

/**
 * Proposals: in the review, "Read-only" and the accepted ones awaiting application; outside it, the
 * new proposals (opens the Proposals window).
 */
function ProposalsItem() {
  const { review } = useEditor();
  if (review.proposalId.value !== null) {
    const pending = review.derived.counts.value.acceptedPending;
    return (
      <>
        <Item class="status-item" title={t('review.readOnlyTip')} icon="lock">
          {t('review.readOnlyFlag')}
        </Item>
        {pending > 0 && (
          <Item
            class="status-item status-item-ok status-item-s4"
            title={awaitingText(pending)}
            icon="check"
          >
            {awaitingText(pending)}
          </Item>
        )}
      </>
    );
  }
  const fresh = review.derived.freshIds.value.length;
  if (fresh === 0) return null;
  return (
    /* Exception to Button: status bar segment (docs/DESIGN-SYSTEM.md, "Standalone buttons") */
    <button
      type="button"
      class="status-item status-item-button status-item-info"
      onClick={() => showAndFocusToolWindow('proposals')}
    >
      <Icon name="proposal" />
      <span class="status-item-text">{t('proposals.statusNew', { count: fresh })}</span>
    </button>
  );
}

/** Specialization warnings (stage #486): how many annotations have a warning; opens the Warnings window. */
function NoticesItem() {
  const { derived } = useEditor();
  const count = derived.noticedCount.value;
  if (count === 0) return null;
  return (
    /* Exception to Button: status bar segment (docs/DESIGN-SYSTEM.md, "Standalone buttons") */
    <button
      type="button"
      class="status-item status-item-button status-item-s"
      title={t('notices.statusTip', { count })}
      onClick={() => showAndFocusToolWindow('notices')}
    >
      <Icon name="warning" />
      <span class="status-item-text">{t('notices.status', { count })}</span>
    </button>
  );
}

/** Open threads (Comments stage): how many and how many await the agent; opens the window. */
function CommentsItem() {
  const { derived } = useEditor();
  const open = derived.threads.openCount.value;
  if (open === 0) return null;
  return (
    /* Exception to Button: status bar segment (docs/DESIGN-SYSTEM.md, "Standalone buttons") */
    <button
      type="button"
      class="status-item status-item-button status-item-s"
      title={t('comments.statusBar.tip')}
      onClick={() => showAndFocusToolWindow('comments')}
    >
      <Icon name="chat" />
      <span class="status-item-text">
        {statusBarText(open, derived.threads.awaitingAgentCount.value)}
      </span>
    </button>
  );
}

/** The whole arrivals sentence (the title of the bar's short item). */
const arrivalsTitle = (count: number) =>
  count === 1
    ? t('perspective.status.arrivalsOne')
    : t('perspective.status.arrivalsMany', { count });

/**
 * Open perspective (stage #659): its name (or the Main one) and, on the Main one, how many items
 * came from other perspectives.
 */
function PerspectiveItem() {
  const { derived, review } = useEditor();
  const open = derived.perspective.value;
  const name = open?.name ?? t('perspective.principal');
  const arrivals = open ? 0 : (review.derived.shownProject.value?.arrivals.length ?? 0);
  return (
    <>
      <Item
        class="status-item status-item-s4"
        title={t('perspective.status.name', { name })}
        icon="perspective"
      >
        {t('perspective.status.name', { name })}
      </Item>
      {arrivals > 0 && (
        <Item class="status-item status-item-s" title={arrivalsTitle(arrivals)}>
          {t('perspective.status.arrivals', { count: arrivals })}
        </Item>
      )}
    </>
  );
}

/** View mode: reminds that the canvas is view-only and how to leave. */
function ViewModeItem() {
  const { ui } = useEditor();
  if (!ui.viewMode.value) return null;
  return (
    <Item class="status-item" aria-live="polite" icon="eye">
      {t('status.viewMode')}
    </Item>
  );
}

/** Save destination, "not exported", schema and channel: common to both bars. */
function useStatusTexts() {
  const { open } = useEditor();
  return {
    target: t(open.kind === 'folder' ? 'status.targetFolder' : 'status.targetLocal'),
    unexported:
      open.kind === 'local' && open.unexported.value ? t('status.unexported') : '',
    channel: t(CHANNEL === 'preview' ? 'status.channelPreview' : 'status.channelMain'),
  };
}

export function StatusBar() {
  const { target, unexported, channel } = useStatusTexts();
  return (
    <footer class="statusbar" aria-label={t('statusbar.label')}>
      <SaveItem />
      <Item class="status-item" title={t('status.targetLabel', { target })}>
        {target}
      </Item>
      {unexported && (
        <Item class="status-item status-item-warn status-item-s" title={unexported}>
          {unexported}
        </Item>
      )}
      <PerspectiveItem />
      <ProposalsItem />
      <NoticesItem />
      <CommentsItem />
      <ViewModeItem />
      <span class="statusbar-gap" />
      <SelectionItem />
      <Separator />
      <CursorItem />
      <Separator />
      <ZoomField class="status-item" />
      <Separator />
      <Item
        class="status-item status-wide"
        title={t('status.schemaLabel', { version: SCHEMA_VERSION })}
      >
        {t('status.schema', { version: SCHEMA_VERSION })}
      </Item>
      <Separator />
      <Item class="status-item status-wide" title={t('status.channelLabel', { channel })}>
        {channel}
      </Item>
      <Separator />
      <Item
        class="status-item status-item-mono"
        title={t('status.buildLabel', { id: BUILD_ID })}
      >
        {BUILD_ID}
      </Item>
    </footer>
  );
}
