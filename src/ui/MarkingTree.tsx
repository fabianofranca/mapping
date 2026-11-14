import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { t } from '../i18n';
import {
  arrowsOf,
  containerLockStates,
  projectIndex,
  type LayerDot,
  type Arrow,
  type Marking,
  type Project,
  type ProjectContainer,
} from '../model';
import {
  isItemSelected,
  revealInTree,
  selectedItems,
  toggleSelectedItem,
  toggleTreeNode,
  treeKey,
  type Selection,
  type SelectionItem,
} from '../store/ui';
import { ItemMenu } from './CopyActions';
import { useEditor } from './EditorContext';
import { isMultiSelectClick } from '../utils/platform';
import { Icon } from './icons';
import { arrowEndLabel, arrowShort, arrowText, imageLabel, markingLabel } from './labels';

interface MarkingTreeProps {
  readonly project: Project;
  readonly selection: Selection;
  readonly onSelect: (selection: NonNullable<Selection>) => void;
}

/**
 * Scrolls to the selected row (and, with `focus`, puts focus on it). Called after the
 * tree redraws, because opening the ancestors swaps the rows.
 */
export function scrollToSelected(root: HTMLElement | null, focus = false): void {
  const row = root?.querySelector<HTMLElement>('[aria-current="true"]');
  if (!row) return;
  row.scrollIntoView?.({ block: 'nearest' });
  if (focus) row.focus();
}

/** Waits for the next paint (the tree updates through a signal) before touching the DOM. */
export function afterPaint(callback: () => void): void {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(callback);
  else setTimeout(callback, 0);
}

/** Dots of the visible layers that have an annotation on the marking. */
export function LayerDots({ dots }: { readonly dots: readonly LayerDot[] }) {
  return (
    <span class="tree-dots" aria-hidden="true">
      {dots.map(({ layer }) => (
        <span
          key={layer.id}
          class="tree-dot"
          style={{ '--layer-color': layer.color }}
          title={t('tree.layerDot', { name: layer.name })}
        />
      ))}
    </span>
  );
}

/**
 * Image → nested markings tree, with collapsible nodes and the layer dots
 * on the row. Choosing an item selects it; when the selection changes from outside (canvas,
 * list, breadcrumbs), the tree opens the ancestors and scrolls to the row.
 */
export function MarkingTree({ project, selection, onSelect }: MarkingTreeProps) {
  const { ui, derived, store, actions } = useEditor();
  const readOnly = store.locked.value;
  const locks = derived.markingLocks.value;
  const collapsed = ui.collapsedTree.value;
  const dots = derived.layerDots.value;
  const projectIdx = projectIndex(project);
  const index = projectIdx.children;
  const containerLocks = useMemo(() => containerLockStates(project), [project]);
  const isSelected = (kind: SelectionItem['kind'], id: string) =>
    selection?.kind === kind && selection.id === id;
  // Multiple selection: the other selected rows (the primary keeps the usual highlight).
  const items = selectedItems(ui);
  const isGrouped = (kind: SelectionItem['kind'], id: string) =>
    items.length > 1 && isItemSelected(items, { kind, id });
  /** Shift, Ctrl (outside macOS) or Cmd+click adds or removes the item from the selection; a plain click selects. */
  const pick = (e: MouseEvent, item: SelectionItem) => {
    if (isMultiSelectClick(e)) toggleSelectedItem(ui, item);
    else onSelect(item);
  };

  const list = useRef<HTMLUListElement>(null);
  const latest = useRef({ project, selection });
  latest.current = { project, selection };
  const selectionKey = selection ? `${selection.kind}:${selection.id}` : '';
  useEffect(() => {
    const { project: current, selection: selected } = latest.current;
    if (!selected) return;
    revealInTree(ui, current, selected);
    // Only when the selection changes: collapsing a node afterwards does not pull the scroll back.
    afterPaint(() => scrollToSelected(list.current));
  }, [selectionKey, ui]);

  /** Row lock: button for its own lock; dimmed, with no action, if it comes from the parent. */
  const lockControl = (
    name: string,
    locked: boolean,
    inherited: boolean,
    toggle: () => void,
  ) =>
    inherited ? (
      <span class="tree-lock tree-lock-inherited" title={t('lock.inherited')}>
        <Icon name="lock" />
        <span class="visually-hidden">{t('lock.inherited')}</span>
      </span>
    ) : (
      <button
        type="button"
        class={locked ? 'tree-lock tree-lock-on' : 'tree-lock'}
        aria-pressed={locked}
        aria-label={t('lock.treeLock', { name })}
        title={t('lock.treeLock', { name })}
        disabled={readOnly}
        onClick={toggle}
      >
        <Icon name={locked ? 'lock' : 'unlock'} />
      </button>
    );

  const row = (
    key: string,
    depth: number,
    expandable: boolean,
    name: string,
    current: boolean,
    grouped: boolean,
    item: ComponentChildren,
    lock: ComponentChildren,
    menu: ComponentChildren,
  ) => (
    <div
      class={
        current
          ? 'tree-row tree-row-current'
          : grouped
            ? 'tree-row tree-row-selected'
            : 'tree-row'
      }
      style={{ '--depth': depth }}
    >
      {expandable ? (
        <button
          type="button"
          class="tree-toggle"
          aria-expanded={!collapsed.has(key)}
          aria-label={t(collapsed.has(key) ? 'tree.expand' : 'tree.collapse', { name })}
          onClick={() => toggleTreeNode(ui, key)}
        >
          <Icon name={collapsed.has(key) ? 'chevronRight' : 'chevronDown'} />
        </button>
      ) : (
        <span class="tree-toggle tree-toggle-empty" aria-hidden="true" />
      )}
      {item}
      {lock}
      {menu}
    </div>
  );

  /** Member containers of a canvas marking (those that have the marking as parent). */
  const membersOfMarking = (m: Marking): readonly ProjectContainer[] =>
    m.floating ? [] : (projectIdx.containersByParent.get(m.id) ?? []);

  /** Markings at the root of each container, grouped once per draw. */
  const rootsByContainer = new Map<string | null, Marking[]>();
  for (const m of index.get(null) ?? []) {
    const siblings = rootsByContainer.get(m.containerId);
    if (siblings) siblings.push(m);
    else rootsByContainer.set(m.containerId, [m]);
  }

  const containerNode = (image: ProjectContainer, depth: number) => {
    const key = treeKey('image', image.id);
    const roots = rootsByContainer.get(image.id) ?? [];
    const current = isSelected('image', image.id);
    return (
      <li key={image.id}>
        {row(
          key,
          depth,
          roots.length > 0,
          imageLabel(image),
          current,
          isGrouped('image', image.id),
          <button
            type="button"
            class="tree-item tree-image"
            title={imageLabel(image)}
            aria-current={current || undefined}
            onClick={(e) => pick(e, { kind: 'image', id: image.id })}
          >
            <span class="tree-label">{imageLabel(image)}</span>
          </button>,
          lockControl(
            imageLabel(image),
            image.locked,
            containerLocks.get(image.id) === 'inherited',
            () => actions.setImageLocked(image.id, !image.locked),
          ),
          <ItemMenu target={{ kind: 'i', id: image.id }} name={imageLabel(image)} />,
        )}
        {!collapsed.has(key) && branch(roots, depth + 1)}
      </li>
    );
  };

  /** The arrow under the source marking: "→ target" (or its name), with its own lock. */
  const arrowNode = (arrow: Arrow, depth: number) => {
    const current = isSelected('arrow', arrow.id);
    const to = arrowEndLabel(project, projectIdx.markings.get(arrow.to));
    const text = arrowShort(project, arrow);
    return (
      <li key={arrow.id}>
        {row(
          treeKey('arrow', arrow.id),
          depth,
          false,
          arrowText(project, arrow),
          current,
          isGrouped('arrow', arrow.id),
          <button
            type="button"
            class="tree-item tree-arrow"
            aria-current={current || undefined}
            aria-label={t('arrow.treeItem', { name: to })}
            title={arrowText(project, arrow)}
            onClick={(e) => pick(e, { kind: 'arrow', id: arrow.id })}
          >
            <Icon name="arrow" />
            <span class={arrow.name === null ? 'tree-label muted' : 'tree-label'}>
              {text}
            </span>
            <LayerDots dots={dots.get(arrow.id) ?? []} />
          </button>,
          lockControl(t('arrow.treeItem', { name: to }), arrow.locked, false, () =>
            actions.setArrowLocked(arrow.id, !arrow.locked),
          ),
          null,
        )}
      </li>
    );
  };

  const branch = (markings: readonly Marking[], depth: number): ComponentChildren =>
    markings.length > 0 && (
      <ul>
        {markings.map((m) => {
          // Children of the marking and, on a canvas marking, the containers it contains.
          const children = index.get(m.id) ?? [];
          const members = membersOfMarking(m);
          const arrows = arrowsOf(project, m.id).outgoing;
          const key = treeKey('marking', m.id);
          const current = isSelected('marking', m.id);
          return (
            <li key={m.id}>
              {row(
                key,
                depth,
                children.length > 0 || members.length > 0 || arrows.length > 0,
                markingLabel(project, m),
                current,
                isGrouped('marking', m.id),
                <button
                  type="button"
                  class="tree-item"
                  title={markingLabel(project, m)}
                  aria-current={current || undefined}
                  onClick={(e) => pick(e, { kind: 'marking', id: m.id })}
                >
                  {m.needsReview && (
                    <span class="tree-warning" title={t('marking.needsReview')}>
                      ⚠
                    </span>
                  )}
                  <span class={m.name === null ? 'tree-label muted' : 'tree-label'}>
                    {markingLabel(project, m)}
                  </span>
                  <LayerDots dots={dots.get(m.id) ?? []} />
                </button>,
                lockControl(
                  markingLabel(project, m),
                  m.locked,
                  locks.get(m.id) === 'inherited',
                  () => actions.setMarkingLocked(m.id, !m.locked),
                ),
                <ItemMenu
                  target={{ kind: 'm', id: m.id }}
                  name={markingLabel(project, m)}
                />,
              )}
              {!collapsed.has(key) && (
                <>
                  {branch(children, depth + 1)}
                  {members.length > 0 && (
                    <ul>{members.map((image) => containerNode(image, depth + 1))}</ul>
                  )}
                  {arrows.length > 0 && (
                    <ul>{arrows.map((arrow) => arrowNode(arrow, depth + 1))}</ul>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
    );

  const canvasRoots = rootsByContainer.get(null) ?? [];
  const topContainers = projectIdx.containersByParent.get(null) ?? [];
  const canvasKey = treeKey('canvas', '');
  const canvasName = t('canvas.name');

  if (project.containers.length === 0 && canvasRoots.length === 0) {
    return <p class="muted">{t('panel.treeEmpty')}</p>;
  }
  return (
    <ul class="tree" aria-label={t('panel.treeTitle')} ref={list}>
      {canvasRoots.length > 0 && (
        <li key="canvas">
          {row(
            canvasKey,
            0,
            true,
            canvasName,
            false,
            false,
            <button
              type="button"
              class="tree-item tree-canvas"
              title={canvasName}
              onClick={() => toggleTreeNode(ui, canvasKey)}
            >
              <span class="tree-label">{canvasName}</span>
            </button>,
            null,
            null,
          )}
          {!collapsed.has(canvasKey) && branch(canvasRoots, 1)}
        </li>
      )}
      {topContainers.map((image) => containerNode(image, 0))}
    </ul>
  );
}
