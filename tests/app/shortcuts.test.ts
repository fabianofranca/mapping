import { describe, expect, it } from 'vitest';
import {
  altNumbersAvailable,
  arrowsBelongToEditor,
  ariaKeys,
  SHORTCUT_LABELS,
  isTextInput,
  reviewShortcutFor,
  shortcutFor,
} from '../../src/app/shortcuts';
import { REVIEW_KEYS } from '../../src/ui/review/DecisionControl';
import { toolWindowShortcut } from '../../src/ui/toolWindowMeta';
import { TOOL_WINDOWS } from '../../src/store/toolWindows';

const key = (
  k: string,
  mods: Partial<Record<'ctrl' | 'meta' | 'shift' | 'alt', boolean>> = {},
  code?: string,
) => ({
  key: k,
  code,
  ctrlKey: mods.ctrl ?? false,
  metaKey: mods.meta ?? false,
  shiftKey: mods.shift ?? false,
  altKey: mods.alt ?? false,
});

describe('editor shortcuts', () => {
  // Stage 2.5: Alt+L locks or unlocks the selected item.
  it('Alt+L: lock/unlock (by the physical key, because of Option on macOS)', () => {
    expect(shortcutFor(key('l', { alt: true }))).toEqual({ kind: 'toggle-lock' });
    expect(shortcutFor(key('¬', { alt: true }, 'KeyL'))).toEqual({ kind: 'toggle-lock' });
    expect(shortcutFor(key('l', { alt: true, shift: true }))).toBeNull();
    expect(shortcutFor(key('l', { alt: true, ctrl: true }))).toBeNull();
    // Ctrl+L is still the Layers window and L alone does nothing.
    expect(shortcutFor(key('l', { ctrl: true }))).toEqual({ kind: 'layers' });
    expect(shortcutFor(key('l'))).toBeNull();
  });

  // Clean canvas: Alt+H toggles view mode.
  it('Alt+H: view mode (by the physical key, because of Option on macOS)', () => {
    expect(shortcutFor(key('h', { alt: true }))).toEqual({ kind: 'view-mode' });
    expect(shortcutFor(key('˙', { alt: true }, 'KeyH'))).toEqual({ kind: 'view-mode' });
    expect(shortcutFor(key('h', { alt: true, shift: true }))).toBeNull();
    expect(shortcutFor(key('h', { alt: true, ctrl: true }))).toBeNull();
    expect(shortcutFor(key('h'))).toBeNull();
  });

  // B3/P7: Alt+Shift+A arranges the selected container.
  it('Alt+Shift+A: arrange (by the physical key, because of Option on macOS)', () => {
    expect(shortcutFor(key('a', { alt: true, shift: true }))).toEqual({
      kind: 'arrange',
    });
    expect(shortcutFor(key('Å', { alt: true, shift: true }, 'KeyA'))).toEqual({
      kind: 'arrange',
    });
    expect(shortcutFor(key('a', { alt: true }))).toBeNull();
    expect(shortcutFor(key('a', { alt: true, shift: true, ctrl: true }))).toBeNull();
  });

  // The active layer is gone: Alt+N is no longer a shortcut.
  it('Alt+N does nothing (not even by the physical key)', () => {
    expect(shortcutFor(key('n', { alt: true }))).toBeNull();
    expect(shortcutFor(key('˜', { alt: true }, 'KeyN'))).toBeNull();
  });

  it('undo and redo', () => {
    expect(shortcutFor(key('z', { ctrl: true }))).toEqual({ kind: 'undo' });
    expect(shortcutFor(key('z', { meta: true }))).toEqual({ kind: 'undo' });
    expect(shortcutFor(key('Z', { ctrl: true, shift: true }))).toEqual({ kind: 'redo' });
    expect(shortcutFor(key('z', { meta: true, shift: true }))).toEqual({ kind: 'redo' });
    expect(shortcutFor(key('y', { ctrl: true }))).toEqual({ kind: 'redo' });
    expect(shortcutFor(key('z'))).toBeNull();
  });

  it('delete and Esc', () => {
    expect(shortcutFor(key('Delete'))).toEqual({ kind: 'delete' });
    expect(shortcutFor(key('Backspace'))).toEqual({ kind: 'delete' });
    expect(shortcutFor(key('Escape'))).toEqual({ kind: 'escape' });
    expect(shortcutFor(key('Escape', { shift: true }))).toEqual({ kind: 'hide-window' });
    expect(shortcutFor(key('Delete', { ctrl: true }))).toBeNull();
    expect(shortcutFor(key('z', { ctrl: true, alt: true }))).toBeNull();
  });

  // Ctrl+Shift+number is the official shortcut.
  it('tool windows: Ctrl+Shift+number and Alt+number', () => {
    expect(shortcutFor(key('1', { ctrl: true, shift: true }))).toEqual({
      kind: 'toggle-window',
      window: 'tree',
    });
    expect(shortcutFor(key('3', { ctrl: true, shift: true }))).toEqual({
      kind: 'toggle-window',
      window: 'details',
    });
    expect(shortcutFor(key('4', { alt: true }))).toEqual({
      kind: 'toggle-window',
      window: 'list',
    });
    // With Shift the browser sends the symbol ($ on the US layout): the physical key counts.
    expect(shortcutFor(key('$', { ctrl: true, shift: true }, 'Digit4'))).toEqual({
      kind: 'toggle-window',
      window: 'list',
    });
    expect(shortcutFor(key('2', { ctrl: true, shift: true }))).toEqual({
      kind: 'toggle-window',
      window: 'layers',
    });
    expect(shortcutFor(key('5', { ctrl: true, shift: true }))).toEqual({
      kind: 'toggle-window',
      window: 'incomplete',
    });
    expect(shortcutFor(key('6', { ctrl: true, shift: true }))).toEqual({
      kind: 'toggle-window',
      window: 'diagnostics',
    });
    // Alt+number turned off (Chrome on Linux switches tabs).
    expect(shortcutFor(key('4', { alt: true }), false)).toBeNull();
    expect(shortcutFor(key('4', { ctrl: true, shift: true }), false)).toEqual({
      kind: 'toggle-window',
      window: 'list',
    });
  });

  it('arrows move the selection 1 px; with Shift, 10 px; with Ctrl or Alt they do not', () => {
    expect(shortcutFor(key('ArrowLeft'))).toEqual({ kind: 'nudge', dx: -1, dy: 0 });
    expect(shortcutFor(key('ArrowDown'))).toEqual({ kind: 'nudge', dx: 0, dy: 1 });
    expect(shortcutFor(key('ArrowRight', { shift: true }))).toEqual({
      kind: 'nudge',
      dx: 10,
      dy: 0,
    });
    expect(shortcutFor(key('ArrowUp', { shift: true }))).toEqual({
      kind: 'nudge',
      dx: 0,
      dy: -10,
    });
    expect(shortcutFor(key('ArrowRight', { ctrl: true }))).toBeNull();
    expect(shortcutFor(key('ArrowLeft', { alt: true }))).toBeNull();
    // The shortcuts with a modifier stay as they were.
    expect(shortcutFor(key('ArrowUp', { alt: true }))).toEqual({ kind: 'select-parent' });
  });

  it('the arrows belong to the editor only with focus on the canvas or on no control', () => {
    const area = document.createElement('main');
    area.setAttribute('data-canvas-area', '');
    const button = document.createElement('button');
    const input = document.createElement('input');
    const outside = document.createElement('div');
    area.append(button, input);
    document.body.append(area, outside);
    expect(arrowsBelongToEditor(document.body)).toBe(true);
    expect(arrowsBelongToEditor(window)).toBe(true);
    expect(arrowsBelongToEditor(area)).toBe(true);
    expect(arrowsBelongToEditor(button)).toBe(false);
    expect(arrowsBelongToEditor(input)).toBe(false);
    expect(arrowsBelongToEditor(outside)).toBe(false);
    area.remove();
    outside.remove();
  });

  it('resize the focused window and walk through the selection', () => {
    expect(shortcutFor(key('ArrowLeft', { ctrl: true, shift: true }))).toEqual({
      kind: 'resize-window',
      dx: -1,
      dy: 0,
    });
    expect(shortcutFor(key('ArrowUp', { ctrl: true, shift: true }))).toEqual({
      kind: 'resize-window',
      dx: 0,
      dy: -1,
    });
    expect(shortcutFor(key('ArrowUp', { alt: true }))).toEqual({ kind: 'select-parent' });
    expect(shortcutFor(key('ArrowDown', { alt: true }))).toEqual({
      kind: 'select-child',
    });
  });

  // Frame selection: Shift+2 by the physical key (with Shift the `key` becomes `@` or `"`).
  it('Shift+2: frame the selection, by the physical key', () => {
    expect(shortcutFor(key('@', { shift: true }, 'Digit2'))).toEqual({
      kind: 'fit-selection',
    });
    expect(shortcutFor(key('"', { shift: true }, 'Digit2'))).toEqual({
      kind: 'fit-selection',
    });
    expect(shortcutFor(key('2', { shift: true }))).toEqual({ kind: 'fit-selection' });
    // Without Shift, or with another modifier, it is not this shortcut (Ctrl+Shift+2 opens a window).
    expect(shortcutFor(key('2', {}, 'Digit2'))).toBeNull();
    expect(shortcutFor(key('@', { shift: true, ctrl: true }, 'Digit2'))).not.toEqual({
      kind: 'fit-selection',
    });
    expect(SHORTCUT_LABELS.fitSelection).toBe('Shift+2');
  });

  // Frame all: Shift+1 by the physical key (with Shift the `key` becomes `!` or `1`).
  it('Shift+1: frame all, by the physical key', () => {
    expect(shortcutFor(key('!', { shift: true }, 'Digit1'))).toEqual({ kind: 'fit-all' });
    expect(shortcutFor(key('1', { shift: true }, 'Digit1'))).toEqual({ kind: 'fit-all' });
    expect(shortcutFor(key('1', {}, 'Digit1'))).toBeNull();
    expect(shortcutFor(key('!', { shift: true, ctrl: true }, 'Digit1'))).not.toEqual({
      kind: 'fit-all',
    });
    expect(SHORTCUT_LABELS.fitAll).toBe('Shift+1');
  });

  it('zoom, export, layers, help and settings', () => {
    expect(shortcutFor(key('=', { ctrl: true }))).toMatchObject({ kind: 'zoom' });
    // Ctrl+Shift+= (Ctrl++ on the US keyboard) also zooms in (#971, item 5).
    expect(shortcutFor(key('+', { ctrl: true, shift: true }))).toMatchObject({
      kind: 'zoom',
    });
    expect(shortcutFor(key('=', { ctrl: true, shift: true }))).toMatchObject({
      kind: 'zoom',
    });
    expect(shortcutFor(key('-', { ctrl: true }))).toMatchObject({ kind: 'zoom' });
    expect(shortcutFor(key('0', { ctrl: true }))).toEqual({ kind: 'zoom-reset' });
    expect(shortcutFor(key('e', { ctrl: true }))).toEqual({ kind: 'export' });
    expect(shortcutFor(key('l', { ctrl: true }))).toEqual({ kind: 'layers' });
    expect(shortcutFor(key(',', { ctrl: true }))).toEqual({ kind: 'settings' });
    expect(shortcutFor(key('F1'))).toEqual({ kind: 'help' });
  });

  it('Alt+number works when installed, or outside Linux', () => {
    expect(altNumbersAvailable('X11; Linux x86_64', false)).toBe(false);
    expect(altNumbersAvailable('X11; Linux x86_64', true)).toBe(true);
    expect(altNumbersAvailable('Macintosh; Intel Mac OS X', false)).toBe(true);
  });

  it('text fields keep the keyboard', () => {
    expect(isTextInput(document.createElement('input'))).toBe(true);
    expect(isTextInput(document.createElement('textarea'))).toBe(true);
    expect(isTextInput(document.createElement('div'))).toBe(false);
    expect(isTextInput(null)).toBe(false);
  });
});

describe('copy shortcuts (stage 3a.2)', () => {
  it('Ctrl+C and Cmd+C copy the reference', () => {
    expect(shortcutFor(key('c', { ctrl: true }))).toEqual({ kind: 'copy-reference' });
    expect(shortcutFor(key('c', { meta: true }))).toEqual({ kind: 'copy-reference' });
    expect(shortcutFor(key('C', { ctrl: true }))).toEqual({ kind: 'copy-reference' });
    expect(shortcutFor(key('c'))).toBeNull();
  });

  it('Ctrl+Alt+C copies the crop (by the physical key, because of Option on macOS)', () => {
    expect(shortcutFor(key('c', { ctrl: true, alt: true }))).toEqual({
      kind: 'copy-crop',
    });
    // pt-BR kept: ç is the character macOS Option+C produces (a key value, not Portuguese text)
    expect(shortcutFor(key('ç', { meta: true, alt: true }, 'KeyC'))).toEqual({
      kind: 'copy-crop',
    });
    expect(shortcutFor(key('c', { alt: true }))).toBeNull();
  });

  it('Ctrl+Shift+C stays free: it is the Chrome developer tools one', () => {
    expect(shortcutFor(key('c', { ctrl: true, shift: true }))).toBeNull();
    expect(shortcutFor(key('c', { ctrl: true, alt: true, shift: true }))).toBeNull();
  });
});

// Stage 4 (HANDOFF-PROPOSALS 6): proposal review shortcuts.
describe('review shortcuts', () => {
  it('A / R / Backspace decide the selected level (R is Reject in the review)', () => {
    expect(reviewShortcutFor(key('a'))).toEqual({ kind: 'decide', state: 'accepted' });
    expect(reviewShortcutFor(key('R'))).toEqual({ kind: 'decide', state: 'rejected' });
    expect(reviewShortcutFor(key('Backspace'))).toEqual({ kind: 'decide', state: null });
  });

  it('N / Shift+N and C / Shift+C walk through the pending ones and the conflicts', () => {
    expect(reviewShortcutFor(key('n'))).toEqual({
      kind: 'step',
      target: 'pending',
      direction: 1,
    });
    expect(reviewShortcutFor(key('N', { shift: true }, 'KeyN'))).toEqual({
      kind: 'step',
      target: 'pending',
      direction: -1,
    });
    expect(reviewShortcutFor(key('c'))).toEqual({
      kind: 'step',
      target: 'conflict',
      direction: 1,
    });
    expect(reviewShortcutFor(key('C', { shift: true }, 'KeyC'))).toEqual({
      kind: 'step',
      target: 'conflict',
      direction: -1,
    });
  });

  it('P toggles Current/Proposed, L the legend and Ctrl+Enter applies', () => {
    expect(reviewShortcutFor(key('p'))).toEqual({ kind: 'toggle-view' });
    expect(reviewShortcutFor(key('l'))).toEqual({ kind: 'legend' });
    expect(reviewShortcutFor(key('Enter', { ctrl: true }))).toEqual({ kind: 'apply' });
    expect(reviewShortcutFor(key('Enter'))).toBeNull();
  });

  it('does not catch the editor shortcuts (Ctrl+Z, Ctrl+Shift+7, Alt+…)', () => {
    expect(reviewShortcutFor(key('z', { ctrl: true }))).toBeNull();
    expect(reviewShortcutFor(key('&', { ctrl: true, shift: true }, 'Digit7'))).toBeNull();
    expect(reviewShortcutFor(key('a', { alt: true }))).toBeNull();
    expect(shortcutFor(key('&', { ctrl: true, shift: true }, 'Digit7'))).toEqual({
      kind: 'toggle-window',
      window: 'proposals',
    });
    expect(shortcutFor(key('7', { alt: true }))).toEqual({
      kind: 'toggle-window',
      window: 'proposals',
    });
  });
});

// Stage 8 (8.3), F5: `aria-keyshortcuts` in ARIA syntax; the human label stays in the tooltip.
describe('ariaKeys', () => {
  it.each([
    ['Ctrl+E', 'Control+E'],
    ['Ctrl+Shift+Z', 'Control+Shift+Z'],
    ['Ctrl+,', 'Control+,'],
    ['Ctrl+Alt+C', 'Control+Alt+C'],
    ['Alt+Enter', 'Alt+Enter'],
    ['Ctrl+Enter', 'Control+Enter'],
    ['Shift+N', 'Shift+N'],
    ['Esc', 'Escape'],
    ['Del', 'Delete'],
    ['F1', 'F1'],
    ['A', 'A'],
    ['Backspace', 'Backspace'],
    ['Ctrl+Shift+3', 'Control+Shift+3'],
    ['Ctrl++', 'Control+Plus'],
    ['Cmd+K', 'Meta+K'],
  ])('%s → %s', (label, aria) => {
    expect(ariaKeys(label)).toBe(aria);
  });

  it('what is not a key does not become an attribute', () => {
    expect(ariaKeys('Ctrl+click')).toBeUndefined();
    expect(ariaKeys('')).toBeUndefined();
    expect(ariaKeys(undefined)).toBeUndefined();
  });

  it('all the app shortcuts have an ARIA form', () => {
    const labels = [
      ...Object.values(SHORTCUT_LABELS),
      ...Object.values(REVIEW_KEYS),
      ...TOOL_WINDOWS.map(toolWindowShortcut),
    ];
    for (const label of labels) {
      expect(ariaKeys(label), label).toMatch(/^((Control|Alt|Shift|Meta)\+)*[^+\s]+$/);
    }
  });
});

describe('Wrap shortcut (stage Wrap, EV1)', () => {
  it('Ctrl+G and Cmd+G wrap', () => {
    expect(shortcutFor(key('g', { ctrl: true }))).toEqual({ kind: 'wrap' });
    expect(shortcutFor(key('g', { meta: true }))).toEqual({ kind: 'wrap' });
    expect(shortcutFor(key('G', { ctrl: true }))).toEqual({ kind: 'wrap' });
  });

  it('G alone, Ctrl+Shift+G and Alt+G are not the shortcut', () => {
    expect(shortcutFor(key('g'))).toBeNull();
    expect(shortcutFor(key('g', { ctrl: true, shift: true }))).toBeNull();
    expect(shortcutFor(key('g', { alt: true }))).toBeNull();
    expect(shortcutFor(key('g', { ctrl: true, alt: true }))).toBeNull();
  });
});
