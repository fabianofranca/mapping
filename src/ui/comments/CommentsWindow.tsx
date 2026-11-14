import { useState } from 'preact/hooks';
import { t } from '../../i18n';
import {
  awaiting,
  initials,
  lastMessage,
  messagePlainText,
  userLabel,
  type Project,
  type Thread,
  type ThreadAnchor,
  type ThreadStatusFilter,
  type ThreadUser,
} from '../../model';
import { identity } from '../../store/identity';
import type { ThreadEntry } from '../../store/threadDerived';
import { selectedThreadId, selectThread, startComposing } from '../../store/threadUi';
import type { Selection } from '../../store/ui';
import { ActionMenu } from '../ActionMenu';
import { Button, Choice, Select, TextField } from '../controls';
import { useEditor } from '../EditorContext';
import { openToolWindow } from '../toolWindowLayout';
import { anchorLabel } from './anchorLabel';
import { Icon } from '../icons';
import { BulkDeleteDialog } from './BulkDeleteDialog';
import { summaryText } from './commentsText';
import { relativeTime } from './relativeTime';
import { useDeleteThread } from './useDeleteThread';

// Comments window (Comments stage, CM3): all the threads of the mapping in a table, with
// status, user and text filters. Choosing a row selects the thread and its item and
// goes to the Details. In the review of a proposal the window is read-only (decision 26).

const STATUSES: readonly ThreadStatusFilter[] = [
  'all',
  'open',
  'awaitingAgent',
  'awaitingHuman',
  'resolved',
];

const STATUS_LABEL = {
  all: 'comments.filter.statusAll',
  open: 'comments.filter.statusOpen',
  awaitingAgent: 'comments.filter.statusAwaitingAgent',
  awaitingHuman: 'comments.filter.statusAwaitingHuman',
  resolved: 'comments.filter.statusResolved',
} as const satisfies Record<ThreadStatusFilter, string>;

function isStatus(value: string): value is ThreadStatusFilter {
  return (STATUSES as readonly string[]).includes(value);
}

/** What the window can do now: read always, write only outside review and read-only. */
function useAccess() {
  const { store } = useEditor();
  const readOnly = store.readOnly.value;
  const reviewing = store.reviewing.value;
  return {
    readOnly,
    reviewing,
    hasIdentity: identity.value !== null,
    canWrite: !readOnly && !reviewing,
  };
}

/** The anchor of a new thread from the canvas selection; `null` without a selection. */
function anchorOfSelection(selection: Selection): ThreadAnchor | null {
  if (selection === null) return null;
  return selection.kind === 'image'
    ? { kind: 'container', id: selection.id }
    : { kind: selection.kind, id: selection.id };
}

/** New thread and the ⋯ menu (Delete threads…), in the window header. */
export function CommentsHeaderActions() {
  const { ui, review, session } = useEditor();
  const access = useAccess();
  const [bulk, setBulk] = useState(false);
  const project = review.derived.shownProject.value;
  if (!project || access.reviewing) return null;
  const anchor = anchorOfSelection(ui.selection.value);
  const hint = anchor === null ? t('comments.newNoSelection') : undefined;
  const newTitle = access.readOnly ? t('comments.error.readOnly') : hint;
  return (
    <>
      <Button
        size="sm"
        disabled={anchor === null || access.readOnly}
        title={newTitle}
        onClick={() => {
          if (anchor === null) return;
          startComposing(ui, project, anchor);
          openToolWindow('details');
        }}
      >
        {t('comments.new')}
      </Button>
      <ActionMenu
        label={t('comments.windowMore')}
        items={[
          {
            label: t('comments.bulk.open'),
            disabled: !access.canWrite || !access.hasIdentity,
            onSelect: () => setBulk(true),
          },
        ]}
      />
      {bulk && (
        <BulkDeleteDialog
          threads={session.threads.list.value}
          onClose={() => setBulk(false)}
        />
      )}
    </>
  );
}

function userOptions(users: readonly ThreadUser[]) {
  return users.map((u) => {
    const name =
      u.kind === 'agent'
        ? t('comments.filter.userAgent', { name: u.label })
        : (u.email ?? u.label);
    return (
      <option key={u.key} value={u.key}>
        {t('comments.filter.userOption', { name, count: u.count })}
      </option>
    );
  });
}

/** "Only those that cite the selection" (decision 34): only valid with an item selected. */
function CiteSelectionFilter() {
  const { ui } = useEditor();
  const hasSelection = anchorOfSelection(ui.selection.value) !== null;
  return (
    <Choice
      label={t('comments.filter.citesSelection')}
      title={t(
        hasSelection
          ? 'comments.filter.citesSelectionHint'
          : 'comments.filter.citesSelectionNone',
      )}
      checked={ui.commentsCiteSelection.value}
      disabled={!hasSelection}
      onChange={(e) => (ui.commentsCiteSelection.value = e.currentTarget.checked)}
    />
  );
}

function Filters() {
  const { ui, derived } = useEditor();
  const users = derived.threads.users.value;
  return (
    <div class="list-filters comments-filters">
      <Select
        size="sm"
        aria-label={t('comments.filter.status')}
        value={ui.commentsStatus.value}
        onChange={(e) => {
          const v = e.currentTarget.value;
          if (isStatus(v)) ui.commentsStatus.value = v;
        }}
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {t(STATUS_LABEL[s])}
          </option>
        ))}
      </Select>
      <Select
        size="sm"
        aria-label={t('comments.filter.user')}
        value={ui.commentsUser.value}
        onChange={(e) => (ui.commentsUser.value = e.currentTarget.value)}
      >
        <option value="">{t('comments.filter.userAll')}</option>
        {userOptions(users)}
      </Select>
      <TextField
        size="sm"
        type="search"
        aria-label={t('comments.filter.text')}
        placeholder={t('comments.filter.text')}
        value={ui.commentsText.value}
        onInput={(e) => (ui.commentsText.value = e.currentTarget.value)}
      />
      <CiteSelectionFilter />
    </div>
  );
}

function Summary() {
  const { derived } = useEditor();
  const d = derived.threads;
  return (
    <p class="comments-summary muted" role="status">
      {summaryText(d.openCount.value, d.awaitingAgentCount.value, d.resolvedCount.value)}
    </p>
  );
}

const STATE_ICON = {
  human: 'threadAwaitingHuman',
  agent: 'threadAwaitingAgent',
} as const;

function StatusBadge({ thread }: { readonly thread: Thread }) {
  if (thread.resolved !== null) {
    return (
      <span
        class="comments-badge comments-badge-resolved"
        title={t('comments.badge.resolved')}
      >
        <Icon name="check" />
        {t('comments.badge.resolved')}
      </span>
    );
  }
  const who = awaiting(thread);
  const key =
    who === 'agent'
      ? 'comments.badge.awaitingAgent'
      : who === 'human'
        ? 'comments.badge.awaitingHuman'
        : 'comments.badge.open';
  return (
    <span class={`comments-badge comments-badge-${who ?? 'open'}`} title={t(key)}>
      {who !== null && <Icon name={STATE_ICON[who]} />}
      {t(key)}
    </span>
  );
}

/** Who opened the thread: initials and name. */
function OpenerCell({ thread }: { readonly thread: Thread }) {
  const opener = thread.messages[0];
  if (!opener) return null;
  return (
    <>
      <span class="comments-avatar" aria-hidden="true" title={userLabel(opener.author)}>
        {initials(opener.author)}
      </span>
      <span class="comments-by-name">{userLabel(opener.author)}</span>
    </>
  );
}

interface AnchorCellProps {
  readonly anchor: string;
  /** In the review the anchor is text only. */
  readonly plain: boolean;
  readonly selected: boolean;
  readonly unread: boolean;
}

function AnchorCell({ anchor, plain, selected, unread }: AnchorCellProps) {
  return (
    <div class="comments-anchor-line">
      {plain ? (
        <span class="comments-anchor-text">{anchor}</span>
      ) : (
        <button
          type="button"
          class="link comments-anchor-button"
          aria-current={selected || undefined}
          aria-label={t(unread ? 'comments.row.openUnread' : 'comments.row.open', {
            anchor,
          })}
        >
          {anchor}
        </button>
      )}
      {unread && <span class="comments-unread-dot" title={t('comments.unread')} />}
    </div>
  );
}

interface RowProps {
  readonly project: Project;
  readonly entry: ThreadEntry;
  readonly unread: boolean;
  readonly selected: boolean;
  readonly reviewing: boolean;
  readonly canDelete: boolean;
  readonly onChoose: (thread: Thread) => void;
  readonly onDelete: (thread: Thread) => void;
}

function ThreadRow({
  project,
  entry,
  unread,
  selected,
  reviewing,
  canDelete,
  onChoose,
  onDelete,
}: RowProps) {
  const { thread } = entry;
  const last = lastMessage(thread);
  const anchor = anchorLabel(project, thread.anchor);
  return (
    <tr
      class="list-row comments-row"
      data-thread={thread.id}
      data-resolved={thread.resolved !== null ? '' : undefined}
      data-orphan={entry.resolution.orphan ? '' : undefined}
      data-unread={unread ? '' : undefined}
      data-selected={selected || undefined}
      onClick={(e) => {
        if ((e.target as Element).closest('[data-row-menu]')) return;
        onChoose(thread);
      }}
    >
      <td class="list-cell comments-by">
        <OpenerCell thread={thread} />
      </td>
      <td class="list-cell comments-anchor">
        <AnchorCell
          anchor={anchor}
          plain={reviewing}
          selected={selected}
          unread={unread}
        />
      </td>
      <td class="list-cell comments-last">{last ? messagePlainText(last.text) : ''}</td>
      <td class="list-cell comments-count">{thread.messages.length}</td>
      <td class="list-cell">
        <StatusBadge thread={thread} />
      </td>
      <td class="list-cell comments-when muted">{last ? relativeTime(last.at) : ''}</td>
      <td class="list-cell comments-menu" data-row-menu="">
        {!reviewing && (
          <ActionMenu
            label={t('comments.row.more', { anchor })}
            items={[
              {
                label: t('comments.row.delete'),
                danger: true,
                disabled: !canDelete,
                onSelect: () => onDelete(thread),
              },
            ]}
          />
        )}
      </td>
    </tr>
  );
}

export function CommentsWindow() {
  const { ui, review, derived } = useEditor();
  const access = useAccess();
  const del = useDeleteThread();
  const project = review.derived.shownProject.value;
  if (!project) return null;
  const rows = derived.threads.rows.value;
  const unread = derived.threads.unreadIds.value;
  const chosen = selectedThreadId(ui);
  const choose = (thread: Thread) => {
    // In the review the window only shows: choosing a row does not touch the selection (decision 26).
    if (access.reviewing) return;
    selectThread(ui, project, thread);
    openToolWindow('details');
  };
  return (
    <div class="list-view comments-view">
      {access.reviewing && (
        <p class="comments-notice" role="note">
          {t('comments.reviewNotice')}
        </p>
      )}
      <Filters />
      <Summary />
      {rows.length === 0 ? (
        <p class="muted list-message">
          {t(
            derived.threads.entries.value.length === 0
              ? 'comments.empty'
              : 'comments.emptyFiltered',
          )}
        </p>
      ) : (
        <div class="list-scroll">
          <table
            class="list-table list-table-fixed comments-table"
            aria-label={t('comments.table')}
          >
            <thead>
              <tr>
                <th scope="col" class="comments-col-by">
                  {t('comments.col.by')}
                </th>
                <th scope="col" class="comments-col-anchor">
                  {t('comments.col.anchor')}
                </th>
                <th scope="col">{t('comments.col.last')}</th>
                <th scope="col" class="comments-col-count">
                  {t('comments.col.messages')}
                </th>
                <th scope="col" class="comments-col-status">
                  {t('comments.col.status')}
                </th>
                <th scope="col" class="comments-col-when">
                  {t('comments.col.when')}
                </th>
                <th scope="col" class="comments-col-menu" />
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => (
                <ThreadRow
                  key={entry.thread.id}
                  project={project}
                  entry={entry}
                  unread={unread.has(entry.thread.id)}
                  selected={chosen === entry.thread.id}
                  reviewing={access.reviewing}
                  canDelete={access.canWrite && access.hasIdentity}
                  onChoose={choose}
                  onDelete={del.request}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {del.dialog}
    </div>
  );
}
