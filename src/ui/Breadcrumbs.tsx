import { Fragment } from 'preact';
import { t } from '../i18n';
import { ancestorsOf, type Marking, type Project, type ProjectContainer } from '../model';
import { resolveSelection, type Selection } from '../store/ui';
import { drawHintVisible } from '../store/drawHint';
import { selectionProject } from '../store/shownSelection';
import { ActionMenu } from './ActionMenu';
import { useEditor } from './EditorContext';
import { Icon } from './icons';
import { arrowText, imageLabel, markingLabel } from './labels';

// Selection path above the canvas (B11): Image › Marking › Marking. Clicking a
// level selects that item; Alt+↑ and Alt+↓ walk along the path (see `app/shortcuts.ts`).

interface Crumb {
  /** What the click selects; `null` at the Canvas level, which only labels. */
  readonly selection: Selection;
  readonly label: string;
  readonly name: string;
}

function imageCrumb(image: ProjectContainer): Crumb {
  const name = imageLabel(image);
  return {
    selection: { kind: 'image', id: image.id },
    name,
    label: t('crumbs.image', { name }),
  };
}

function markingCrumb(project: Project, marking: Marking): Crumb {
  const name = markingLabel(project, marking);
  return {
    selection: { kind: 'marking', id: marking.id },
    name,
    label: t('crumbs.marking', { name }),
  };
}

function canvasCrumb(): Crumb {
  return { selection: null, name: t('canvas.name'), label: t('crumbs.canvas') };
}

/** Canvas markings that contain the container, from the outermost to the innermost. */
function canvasChain(project: Project, parentId: string | null): Marking[] {
  if (parentId === null) return [];
  return [
    ...ancestorsOf(project, parentId).reverse(),
    project.markings.find((m) => m.id === parentId),
  ].filter((m): m is Marking => m !== undefined);
}

/**
  * Selection path: Canvas › canvas markings › container › markings. The first level
  * (Canvas) only labels: there is no canvas item to select.
 */
export function crumbsOf(project: Project | null, selection: Selection): Crumb[] {
  const resolved = resolveSelection(project, selection);
  if (!project || !resolved) return [];
  // The arrow is a leaf: its path is "Origin → Target" (the name, if any).
  if (resolved.kind === 'arrow') {
    const name = arrowText(project, resolved.arrow);
    return [
      canvasCrumb(),
      {
        selection: { kind: 'arrow', id: resolved.arrow.id },
        name,
        label: t('crumbs.arrow', { name }),
      },
    ];
  }
  if (resolved.kind === 'image') {
    return [
      canvasCrumb(),
      ...canvasChain(project, resolved.image.parentId).map((m) =>
        markingCrumb(project, m),
      ),
      imageCrumb(resolved.image),
    ];
  }
  const chain = [
    ...ancestorsOf(project, resolved.marking.id).reverse(),
    resolved.marking,
  ];
  if (resolved.image === null)
    return [canvasCrumb(), ...chain.map((m) => markingCrumb(project, m))];
  return [
    canvasCrumb(),
    ...canvasChain(project, resolved.image.parentId).map((m) => markingCrumb(project, m)),
    imageCrumb(resolved.image),
    ...chain.map((m) => markingCrumb(project, m)),
  ];
}

/**
  * The "…" of the collapsed path: the CSS hides the middle segments and shows this button in the
  * narrow bar (container query); the menu lists the whole path and each level selects its own.
 */
function PathMenu({
  crumbs,
  onSelect,
}: {
  readonly crumbs: readonly Crumb[];
  readonly onSelect: (selection: NonNullable<Selection>) => void;
}) {
  const items = crumbs.map((crumb, i) => ({
    label: crumb.name,
    current: i === crumbs.length - 1,
    disabled: crumb.selection === null,
    onSelect: () => {
      if (crumb.selection) onSelect(crumb.selection);
    },
  }));
  return (
    <span class="crumb-more">
      <span class="crumb-sep" aria-hidden="true">
        ›
      </span>
      <ActionMenu
        icon="more"
        label={t('crumbs.showFull')}
        menuLabel={t('crumbs.menu')}
        items={items}
      />
    </span>
  );
}

function crumbIcon(kind: NonNullable<Selection>['kind']): 'image' | 'arrow' | 'marking' {
  if (kind === 'image') return 'image';
  return kind === 'arrow' ? 'arrow' : 'marking';
}

/** A path segment; the middle ones (neither the first nor the last) go away in the narrow bar. */
function CrumbItem({
  crumb,
  first,
  last,
  onSelect,
}: {
  readonly crumb: Crumb;
  readonly first: boolean;
  readonly last: boolean;
  readonly onSelect: (selection: NonNullable<Selection>) => void;
}) {
  const { selection: target } = crumb;
  const name = (
    <span class="crumb-name" title={crumb.name}>
      {crumb.name}
    </span>
  );
  return (
    <span class={first || last ? 'crumb-item' : 'crumb-item crumb-mid'}>
      {!first && (
        <span class="crumb-sep" aria-hidden="true">
          ›
        </span>
      )}
      {target ? (
        <button
          type="button"
          class="crumb"
          aria-label={crumb.label}
          aria-current={last ? 'location' : undefined}
          onClick={() => onSelect(target)}
        >
          <Icon name={crumbIcon(target.kind)} />
          {name}
        </button>
      ) : (
        <span class="crumb crumb-static" aria-label={crumb.label}>
          {name}
        </span>
      )}
    </span>
  );
}

export function Breadcrumbs({
  onSelect,
}: {
  readonly onSelect: (selection: NonNullable<Selection>) => void;
}) {
  const { review, store, ui } = useEditor();
  // The project in view: in the review's Proposed view, an item that only exists in the proposal
  // also has a path (phase 8.2, P1), and that of a rejected creation, through the preview without
  // decisions.
  const selection = ui.selection.value;
  const crumbs = crumbsOf(selectionProject(review, selection), selection);
  const hint = drawHintVisible({
    mode: ui.mode.value,
    locked: store.locked.value,
    selection,
    shownProject: review.derived.shownProject.value,
  });
  const emptyText = hint ? t('editor.drawHint') : t('panel.nothingSelected');
  return (
    <nav class="crumbs" aria-label={t('crumbs.label')}>
      {crumbs.length === 0 && (
        <span class="crumbs-empty" title={emptyText}>
          {emptyText}
        </span>
      )}
      {crumbs.map((crumb, i) => (
        <Fragment
          key={
            crumb.selection ? `${crumb.selection.kind}:${crumb.selection.id}` : 'canvas'
          }
        >
          {i === 1 && crumbs.length >= 3 && (
            <PathMenu crumbs={crumbs} onSelect={onSelect} />
          )}
          <CrumbItem
            crumb={crumb}
            first={i === 0}
            last={i === crumbs.length - 1}
            onSelect={onSelect}
          />
        </Fragment>
      ))}
    </nav>
  );
}
