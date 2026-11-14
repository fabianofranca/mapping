import type { ComponentChildren } from 'preact';
import { t } from '../i18n';
import { writeClipboardText } from '../utils/clipboard';
import { Icon, type IconName } from './icons';
import { useCopyResult } from './useCopyResult';

// Details identity block: icon, name (15px), path and the ID in mono with
// copy in the same block (the ID is used to cite the item in a thread with an agent).

interface DetailsIdentityProps {
  readonly icon: IconName;
  readonly name: string;
  /** Bottom line: where the item is (image and path, or file and size). */
  readonly sub: string;
  /** The ID to copy; without it (the review's Project group), there is no button. */
  readonly id?: string;
  /** Buttons next to the ID (e.g. the lock). */
  readonly actions?: ComponentChildren;
  /** Row of badges below (e.g. "Created by the proposal", in the review). */
  readonly flags?: ComponentChildren;
  /** The name is struck through (the entity is about to be removed). */
  readonly struck?: boolean;
}

export function DetailsIdentity({
  icon,
  name,
  sub,
  id,
  actions,
  flags,
  struck,
}: DetailsIdentityProps) {
  return (
    <div class="identity">
      <div class="identity-main">
        <Icon name={icon} />
        {struck ? (
          <del class="identity-name">{name}</del>
        ) : (
          <strong class="identity-name">{name}</strong>
        )}
        {id !== undefined && <CopyIdButton id={id} />}
        {actions}
      </div>
      <span class="identity-sub">{sub}</span>
      {flags && <div class="identity-flags">{flags}</div>}
    </div>
  );
}

function CopyIdButton({ id }: { readonly id: string }) {
  // Without the API (or permission): the ID stays in the `title` to copy by hand.
  const { result: copied, copy } = useCopyResult();

  return (
    <>
      <button
        type="button"
        class="identity-id"
        title={`${t('common.copyId')}: ${id}`}
        aria-label={`${t('common.copyId')}: ${id}`}
        onClick={() => void copy(() => writeClipboardText(id))}
      >
        <span class="identity-id-text">{id}</span>
        <Icon name={copied === 'ok' ? 'check' : 'copy'} />
      </button>
      <span class="visually-hidden" role="status">
        {copied === 'ok'
          ? t('common.copied')
          : copied === 'failed'
            ? t('common.copyFailed')
            : ''}
      </span>
    </>
  );
}
