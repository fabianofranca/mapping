import { t } from '../../i18n';
import type { LevelState } from '../../model';

// Decision state of a level (HANDOFF-PROPOSALS 2.1 and 4.2): the SHAPE tells the state and the
// color reinforces it. Dashed circle = no decision; filled with ✓ = accepted; filled with ✕ =
// rejected; left half filled = partial (always with the counts nearby). It is
// read-only: whoever decides is the `DecisionControl`.

export interface DecisionCounts {
  readonly accepted: number;
  readonly rejected: number;
  readonly undecided: number;
}

/** Text of the state (accessible name and tooltip). Partial carries the counts. */
export function decisionLabel(state: LevelState, counts?: DecisionCounts): string {
  if (state === 'partial' && counts) {
    return t('review.state.partialCounts', {
      accepted: counts.accepted,
      rejected: counts.rejected,
      undecided: counts.undecided,
    });
  }
  return t(`review.state.${state}`);
}

interface DecisionMarkProps {
  readonly state: LevelState;
  readonly counts?: DecisionCounts;
  /** Accessible text in place of the default (e.g. "Item rejected"). */
  readonly label?: string;
  /** Decorative (the state is already written alongside, e.g. in the counts). */
  readonly decorative?: boolean;
}

function Shape({ state }: { readonly state: LevelState }) {
  switch (state) {
    case 'undecided':
      return <circle cx="8" cy="8" r="5.75" class="decision-mark-dashed" />;
    case 'accepted':
      return (
        <>
          <circle cx="8" cy="8" r="6.25" class="decision-mark-fill" />
          <path d="m5 8.3 2.2 2.2L11.2 5.9" class="decision-mark-glyph" />
        </>
      );
    case 'rejected':
      return (
        <>
          <circle cx="8" cy="8" r="6.25" class="decision-mark-fill" />
          <path d="m5.6 5.6 4.8 4.8m0-4.8-4.8 4.8" class="decision-mark-glyph" />
        </>
      );
    case 'partial':
      return (
        <>
          <circle cx="8" cy="8" r="5.75" />
          <path d="M8 2.25a5.75 5.75 0 0 0 0 11.5Z" class="decision-mark-fill" />
        </>
      );
  }
}

export function DecisionMark({ state, counts, label, decorative }: DecisionMarkProps) {
  const text = label ?? decisionLabel(state, counts);
  return (
    <span
      class={`decision-mark decision-mark-${state}`}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : text}
      aria-hidden={decorative ? 'true' : undefined}
      title={decorative ? undefined : text}
      data-state={state}
    >
      <svg
        class="icon"
        viewBox="0 0 16 16"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        stroke-width="1.25"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <Shape state={state} />
      </svg>
    </span>
  );
}
