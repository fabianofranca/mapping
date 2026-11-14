import { t } from '../../i18n';
import { Icon } from '../icons';
import type { ValuePart } from './changeText';

// Current value, before and after of a field (HANDOFF-PROPOSALS 2.1, DiffValue): mono font,
// no red or green. What changes stands out by weight and background, and the row's label says
// which is which. For the position, only the number that changes goes in bold.

export type DiffRowKind = 'current' | 'before' | 'after' | 'same';

export interface DiffRow {
  readonly kind: DiffRowKind;
  /** Row label ("Current", "Before", "After"; "This one", "In the new one" on the replaced one). */
  readonly label: string;
  readonly parts: readonly ValuePart[];
}

export function DiffValue({ rows }: { readonly rows: readonly DiffRow[] }) {
  return (
    <dl class="diff-value">
      {rows.map((row) => (
        <div key={`${row.kind}-${row.label}`} class="diff-value-row">
          <dt class="diff-value-label">
            {row.kind === 'current' && (
              <span class="diff-value-warn" title={t('review.flag.conflict')}>
                <Icon name="warning" />
              </span>
            )}
            {row.label}
          </dt>
          <dd class={`diff-value-value diff-value-${row.kind}`}>
            {row.parts.map((part, i) =>
              part.strong ? <b key={i}>{part.text}</b> : <span key={i}>{part.text}</span>,
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
