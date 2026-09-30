import { describe, expect, it } from 'vitest';
import { isTextInput, shortcutFor } from '../../src/app/shortcuts';

const key = (
  k: string,
  mods: Partial<Record<'ctrl' | 'meta' | 'shift' | 'alt', boolean>> = {},
) => ({
  key: k,
  ctrlKey: mods.ctrl ?? false,
  metaKey: mods.meta ?? false,
  shiftKey: mods.shift ?? false,
  altKey: mods.alt ?? false,
});

describe('atalhos do editor', () => {
  it('desfazer e refazer', () => {
    expect(shortcutFor(key('z', { ctrl: true }))).toBe('undo');
    expect(shortcutFor(key('z', { meta: true }))).toBe('undo');
    expect(shortcutFor(key('Z', { ctrl: true, shift: true }))).toBe('redo');
    expect(shortcutFor(key('z', { meta: true, shift: true }))).toBe('redo');
    expect(shortcutFor(key('y', { ctrl: true }))).toBe('redo');
    expect(shortcutFor(key('z'))).toBeNull();
  });

  it('excluir e Esc', () => {
    expect(shortcutFor(key('Delete'))).toBe('delete');
    expect(shortcutFor(key('Backspace'))).toBe('delete');
    expect(shortcutFor(key('Escape'))).toBe('escape');
    expect(shortcutFor(key('Delete', { ctrl: true }))).toBeNull();
    expect(shortcutFor(key('z', { ctrl: true, alt: true }))).toBeNull();
  });

  it('campos de texto ficam com o teclado', () => {
    expect(isTextInput(document.createElement('input'))).toBe(true);
    expect(isTextInput(document.createElement('textarea'))).toBe(true);
    expect(isTextInput(document.createElement('div'))).toBe(false);
    expect(isTextInput(null)).toBe(false);
  });
});
