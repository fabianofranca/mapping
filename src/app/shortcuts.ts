// Editor keyboard shortcuts (desktop). See the Shortcuts section of the design system (docs/DESIGN-SYSTEM.md).
import { toolWindowByNumber, type ToolWindowId } from '../store/toolWindows';

export type Shortcut =
  | { readonly kind: 'undo' }
  | { readonly kind: 'redo' }
  | { readonly kind: 'delete' }
  | { readonly kind: 'escape' }
  /** Shift+Esc: hides the focused tool window. */
  | { readonly kind: 'hide-window' }
  | { readonly kind: 'toggle-window'; readonly window: ToolWindowId }
  /** Ctrl+Shift+arrows: resizes the focused window by 16px. */
  | { readonly kind: 'resize-window'; readonly dx: number; readonly dy: number }
  /** Alt+↑ / Alt+↓ on the breadcrumbs. */
  | { readonly kind: 'select-parent' }
  | { readonly kind: 'select-child' }
  | { readonly kind: 'zoom'; readonly factor: number }
  | { readonly kind: 'zoom-reset' }
  /** Shift+1: frames everything (zoom and view center). */
  | { readonly kind: 'fit-all' }
  /** Shift+2: frames the selection (zoom and view center). */
  | { readonly kind: 'fit-selection' }
  | { readonly kind: 'export' }
  | { readonly kind: 'layers' }
  | { readonly kind: 'help' }
  | { readonly kind: 'settings' }
  /** Alt+L: locks or unlocks the selected item. */
  | { readonly kind: 'toggle-lock' }
  /** Alt+H: turns the canvas view mode on or off. */
  | { readonly kind: 'view-mode' }
  /** Ctrl/Cmd+C: copies the item's reference (outside text fields and with no selected text). */
  | { readonly kind: 'copy-reference' }
  /** Ctrl+Alt+C: copies the selected marking's crop as PNG. */
  | { readonly kind: 'copy-crop' }
  /** Alt+Shift+A: arranges the selected container's children (Library stage, B3). */
  | { readonly kind: 'arrange' }
  /** Ctrl/Cmd+G: wraps the selection in a new marking (Wrap stage). */
  | { readonly kind: 'wrap' }
  /** ←↑→↓ move the selection by 1 px; Shift+arrow, 10 px (`dx`, `dy` already with the step). */
  | { readonly kind: 'nudge'; readonly dx: number; readonly dy: number };

/**
 * Text of the shortcuts in the button hints. For the windows and for resizing it is always
 * Ctrl (also on macOS, where Cmd+Shift+3/4/5 takes a screenshot).
 */
export const SHORTCUT_LABELS = {
  undo: 'Ctrl+Z',
  redo: 'Ctrl+Shift+Z',
  export: 'Ctrl+E',
  layers: 'Ctrl+L',
  help: 'F1',
  settings: 'Ctrl+,',
  toggleLock: 'Alt+L',
  viewMode: 'Alt+H',
  newRow: 'Alt+Enter',
  pickRef: 'Ctrl+B',
  copyReference: 'Ctrl+C',
  copyCrop: 'Ctrl+Alt+C',
  arrange: 'Alt+Shift+A',
  wrap: 'Ctrl+G',
  fitAll: 'Shift+1',
  fitSelection: 'Shift+2',
} as const;

const ARIA_MODIFIERS: Readonly<Record<string, string>> = {
  ctrl: 'Control',
  control: 'Control',
  cmd: 'Meta',
  meta: 'Meta',
  alt: 'Alt',
  option: 'Alt',
  shift: 'Shift',
};

const ARIA_KEY_NAMES: Readonly<Record<string, string>> = {
  esc: 'Escape',
  escape: 'Escape',
  del: 'Delete',
  delete: 'Delete',
  enter: 'Enter',
  backspace: 'Backspace',
  tab: 'Tab',
  space: 'Space',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  '+': 'Plus',
  '↑': 'ArrowUp',
  '↓': 'ArrowDown',
  '←': 'ArrowLeft',
  '→': 'ArrowRight',
};

/**
 * The value of `aria-keyshortcuts` (WAI-ARIA syntax: `Control+E`, `Control+Shift+Z`,
 * `Alt+Enter`, `F1`) from the human label of the hint (`Ctrl+E`), which stays only in the hint.
 * A label that is not a key ("Ctrl+click") does not become an attribute (stage 8, F5).
 */
export function ariaKeys(label: string | undefined): string | undefined {
  if (!label) return undefined;
  // "Ctrl++": the last "+" is the key.
  const parts = label.endsWith('++')
    ? [...label.slice(0, -2).split('+'), '+']
    : label.split('+');
  const key = parts.pop() ?? '';
  const modifiers = parts.map((m) => ARIA_MODIFIERS[m.trim().toLowerCase()]);
  if (modifiers.some((m) => m === undefined)) return undefined;
  const name =
    ARIA_KEY_NAMES[key.toLowerCase()] ??
    (/^F\d{1,2}$/i.test(key)
      ? key.toUpperCase()
      : key.length === 1
        ? key.toUpperCase()
        : undefined);
  return name === undefined ? undefined : [...modifiers, name].join('+');
}

/** `aria-keyshortcuts` of several shortcuts of an action (separated by space, as ARIA asks). */
export function ariaKeysAll(labels: readonly string[]): string | undefined {
  const keys = labels.map((label) => ariaKeys(label)).filter((k) => k !== undefined);
  return keys.length > 0 ? keys.join(' ') : undefined;
}

type KeyInfo = Pick<
  KeyboardEvent,
  'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'
> & {
  /** Physical key: with Shift (or Alt on macOS) the number's `key` becomes another character. */
  readonly code?: string;
};

/** Zoom factor of one Ctrl+= / Ctrl+− step. */
const ZOOM_STEP = 1.25;

const ARROWS: Readonly<Record<string, { readonly dx: number; readonly dy: number }>> = {
  arrowleft: { dx: -1, dy: 0 },
  arrowright: { dx: 1, dy: 0 },
  arrowup: { dx: 0, dy: -1 },
  arrowdown: { dx: 0, dy: 1 },
};

/**
 * Alt+number is an extra shortcut: only where the browser does not intercept it. In Chrome on
 * Linux it switches tabs, so there it only applies when the app is installed (PWA).
 */
export function altNumbersAvailable(userAgent: string, standalone: boolean): boolean {
  return standalone || !/Linux/.test(userAgent);
}

/**
 * Number from 0 to 9 of the key. With Shift, `key` becomes the keyboard symbol (Ctrl+Shift+4
 * arrives as `$` on the US layout), so the physical key (`code`) is what rules.
 */
function numberOf(e: KeyInfo): number | null {
  const physical = /^(?:Digit|Numpad)([0-9])$/.exec(e.code ?? '');
  if (physical) return Number(physical[1]);
  if (e.key.length !== 1) return null;
  const n = Number(e.key);
  return Number.isInteger(n) && n >= 0 && n <= 9 ? n : null;
}

/** Ctrl/Cmd keys (without Shift or Alt) that always give the same shortcut. */
const MOD_KEYS: Readonly<Record<string, Shortcut>> = {
  z: { kind: 'undo' },
  c: { kind: 'copy-reference' },
  e: { kind: 'export' },
  g: { kind: 'wrap' },
  l: { kind: 'layers' },
  ',': { kind: 'settings' },
  '=': { kind: 'zoom', factor: ZOOM_STEP },
  '+': { kind: 'zoom', factor: ZOOM_STEP },
  '-': { kind: 'zoom', factor: 1 / ZOOM_STEP },
  '0': { kind: 'zoom-reset' },
};

/** Shortcuts with Ctrl/Cmd (without Shift or Alt). */
function modShortcut(e: KeyInfo, key: string): Shortcut | null {
  // Ctrl+Y redoes; macOS Cmd+Y belongs to the browser.
  if (key === 'y') return e.ctrlKey && !e.metaKey ? { kind: 'redo' } : null;
  return MOD_KEYS[key] ?? null;
}

/**
 * Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z and Ctrl+Y redo; Delete (or Backspace, the
 * Mac "delete" key) deletes; Esc cancels/deselects; Shift+Esc hides the
 * focused window. Ctrl+Shift+number opens and closes the windows (Alt+number is the extra,
 * turned on by `altNumbers`), Ctrl+Shift+arrows resize them, Alt+↑/↓ moves through the
 * selection, Alt+N creates an annotation in the active layer, Alt+L locks/unlocks the
 * selected item, Alt+H turns on view mode, Ctrl/Cmd+C copies the item's reference, Ctrl/Cmd+G wraps the
 * selection, Ctrl+Alt+C copies the marking crop and Ctrl+=/−/0 control the zoom.
 */
export function shortcutFor(e: KeyInfo, altNumbers = true): Shortcut | null {
  const key = e.key.toLowerCase();
  const mod = e.ctrlKey || e.metaKey;

  if (e.altKey) {
    // Ctrl+Alt+C (the physical key: with Alt the `key` becomes another character). Do not use Ctrl+Shift+C,
    // which opens the developer tools in Chrome.
    if (mod) {
      return !e.shiftKey && (e.code === 'KeyC' || key === 'c')
        ? { kind: 'copy-crop' }
        : null;
    }
    // With Alt (Option on macOS) the `key` becomes another character: the physical key rules.
    if (e.shiftKey && (e.code === 'KeyA' || key === 'a')) return { kind: 'arrange' };
    if (!e.shiftKey && (e.code === 'KeyL' || key === 'l')) return { kind: 'toggle-lock' };
    if (!e.shiftKey && (e.code === 'KeyH' || key === 'h')) return { kind: 'view-mode' };
    if (key === 'arrowup') return { kind: 'select-parent' };
    if (key === 'arrowdown') return { kind: 'select-child' };
    const n = altNumbers ? numberOf(e) : null;
    const window = n === null ? null : toolWindowByNumber(n);
    return window ? { kind: 'toggle-window', window } : null;
  }

  if (mod && e.shiftKey) {
    if (key === 'z') return { kind: 'redo' };
    // Ctrl+Shift+= (Ctrl++): zooms in, like Ctrl+=; otherwise falls to the browser zoom.
    if (key === '+' || key === '=') return MOD_KEYS['=']!;
    const n = numberOf(e);
    const window = n === null ? null : toolWindowByNumber(n);
    if (window) return { kind: 'toggle-window', window };
    const arrow = ARROWS[key];
    if (arrow) return { kind: 'resize-window', ...arrow };
    return null;
  }

  if (mod) return modShortcut(e, key);

  if (key === 'f1') return { kind: 'help' };
  const nudge = nudgeShortcut(key, e.shiftKey);
  if (nudge) return nudge;
  if (e.shiftKey) {
    // By physical key: with Shift the `key` becomes `@` or `"` depending on the layout.
    const digit = numberOf(e);
    if (digit === 1) return { kind: 'fit-all' };
    if (digit === 2) return { kind: 'fit-selection' };
    return key === 'escape' ? { kind: 'hide-window' } : null;
  }
  if (key === 'delete' || key === 'backspace') return { kind: 'delete' };
  if (key === 'escape') return { kind: 'escape' };
  return null;
}

/** Arrow step without Ctrl/Alt: 1 px, or 10 px with Shift. */
export const NUDGE_STEP = 1;
export const NUDGE_STEP_SHIFT = 10;

function nudgeShortcut(key: string, shift: boolean): Shortcut | null {
  const arrow = ARROWS[key];
  if (!arrow) return null;
  const step = shift ? NUDGE_STEP_SHIFT : NUDGE_STEP;
  return { kind: 'nudge', dx: arrow.dx * step, dy: arrow.dy * step };
}

/** Controls inside the canvas that use the arrows (or focus) on their own. */
const OWN_ARROWS =
  'button, a[href], input, select, textarea, [contenteditable], [role="menu"], [role="menuitem"], [role="slider"], [role="tab"], [role="listbox"], [role="option"], [role="radio"], [role="tree"], [role="treeitem"], [tabindex]:not([tabindex="-1"])';

/**
 * The arrows belong to the editor (they move the selection) only with focus on the canvas or on no control
 * (`body`). In a field, the Tree, a menu, list, tabs or any control that uses arrows, the
 * keyboard is theirs.
 */
export function arrowsBelongToEditor(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  if (target === document.body || target === document.documentElement) return true;
  if (!target.closest('[data-canvas-area]')) return false;
  return target.closest(OWN_ARROWS) === null;
}

/**
 * Proposal review shortcuts (HANDOFF-PROPOSALS 6): they apply only with the review open and
 * focus outside a text field. The project is read-only, so the letters stay
 * free (`R` rejects).
 */
export type ReviewShortcut =
  | { readonly kind: 'decide'; readonly state: 'accepted' | 'rejected' | null }
  | {
      readonly kind: 'step';
      readonly target: 'pending' | 'conflict';
      readonly direction: 1 | -1;
    }
  | { readonly kind: 'toggle-view' }
  | { readonly kind: 'legend' }
  | { readonly kind: 'apply' };

/**
 * A / R accept and reject the selected level, Backspace clears the decision, N / Shift+N and
 * C / Shift+C move through the pending ones and the conflicts, P toggles Current / Proposed, L shows the
 * legend of the marks and Ctrl+Enter applies the accepted ones.
 */
export function reviewShortcutFor(e: KeyInfo): ReviewShortcut | null {
  const key = e.key.toLowerCase();
  const mod = e.ctrlKey || e.metaKey;
  if (e.altKey) return null;
  if (mod) return !e.shiftKey && key === 'enter' ? { kind: 'apply' } : null;
  const direction = e.shiftKey ? -1 : 1;
  if (e.code === 'KeyN' || key === 'n')
    return { kind: 'step', target: 'pending', direction };
  if (e.code === 'KeyC' || key === 'c') {
    return { kind: 'step', target: 'conflict', direction };
  }
  if (e.shiftKey) return null;
  if (key === 'a') return { kind: 'decide', state: 'accepted' };
  if (key === 'r') return { kind: 'decide', state: 'rejected' };
  if (key === 'backspace') return { kind: 'decide', state: null };
  if (key === 'p') return { kind: 'toggle-view' };
  if (key === 'l') return { kind: 'legend' };
  return null;
}

/** Targets where the keyboard belongs to the field, not the editor. */
export function isTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

/** `<input>` types that do not receive text: checkbox, radio, button, slider etc. */
const NON_TEXT_INPUTS = /^(checkbox|radio|button|submit|reset|range|color|file|image)$/;

/**
 * Shortcut that also applies with focus on a checkbox or radio (the view-mode Alt+H, with
 * focus on the "Show on canvas" panel): only the field where one types is left out.
 */
export function isTypingField(target: EventTarget | null): boolean {
  if (!isTextInput(target)) return false;
  return !(target instanceof HTMLInputElement && NON_TEXT_INPUTS.test(target.type));
}
