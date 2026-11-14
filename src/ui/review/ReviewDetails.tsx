import { useLayoutEffect, useMemo } from 'preact/hooks';
import { t } from '../../i18n';
import { proposalIndex, type ReviewTarget } from '../../model';
import { expandSections } from '../../store/ui';
import { locale } from '../../store/settings';
import { DetailsIdentity } from '../DetailsIdentity';
import { useEditor } from '../EditorContext';
import { createOpenMark, OpenMarkContext } from './ChangeMark';
import { targetName } from './changeText';
import { formatFullDate, joinParts } from './format';
import { ImagesSection, OtherChangesSection } from './OtherChanges';
import { IdentityFlags, ReviewHeader } from './ReviewHeader';
import { useReviewNames } from './useReview';

// Details in the review without a normal panel (HANDOFF-REVIEW-DETAILS 5.6, phase 9.6): the
// proposal (identity, header with Accept all / Reject all, "Other changes" of the Project group and
// "Images" with Open), the Project group (the same panel, with only "Other changes") and the
// changes without an item (layers, specializations, repositories). Also the empty state and what an
// item would show if the normal panel did not find it. Image and item have the normal panel, in
// `ReviewPanel`.

/** The level the header decides and the changes that the "Other changes" section lists. */
function plan(
  target: ReviewTarget,
  imageId: string | null | undefined,
  markingId: string | null | undefined,
) {
  const project: ReviewTarget = { level: 'project', id: null };
  if (target.level === 'proposal') {
    return { header: target, others: project, images: true };
  }
  if (target.level === 'project')
    return { header: target, others: project, images: false };
  if (target.level === 'canvas') return { header: target, others: target, images: false };
  // A change of the Project group (without an image or marking) shows the group's panel.
  if (target.level === 'change' && imageId === null && markingId === null) {
    return { header: project, others: project, images: false };
  }
  return { header: target, others: target, images: false };
}

/** A review level without a normal panel. */
export function ReviewLevelPanel({ target }: { readonly target: ReviewTarget }) {
  const { review, ui } = useEditor();
  const names = useReviewNames();
  const openMark = useMemo(createOpenMark, []);
  const d = review.derived;
  const tree = d.tree.value;
  const p = d.proposal.value;
  const change =
    target.level === 'change' && target.id !== null && p
      ? (proposalIndex(p).changes.get(target.id) ?? null)
      : null;
  const targetId = change?.id ?? null;

  // The selected change opens "Other changes" and is scrolled into view.
  useLayoutEffect(() => {
    if (targetId !== null) expandSections(ui, [{ kind: 'others' }]);
  }, [targetId, ui]);

  if (!names || !tree || !p) return null;
  const { header, others, images } = plan(target, change?.imageId, change?.markingId);
  const ids = tree.changeIdsOf(others);

  let identity;
  if (header.level === 'proposal') {
    identity = (
      <DetailsIdentity
        icon="proposal"
        name={p.title}
        sub={joinParts([p.origin, p.author, formatFullDate(p.createdAt, locale.value)])}
        id={p.id}
        flags={<IdentityFlags target={header} />}
      />
    );
  } else {
    identity = (
      <DetailsIdentity
        icon={header.level === 'project' ? 'settings' : 'marking'}
        name={targetName(names, header)}
        sub={t(
          header.level === 'project'
            ? 'review.panel.projectSub'
            : header.level === 'canvas'
              ? 'review.panel.canvasSub'
              : 'review.panel.levelSub',
        )}
        flags={<IdentityFlags target={header} />}
      />
    );
  }

  return (
    <div class="review-details review-details-panel">
      <OpenMarkContext.Provider value={openMark}>
        <div class="review-panel">
          <div class="panel-details">
            {identity}
            {header.level === 'proposal' && p.description && (
              <p class="review-description">{p.description}</p>
            )}
            <ReviewHeader target={header} />
            <OtherChangesSection ids={ids} />
            {images && <ImagesSection />}
          </div>
        </div>
      </OpenMarkContext.Provider>
    </div>
  );
}

/** Details in the review without a normal panel: the empty state or the level's panel. */
export function ReviewDetails() {
  const { review } = useEditor();
  const target = review.selected.value;
  if (!review.derived.tree.value || !review.derived.proposal.value) return null;
  if (!target) {
    return (
      <div class="review-details review-details-empty">
        <p class="muted">{t('review.details.empty')}</p>
      </div>
    );
  }
  return <ReviewLevelPanel target={target} />;
}
