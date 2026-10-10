import type { ComponentChildren } from 'preact';
import { t } from '../../i18n';
import type { ChangeType, LevelState } from '../../model';
import { classes } from '../controls/classes';
import { Icon } from '../icons';
import { ChangeKind } from './ChangeKind';
import { DecisionControl, type DecisionValue } from './DecisionControl';
import { DecisionMark, type DecisionCounts } from './DecisionMark';

// Linha dos níveis da revisão (HANDOFF-PROPOSALS 2.1, ReviewRow): um TreeRow de três
// colunas — nome (chevron, decisão, tipo, rótulo e sinalizadores), resumo (contagens ou
// "antes → depois") e o DecisionControl. 28px no desktop; no celular o resumo desce para
// uma segunda linha e os botões têm 44px.

export interface ReviewRowProps {
  readonly rowKey: string;
  /** Profundidade (0 = proposta). */
  readonly depth: number;
  readonly label: string;
  readonly state: LevelState;
  readonly counts?: DecisionCounts;
  readonly type?: ChangeType | null;
  readonly expandable: boolean;
  readonly expanded: boolean;
  readonly selected: boolean;
  /** Faz parte do conjunto que bloqueia "Aplicar" (`is-invalid`). */
  readonly invalid?: boolean;
  /** Sinalizadores depois do rótulo (Flag, cadeado, nota…). */
  readonly flags?: ComponentChildren;
  readonly summary: ComponentChildren;
  readonly decision: DecisionValue;
  readonly decisionDisabled?: boolean;
  readonly disabledReason?: string;
  readonly conflict?: boolean;
  readonly onSelect: () => void;
  readonly onToggle: () => void;
  readonly onDecide: (state: DecisionValue) => void;
}

export function ReviewRow({
  rowKey,
  depth,
  label,
  state,
  counts,
  type,
  expandable,
  expanded,
  selected,
  invalid,
  flags,
  summary,
  decision,
  decisionDisabled,
  disabledReason,
  conflict,
  onSelect,
  onToggle,
  onDecide,
}: ReviewRowProps) {
  return (
    <div
      class={classes(
        'review-row',
        selected && 'review-row-selected',
        invalid && 'is-invalid',
      )}
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded={expandable ? expanded : undefined}
      aria-selected={selected}
      aria-label={label}
      data-row={rowKey}
      style={{ '--depth': depth }}
      onClick={(e) => {
        // Os botões da linha (chevron e decisão) cuidam do próprio clique.
        if ((e.target as Element).closest('button')) return;
        onSelect();
      }}
    >
      <span class="review-row-name">
        {expandable ? (
          <button
            type="button"
            class="review-row-toggle"
            tabIndex={-1}
            aria-label={t(expanded ? 'tree.collapse' : 'tree.expand', { name: label })}
            onClick={onToggle}
          >
            <Icon name={expanded ? 'chevronDown' : 'chevronRight'} />
          </button>
        ) : (
          <span class="review-row-toggle" aria-hidden="true" />
        )}
        <DecisionMark state={state} counts={counts} />
        {type && <ChangeKind type={type} size="sm" />}
        <span class="review-row-label" title={label}>
          {label}
        </span>
        {flags}
      </span>
      <span class="review-row-summary">{summary}</span>
      <span class="review-row-decision">
        <DecisionControl
          value={decision}
          name={label}
          conflict={conflict}
          disabled={decisionDisabled}
          disabledReason={disabledReason}
          onDecide={onDecide}
        />
      </span>
    </div>
  );
}
