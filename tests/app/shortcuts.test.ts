import { describe, expect, it } from 'vitest';
import { altNumbersAvailable, isTextInput, shortcutFor } from '../../src/app/shortcuts';

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

describe('atalhos do editor', () => {
  it('desfazer e refazer', () => {
    expect(shortcutFor(key('z', { ctrl: true }))).toEqual({ kind: 'undo' });
    expect(shortcutFor(key('z', { meta: true }))).toEqual({ kind: 'undo' });
    expect(shortcutFor(key('Z', { ctrl: true, shift: true }))).toEqual({ kind: 'redo' });
    expect(shortcutFor(key('z', { meta: true, shift: true }))).toEqual({ kind: 'redo' });
    expect(shortcutFor(key('y', { ctrl: true }))).toEqual({ kind: 'redo' });
    expect(shortcutFor(key('z'))).toBeNull();
  });

  it('excluir e Esc', () => {
    expect(shortcutFor(key('Delete'))).toEqual({ kind: 'delete' });
    expect(shortcutFor(key('Backspace'))).toEqual({ kind: 'delete' });
    expect(shortcutFor(key('Escape'))).toEqual({ kind: 'escape' });
    expect(shortcutFor(key('Escape', { shift: true }))).toEqual({ kind: 'hide-window' });
    expect(shortcutFor(key('Delete', { ctrl: true }))).toBeNull();
    expect(shortcutFor(key('z', { ctrl: true, alt: true }))).toBeNull();
  });

  // B12 e decisão 1 da seção 5 do HANDOFF: Ctrl+Shift+número é o oficial.
  it('janelas de ferramenta: Ctrl+Shift+número e Alt+número', () => {
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
    // Com Shift o navegador manda o símbolo ($ no layout americano): vale a tecla física.
    expect(shortcutFor(key('$', { ctrl: true, shift: true }, 'Digit4'))).toEqual({
      kind: 'toggle-window',
      window: 'list',
    });
    expect(shortcutFor(key('5', { ctrl: true, shift: true }))).toEqual({
      kind: 'toggle-window',
      window: 'incomplete',
    });
    expect(shortcutFor(key('6', { ctrl: true, shift: true }))).toEqual({
      kind: 'toggle-window',
      window: 'diagnostics',
    });
    // O 2 só ganha janela na fase R6 (Camadas).
    expect(shortcutFor(key('2', { ctrl: true, shift: true }))).toBeNull();
    // Alt+número desligado (Chrome no Linux troca de aba).
    expect(shortcutFor(key('4', { alt: true }), false)).toBeNull();
    expect(shortcutFor(key('4', { ctrl: true, shift: true }), false)).toEqual({
      kind: 'toggle-window',
      window: 'list',
    });
  });

  it('redimensionar a janela em foco e andar na seleção', () => {
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

  it('zoom, exportar, camadas, ajuda e configurações', () => {
    expect(shortcutFor(key('=', { ctrl: true }))).toMatchObject({ kind: 'zoom' });
    expect(shortcutFor(key('-', { ctrl: true }))).toMatchObject({ kind: 'zoom' });
    expect(shortcutFor(key('0', { ctrl: true }))).toEqual({ kind: 'zoom-reset' });
    expect(shortcutFor(key('e', { ctrl: true }))).toEqual({ kind: 'export' });
    expect(shortcutFor(key('l', { ctrl: true }))).toEqual({ kind: 'layers' });
    expect(shortcutFor(key(',', { ctrl: true }))).toEqual({ kind: 'settings' });
    expect(shortcutFor(key('F1'))).toEqual({ kind: 'help' });
  });

  it('Alt+número vale instalado, ou fora do Linux', () => {
    expect(altNumbersAvailable('X11; Linux x86_64', false)).toBe(false);
    expect(altNumbersAvailable('X11; Linux x86_64', true)).toBe(true);
    expect(altNumbersAvailable('Macintosh; Intel Mac OS X', false)).toBe(true);
  });

  it('campos de texto ficam com o teclado', () => {
    expect(isTextInput(document.createElement('input'))).toBe(true);
    expect(isTextInput(document.createElement('textarea'))).toBe(true);
    expect(isTextInput(document.createElement('div'))).toBe(false);
    expect(isTextInput(null)).toBe(false);
  });
});
