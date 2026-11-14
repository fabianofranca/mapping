import type { ItemRef } from '../model';
import type { ActionResult } from '../store/history';

/** What the arrow step asks of the store actions (one gesture: previews and an end with settle). */
export interface NudgeActions {
  beginGesture(): ActionResult;
  previewItemsNudge(items: readonly ItemRef[], dx: number, dy: number): ActionResult;
  finishItemsNudge(items: readonly ItemRef[], dx: number, dy: number): ActionResult;
  commitGesture(): void;
}

interface Active {
  readonly key: string;
  readonly items: readonly ItemRef[];
  /** Displacement requested so far and the last one the preview accepted (all or nothing). */
  total: { dx: number; dy: number };
  valid: { dx: number; dy: number };
}

/**
 * The arrow being pressed: press and release is a one-step gesture, holding (keyboard
 * repeat) adds steps to the same gesture. `end` closes the gesture (on `keyup`, on focus loss or
 * on another key) with one undo entry.
 */
export class NudgeSession {
  private active: Active | null = null;

  constructor(
    private readonly actions: NudgeActions,
    private readonly selectedItems: () => readonly ItemRef[],
  ) {}

  /** An arrow `keydown`: starts the gesture or adds a step to the open one. */
  step(key: string, dx: number, dy: number): void {
    const a = this.active;
    if (a && a.key === key) {
      this.add(a, dx, dy);
      return;
    }
    this.end();
    this.start(key, dx, dy);
  }

  /** Closes the open gesture (if any): repeats the final operation, settles and records one entry. */
  end(): void {
    const a = this.active;
    if (!a) return;
    this.active = null;
    this.actions.finishItemsNudge(a.items, a.valid.dx, a.valid.dy);
    this.actions.commitGesture();
  }

  private start(key: string, dx: number, dy: number): void {
    const items = this.selectedItems();
    if (items.length === 0 || !this.actions.beginGesture().ok) return;
    const a: Active = {
      key,
      items,
      total: { dx: 0, dy: 0 },
      valid: { dx: 0, dy: 0 },
    };
    this.active = a;
    this.add(a, dx, dy);
  }

  private add(a: Active, dx: number, dy: number): void {
    a.total = { dx: a.total.dx + dx, dy: a.total.dy + dy };
    if (this.actions.previewItemsNudge(a.items, a.total.dx, a.total.dy).ok) {
      a.valid = a.total;
    }
  }
}
