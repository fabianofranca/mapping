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

describe('atalhos do editor', () => {
  // Etapa 2.5: Alt+L tranca ou destranca o item selecionado.
  it('Alt+L: trancar/destrancar (pela tecla física, por causa do Option no macOS)', () => {
    expect(shortcutFor(key('l', { alt: true }))).toEqual({ kind: 'toggle-lock' });
    expect(shortcutFor(key('¬', { alt: true }, 'KeyL'))).toEqual({ kind: 'toggle-lock' });
    expect(shortcutFor(key('l', { alt: true, shift: true }))).toBeNull();
    expect(shortcutFor(key('l', { alt: true, ctrl: true }))).toBeNull();
    // O Ctrl+L continua sendo a janela Camadas e o L sozinho não faz nada.
    expect(shortcutFor(key('l', { ctrl: true }))).toEqual({ kind: 'layers' });
    expect(shortcutFor(key('l'))).toBeNull();
  });

  // Canvas limpo: Alt+H liga ou desliga o modo visualização.
  it('Alt+H: modo visualização (pela tecla física, por causa do Option no macOS)', () => {
    expect(shortcutFor(key('h', { alt: true }))).toEqual({ kind: 'view-mode' });
    expect(shortcutFor(key('˙', { alt: true }, 'KeyH'))).toEqual({ kind: 'view-mode' });
    expect(shortcutFor(key('h', { alt: true, shift: true }))).toBeNull();
    expect(shortcutFor(key('h', { alt: true, ctrl: true }))).toBeNull();
    expect(shortcutFor(key('h'))).toBeNull();
  });

  // B3/P7: Alt+Shift+A arruma o container selecionado.
  it('Alt+Shift+A: arrumar (pela tecla física, por causa do Option no macOS)', () => {
    expect(shortcutFor(key('a', { alt: true, shift: true }))).toEqual({
      kind: 'arrange',
    });
    expect(shortcutFor(key('Å', { alt: true, shift: true }, 'KeyA'))).toEqual({
      kind: 'arrange',
    });
    expect(shortcutFor(key('a', { alt: true }))).toBeNull();
    expect(shortcutFor(key('a', { alt: true, shift: true, ctrl: true }))).toBeNull();
  });

  // A camada ativa saiu: o Alt+N não é mais atalho.
  it('Alt+N não faz nada (nem pela tecla física)', () => {
    expect(shortcutFor(key('n', { alt: true }))).toBeNull();
    expect(shortcutFor(key('˜', { alt: true }, 'KeyN'))).toBeNull();
  });

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

  // Ctrl+Shift+número é o atalho oficial.
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
    // Alt+número desligado (Chrome no Linux troca de aba).
    expect(shortcutFor(key('4', { alt: true }), false)).toBeNull();
    expect(shortcutFor(key('4', { ctrl: true, shift: true }), false)).toEqual({
      kind: 'toggle-window',
      window: 'list',
    });
  });

  it('setas movem a seleção 1 px; com Shift, 10 px; com Ctrl ou Alt não fazem isso', () => {
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
    // Os atalhos com modificador seguem como estavam.
    expect(shortcutFor(key('ArrowUp', { alt: true }))).toEqual({ kind: 'select-parent' });
  });

  it('as setas são do editor só com o foco no canvas ou em nenhum controle', () => {
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

  // Enquadrar seleção: Shift+2 pela tecla física (com Shift o `key` vira `@` ou `"`).
  it('Shift+2: enquadrar a seleção, pela tecla física', () => {
    expect(shortcutFor(key('@', { shift: true }, 'Digit2'))).toEqual({
      kind: 'fit-selection',
    });
    expect(shortcutFor(key('"', { shift: true }, 'Digit2'))).toEqual({
      kind: 'fit-selection',
    });
    expect(shortcutFor(key('2', { shift: true }))).toEqual({ kind: 'fit-selection' });
    // Sem Shift, ou com outro modificador, não é este atalho (Ctrl+Shift+2 abre uma janela).
    expect(shortcutFor(key('2', {}, 'Digit2'))).toBeNull();
    expect(shortcutFor(key('@', { shift: true, ctrl: true }, 'Digit2'))).not.toEqual({
      kind: 'fit-selection',
    });
    expect(SHORTCUT_LABELS.fitSelection).toBe('Shift+2');
  });

  // Enquadrar tudo: Shift+1 pela tecla física (com Shift o `key` vira `!` ou `1`).
  it('Shift+1: enquadrar tudo, pela tecla física', () => {
    expect(shortcutFor(key('!', { shift: true }, 'Digit1'))).toEqual({ kind: 'fit-all' });
    expect(shortcutFor(key('1', { shift: true }, 'Digit1'))).toEqual({ kind: 'fit-all' });
    expect(shortcutFor(key('1', {}, 'Digit1'))).toBeNull();
    expect(shortcutFor(key('!', { shift: true, ctrl: true }, 'Digit1'))).not.toEqual({
      kind: 'fit-all',
    });
    expect(SHORTCUT_LABELS.fitAll).toBe('Shift+1');
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

describe('atalhos de copiar (etapa 3a.2)', () => {
  it('Ctrl+C e Cmd+C copiam a referência', () => {
    expect(shortcutFor(key('c', { ctrl: true }))).toEqual({ kind: 'copy-reference' });
    expect(shortcutFor(key('c', { meta: true }))).toEqual({ kind: 'copy-reference' });
    expect(shortcutFor(key('C', { ctrl: true }))).toEqual({ kind: 'copy-reference' });
    expect(shortcutFor(key('c'))).toBeNull();
  });

  it('Ctrl+Alt+C copia o recorte (pela tecla física, por causa do Option no macOS)', () => {
    expect(shortcutFor(key('c', { ctrl: true, alt: true }))).toEqual({
      kind: 'copy-crop',
    });
    expect(shortcutFor(key('ç', { meta: true, alt: true }, 'KeyC'))).toEqual({
      kind: 'copy-crop',
    });
    expect(shortcutFor(key('c', { alt: true }))).toBeNull();
  });

  it('Ctrl+Shift+C continua livre: é o das ferramentas de desenvolvedor do Chrome', () => {
    expect(shortcutFor(key('c', { ctrl: true, shift: true }))).toBeNull();
    expect(shortcutFor(key('c', { ctrl: true, alt: true, shift: true }))).toBeNull();
  });
});

// Etapa 4 (HANDOFF-PROPOSALS 6): atalhos da revisão de propostas.
describe('atalhos da revisão', () => {
  it('A / R / Backspace decidem o nível selecionado (R é Rejeitar na revisão)', () => {
    expect(reviewShortcutFor(key('a'))).toEqual({ kind: 'decide', state: 'accepted' });
    expect(reviewShortcutFor(key('R'))).toEqual({ kind: 'decide', state: 'rejected' });
    expect(reviewShortcutFor(key('Backspace'))).toEqual({ kind: 'decide', state: null });
  });

  it('N / Shift+N e C / Shift+C andam nas pendentes e nos conflitos', () => {
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

  it('P alterna Atual/Proposto, L a legenda e Ctrl+Enter aplica', () => {
    expect(reviewShortcutFor(key('p'))).toEqual({ kind: 'toggle-view' });
    expect(reviewShortcutFor(key('l'))).toEqual({ kind: 'legend' });
    expect(reviewShortcutFor(key('Enter', { ctrl: true }))).toEqual({ kind: 'apply' });
    expect(reviewShortcutFor(key('Enter'))).toBeNull();
  });

  it('não pega os atalhos do editor (Ctrl+Z, Ctrl+Shift+7, Alt+…)', () => {
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

// Etapa 8 (8.3), F5: `aria-keyshortcuts` na sintaxe ARIA; o rótulo humano fica na dica.
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

  it('o que não é tecla não vira atributo', () => {
    expect(ariaKeys('Ctrl+clique')).toBeUndefined();
    expect(ariaKeys('')).toBeUndefined();
    expect(ariaKeys(undefined)).toBeUndefined();
  });

  it('todos os atalhos da app têm forma ARIA', () => {
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

describe('atalho Envolver (etapa Envolver, EV1)', () => {
  it('Ctrl+G e Cmd+G envolvem', () => {
    expect(shortcutFor(key('g', { ctrl: true }))).toEqual({ kind: 'wrap' });
    expect(shortcutFor(key('g', { meta: true }))).toEqual({ kind: 'wrap' });
    expect(shortcutFor(key('G', { ctrl: true }))).toEqual({ kind: 'wrap' });
  });

  it('G sozinho, Ctrl+Shift+G e Alt+G não são o atalho', () => {
    expect(shortcutFor(key('g'))).toBeNull();
    expect(shortcutFor(key('g', { ctrl: true, shift: true }))).toBeNull();
    expect(shortcutFor(key('g', { alt: true }))).toBeNull();
    expect(shortcutFor(key('g', { ctrl: true, alt: true }))).toBeNull();
  });
});
