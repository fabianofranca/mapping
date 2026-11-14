import { useRef, useState } from 'preact/hooks';

// Reorder rows by dragging (P6): pairs of the free annotation and rows of the typed
// tables. The handle uses pointer events (mouse, pen and touch); the list only changes on
// drop, with a single store action, so the gesture produces one undo entry.

/**
 * Final position of the dragged row (`from`) when dropped at `y`: how many of the other
 * rows have their center above the pointer. `mids` are the rows' vertical centers,
 * in the current order. Pure function: `tests/ui/rowDrag.test.ts`.
 */
export function dropIndex(mids: readonly number[], y: number, from: number): number {
  let slot = 0;
  mids.forEach((mid, i) => {
    if (i !== from && mid < y) slot++;
  });
  return slot;
}

/**
 * Row (in the current order) before which the dragged one will enter; `count` = after the
 * last. Used to draw the target line.
 */
export function dropBefore(from: number, to: number): number {
  return to < from ? to : to + 1;
}

export interface RowDrag {
  /** Drag in progress: picked-up row and expected final position. */
  readonly state: { readonly from: number; readonly to: number } | null;
  /** Attributes of the handle of row `index`. */
  handle(index: number): {
    onPointerDown: (e: PointerEvent) => void;
  };
  /** Target attribute of row `index` (`before`/`after`) during the drag. */
  drop(index: number, count: number): 'before' | 'after' | undefined;
}

/**
 * Drag by the handle. The rows are the elements with `data-drag-row` inside
 * `container`; on drop at a different position, calls `onMove(from, to)`.
 */
export function useRowDrag(
  container: { readonly current: HTMLElement | null },
  onMove: (from: number, to: number) => void,
): RowDrag {
  const [state, setState] = useState<RowDrag['state']>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  return {
    state,
    handle: (index) => ({
      onPointerDown: (e: PointerEvent) => {
        if (e.button !== 0 || !container.current) return;
        e.preventDefault();
        const grip = e.currentTarget as HTMLElement;
        const rows = [...container.current.querySelectorAll('[data-drag-row]')];
        const mids = rows.map((row) => {
          const box = row.getBoundingClientRect();
          return box.top + box.height / 2;
        });
        let to = index;
        setState({ from: index, to });
        try {
          grip.setPointerCapture(e.pointerId);
        } catch {
          // Without capture (e.g. pointer already released): the drag ends at the next event.
        }
        const move = (ev: PointerEvent) => {
          const next = dropIndex(mids, ev.clientY, index);
          if (next === to) return;
          to = next;
          setState({ from: index, to });
        };
        const end = (commit: boolean) => () => {
          grip.removeEventListener('pointermove', move);
          grip.removeEventListener('pointerup', up);
          grip.removeEventListener('pointercancel', cancel);
          setState(null);
          if (commit && to !== index) onMoveRef.current(index, to);
        };
        const up = end(true);
        const cancel = end(false);
        grip.addEventListener('pointermove', move);
        grip.addEventListener('pointerup', up);
        grip.addEventListener('pointercancel', cancel);
      },
    }),
    drop: (index, count) => {
      if (!state || state.from === state.to) return undefined;
      const before = dropBefore(state.from, state.to);
      if (before === index) return 'before';
      if (before === count && index === count - 1) return 'after';
      return undefined;
    },
  };
}

/** Alt+Shift+↑/↓ (and ↑/↓ on the handle): offset requested by the key, or 0. */
export function moveKeyDelta(e: KeyboardEvent, onGrip: boolean): -1 | 0 | 1 {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return 0;
  const chord = e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey;
  const plain = onGrip && !e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey;
  if (!chord && !plain) return 0;
  return e.key === 'ArrowUp' ? -1 : 1;
}
