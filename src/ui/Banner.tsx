import type { ComponentChildren } from 'preact';
import { t } from '../i18n';
import { IconButton } from './controls';

interface BannerProps {
  /** `warning` for permanent channel notices; `info` for news. */
  readonly tone: 'warning' | 'info';
  readonly role?: 'note' | 'status';
  readonly class?: string;
  readonly children: ComponentChildren;
  /** Action beside the text (e.g. "Update"). */
  readonly action?: ComponentChildren;
  /** With it, the strip gains the dismiss button. */
  readonly onDismiss?: () => void;
}

/** Strip at the top of the screen (`mp-banner` of DS 2.0): text, optional action and dismiss. */
export function Banner({
  tone,
  role = 'note',
  class: extra,
  children,
  action,
  onDismiss,
}: BannerProps) {
  return (
    <div class={`banner banner-${tone}${extra ? ` ${extra}` : ''}`} role={role}>
      <span class="banner-text">{children}</span>
      {action}
      {onDismiss && (
        <IconButton icon="close" label={t('editor.dismiss')} onClick={onDismiss} />
      )}
    </div>
  );
}
