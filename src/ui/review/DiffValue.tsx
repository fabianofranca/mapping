import { t } from '../../i18n';
import { Icon } from '../icons';
import type { ValuePart } from './changeText';

// Valor atual, antes e depois de um campo (HANDOFF-PROPOSALS 2.1, DiffValue): fonte mono,
// sem vermelho nem verde. O que muda se destaca por peso e fundo, e o rótulo da linha diz
// qual é qual. Na posição, só o número que muda vai em negrito.

export type DiffRowKind = 'current' | 'before' | 'after' | 'same';

export interface DiffRow {
  readonly kind: DiffRowKind;
  /** Rótulo da linha ("Atual", "Antes", "Depois"; "Esta", "Na nova" na substituída). */
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
