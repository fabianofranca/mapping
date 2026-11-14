import type { ComponentChildren } from 'preact';
import { t } from '../../i18n';
import type { ChangeType, LevelState } from '../../model';
import { classes } from '../controls/classes';
import { Icon } from '../icons';
import { ChangeKind } from './ChangeKind';
import { DecisionControl, type DecisionValue } from './DecisionControl';
import { DecisionMark, type DecisionCounts } from './DecisionMark';
import { badgeText, RevisedFlag, type RevisedBadge } from './RevisedFlag';
import { rowDomId, type RowPosition } from './levelRows';

// Row of the review levels (HANDOFF-PROPOSALS 2.1, ReviewRow): a three-column TreeRow
// — name (chevron, decision, type, label and flags), summary (counts or
// "before → after") and the DecisionControl. 28px tall.

export interface ReviewRowProps {
  readonly rowKey: string;
  /** Depth (0 = proposal). */
  readonly depth: number;
  readonly label: string;
  readonly state: LevelState;
  readonly counts?: DecisionCounts;
  readonly type?: ChangeType | null;
  readonly expandable: boolean;
  readonly expanded: boolean;
  readonly selected: boolean;
  /** Position among siblings (`aria-posinset`/`aria-setsize`). */
  readonly position?: RowPosition;
  /** Part of the set that blocks "Apply" (`is-invalid`). */
  readonly invalid?: boolean;
  /** Flags after the label (Flag, lock, note…). */
  readonly flags?: ComponentChildren;
  /** Shows the "Reviewed" mark (stage #644): the badge after the label and its accessible name. */
  readonly revised?: RevisedBadge | null;
  readonly summary: ComponentChildren;
  readonly decision: DecisionValue;
  readonly decisionDisabled?: boolean;
  readonly disabledReason?: string;
  readonly conflict?: boolean;
  readonly onSelect: () => void;
  readonly onToggle: () => void;
  readonly onDecide: (state: DecisionValue) => void;
}

/** ARIA attributes of the `treeitem` (position and total among siblings, for the virtualized list). */
function treeitemAttrs(
  r: Pick<
    ReviewRowProps,
    | 'rowKey'
    | 'depth'
    | 'expandable'
    | 'expanded'
    | 'selected'
    | 'label'
    | 'revised'
    | 'position'
  >,
) {
  return {
    id: rowDomId(r.rowKey),
    role: 'treeitem' as const,
    'aria-level': r.depth + 1,
    'aria-setsize': r.position?.setsize,
    'aria-posinset': r.position?.posinset,
    'aria-expanded': r.expandable ? r.expanded : undefined,
    'aria-selected': r.selected,
    'aria-label': r.revised ? `${r.label}, ${badgeText(r.revised)}` : r.label,
  };
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
  position,
  invalid,
  flags,
  revised,
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
      {...treeitemAttrs({
        rowKey,
        depth,
        expandable,
        expanded,
        selected,
        label,
        revised,
        position,
      })}
      data-row={rowKey}
      style={{ '--depth': depth }}
      onClick={(e) => {
        // The row's buttons (chevron and decision) handle their own click.
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
        {revised && <RevisedFlag badge={revised} />}
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
