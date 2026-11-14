import type { ComponentChildren } from 'preact';
import { t } from '../i18n';
import { classes } from './controls/classes';
import { IconButton, Tooltip } from './controls';
import { Icon, type IconName } from './icons';

// Boxed notice (DS 2.0 Notice), with the proposal review variants
// (HANDOFF-PROPOSALS 2.2): `info` (`color-selection` background, accent icon) for the
// new proposal and the dependencies, `sm` for compact notices inside the windows
// (locked item, apply blocked), and `line` for a single-line notice (icon, short text
// with an ellipsis and the full sentence in the tooltip, action and X). The short `.notice`
// text of the canvas overlays stays as it is.

export type NoticeTone = 'info' | 'warning' | 'error' | 'success';

const ICONS: Readonly<Record<NoticeTone, IconName>> = {
  info: 'info',
  warning: 'warning',
  error: 'error',
  success: 'check',
};

interface NoticeProps {
  readonly tone: NoticeTone;
  /** Compact (inside the windows): smaller padding and text. */
  readonly size?: 'md' | 'sm' | 'line';
  /**
   * `line` only: the full sentence. It goes in the short text's tooltip and, hidden, in the notice,
   * for the screen reader.
   */
  readonly hint?: string;
  readonly title?: string;
  readonly icon?: IconName;
  readonly children?: ComponentChildren;
  /** Action buttons, on the right (or below, in compact). */
  readonly actions?: ComponentChildren;
  /** Shows the notice's "close". */
  readonly onDismiss?: () => void;
  readonly role?: 'status' | 'alert';
  readonly class?: string;
}

function LineBody({ hint, children }: Pick<NoticeProps, 'hint' | 'children'>) {
  const text = <span class="notice-box-text">{children}</span>;
  return (
    <>
      {hint ? <Tooltip label={hint}>{text}</Tooltip> : text}
      {hint && <span class="visually-hidden">{hint}</span>}
    </>
  );
}

export function Notice({
  tone,
  size = 'md',
  hint,
  title,
  icon,
  children,
  actions,
  onDismiss,
  role = tone === 'error' ? 'alert' : 'status',
  class: extra,
}: NoticeProps) {
  const line = size === 'line';
  return (
    <div
      class={classes(
        'notice-box',
        `notice-box-${tone}`,
        size === 'sm' && 'notice-box-sm',
        line && 'notice-box-line',
        extra,
      )}
      role={role}
    >
      <span class="notice-box-icon" aria-hidden="true">
        <Icon name={icon ?? ICONS[tone]} />
      </span>
      {line ? (
        <LineBody hint={hint}>{children}</LineBody>
      ) : (
        <div class="notice-box-body">
          {title && <span class="notice-box-title">{title}</span>}
          {children}
          {actions && size === 'sm' && <div class="notice-box-actions">{actions}</div>}
        </div>
      )}
      {actions && size !== 'sm' && <div class="notice-box-actions">{actions}</div>}
      {onDismiss && (
        <IconButton
          icon="close"
          size="sm"
          label={t('editor.dismiss')}
          onClick={onDismiss}
        />
      )}
    </div>
  );
}
