import { useState } from 'preact/hooks';
import { t } from '../../i18n';
import { proposalIndex, reviewKey, type Change, type ReviewTarget } from '../../model';
import { Button } from '../controls';
import { Section } from '../DetailsSection';
import { useEditor } from '../EditorContext';
import { ChangeKind } from './ChangeKind';
import { ChangeMark } from './ChangeMark';
import { markType } from './ChangePopover';
import { changeSummary, changeTitle, targetName } from './changeText';
import { DecisionCounts } from './ProposalRow';
import { useReviewNames, useReviewNavigate } from './useReview';

// "Other changes" (HANDOFF-REVIEW-DETAILS 5.6, phase 9.6): what has no field in the normal
// panel (source, lock, marking image swap, image position, layers,
// specializations and repositories) in one row with the type, the summary and the same marker and
// popover as the fields. It replaces the cards (`ChangeCard`) with a single form.

/** Rows drawn at once (a large import can have hundreds). */
const MAX_ROWS = 60;

export function OtherChangeRow({ change }: { readonly change: Change }) {
  const names = useReviewNames();
  if (!names) return null;
  const field = change.field ?? '';
  const type = markType({ change, field, part: false });
  return (
    <li class="other-change-row">
      <ChangeKind type={type} size="sm" />
      <span class="other-change-text">
        <span class="other-change-title">{changeTitle(names, change)}</span>
        <span class="other-change-summary muted">{changeSummary(names, change)}</span>
      </span>
      <ChangeMark change={change} field={field} part={false} />
    </li>
  );
}

/** The "Other changes" section with one row per change of `ids`; `null` with none. */
export function OtherChangesSection({ ids }: { readonly ids: readonly string[] }) {
  const { review } = useEditor();
  const names = useReviewNames();
  const [limit, setLimit] = useState(MAX_ROWS);
  if (!names || ids.length === 0) return null;
  const byId = proposalIndex(names.proposal).changes;
  const changes = ids.flatMap((id) => {
    const c = byId.get(id);
    return c ? [c] : [];
  });
  // The change selected in the Proposals window never stays beyond "show more".
  const selected = review.selected.value;
  const wanted =
    selected?.level === 'change' ? changes.findIndex((c) => c.id === selected.id) : -1;
  const shown = changes.slice(0, Math.max(limit, wanted + 1));
  const rest = changes.length - shown.length;
  return (
    <Section
      section={{ kind: 'others' }}
      title={t('review.panel.otherChanges')}
      count={changes.length}
    >
      <ul class="other-changes">
        {shown.map((c) => (
          <OtherChangeRow key={c.id} change={c} />
        ))}
      </ul>
      {rest > 0 && (
        <Button size="sm" class="button-link" onClick={() => setLimit(limit + MAX_ROWS)}>
          {t('review.panel.showMoreChanges', { count: Math.min(rest, MAX_ROWS) })}
        </Button>
      )}
    </Section>
  );
}

/** The "Images" section of the proposal: one row per image with changes and **Open**. */
export function ImagesSection() {
  const { review } = useEditor();
  const names = useReviewNames();
  const navigate = useReviewNavigate();
  const d = review.derived;
  const tree = d.tree.value;
  if (!names || !tree) return null;
  // The Canvas group (canvas markings) is a sibling of the containers and opens like them.
  const images = tree.root.children.filter(
    (n) => n.level === 'image' || n.level === 'canvas',
  );
  if (images.length === 0) return null;
  const levels = d.levels.value;
  return (
    <Section
      section={{ kind: 'images' }}
      title={t('review.panel.images')}
      count={images.length}
    >
      <ul class="other-changes">
        {images.map((node) => {
          const canvas = node.level === 'canvas';
          const target: ReviewTarget = canvas
            ? { level: 'canvas', id: null }
            : { level: 'image', id: node.id };
          const summary = levels.get(reviewKey(target));
          const label = targetName(names, target);
          return (
            <li
              key={canvas ? 'canvas' : node.id}
              class="other-change-row"
              data-image={canvas ? 'canvas' : (node.id ?? '')}
            >
              <span class="other-change-text">
                <span class="other-change-title">{label}</span>
                {summary && (
                  <DecisionCounts
                    undecided={summary.undecided}
                    accepted={summary.accepted}
                    rejected={summary.rejected}
                  />
                )}
              </span>
              <Button
                size="sm"
                aria-label={t('review.panel.openNamed', { name: label })}
                onClick={() => navigate(target)}
              >
                {t('review.panel.open')}
              </Button>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
