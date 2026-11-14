import { useId, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import {
  fieldLabel,
  findCellRefTargets,
  findRefTargets,
  acceptedAnnotationTypes,
  parseRefValue,
  projectIndex,
  tableRows,
  typeOfAnnotation,
  type Annotation,
  type Project,
  type RefTarget,
  type SpecField,
  type SpecRefColumn,
} from '../model';
import { IconButton, Tabs, type TabItem } from './controls';
import { useFocusOrigin, useModal, type FocusReturn } from './focus';
import { Icon } from './icons';
import { imageLabel, markingPath } from './labels';
import { annotationSourceLabel, labelTexts } from './typedText';

// Reference picker in the "go to symbol" style (B14): 600px popup at the top,
// without a darkened backdrop, with search, tabs by accepted label
// (P5) and keyboard: ↑↓ navigate, Enter picks, Ctrl+Enter picks and goes to the target,
// Esc closes. On closing (Esc, click outside or pick), focus returns to whoever opened it, as in
// `Dialog`: after the picker leaves the screen, because with it open the rest is inert.

/** `ref` field of the annotation or `ref` column of a table: the picker reads `key`, `label` and `accepts`. */
export type RefFieldDef = Extract<SpecField, { type: 'ref' }> | SpecRefColumn;

/** The cell the picker edits: the type's table and the row (the `field` is the column). */
export interface RefCellTarget {
  readonly tableKey: string;
  readonly rowId: string;
}

/** Filter tab: all, an accepted label, an accepted annotation type or only the free tuples. */
type Filter =
  | { readonly kind: 'all' }
  | { readonly kind: 'tag'; readonly tag: string }
  | { readonly kind: 'type'; readonly typeId: string; readonly name: string }
  | { readonly kind: 'free' };

interface TargetGroup {
  readonly annotation: Annotation;
  readonly context: string;
  readonly items: RefTarget[];
}

/** Groups the targets by annotation, with the "image › marking" context. */
function groupTargets(project: Project, targets: readonly RefTarget[]): TargetGroup[] {
  const index = projectIndex(project);
  const groups = new Map<string, TargetGroup>();
  for (const target of targets) {
    const id = target.annotation.id;
    let group = groups.get(id);
    if (!group) {
      const marking = index.markings.get(target.annotation.markingId);
      const image =
        marking?.containerId != null
          ? index.containers.get(marking.containerId)
          : undefined;
      const context = [
        image ? imageLabel(image) : marking ? t('canvas.name') : '',
        marking ? markingPath(project, marking) : '',
      ]
        .filter((s) => s !== '')
        .join(t('marking.pathSeparator'));
      group = { annotation: target.annotation, context, items: [] };
      groups.set(id, group);
    }
    group.items.push(target);
  }
  return [...groups.values()];
}

function noTargetsMessage(field: RefFieldDef, typeNames: readonly string[]): string {
  const tags = (field.accepts.tags ?? []).join(', ');
  if (tags === '' && !field.accepts.free && typeNames.length > 0) {
    return t('ref.noTargetsAnnotations', { types: typeNames.join(', ') });
  }
  if (tags !== '' && field.accepts.free) return t('ref.noTargetsTagsFree', { tags });
  if (tags !== '') return t('ref.noTargetsTags', { tags });
  return t('ref.noTargetsFree');
}

/** "accepts: data-field, Model and free ones". */
function acceptsText(field: RefFieldDef, typeNames: readonly string[]): string {
  const parts = [...(field.accepts.tags ?? []), ...typeNames];
  if (field.accepts.free) parts.push(t('ref.free'));
  return t('ref.accepts', { what: parts.join(t('ref.acceptsJoin')) });
}

/** Type of the target when it is a whole annotation (`{ annotationId }`); `null` in the other formats. */
function wholeAnnotationType(
  project: Project,
  target: RefTarget,
): { readonly typeId: string; readonly name: string } | null {
  if ('key' in target.ref || 'entryId' in target.ref) return null;
  const type = typeOfAnnotation(project, target.annotation)?.type;
  return type ? { typeId: type.id, name: type.name } : null;
}

function matches(project: Project, filter: Filter, target: RefTarget): boolean {
  if (filter.kind === 'all') return true;
  const whole = wholeAnnotationType(project, target);
  if (filter.kind === 'type') return whole?.typeId === filter.typeId;
  if (filter.kind === 'free') return whole === null && target.tags.length === 0;
  return target.tags.includes(filter.tag);
}

const filterId = (filter: Filter) =>
  filter.kind === 'tag'
    ? `tag:${filter.tag}`
    : filter.kind === 'type'
      ? `type:${filter.typeId}`
      : filter.kind;

const filterLabel = (filter: Filter) =>
  filter.kind === 'all'
    ? t('ref.filterAll')
    : filter.kind === 'free'
      ? t('ref.filterFree')
      : filter.kind === 'type'
        ? filter.name
        : filter.tag;

/** Target label text: the labels, the type (whole annotation) or "free". */
function optionTagText(project: Project, target: RefTarget): string {
  const whole = wholeAnnotationType(project, target);
  if (whole) return whole.name;
  return target.tags.length > 0 ? target.tags.join(', ') : t('ref.freeTag');
}

/**
 * Where `needle` (already lowercase) appears in `text` ignoring case, as indices of the
 * original text. The lowercase of some characters has another length ("İ" becomes two), so the
 * index found in the lowercase text is mapped back to the original, character by character.
 */
function findFolded(
  text: string,
  needle: string,
): { readonly start: number; readonly end: number } | null {
  if (needle === '') return null;
  let lowered = '';
  const starts: number[] = [];
  const ends: number[] = [];
  let at = 0;
  for (const char of text) {
    const folded = char.toLocaleLowerCase();
    for (let i = 0; i < folded.length; i++) {
      starts.push(at);
      ends.push(at + char.length);
    }
    lowered += folded;
    at += char.length;
  }
  const found = lowered.indexOf(needle);
  if (found < 0) return null;
  return {
    start: starts[found] ?? 0,
    end: ends[found + needle.length - 1] ?? text.length,
  };
}

/** Text with the searched part in `<mark>`. */
function Highlight({ text, needle }: { readonly text: string; readonly needle: string }) {
  const match = findFolded(text, needle);
  if (!match) return <>{text}</>;
  return (
    <>
      {text.slice(0, match.start)}
      <mark>{text.slice(match.start, match.end)}</mark>
      {text.slice(match.end)}
    </>
  );
}

interface RefPickerProps {
  readonly project: Project;
  readonly annotation: Annotation;
  /** The `ref` field; with `cell`, the table's `ref` column. */
  readonly field: RefFieldDef;
  /** Cell of a `ref` column (table variant): the targets and the current value come from the row. */
  readonly cell?: RefCellTarget;
  /**
   * Compact version, for a table cell: narrower popup and without the shortcut
   * bar (the keyboard is the same).
   */
  readonly compact?: boolean;
  /** Esc, click outside or pick made. */
  readonly onClose: () => void;
  /** Chosen target; `goTo` = Ctrl+Enter (or Ctrl+click): also goes to it. */
  readonly onPick: (target: RefTarget, goTo: boolean) => void;
  /** Focus target on close if whoever opened is no longer in the DOM (the reference field). */
  readonly returnFocus?: FocusReturn;
}

export function RefPicker({
  project,
  annotation,
  field,
  cell,
  compact = false,
  onClose,
  onPick,
  returnFocus,
}: RefPickerProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>({ kind: 'all' });
  const targets = cell
    ? findCellRefTargets(project, annotation.id, cell.tableKey, field.key, labelTexts())
    : findRefTargets(project, annotation.id, field.key, labelTexts());
  const currentValue = cell
    ? tableRows(annotation.values?.[cell.tableKey]).find((r) => r._id === cell.rowId)?.[
        field.key
      ]
    : annotation.values?.[field.key];
  const current = parseRefValue(currentValue);
  const isCurrent = (target: RefTarget) =>
    current !== null && JSON.stringify(current) === JSON.stringify(target.ref);
  const [active, setActive] = useState(() => Math.max(0, targets.findIndex(isCurrent)));
  // Who had focus on open (the reference field), stored before the picker takes it.
  const origin = useFocusOrigin();
  useModal(dialog, origin, returnFocus, () => input.current?.focus());

  const acceptedTypes = acceptedAnnotationTypes(project, annotation.id, field.accepts);
  const typeNames = acceptedTypes.map((type) => type.name);
  const filters: Filter[] = [
    ...(field.accepts.tags ?? []).map((tag) => ({ kind: 'tag', tag }) as const),
    ...acceptedTypes.map(
      (type) => ({ kind: 'type', typeId: type.id, name: type.name }) as const,
    ),
    ...(field.accepts.free ? [{ kind: 'free' } as const] : []),
  ];
  const tabs: TabItem<string>[] =
    filters.length > 1
      ? [{ kind: 'all' } as const, ...filters].map((f) => ({
          id: filterId(f),
          label: filterLabel(f),
        }))
      : [];

  const needle = query.trim().toLocaleLowerCase();
  const groups = groupTargets(
    project,
    targets.filter((target) => matches(project, filter, target)),
  )
    .map((g) => ({
      ...g,
      items:
        needle === ''
          ? g.items
          : g.items.filter((i) =>
              `${i.label} ${g.context}`.toLocaleLowerCase().includes(needle),
            ),
    }))
    .filter((g) => g.items.length > 0);
  const options = groups.flatMap((g) => g.items);
  const activeIndex = Math.min(active, options.length - 1);
  const optionId = (i: number) => `${listId}-${i}`;

  const choose = (target: RefTarget | undefined, goTo: boolean) => {
    if (target) onPick(target, goTo);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (options.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      const next = (activeIndex + step + options.length) % options.length;
      setActive(next);
      dialog.current
        ?.querySelector(`[id="${optionId(next)}"]`)
        ?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // Enter (with or without Alt) only picks the target: it does not bubble to the table field, which would add a row.
      e.stopPropagation();
      choose(options[activeIndex], e.ctrlKey || e.metaKey);
    }
  };

  let n = 0;
  return (
    <dialog
      ref={dialog}
      class={compact ? 'picker picker-compact' : 'picker'}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // Click outside the content (on the transparent backdrop) closes.
        if (e.target === dialog.current) onClose();
      }}
    >
      <div class="picker-body">
        <div class="picker-head">
          <h2 id={titleId}>{t('ref.pickerTitle', { field: fieldLabel(field) })}</h2>
          <span class="picker-accepts">{acceptsText(field, typeNames)}</span>
          <IconButton icon="close" label={t('common.close')} onClick={onClose} />
        </div>
        {targets.length === 0 ? (
          <p class="notice notice-info picker-empty">
            {noTargetsMessage(field, typeNames)}
          </p>
        ) : (
          <>
            <div class="picker-search">
              <input
                ref={input}
                type="search"
                class="input"
                role="combobox"
                aria-label={t('ref.search')}
                placeholder={t('ref.search')}
                aria-controls={listId}
                aria-expanded="true"
                aria-autocomplete="list"
                aria-activedescendant={
                  options.length > 0 ? optionId(activeIndex) : undefined
                }
                value={query}
                onInput={(e) => {
                  setQuery(e.currentTarget.value);
                  setActive(0);
                }}
                onKeyDown={onKeyDown}
              />
            </div>
            {tabs.length > 0 && (
              <div class="picker-tabs">
                <Tabs
                  label={t('ref.filterLabel')}
                  tabs={tabs}
                  value={filterId(filter)}
                  onChange={(id) => {
                    const next = [{ kind: 'all' } as const, ...filters].find(
                      (f) => filterId(f) === id,
                    );
                    if (next) setFilter(next);
                    setActive(0);
                    input.current?.focus();
                  }}
                />
              </div>
            )}
            <div class="picker-list" role="listbox" id={listId} aria-labelledby={titleId}>
              {options.length === 0 && (
                <p class="muted picker-empty">{t('ref.noMatches')}</p>
              )}
              {groups.map((group) => (
                <div
                  key={group.annotation.id}
                  role="group"
                  aria-label={annotationSourceLabel(project, group.annotation)}
                >
                  <div class="picker-group" aria-hidden="true">
                    <strong>{annotationSourceLabel(project, group.annotation)}</strong>
                    <span class="picker-context" title={group.context}>
                      {group.context}
                    </span>
                  </div>
                  {group.items.map((item) => {
                    const i = n++;
                    return (
                      <div
                        key={JSON.stringify(item.ref)}
                        id={optionId(i)}
                        role="option"
                        class="picker-option"
                        aria-selected={i === activeIndex}
                        onMouseMove={() => i !== activeIndex && setActive(i)}
                        onClick={(e) => choose(item, e.ctrlKey || e.metaKey)}
                      >
                        <Icon name="arrowRight" />
                        <span class="picker-option-label" title={item.label}>
                          <Highlight text={item.label} needle={needle} />
                        </span>
                        {isCurrent(item) && (
                          <span class="picker-current">{t('ref.current')}</span>
                        )}
                        <span class="picker-option-tag">
                          {optionTagText(project, item)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </>
        )}
        {!compact && (
          <div class="picker-foot" aria-hidden="true">
            <span>
              <kbd class="kbd">{t('ref.keyUp')}</kbd>{' '}
              <kbd class="kbd">{t('ref.keyDown')}</kbd> {t('ref.keyNavigate')}
            </span>
            <span>
              <kbd class="kbd">{t('ref.keyEnter')}</kbd> {t('ref.keyChoose')}
            </span>
            <span>
              <kbd class="kbd">{t('ref.keyCtrlEnter')}</kbd> {t('ref.keyGoTo')}
            </span>
            <span>
              <kbd class="kbd">{t('ref.keyEsc')}</kbd> {t('ref.keyClose')}
            </span>
          </div>
        )}
      </div>
    </dialog>
  );
}
