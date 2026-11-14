import { t, type TranslationKey } from '../i18n';
import {
  highestNotice,
  sortNotices,
  typeNotices,
  type SpecAnnotationType,
  type SpecNotice,
  type SpecNoticeKind,
} from '../model';
import { Tooltip } from './controls';
import { Icon, type IconName } from './icons';

// Specialization notice (formatVersion 10, stage #486): the badge (pill with icon and label),
// the type block and the field or column row. The color comes from the `kind` (tokens, in the CSS)
// and always goes with icon and text. It only informs: nothing here blocks or becomes a pending item.

const ICONS: Record<SpecNoticeKind, IconName> = {
  removed: 'blocked',
  deprecated: 'warning',
  diverges: 'compare',
  pending: 'info',
};

/** The icon of the `kind` (the same on the badge, the block and the field label). */
export function noticeIcon(kind: SpecNoticeKind): IconName {
  return ICONS[kind];
}

/** The translated label of the `kind`. */
export function noticeKindLabel(kind: SpecNoticeKind): string {
  return t(`notice.kind.${kind}` as TranslationKey);
}

/** Accessible name of the notice: "Notice <label>: <message>". */
export function noticeName(notice: SpecNotice): string {
  return t('notice.badge', {
    kind: noticeKindLabel(notice.kind),
    message: notice.message,
  });
}

interface BadgeProps {
  readonly notice: SpecNotice;
  /** Tooltip text; without it, the notice's message. */
  readonly tip?: string;
}

/** The badge: pill of the `kind`; the tooltip carries the message. */
export function NoticeBadge({ notice, tip }: BadgeProps) {
  return (
    <Tooltip label={tip ?? notice.message}>
      <span
        class={`notice-badge notice-${notice.kind}`}
        role="img"
        aria-label={noticeName(notice)}
      >
        <Icon name={ICONS[notice.kind]} />
        {noticeKindLabel(notice.kind)}
      </span>
    </Tooltip>
  );
}

/**
 * The badge of a type: the highest-severity notice among the type's, the fields' and the
 * columns'; the tooltip lists all of them. Nothing on a type without a notice.
 */
export function TypeNoticeBadge({ type }: { readonly type: SpecAnnotationType }) {
  const top = highestNotice(type);
  if (!top) return null;
  const tip = sortNotices(typeNotices(type))
    .map((n) => `${noticeKindLabel(n.kind)}: ${n.message}`)
    .join(' · ');
  return <NoticeBadge notice={top} tip={tip} />;
}

/** `since` and `ref` of the notice (the `ref` in a mono font). */
function NoticeOrigin({ notice }: { readonly notice: SpecNotice }) {
  return (
    <>
      {notice.since && (
        <span class="notice-since">{t('notice.since', { date: notice.since })}</span>
      )}
      {notice.ref && (
        <span class="notice-origin">
          {t('notice.ref')} <span class="notice-ref">{notice.ref}</span>
        </span>
      )}
    </>
  );
}

/** The type's notice at the top of the annotation: icon, label, message and, if present, `since` and `ref`. */
export function NoticeBlock({ notice }: { readonly notice: SpecNotice }) {
  return (
    <div
      class={`notice-block notice-${notice.kind}`}
      role="note"
      aria-label={noticeName(notice)}
    >
      <span class="notice-head">
        <Icon name={ICONS[notice.kind]} />
        <strong>{noticeKindLabel(notice.kind)}</strong>
      </span>
      <span class="notice-message">{notice.message}</span>
      <NoticeOrigin notice={notice} />
    </div>
  );
}

/** The notice of a field, or of a column (with `column`): a row with the `kind`'s background. */
export function NoticeLine({
  notice,
  column,
}: {
  readonly notice: SpecNotice;
  readonly column?: string;
}) {
  const message = column
    ? t('notice.column', { column, message: notice.message })
    : notice.message;
  return (
    <p
      class={`notice-line notice-${notice.kind}`}
      role="note"
      aria-label={noticeName(notice)}
    >
      <Icon name={ICONS[notice.kind]} />
      <span class="notice-message">{message}</span>
      <NoticeOrigin notice={notice} />
    </p>
  );
}

/** The notice rows of a field and of its columns (table), in display order. */
export function NoticeLines({
  notices,
  column,
}: {
  readonly notices: readonly SpecNotice[] | undefined;
  readonly column?: string;
}) {
  if (!notices || notices.length === 0) return null;
  return (
    <>
      {sortNotices(notices).map((notice, index) => (
        <NoticeLine key={`${notice.kind}-${index}`} notice={notice} column={column} />
      ))}
    </>
  );
}

/** The icon of the most severe notice on the field label. */
export function NoticeLabelIcon({
  notices,
}: {
  readonly notices: readonly SpecNotice[] | undefined;
}) {
  const top = notices ? sortNotices(notices)[0] : undefined;
  if (!top) return null;
  return (
    <span class={`notice-label-icon notice-${top.kind}`} aria-hidden="true">
      <Icon name={ICONS[top.kind]} />
    </span>
  );
}
