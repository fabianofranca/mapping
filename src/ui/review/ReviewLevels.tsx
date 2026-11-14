import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { t } from '../../i18n';
import { BREAKPOINTS } from '../../theme/breakpoints';
import {
  CANVAS_FILTER,
  CHANGE_TYPES,
  hasActiveFilters,
  reviewKey,
  type Change,
  type ChangeType,
  type ReviewFilters as ReviewFiltersState,
  type LevelSummary,
  type Proposal,
  type ReviewTarget,
} from '../../model';
import { useEditor } from '../EditorContext';
import { Icon } from '../icons';
import { Popover } from '../Popover';
import { Notice } from '../Notice';
import { useMediaQuery } from '../useMediaQuery';
import { Button, Chip, Choice, IconButton, Segmented, Select } from '../controls';
import { ChangeKind, changeKindLabel } from './ChangeKind';
import { changeSummary, changeTitle, targetName, type ReviewNames } from './changeText';
import { REVIEW_KEYS, type DecisionValue } from './DecisionControl';
import { Flag } from './Flag';
import { DecisionCounts } from './ProposalRow';
import { changeBadge, levelBadge } from './RevisedFlag';
import { ReviewRow } from './ReviewRow';
import {
  allNodeKeys,
  ancestorKeys,
  buildLevelRows,
  initiallyCollapsed,
  levelParents,
  rowDomId,
  rowPositions,
  type LevelRow,
} from './levelRows';
import { useDecide, useReviewNames, useReviewNavigate } from './useReview';
import { useReviewCommands } from './useReviewCommands';

// Proposals window in review mode (HANDOFF-PROPOSALS 5.2 and 5.4): filters (type, image,
// layer, decision, conflicts only), the Project → Image → Item → Change levels with the
// three-state decision on each one, and the shortcuts footer. The list is virtualized
// (thousands of changes): only the rows in view are drawn. A large proposal starts
// with the images collapsed, except the selected one.

/** Above this the proposal starts with the groups collapsed (HANDOFF-PROPOSALS 5.4). */
export const LARGE_PROPOSAL = 150;
/** Rows drawn beyond the visible ones, so scrolling does not flicker. */
const OVERSCAN = 12;
/** Without a measurement (first frame, tests), how many rows to draw. */
const UNMEASURED_ROWS = 80;

function decisionOf(p: Proposal, changeId: string): DecisionValue {
  return p.decisions[changeId]?.state ?? null;
}

function levelValue(summary: LevelSummary | undefined): DecisionValue {
  if (summary?.state === 'accepted') return 'accepted';
  if (summary?.state === 'rejected') return 'rejected';
  return null;
}

/**
 * Window of the rows in view inside the scrolling container. Keeps only the index of the first
 * visible row: scrolling within the same row does not render again.
 */
function useVirtualWindow(count: number, scroller: { current: HTMLElement | null }) {
  const [view, setView] = useState({ first: 0, height: 0, row: 0 });
  const measureRef = useRef(() => {});
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => {
      // The height comes from an item row: the group header (replaced proposal) has
      // another height.
      const item = el.querySelector<HTMLElement>('[data-row]:not([data-group])');
      const row = item?.offsetHeight ?? 0;
      const next = {
        first: row > 0 ? Math.floor(el.scrollTop / row) : 0,
        height: el.clientHeight,
        row,
      };
      setView((v) =>
        v.first === next.first && v.height === next.height && v.row === next.row
          ? v
          : next,
      );
    };
    measureRef.current = measure;
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const observer =
      typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(el);
    return () => {
      el.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, [scroller]);
  // New rows (or the first time with rows): measures the row height again.
  useLayoutEffect(() => measureRef.current(), [count]);
  const measure = () => measureRef.current();
  if (view.row <= 0 || view.height <= 0) {
    return { start: 0, end: Math.min(count, UNMEASURED_ROWS), row: 0, measure };
  }
  const start = Math.max(0, view.first - OVERSCAN);
  const end = Math.min(
    count,
    view.first + Math.ceil(view.height / view.row) + 1 + OVERSCAN,
  );
  return { start, end, row: view.row, measure };
}

/**
 * How many filter groups are active (decision, types, image, layer, conflicts only):
 * counts groups, not values.
 */
export function activeFilterGroups(f: ReviewFiltersState): number {
  return activeFilterConditions(f).filter(Boolean).length;
}

/**
 * One condition per filter group (decision, types, image, layer, conflicts only,
 * reviewed only): `true` when the group is active. `hasActiveFilters`
 * (`src/model/proposalView.ts`) has the same list; the `activeFilterGroups` test checks
 * the two.
 */
export function activeFilterConditions(f: ReviewFiltersState): readonly boolean[] {
  return [
    f.decision !== 'all',
    f.types.length > 0,
    f.imageId !== null,
    f.layerId !== null,
    f.onlyConflicts,
    f.onlyRevised,
  ];
}

/**
 * Review filters, collapsed into one row: the **Filters** button (with the count of active
 * groups) opens a popover with the controls. Choosing a filter does not close the popover.
 */
export function ReviewFilters({ names }: { readonly names: ReviewNames }) {
  const { review } = useEditor();
  const d = review.derived;
  const filters = review.filters.value;
  const counts = d.counts.value;
  const tree = d.tree.value;
  const active = hasActiveFilters(filters);
  const groups = activeFilterGroups(filters);
  const shown = d.visibleIds.value.length;
  const images = (tree?.root.children ?? []).filter((n) => n.level === 'image');
  const hasCanvas = (tree?.changeIdsOf({ level: 'canvas', id: null }).length ?? 0) > 0;
  const layers = names.preview?.layers ?? names.current.layers;
  const toggleType = (type: ChangeType) => {
    const set = new Set(filters.types);
    if (set.has(type)) set.delete(type);
    else set.add(type);
    review.setFilters({ types: CHANGE_TYPES.filter((x) => set.has(x)) });
  };
  return (
    <div class="review-filters">
      <Popover
        panelClass="review-filters-panel"
        label={t('review.filters')}
        trigger={({ open, toggle }) => (
          <Button size="sm" aria-haspopup="dialog" aria-expanded={open} onClick={toggle}>
            <Icon name="filter" />
            {groups > 0
              ? t('review.filtersButtonCount', { count: groups })
              : t('review.filtersButton')}
          </Button>
        )}
      >
        <Segmented
          label={t('review.filter.decision')}
          value={filters.decision}
          onSelect={(decision) => review.setFilters({ decision })}
          items={[
            { id: 'all', label: t('review.filter.all', { count: counts.total }) },
            {
              id: 'undecided',
              label: t('review.filter.undecided', { count: counts.undecided }),
            },
            {
              id: 'accepted',
              label: t('review.filter.accepted', { count: counts.accepted }),
            },
            {
              id: 'rejected',
              label: t('review.filter.rejected', { count: counts.rejected }),
            },
          ]}
        />
        <span class="review-chips" role="group" aria-label={t('review.filter.type')}>
          {CHANGE_TYPES.map((type) => (
            <Chip
              key={type}
              pressed={filters.types.includes(type)}
              onClick={() => toggleType(type)}
            >
              <ChangeKind type={type} size="sm" decorative />
              {changeKindLabel(type)}
            </Chip>
          ))}
        </span>
        <span class="review-select">
          <Select
            size="sm"
            aria-label={t('review.filter.image')}
            value={filters.imageId ?? ''}
            onChange={(e) =>
              review.setFilters({ imageId: e.currentTarget.value || null })
            }
          >
            <option value="">{t('review.filter.allImages')}</option>
            {hasCanvas && (
              <option value={CANVAS_FILTER}>{t('review.filter.canvas')}</option>
            )}
            {images.map((n) => (
              <option key={n.id} value={n.id ?? ''}>
                {targetName(names, { level: 'image', id: n.id })}
              </option>
            ))}
          </Select>
        </span>
        <span class="review-select">
          <Select
            size="sm"
            aria-label={t('review.filter.layer')}
            value={filters.layerId ?? ''}
            onChange={(e) =>
              review.setFilters({ layerId: e.currentTarget.value || null })
            }
          >
            <option value="">{t('review.filter.allLayers')}</option>
            {layers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </span>
        <Choice
          checked={filters.onlyConflicts}
          label={t('review.filter.onlyConflicts', { count: counts.conflicts })}
          onChange={(e) => review.setFilters({ onlyConflicts: e.currentTarget.checked })}
        />
        {(counts.revised > 0 || filters.onlyRevised) && (
          <Choice
            checked={filters.onlyRevised}
            label={t('review.filter.onlyRevised', { count: counts.revised })}
            onChange={(e) => review.setFilters({ onlyRevised: e.currentTarget.checked })}
          />
        )}
      </Popover>
      {active && (
        <>
          <span class="muted review-shown">
            {t('review.filter.shown', { shown, total: counts.total })}
          </span>
          <Button size="sm" variant="ghost" onClick={() => review.clearFilters()}>
            {t('review.filter.clear')}
          </Button>
        </>
      )}
    </div>
  );
}

/**
 * Footer with the main shortcuts (desktop). In a narrow window (same threshold as
 * `ReviewBar`) it shows only the first three, on one line; the others still work by
 * keyboard and in Help › Shortcuts.
 */
function ShortcutFooter() {
  const compact = useMediaQuery(`(max-width: ${BREAKPOINTS.compact}px)`);
  const all: readonly [string, string][] = [
    [REVIEW_KEYS.accept, t('review.accept')],
    [REVIEW_KEYS.reject, t('review.reject')],
    [REVIEW_KEYS.nextPending, t('review.nextPending')],
    [REVIEW_KEYS.nextConflict, t('review.nextConflict')],
    [REVIEW_KEYS.toggleView, t('review.view.toggle')],
    [REVIEW_KEYS.apply, t('review.applyShort')],
  ];
  const items = compact ? all.slice(0, 3) : all;
  return (
    <div
      class={compact ? 'review-footer review-footer-compact' : 'review-footer'}
      role="group"
      aria-label={t('review.shortcuts')}
    >
      {items.map(([key, label]) => (
        <span key={key}>
          <kbd class="kbd">{key}</kbd>
          {label}
        </span>
      ))}
    </div>
  );
}

/** Rows of a replaced proposal: "No decision / Accepted, not applied / Rejected". */
type SupersededRow =
  | {
      readonly kind: 'group';
      readonly key: string;
      readonly label: string;
      readonly count: number;
    }
  | { readonly kind: 'change'; readonly key: string; readonly id: string };

function supersededRows(review: ReturnType<typeof useEditor>['review']): SupersededRow[] {
  const s = review.derived.supersession.value;
  if (!s) return [];
  const visible = new Set(review.derived.visibleIds.value);
  const out: SupersededRow[] = [];
  const groups: [string, readonly string[]][] = [
    [t('review.superseded.undecided'), s.leftBehind.undecided],
    [t('review.superseded.acceptedPending'), s.leftBehind.acceptedPending],
    [t('review.superseded.rejected'), s.leftBehind.rejected],
  ];
  for (const [label, ids] of groups) {
    const shown = ids.filter((id) => visible.has(id));
    if (shown.length === 0) continue;
    out.push({ kind: 'group', key: `group:${label}`, label, count: shown.length });
    for (const id of shown) out.push({ kind: 'change', key: `change:${id}`, id });
  }
  return out;
}

export function ReviewLevels() {
  const { review, canvas } = useEditor();
  const names = useReviewNames();
  const d = review.derived;
  const p = d.proposal.value;
  const tree = d.tree.value;
  const decide = useDecide();
  const navigate = useReviewNavigate();
  const scroller = useRef<HTMLDivElement>(null);

  // Collapsed nodes: state of this window, new for each proposal.
  const [collapsedState, setCollapsed] = useState<{
    readonly id: string | null;
    readonly keys: ReadonlySet<string>;
  }>({ id: null, keys: new Set() });
  const proposalId = p?.id ?? null;
  const large = (p?.changes.length ?? 0) > LARGE_PROPOSAL;
  const collapsed = useMemo(
    (): ReadonlySet<string> =>
      collapsedState.id === proposalId
        ? collapsedState.keys
        : tree && large
          ? initiallyCollapsed(tree)
          : new Set<string>(),
    [collapsedState, proposalId, tree, large],
  );
  const setKeys = (keys: ReadonlySet<string>) =>
    setCollapsed({ id: p?.id ?? null, keys });

  const parents = useMemo(
    () => (tree ? levelParents(tree) : new Map<string, string>()),
    [tree],
  );
  const selected = review.selected.value;
  const selectedKey = selected ? reviewKey(selected) : null;

  // A selection that changes (N, C, canvas, Details) opens the collapsed groups down to it.
  useEffect(() => {
    if (!selectedKey) return;
    const closed = ancestorKeys(parents, selectedKey).filter((k) => collapsed.has(k));
    if (closed.length === 0) return;
    const next = new Set(collapsed);
    for (const k of closed) next.delete(k);
    setKeys(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, parents]);

  const filters = review.filters.value;
  const visibleIds = d.visibleIds.value;
  const active = hasActiveFilters(filters);
  const superseded = p?.status === 'superseded';
  const rows: readonly LevelRow[] = useMemo(
    () =>
      tree && !superseded
        ? buildLevelRows(tree, {
            visible: active ? new Set(visibleIds) : null,
            collapsed,
          })
        : [],
    [tree, superseded, active, visibleIds, collapsed],
  );
  const flat = superseded ? supersededRows(review) : null;
  const count = flat ? flat.length : rows.length;
  const win = useVirtualWindow(count, scroller);

  // Scrolls to the selected row when it changes (keyboard, N, canvas) and when the row's
  // measurement arrives after the first render. Scrolls once per selection: expanding or
  // collapsing a group afterwards does not make the list jump back.
  const measured = win.row > 0;
  const scrolledTo = useRef<string | null>(null);
  useEffect(() => {
    const el = scroller.current;
    if (!el || !selectedKey) {
      scrolledTo.current = null;
      return;
    }
    const scope = `${proposalId}|${selectedKey}`;
    if (scrolledTo.current === scope) return;
    const index = flat
      ? flat.findIndex((r) => r.key === selectedKey)
      : rows.findIndex((r) => r.key === selectedKey);
    if (index < 0 || !measured) return;
    scrolledTo.current = scope;
    const top = index * win.row;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + win.row > el.scrollTop + el.clientHeight) {
      el.scrollTop = top + win.row - el.clientHeight;
    }
    // The window follows right away: the selected row stays drawn (target of the activedescendant).
    win.measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, proposalId, count, measured]);

  const positions = useMemo(
    () =>
      rowPositions(
        flat ? flat.filter((r) => r.kind === 'change') : rows,
        flat ? new Map<string, string>() : parents,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, parents, superseded],
  );
  const selectedIndex = selectedKey
    ? flat
      ? flat.findIndex((r) => r.key === selectedKey)
      : rows.findIndex((r) => r.key === selectedKey)
    : -1;

  if (!p || !tree || !names) return null;

  const levels = d.levels.value;
  const types = d.changeTypes.value;
  const levelTypes = d.levelTypes.value;
  const situation = d.situation.value;
  const conflicts = d.conflictIds.value;
  const revisedIds = d.revisedIds.value;
  const invalid = d.invalid.value;
  const notes = d.notes.value;
  const fresh = review.newConflicts.value;
  const staleFresh = review.staleNotice.value;
  const undo = review.undoable.value;
  const together = new Set(undo?.cascaded ?? []);
  const comparison = d.supersession.value?.comparison ?? null;
  const open = p.status === 'open';
  const changesById = new Map(p.changes.map((c) => [c.id, c]));
  const closedReason = open ? undefined : t('review.closedReason');

  const toggle = (key: string) => {
    const next = new Set(collapsed);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setKeys(next);
  };

  const changeRow = (c: Change, key: string, depth: number) => {
    const target: ReviewTarget = { level: 'change', id: c.id };
    const decision = decisionOf(p, c.id);
    const state = decision ?? 'undecided';
    const s = situation.get(c.id);
    const conflict = conflicts.has(c.id);
    const applied = Object.hasOwn(p.applied, c.id);
    const compare = comparison?.get(c.id);
    const label = changeTitle(names, c);
    const summaryText = changeSummary(names, c);
    return (
      <ReviewRow
        key={key}
        rowKey={key}
        depth={depth}
        label={label}
        state={state}
        type={types.get(c.id) ?? null}
        expandable={false}
        expanded={false}
        selected={selectedKey === key}
        position={positions.get(key)}
        invalid={invalid.changeIds.has(c.id)}
        revised={changeBadge(p, revisedIds, c.id)}
        conflict={conflict}
        decision={decision}
        decisionDisabled={!open || applied}
        disabledReason={applied ? t('review.appliedReason') : closedReason}
        summary={
          <span class="review-row-text" title={summaryText}>
            {summaryText}
          </span>
        }
        flags={
          <>
            {s?.locked && (
              <span class="review-row-icon" title={t('review.lockedItem')}>
                <Icon name="lock" />
              </span>
            )}
            {conflict && (
              <Flag tone="warn" icon="warning">
                {fresh.has(c.id)
                  ? t('review.flag.newConflict')
                  : t('review.flag.conflict')}
              </Flag>
            )}
            {invalid.changeIds.has(c.id) && (
              <Flag tone="danger">{t('review.flag.involved')}</Flag>
            )}
            {together.has(c.id) && (
              <Flag icon="link" title={t('review.flag.togetherHint')}>
                {t('review.flag.together')}
              </Flag>
            )}
            {applied && <Flag tone="ok">{t('review.flag.applied')}</Flag>}
            {compare && (
              <Flag tone={compare === 'missing' ? 'danger' : 'neutral'}>
                {t(`review.compare.${compare}`)}
              </Flag>
            )}
            {notes.has(key) && (
              <span class="review-row-icon" title={t('review.hasNote')}>
                <Icon name="note" />
              </span>
            )}
          </>
        }
        onSelect={() => {
          // Click on the change: focus goes to its marker in Details (the arrows only scroll).
          navigate(target);
          review.requestMark(c.id);
        }}
        onToggle={() => {}}
        onDecide={(state) => decide(target, state)}
      />
    );
  };

  const nodeRow = (row: LevelRow) => {
    const summary = levels.get(row.key);
    const ids = tree.changeIdsOf(row.target);
    const hasConflict = ids.some((id) => conflicts.has(id));
    const hasLock = ids.some((id) => situation.get(id)?.locked === true);
    const label = targetName(names, row.target);
    const isInvalid = ids.some((id) => invalid.changeIds.has(id));
    return (
      <ReviewRow
        key={row.key}
        rowKey={row.key}
        depth={row.depth}
        label={label}
        state={summary?.state ?? 'undecided'}
        counts={summary}
        type={row.target.level === 'proposal' ? null : (levelTypes.get(row.key) ?? null)}
        expandable={row.expandable}
        expanded={row.expanded}
        selected={selectedKey === row.key}
        position={positions.get(row.key)}
        invalid={isInvalid}
        revised={levelBadge(row.target.level, revisedIds, ids)}
        decision={levelValue(summary)}
        decisionDisabled={
          !open || (summary !== undefined && summary.applied === summary.total)
        }
        disabledReason={closedReason}
        summary={
          summary && (
            <>
              <DecisionCounts
                undecided={summary.undecided}
                accepted={summary.accepted}
                rejected={summary.rejected}
              />
              {p.changes.length > LARGE_PROPOSAL && row.target.level === 'image' && (
                <ProgressBar summary={summary} />
              )}
            </>
          )
        }
        flags={
          <>
            {hasLock && (
              <span class="review-row-icon" title={t('review.lockedItem')}>
                <Icon name="lock" />
              </span>
            )}
            {hasConflict && (
              <span
                class="review-row-icon review-row-warn"
                title={t('review.hasConflict')}
              >
                <Icon name="warning" />
              </span>
            )}
            {notes.has(row.key) && (
              <span class="review-row-icon" title={t('review.hasNote')}>
                <Icon name="note" />
              </span>
            )}
          </>
        }
        onSelect={() => navigate(row.target)}
        onToggle={() => toggle(row.key)}
        onDecide={(state) => decide(row.target, state)}
      />
    );
  };

  const keys: readonly string[] = flat
    ? flat.filter((r) => r.kind === 'change').map((r) => r.key)
    : rows.map((r) => r.key);

  const onKeyDown = (e: KeyboardEvent) => {
    // Only with focus on the tree itself: on the row's buttons the keys belong to them.
    if (e.target !== e.currentTarget || e.altKey || e.ctrlKey || e.metaKey) return;
    const at = selectedKey ? keys.indexOf(selectedKey) : -1;
    const go = (index: number) => {
      const key = keys[index];
      if (key === undefined) return;
      e.preventDefault();
      const [level, ...rest] = key.split(':');
      const id = rest.join(':');
      navigate(
        {
          level: level as ReviewTarget['level'],
          id:
            level === 'proposal' || level === 'project' || level === 'canvas' ? null : id,
        },
        false,
      );
    };
    if (e.key === 'ArrowDown') go(Math.min(keys.length - 1, at + 1));
    else if (e.key === 'ArrowUp') go(Math.max(0, at - 1));
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(keys.length - 1);
    else if (e.key === 'Enter' && selected) {
      e.preventDefault();
      navigate(selected, true);
      if (selected.level === 'change' && selected.id !== null) {
        review.requestMark(selected.id);
      }
    } else if (!flat && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const row = rows[at];
      if (!row) return;
      e.preventDefault();
      if (e.key === 'ArrowRight' && row.expandable && !row.expanded) toggle(row.key);
      else if (e.key === 'ArrowLeft' && row.expanded) toggle(row.key);
      else if (e.key === 'ArrowLeft') {
        const parent = parents.get(row.key);
        const index = parent ? keys.indexOf(parent) : -1;
        if (index >= 0) go(index);
      }
    }
  };

  const supersession = d.supersession.value;
  // The X goes away with the notice: focus goes to the list, never to the body.
  const dismissNotice = (dismiss: () => void) => {
    dismiss();
    scroller.current?.focus();
  };
  const allKeys = allNodeKeys(tree);

  return (
    <div class="review-levels">
      <ReviewFilters names={names} />
      {staleFresh.size > 0 && !superseded && (
        <Notice
          tone="warning"
          size="line"
          hint={`${t('review.stale.title')} ${t('review.stale.text', { count: staleFresh.size })}`}
          actions={
            <Button
              size="sm"
              aria-label={t('review.stale.show', { count: staleFresh.size })}
              onClick={() => {
                review.setFilters({ onlyConflicts: true });
                if (review.step('conflict', 1)) canvas.current?.centerSelection();
              }}
            >
              {t('review.stale.showShort')}
            </Button>
          }
          onDismiss={() => dismissNotice(review.dismissStaleNotice)}
        >
          {t('review.stale.short', { count: staleFresh.size })}
        </Notice>
      )}
      {superseded && !review.supersededDismissed.value && (
        <Notice
          tone="warning"
          size="line"
          hint={`${t('review.superseded.title')} ${t('review.superseded.text')}`}
          actions={
            supersession?.by && (
              <OpenNewer id={supersession.by.id} title={supersession.by.title} />
            )
          }
          onDismiss={() => dismissNotice(review.dismissSupersededNotice)}
        >
          {t('review.superseded.short')}
        </Notice>
      )}
      <div class="review-levels-head" role="presentation">
        <span>{t('review.column.name')}</span>
        <span>{t('review.column.summary')}</span>
        <span class="review-levels-tools">
          {!flat && (
            <>
              <IconButton
                icon="expandAll"
                size="sm"
                label={t('review.expandAll')}
                onClick={() => setKeys(new Set())}
              />
              <IconButton
                icon="collapseAll"
                size="sm"
                label={t('review.collapseAll')}
                onClick={() => setKeys(allKeys)}
              />
            </>
          )}
        </span>
      </div>
      <div
        ref={scroller}
        class="review-levels-body"
        role="tree"
        aria-label={t('review.levels')}
        tabIndex={0}
        aria-activedescendant={
          selectedKey && selectedIndex >= win.start && selectedIndex < win.end
            ? rowDomId(selectedKey)
            : undefined
        }
        onKeyDown={onKeyDown}
      >
        <div style={{ height: `${win.start * win.row}px` }} aria-hidden="true" />
        {flat
          ? flat.slice(win.start, win.end).map((r) => {
              if (r.kind === 'group') {
                return (
                  <div
                    key={r.key}
                    class="review-group"
                    role="presentation"
                    data-row={r.key}
                    data-group=""
                  >
                    <b>{r.label}</b>
                    <span>{r.count}</span>
                  </div>
                );
              }
              const c = changesById.get(r.id);
              return c ? changeRow(c, r.key, 1) : null;
            })
          : rows.slice(win.start, win.end).map((row) => {
              if (row.target.level !== 'change') return nodeRow(row);
              const c = changesById.get(row.target.id ?? '');
              return c ? changeRow(c, row.key, row.depth) : null;
            })}
        <div style={{ height: `${(count - win.end) * win.row}px` }} aria-hidden="true" />
        {count === 0 && <p class="muted review-none">{t('review.noneShown')}</p>}
      </div>
      <ShortcutFooter />
    </div>
  );
}

/** Progress bar of large proposals (accepted and rejected). */
export function ProgressBar({
  summary,
  wide,
}: {
  readonly summary: Pick<LevelSummary, 'accepted' | 'rejected' | 'undecided' | 'total'>;
  readonly wide?: boolean;
}) {
  const total = Math.max(1, summary.total);
  return (
    <span
      class={wide ? 'review-progress review-progress-wide' : 'review-progress'}
      role="img"
      aria-label={t('proposals.progressLabel', {
        accepted: summary.accepted,
        rejected: summary.rejected,
        undecided: summary.undecided,
      })}
    >
      <i
        class="review-progress-yes"
        style={{ width: `${(summary.accepted / total) * 100}%` }}
      />
      <i
        class="review-progress-no"
        style={{ width: `${(summary.rejected / total) * 100}%` }}
      />
    </span>
  );
}

/** "Open the new one": the proposal that replaced this one. */
export function OpenNewer({
  id,
  title,
}: {
  readonly id: string;
  readonly title: string;
}) {
  const { openReview } = useReviewCommands();
  return (
    <Button
      size="sm"
      aria-label={t('review.superseded.openNewNamed', { title })}
      onClick={() => openReview(id)}
    >
      {t('review.superseded.openNew')}
    </Button>
  );
}
