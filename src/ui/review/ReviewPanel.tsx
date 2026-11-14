import { signal, type Signal } from '@preact/signals';
import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { t } from '../../i18n';
import { projectIndex, proposalIndex, type Project } from '../../model';
import type { ReviewView } from '../../store/derived';
import {
  collapseSections,
  expandSections,
  resolveSelection,
  type AnnotationLocation,
  type Selection,
} from '../../store/ui';
import { Button } from '../controls';
import { DetailsExtensionContext } from '../DetailsExtension';
import { useEditor } from '../EditorContext';
import { ArrowPanel } from '../ArrowPanel';
import { MarkingPanel } from '../MarkingPanel';
import { Notice } from '../Notice';
import { SelectionPanel } from '../SelectionPanel';
import { createOpenMark, OpenMarkContext } from './ChangeMark';
import { canvasSelectionOf } from './canvasSelection';
import { ReviewDetails } from './ReviewDetails';
import {
  isChangeLayerHidden,
  reviewExtension,
  sectionsFor,
  sectionsForChange,
} from './reviewExtension';

// Details in review (phases 9.5 and 9.6, HANDOFF-REVIEW-DETAILS 5.1): an image and an item show
// the normal panel (`MarkingPanel`/`SelectionPanel` with the annotations), read-only, over
// the project in view (`review.derived.shownProject`), with a marker on each changed field
// and the decision header right below the identity, through the Details extension point.
// The proposal, the Project group and changes without an item have their own panel (`ReviewDetails`).
// The change selected in the Proposals window opens whatever hides it, scrolls to the field and
// highlights it; a click or Enter in the list moves focus to the marker and opens the popover.

/** The item the panel shows and which project it comes from. */
interface ShownItem {
  readonly kind: 'marking' | 'image';
  readonly id: string;
  /** The item is an arrow (v13): `kind` stays `marking` (the ids share the space and the level is the item). */
  readonly arrow: boolean;
  readonly project: Project;
  /**
   * Why the item comes from another project: it does not exist in the Proposed view (removed), it does
   * not exist yet in the current one (created) or its creation was rejected (not in the preview either).
   */
  readonly away: 'proposed' | 'current' | 'rejected' | null;
}

const has = (project: Project | null, sel: NonNullable<Selection>): boolean =>
  project !== null &&
  (sel.kind === 'image'
    ? projectIndex(project).containers.has(sel.id)
    : sel.kind === 'arrow'
      ? projectIndex(project).arrows.has(sel.id)
      : projectIndex(project).markings.has(sel.id));

/**
 * Where the item is: in the project in view; otherwise, in the Proposed view, in the current one (removed) and,
 * in the Current view, in the preview (created); lastly, in the "how it would look" without the decisions (a
 * rejected creation). `null` if it is nowhere (ReviewDetails shows the change).
 */
function shownItem(
  sel: NonNullable<Selection>,
  view: ReviewView,
  shown: Project | null,
  other: () => Project | null,
  full: () => Project | null,
): ShownItem | null {
  const at = (project: Project | null, away: ShownItem['away']): ShownItem | null =>
    project && has(project, sel)
      ? {
          kind: sel.kind === 'image' ? 'image' : 'marking',
          id: sel.id,
          arrow: sel.kind === 'arrow',
          project,
          away,
        }
      : null;
  return (
    at(shown, null) ??
    at(other(), view === 'proposed' ? 'proposed' : 'current') ??
    at(full(), 'rejected')
  );
}

interface ReviewPanelProps {
  readonly onGoToAnnotation: (annotation: AnnotationLocation) => void;
}

/** Details in review: chooses between the item panel and the level panel. */
export function ReviewPanel({ onGoToAnnotation }: ReviewPanelProps) {
  const { review, ui, store } = useEditor();
  const host = useRef<HTMLDivElement>(null);
  const hadFocus = useRef(false);
  const d = review.derived;
  const target = review.selected.value;
  const view = review.view.value;
  const shown = d.shownProject.value;
  const current = store.committed.value;
  const fromTarget = canvasSelectionOf(review, target);
  // Proposal, Project and Canvas have no normal panel; a change without an item (layer,
  // specialization, repository) does not either.
  const levelOnly =
    target?.level === 'proposal' ||
    target?.level === 'project' ||
    target?.level === 'canvas' ||
    (target?.level === 'change' && fromTarget === undefined);
  // The canvas selection follows the level (`useReviewSync`) and can also be an item without
  // changes, which the level does not follow: it is what names the item.
  const sel = levelOnly ? null : (ui.selection.value ?? fromTarget ?? null);
  const item = sel
    ? shownItem(
        sel,
        view,
        shown,
        () => (view === 'proposed' ? current : (d.preview.value?.project ?? null)),
        () => d.fullPreview.value,
      )
    : null;
  const itemKey = item ? `${item.kind}:${item.id}` : '';

  // Selecting another change of the same item (focusing a marker, the arrows of the Proposals window)
  // must not rebuild the whole panel: the item is only "another" if what the panel shows changed, and
  // the panel element is only rebuilt with it.
  const last = useRef<ShownItem | null>(null);
  const same =
    item !== null &&
    last.current !== null &&
    last.current.kind === item.kind &&
    last.current.id === item.id &&
    last.current.arrow === item.arrow &&
    last.current.project === item.project &&
    last.current.away === item.away;
  const stable = same ? last.current : item;
  last.current = stable;
  const panel = useMemo(
    () =>
      stable ? (
        <ReviewItemPanel
          key={`${stable.kind}:${stable.id}`}
          item={stable}
          onGoToAnnotation={onGoToAnnotation}
        />
      ) : null,
    [stable, onGoToAnnotation],
  );

  // Switching items unmounts the panel: if focus was in it (a marker, the popover), it stays
  // on the container, never on `body` (HANDOFF-REVIEW-DETAILS 12).
  useLayoutEffect(() => {
    const active = document.activeElement;
    if (hadFocus.current && (active === null || active === document.body)) {
      host.current?.focus();
    }
  }, [itemKey]);

  return (
    <div
      class="review-host"
      ref={host}
      tabIndex={-1}
      onFocusIn={() => (hadFocus.current = true)}
      onFocusOut={(e) => {
        const next = e.relatedTarget;
        if (next instanceof Node) {
          if (!host.current?.contains(next)) hadFocus.current = false;
          return;
        }
        // Without `relatedTarget` focus went nowhere: a click on the background (the element stays on
        // the page) or the focused element itself was removed by the item switch (then focus returns
        // to the container). Only the first case resets; the difference shows up after the removal.
        const from = e.target;
        queueMicrotask(() => {
          if (
            from instanceof Node &&
            from.isConnected &&
            !host.current?.contains(document.activeElement)
          ) {
            hadFocus.current = false;
          }
        });
      }}
    >
      {panel ?? <ReviewDetails />}
    </div>
  );
}

/**
 * Follows the change selected in the Proposals window (HANDOFF-REVIEW-DETAILS 6): opens whatever
 * hides it (the section, the layer, the annotation and, in a hidden layer, the "Show here"), leaves
 * the annotation in view beyond the "show more". Scrolling to the marker and moving focus to it belongs to
 * the marker itself (`ChangeMark`), in the commit that draws it. It is a separate component so that
 * changing the selection (or focusing a marker) rebuilds only it, not the panel.
 */
function FollowTarget({
  item,
  reveal,
  onReveal,
}: {
  readonly item: ShownItem;
  readonly reveal: Signal<string | null>;
  readonly onReveal: (revealed: boolean) => void;
}) {
  const { review, ui, store } = useEditor();
  const { kind, id, project } = item;
  const selected = review.selected.value;
  const targetId = selected?.level === 'change' ? selected.id : null;
  const proposal = review.derived.proposal.peek();
  const change =
    targetId !== null && proposal
      ? (proposalIndex(proposal).changes.get(targetId) ?? null)
      : null;
  const current = store.committed.peek();
  const hidden = ui.hiddenLayers.peek();
  useLayoutEffect(() => {
    reveal.value = change?.entity === 'annotation' ? change.entityId : null;
    if (!current || !change) return;
    const args = { kind, id, project, current };
    expandSections(ui, sectionsForChange(change, args));
    if (isChangeLayerHidden(change, { ...args, hiddenLayers: hidden })) {
      onReveal(true);
    }
    // Only when the selected change changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId]);

  return null;
}

function ReviewItemPanel({
  item,
  onGoToAnnotation,
}: ReviewPanelProps & { readonly item: ShownItem }) {
  const { review, ui, store, display } = useEditor();
  const d = review.derived;
  const index = d.fieldIndex.value;
  const tree = d.tree.value;
  const current = store.committed.value;
  const view = review.view.value;
  const hidden = ui.hiddenLayers.value;
  // "Show here" of the hidden layers: only in the panel, until the item changes (decision 4).
  const [revealed, setRevealed] = useState(false);
  const openMark = useMemo(createOpenMark, []);
  // The annotation of the selected change, which the "show more" must not leave out.
  const reveal = useMemo(() => signal<string | null>(null), []);
  const { kind, id, project } = item;
  const level = kind === 'marking' ? 'item' : 'image';
  const hasNode = tree?.nodes.has(`${level}:${id}`) === true;

  const ext = useMemo(
    () =>
      current
        ? reviewExtension({
            kind,
            id,
            project,
            current,
            index,
            view,
            hiddenLayers: hidden,
            revealed,
            onReveal: setRevealed,
            onShowCurrent: () => review.setView('current'),
            proposal: d.proposal,
            hasNode,
            reveal,
            full: () => d.fullPreview.value,
          })
        : null,
    [
      kind,
      id,
      project,
      current,
      index,
      view,
      hidden,
      revealed,
      review,
      d.proposal,
      d.fullPreview,
      hasNode,
      reveal,
    ],
  );

  // When showing the item, the sections with changes open (the others stay as the person left them).
  const proposalId = review.proposalId.value;
  useLayoutEffect(() => {
    if (!current) return;
    const { open, close } = sectionsFor({ kind, id, project, current, index });
    expandSections(ui, open);
    collapseSections(ui, close);
    // Only on arriving at the item (or switching proposals): afterwards, the person opens and closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalId, kind, id]);

  if (!current || !ext) return null;

  const resolved = resolveSelection(project, {
    kind: item.arrow ? 'arrow' : kind,
    id,
  } as NonNullable<Selection>);
  const away =
    item.away === 'proposed' ? (
      <Notice
        tone="info"
        size="sm"
        actions={
          <Button size="sm" onClick={() => review.setView('current')}>
            {t('review.panel.seeCurrent')}
          </Button>
        }
      >
        <span>{t('review.panel.notInView.proposed')}</span>
      </Notice>
    ) : item.away === 'current' ? (
      <Notice
        tone="info"
        size="sm"
        actions={
          <Button size="sm" onClick={() => review.setView('proposed')}>
            {t('review.panel.seeProposed')}
          </Button>
        }
      >
        <span>{t('review.panel.notInView.current')}</span>
      </Notice>
    ) : item.away === 'rejected' ? (
      <Notice tone="info" size="sm">
        <span>{t('review.panel.rejectedCreation')}</span>
      </Notice>
    ) : null;

  const image = resolved?.kind === 'image' ? resolved.image : null;
  const sameFile =
    image !== null && projectIndex(current).containers.get(image.id)?.file === image.file;

  return (
    <div class="review-details review-details-panel">
      <DetailsExtensionContext.Provider value={ext}>
        <OpenMarkContext.Provider value={openMark}>
          {away}
          <div class="review-panel">
            {resolved?.kind === 'arrow' ? (
              <ArrowPanel
                project={project}
                arrow={resolved.arrow}
                readOnly
                onDelete={noop}
                onGoToAnnotation={onGoToAnnotation}
              />
            ) : resolved?.kind === 'marking' ? (
              <MarkingPanel
                project={project}
                marking={resolved.marking}
                image={resolved.image}
                readOnly
                onDelete={noop}
                onGoToAnnotation={onGoToAnnotation}
              />
            ) : (
              <SelectionPanel
                image={image}
                project={project}
                display={
                  image?.file && sameFile
                    ? display.images.value.get(image.file)
                    : undefined
                }
                readOnly
                busy={false}
                onReplace={noop}
                onDelete={noop}
              />
            )}
          </div>
          <FollowTarget item={item} reveal={reveal} onReveal={setRevealed} />
        </OpenMarkContext.Provider>
      </DetailsExtensionContext.Provider>
    </div>
  );
}

/** Editing actions that the read-only panel does not use. */
const noop = () => undefined;
