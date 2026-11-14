import { useContext, useId, useState } from 'preact/hooks';
import { t, type TranslationKey } from '../../i18n';
import {
  changeLayerId,
  projectIndex,
  reviewKey,
  summarizeDecisions,
  type Change,
  type ProposalIssue,
  type ReviewTarget,
} from '../../model';
import { locale } from '../../store/settings';
import { Button, IconButton } from '../controls';
import { useEditor } from '../EditorContext';
import { Icon } from '../icons';
import { Notice } from '../Notice';
import {
  changeTitle,
  entityKindOf,
  entityLabel,
  entityName,
  markingName,
  targetName,
  type ReviewNames,
} from './changeText';
import { OpenMarkContext } from './ChangeMark';
import { DecisionControl, type DecisionValue } from './DecisionControl';
import { DecisionMark } from './DecisionMark';
import { Flag } from './Flag';
import { formatFullDate } from './format';
import { NoteField, useHasNote } from './NoteField';
import { OpenNewer } from './ReviewLevels';
import { RevisionLine } from './RevisedFlag';
import { useDecide, useDecideMany, useReviewNames } from './useReview';

// Header for what is selected in the review Details (HANDOFF-REVIEW-DETAILS 5.4, 5.5
// and 5.7, phase 9.6): what it is (changed, created or removed marking; image; proposal; the
// Project group), the three-state decision with the counts, whole-entity creation or removal,
// the invalid set with its two exits, the locked item, the "together" notice with Undo, the
// item note and the proposal status (applied or superseded). Nothing here computes a rule:
// everything comes from `review.derived`.

/** How many changes are listed in full in the short lists ("and N more"). */
const LIST_MAX = 4;

/** How many markings (or arrows) the "Accept also removes" list shows before "and N more". */
const REMOVAL_MAX = LIST_MAX * 3;

/** The "and N more" line of the marking and arrow lists truncated at `REMOVAL_MAX`. */
function MoreItem({ total }: { readonly total: number }) {
  if (total <= REMOVAL_MAX) return null;
  return <li class="muted">{t('review.panel.more', { count: total - REMOVAL_MAX })}</li>;
}

/** How many dependency names appear in the "together" notice. */
const TOGETHER_NAMES = 4;

// ---------------------------------------------------------------------------
// Texts per kind of item

/**
 * The header variant: changed, created or removed marking or image (the creation or
 * removal of the whole entity comes from the per-field index), the proposal or the Project group.
 * Each variant has its own label key (they are not built by interpolation: "Accept
 * marking" and "Accept removal" do not compose the same way in both languages).
 */
export type HeaderVariant =
  | 'marking'
  | 'markingCreate'
  | 'markingRemove'
  | 'image'
  | 'container'
  | 'imageCreate'
  | 'imageRemove'
  | 'proposal'
  | 'project'
  | 'canvas'
  | 'change';

const GROUP_VARIANTS: Partial<Record<ReviewTarget['level'], HeaderVariant>> = {
  proposal: 'proposal',
  project: 'project',
  canvas: 'canvas',
  change: 'change',
};

export function headerVariant(
  target: ReviewTarget,
  whole: Change | null | undefined,
  changes: readonly Change[] = [],
): HeaderVariant {
  const group = GROUP_VARIANTS[target.level];
  if (group !== undefined) return group;
  const base = target.level === 'image' ? 'image' : 'marking';
  if (whole?.kind === 'create') return `${base}Create`;
  if (whole?.kind === 'remove') return `${base}Remove`;
  // "Image changed" only when the proposal replaces the container's file or dimensions.
  if (base === 'image' && !changes.some(replacesImage)) return 'container';
  return base;
}

/** The change replaces the container's image (file, or size for one without a file). */
const replacesImage = (c: Change): boolean =>
  c.entity === 'image' && (c.field === 'file' || c.field === 'size');

/** Variant of the Accept/Reject labels (created and changed both decide "the marking"). */
function actionVariant(
  variant: HeaderVariant,
): Exclude<HeaderVariant, 'markingCreate' | 'imageCreate'> {
  if (variant === 'markingCreate') return 'marking';
  if (variant === 'imageCreate') return 'image';
  return variant;
}

// ---------------------------------------------------------------------------
// Problems of the accepted set

/** The entity's kind in lower case ("layer"), for the problem text. */
const kindText = (kind: Parameters<typeof entityLabel>[0]) =>
  entityLabel(kind).toLocaleLowerCase();

/**
 * Text of a problem in the accepted set. It cites the entity by name (marking, image,
 * layer, annotation, specialization), never by id; with no name anywhere, by kind.
 */
export function issueText(names: ReviewNames, issue: ProposalIssue): string {
  const name = (id: string | undefined) => {
    if (id === undefined) return '';
    const found = entityName(names, id);
    if (found !== null) return found;
    const kind = entityKindOf(names, id);
    // Specialization and repository have a readable id (`sdui`, `android`): it is the name itself.
    if (
      kind === null ||
      kind === 'specialization' ||
      kind === 'platformRepo' ||
      kind === 'docRepo'
    )
      return id;
    return kindText(kind);
  };
  // The change cites a target that no longer exists (neither in the project nor in the proposal).
  if (issue.code === 'entity-missing' && entityName(names, issue.id) === null) {
    const kind = entityKindOf(names, issue.id);
    if (kind !== null) return t('review.issue.gone', { entity: kindText(kind) });
  }
  const params = { name: name(issue.id), other: name(issue.otherId) };
  switch (issue.code) {
    case 'rect-outside-parent':
      return t('review.issue.outsideParent', params);
    case 'rect-out-of-image':
      return t('review.issue.outOfImage', params);
    case 'images-overlap':
      return t('review.issue.imagesOverlap', params);
    case 'missing-specialization':
      return t('review.issue.missingSpecialization', params);
    case 'entity-missing':
    case 'entity-exists':
    case 'field-mismatch':
      return t('review.issue.doesNotFit', params);
    case 'proposal-closed':
      return t('review.issue.closed');
    case 'missing-image':
      return t('review.issue.missingImage', params);
    default:
      return t('review.issue.generic', { ...params, code: issue.code });
  }
}

/** "Accept the missing one(s)" / "Reject the causing one(s)": concrete form if only one. */
function exitLabel(
  names: ReviewNames,
  ids: readonly string[],
  many: TranslationKey,
  one: TranslationKey,
): string {
  const only =
    ids.length === 1 ? names.proposal.changes.find((c) => c.id === ids[0]) : null;
  return only
    ? t(one, { title: changeTitle(names, only) })
    : t(many, { count: ids.length });
}

function IssueNotices({
  target,
  ids,
  open,
}: {
  readonly target: ReviewTarget;
  readonly ids: readonly string[];
  readonly open: boolean;
}) {
  const { review } = useEditor();
  const names = useReviewNames();
  const decideMany = useDecideMany();
  if (!names) return null;
  const inLevel = new Set(ids);
  const issues = (review.derived.validation.value?.issues ?? []).filter(
    (issue) =>
      target.level === 'proposal' ||
      issue.changeIds.some((id) => inLevel.has(id)) ||
      issue.related.some((id) => inLevel.has(id)),
  );
  return (
    <>
      {issues.map((issue) => (
        <Notice
          key={`${issue.code}:${issue.id}:${issue.otherId ?? ''}`}
          tone="error"
          size="sm"
          title={t('review.issue.title')}
          actions={
            <>
              {issue.related.length > 0 && (
                <Button
                  size="sm"
                  disabled={!open}
                  onClick={() => decideMany(issue.related, 'accepted')}
                >
                  <Icon name="check" />
                  {exitLabel(
                    names,
                    issue.related,
                    'review.issue.acceptMissing',
                    'review.issue.acceptOne',
                  )}
                </Button>
              )}
              {issue.changeIds.length > 0 && (
                <Button
                  size="sm"
                  disabled={!open}
                  onClick={() => decideMany(issue.changeIds, 'rejected')}
                >
                  <Icon name="close" />
                  {exitLabel(
                    names,
                    issue.changeIds,
                    'review.issue.rejectCause',
                    'review.issue.rejectOne',
                  )}
                </Button>
              )}
            </>
          }
        >
          <span>{issueText(names, issue)}</span>
        </Notice>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Whole creation and removal

/** "+ N annotations created" and the help text: the creation is a single change. */
function CreationInfo({
  names,
  target,
  ids,
}: {
  readonly names: ReviewNames;
  readonly target: ReviewTarget;
  readonly ids: readonly string[];
}) {
  const inLevel = new Set(ids);
  let annotations = 0;
  let markings = 0;
  let arrows = 0;
  for (const c of names.proposal.changes) {
    if (c.kind !== 'create' || !inLevel.has(c.id)) continue;
    if (target.level === 'image' && c.entity === 'arrow') arrows++;
    if (
      target.level === 'item' &&
      c.entity === 'annotation' &&
      c.markingId === target.id
    ) {
      annotations++;
    } else if (target.level === 'image' && c.entity === 'marking') {
      markings++;
    }
  }
  return (
    <div class="review-header-info">
      {annotations > 0 && <b>{t('review.panel.createdCount', { count: annotations })}</b>}
      {markings > 0 && <b>{t('review.panel.createdMarkings', { count: markings })}</b>}
      {arrows > 0 && <b>{t('review.panel.createdArrows', { count: arrows })}</b>}
      <span class="muted">{t('review.panel.createHint')}</span>
    </div>
  );
}

/** What goes along with a removed marking or image: children (with a link) and annotations. */
function RemovalList({
  names,
  target,
  ids,
}: {
  readonly names: ReviewNames;
  readonly target: ReviewTarget;
  readonly ids: readonly string[];
}) {
  const { review } = useEditor();
  const inLevel = new Set(ids);
  const markings: string[] = [];
  const arrows: string[] = [];
  const byLayer = new Map<string, string[]>();
  for (const c of names.proposal.changes) {
    if (c.kind !== 'remove' || !inLevel.has(c.id)) continue;
    if (c.entity === 'marking' && c.entityId !== target.id) markings.push(c.entityId);
    else if (c.entity === 'arrow' && c.entityId !== target.id) arrows.push(c.entityId);
    else if (c.entity === 'annotation') {
      const layer = changeLayerId(c, names.current) ?? '';
      const list = byLayer.get(layer);
      const name = entityName(names, c.entityId) ?? t('annotation.unnamed');
      if (list) list.push(name);
      else byLayer.set(layer, [name]);
    }
  }
  if (markings.length === 0 && arrows.length === 0 && byLayer.size === 0) return null;
  const layerName = (id: string) =>
    projectIndex(names.current).layers.get(id)?.name ?? t('review.level.project');
  return (
    <div class="review-header-info">
      <b>{t('review.panel.removesWith')}</b>
      <ul class="review-removal-list">
        {markings.slice(0, REMOVAL_MAX).map((id) => (
          <li key={id}>
            <Icon name="marking" />
            <Button
              size="sm"
              class="button-link"
              onClick={() => review.select({ level: 'item', id })}
            >
              {markingName(names, id)}
            </Button>
          </li>
        ))}
        <MoreItem total={markings.length} />
        {arrows.slice(0, REMOVAL_MAX).map((id) => (
          <li key={id}>
            <Icon name="arrow" />
            <Button
              size="sm"
              class="button-link"
              onClick={() => review.select({ level: 'item', id })}
            >
              {markingName(names, id)}
            </Button>
          </li>
        ))}
        <MoreItem total={arrows.length} />
        {[...byLayer].map(([layer, list]) => (
          <li key={layer}>
            <Icon name="layers" />
            <span>
              <b>{layerName(layer)}</b>
              {': '}
              {list.slice(0, LIST_MAX).join(', ')}
              {list.length > LIST_MAX
                ? ` ${t('review.panel.more', { count: list.length - LIST_MAX })}`
                : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Together and proposal status

/** "N changes rejected together: …" with Undo (the batch notice, here on the item). */
function TogetherNotice({
  names,
  ids,
}: {
  readonly names: ReviewNames;
  readonly ids: readonly string[];
}) {
  const { review } = useEditor();
  const undo = review.undoable.value;
  if (!undo || undo.cascaded.length === 0) return null;
  const inLevel = new Set(ids);
  const here = undo.cascaded.filter((id) => inLevel.has(id));
  if (here.length === 0) return null;
  const byId = new Map(names.proposal.changes.map((c) => [c.id, c]));
  const titles = here
    .slice(0, TOGETHER_NAMES)
    .map((id) => byId.get(id))
    .filter((c): c is Change => c !== undefined)
    .map((c) => changeTitle(names, c));
  const rest = here.length - titles.length;
  const key =
    undo.state === 'accepted'
      ? 'review.panel.together.accepted'
      : undo.state === 'rejected'
        ? 'review.panel.together.rejected'
        : 'review.panel.together.cleared';
  return (
    <Notice
      tone="info"
      size="sm"
      icon="link"
      actions={
        <Button size="sm" onClick={() => void review.undoLastDecision()}>
          {t('review.undo')}
        </Button>
      }
    >
      <span>
        {t(key, {
          count: here.length,
          names:
            titles.join(', ') +
            (rest > 0 ? ` ${t('review.panel.more', { count: rest })}` : ''),
        })}
      </span>
    </Notice>
  );
}

/** Applied proposal (view only) or superseded (with "Open the new one"). */
function ProposalStatusNotice({ names }: { readonly names: ReviewNames }) {
  const { review } = useEditor();
  const p = names.proposal;
  if (p.status === 'applied') {
    const at = Object.values(p.applied)
      .map((a) => a.at)
      .sort()
      .at(-1);
    return (
      <Notice tone="info" size="sm">
        <span>
          {t('review.panel.closedNotice', {
            date: at ? formatFullDate(at, locale.value) : '',
          })}
        </span>
      </Notice>
    );
  }
  if (p.status !== 'superseded') return null;
  const by = review.derived.supersession.value?.by ?? null;
  return (
    <Notice
      tone="warning"
      size="sm"
      title={t('review.superseded.title')}
      actions={by && <OpenNewer id={by.id} title={by.title} />}
    >
      <span>{t('review.superseded.text')}</span>
    </Notice>
  );
}

// ---------------------------------------------------------------------------
// Identity badges and the decision of a whole change

/** Badges under the item name: created, will be removed, locked and blocks applying. */
export function IdentityFlags({
  target,
  whole = null,
}: {
  readonly target: ReviewTarget;
  readonly whole?: Change | null;
}) {
  const { review } = useEditor();
  const d = review.derived;
  const ids = d.tree.value?.changeIdsOf(target) ?? [];
  const situation = d.situation.value;
  const invalid = d.invalid.value;
  const locked = ids.some((id) => situation.get(id)?.locked === true);
  const blocks = ids.some((id) => invalid.changeIds.has(id) || invalid.related.has(id));
  return (
    <>
      {whole?.kind === 'create' && (
        <Flag icon="plus">{t('review.panel.createdByProposal')}</Flag>
      )}
      {whole?.kind === 'remove' && (
        <Flag icon="minus">{t('review.panel.willBeRemoved')}</Flag>
      )}
      {locked && (
        <Flag icon="lock" title={t('review.lockedItem')}>
          {t('review.flag.locked')}
        </Flag>
      )}
      {blocks && (
        <Flag tone="danger" icon="blocked">
          {t('review.panel.blocksApply')}
        </Flag>
      )}
    </>
  );
}

/** ✓ ✕ of the creation or removal of a whole entity (an annotation), in its header. */
export function WholeDecision({ change }: { readonly change: Change }) {
  const { review } = useEditor();
  const openMark = useContext(OpenMarkContext);
  const names = useReviewNames();
  const decide = useDecide();
  if (!names) return null;
  const p = names.proposal;
  const applied = review.derived.situation.value.get(change.id)?.applied === true;
  return (
    <DecisionControl
      value={p.decisions[change.id]?.state ?? null}
      name={changeTitle(names, change)}
      disabled={p.status !== 'open' || applied}
      disabledReason={applied ? t('review.appliedReason') : t('review.closedReason')}
      onDecide={(state) => decide({ level: 'change', id: change.id }, state)}
      onDecidedByKeyboard={(control) =>
        review.requestControlFocus(change.id, 'card', control)
      }
      takeFocus={() => review.takeControlFocus(change.id, 'card')}
      onRejectedByMouse={() => {
        // The suggested note lives in the change popover: the request goes to the store and
        // the popover opens (the card may be swapped by the rejection; the new one fulfils it
        // on mount).
        review.requestNote(change.id);
        if (openMark) openMark.value = `${change.id}|`;
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// The header

interface ReviewHeaderProps {
  /** The level decided by the header: the proposal, the Project group, an image or an item. */
  readonly target: ReviewTarget;
  /** Creation or removal of the whole entity (from the per-field index), if any. */
  readonly whole?: Change | null;
}

export function ReviewHeader({ target, whole = null }: ReviewHeaderProps) {
  const { review } = useEditor();
  const names = useReviewNames();
  const decide = useDecide();
  const [noteShown, setNoteShown] = useState(false);
  const [noteFocus, setNoteFocus] = useState(0);
  const reasonId = useId();
  const hasNote = useHasNote(target);
  const d = review.derived;
  const tree = d.tree.value;
  const p = d.proposal.value;
  if (!names || !tree || !p) return null;

  const key = reviewKey(target);
  const ids = tree.changeIdsOf(target);
  const summary =
    target.level === 'change' ? summarizeDecisions(p, ids) : d.levels.value.get(key);
  const open = p.status === 'open';
  const state = summary?.state ?? 'undecided';
  const value: DecisionValue =
    state === 'accepted' || state === 'rejected' ? state : null;
  const locked = ids.some((id) => d.situation.value.get(id)?.locked === true);
  const inLevel = new Set(ids);
  const variant = headerVariant(
    target,
    whole,
    names.proposal.changes.filter((c) => inLevel.has(c.id)),
  );
  const action = actionVariant(variant);
  const name = targetName(names, target);
  const disabled = !open || (summary != null && summary.applied === summary.total);
  const rejected = (summary?.rejected ?? 0) > 0;
  const reason = !open ? t('review.closedReason') : t('review.appliedReason');

  return (
    <section class="review-header" aria-label={t('review.details.decision')}>
      <ProposalStatusNotice names={names} />
      <RevisionLine
        summary={target.level === 'proposal' ? d.revisionSummary.value : null}
      />
      <div class="review-header-state">
        <DecisionMark state={state} counts={summary ?? undefined} />
        <b>{t(`review.header.kind.${variant}`)}</b>
        {summary && (
          <span class="muted">
            {t('proposals.progressLabel', {
              accepted: summary.accepted,
              rejected: summary.rejected,
              undecided: summary.undecided,
            })}
          </span>
        )}
      </div>
      <div class="review-header-actions">
        <DecisionControl
          variant="text"
          value={value}
          name={name}
          acceptText={t(`review.header.accept.${action}`)}
          rejectText={t(`review.header.reject.${action}`)}
          disabled={disabled}
          disabledReason={reason}
          describedBy={reasonId}
          onDecide={(next) => decide(target, next)}
        />
        {open && (
          <IconButton
            icon="note"
            size="sm"
            label={t('review.note.add')}
            pressed={noteShown || hasNote}
            onClick={() => {
              setNoteShown(true);
              setNoteFocus((n) => n + 1);
            }}
          />
        )}
      </div>
      {disabled && (
        <p class="review-hint muted" id={reasonId}>
          {reason}
        </p>
      )}
      {whole?.kind === 'create' && target.level !== 'proposal' && (
        <CreationInfo names={names} target={target} ids={ids} />
      )}
      {whole?.kind === 'remove' && (
        <RemovalList names={names} target={target} ids={ids} />
      )}
      <NoteField
        target={target}
        show={noteShown}
        focusSeq={noteFocus}
        onHide={() => setNoteShown(false)}
      />
      {ids.length > 1 && (
        <p class="review-hint muted">
          {t('review.details.decideHint', { count: ids.length })}
        </p>
      )}
      {rejected && <p class="review-hint muted">{t('review.note.suggested')}</p>}
      <IssueNotices target={target} ids={ids} open={open} />
      {locked && (
        <Notice tone="warning" size="sm" icon="lock" title={t('review.locked.title')}>
          <span>{t('review.locked.text')}</span>
        </Notice>
      )}
      <TogetherNotice names={names} ids={ids} />
    </section>
  );
}
