import { t } from '../../i18n';
import type { ChangeType } from '../../model';
import { Icon, type IconName } from '../icons';

// Neutral seal of the change kind (HANDOFF-PROPOSALS 4.1): the shape says the kind, never the
// color (green and red are for accepted and rejected). + created, − removed, ⇄ moved,
// ∿ changed, two frames for a swapped image.

export const CHANGE_KIND_ICONS: Readonly<Record<ChangeType, IconName>> = {
  created: 'plus',
  removed: 'minus',
  moved: 'moved',
  changed: 'changed',
  replaced: 'replaced',
};

/** Name of the kind ("Created", "Moved"…), for the tooltip and the filters. */
export function changeKindLabel(type: ChangeType): string {
  return t(`review.kind.${type}`);
}

export function ChangeKind({
  type,
  size = 'md',
  decorative,
}: {
  readonly type: ChangeType;
  /** `sm`: 18px, in rows and cards. */
  readonly size?: 'md' | 'sm';
  /** The kind is already written beside it (e.g. in the filters). */
  readonly decorative?: boolean;
}) {
  const label = changeKindLabel(type);
  return (
    <span
      class={size === 'sm' ? 'change-kind change-kind-sm' : 'change-kind'}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? 'true' : undefined}
      title={decorative ? undefined : label}
      data-kind={type}
    >
      <Icon name={CHANGE_KIND_ICONS[type]} />
    </span>
  );
}
