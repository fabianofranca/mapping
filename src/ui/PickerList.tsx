import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import { Icon } from './icons';
import { cycleStops } from './pickerKeys';

// The list of a picker popover, shared by the Page menu and the perspective picker (stage #2177,
// PF3, decision 15): the shell (focus on the selected row when it opens, ↑/↓ over the stops) and the
// option row (check, name and the trailing texts the caller gives). The caller keeps its own CSS
// classes (`.page-*`, `.perspective-*`), so tests and scripts read the same DOM.

interface PickerListProps {
  /** Class of the root, e.g. `page-list`. */
  readonly class: string;
  /** Accessible name of the listbox. */
  readonly label: string;
  /** Selector of the focus stops: the options and the actions. */
  readonly stops: string;
  /** Class of the actions block, e.g. `page-actions`. */
  readonly actionsClass: string;
  /** The listbox content: options, or groups of options. */
  readonly children: ComponentChildren;
  /** The buttons under the list. */
  readonly actions: ComponentChildren;
}

export function PickerList({
  class: className,
  label,
  stops,
  actionsClass,
  children,
  actions,
}: PickerListProps) {
  const root = useRef<HTMLDivElement>(null);

  // Focus enters the selected row, in the same commit that opens the list.
  useLayoutEffect(() => {
    root.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      class={className}
      ref={root}
      onKeyDown={(e) => cycleStops(root.current, e, stops)}
    >
      <div role="listbox" aria-label={label}>
        {children}
      </div>
      <div class={actionsClass}>{actions}</div>
    </div>
  );
}

interface PickerOptionProps {
  /** Class of the row; its parts are `<rowClass>-check` and `<rowClass>-name`. */
  readonly rowClass: string;
  readonly name: string;
  readonly selected: boolean;
  readonly onPick: () => void;
  /** What follows the name (counts, notes), with the caller's classes. */
  readonly children?: ComponentChildren;
}

export function PickerOption({
  rowClass,
  name,
  selected,
  onPick,
  children,
}: PickerOptionProps) {
  return (
    /* Exception to Button: list option (role="option") (docs/DESIGN-SYSTEM.md, "Loose buttons") */
    <button
      type="button"
      role="option"
      class={rowClass}
      aria-selected={selected}
      data-name={name}
      onClick={onPick}
    >
      <span class={`${rowClass}-check`} aria-hidden="true">
        {selected && <Icon name="check" />}
      </span>
      <span class={`${rowClass}-name`}>{name}</span>
      {children}
    </button>
  );
}
