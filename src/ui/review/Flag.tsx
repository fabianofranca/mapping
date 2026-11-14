import type { ComponentChildren } from 'preact';
import { Icon, type IconName } from '../icons';

// 18px pill with a fact about the row (HANDOFF-PROPOSALS 2.1):
// Conflict, Locked, together, Involved, the proposal status. It is not interactive (the `Chip`
// is); the text always shows, never only the icon.

export type FlagTone = 'neutral' | 'warn' | 'danger' | 'ok' | 'new';

export function Flag({
  tone = 'neutral',
  icon,
  title,
  children,
}: {
  readonly tone?: FlagTone;
  readonly icon?: IconName;
  /** Tooltip with the explanation (e.g. "Rejected together with the creation of the item"). */
  readonly title?: string;
  readonly children: ComponentChildren;
}) {
  return (
    <span class={tone === 'neutral' ? 'flag' : `flag flag-${tone}`} title={title}>
      {icon && <Icon name={icon} />}
      <span class="flag-text">{children}</span>
    </span>
  );
}
