import { describe, expect, it, vi } from 'vitest';
import { isEditable, watchSpaceKey } from '../../../src/canvas/input/keyboard';

const key = (type: 'keydown' | 'keyup', code = 'Space') =>
  new KeyboardEvent(type, { code, bubbles: true, cancelable: true });

describe('watchSpaceKey', () => {
  it('acompanha o Espaço e avisa a cada mudança', () => {
    const onChange = vi.fn();
    const space = watchSpaceKey(onChange);
    const down = key('keydown');
    window.dispatchEvent(down);
    expect(space.down()).toBe(true);
    expect(down.defaultPrevented).toBe(true);
    window.dispatchEvent(key('keyup'));
    expect(space.down()).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(2);
    space.dispose();
  });

  it('ignora outras teclas e o Espaço digitado num campo', () => {
    const onChange = vi.fn();
    const space = watchSpaceKey(onChange);
    window.dispatchEvent(key('keydown', 'KeyA'));
    const input = document.createElement('input');
    document.body.append(input);
    input.dispatchEvent(key('keydown'));
    expect(space.down()).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
    input.remove();
    space.dispose();
  });

  it('perder o foco solta a tecla; depois de `dispose` não escuta mais', () => {
    const space = watchSpaceKey(() => undefined);
    window.dispatchEvent(key('keydown'));
    window.dispatchEvent(new Event('blur'));
    expect(space.down()).toBe(false);
    space.dispose();
    window.dispatchEvent(key('keydown'));
    expect(space.down()).toBe(false);
  });
});

describe('watchSpaceKey: foco em campo (CR canvas/store, item 18)', () => {
  it('soltar o Espaço num campo zera o estado', () => {
    const space = watchSpaceKey(() => undefined);
    window.dispatchEvent(key('keydown'));
    expect(space.down()).toBe(true);
    const input = document.createElement('input');
    document.body.append(input);
    input.dispatchEvent(key('keyup'));
    expect(space.down()).toBe(false);
    input.remove();
    space.dispose();
  });

  it('o keydown não é cancelado num link, botão ou role=button, nem em campo', () => {
    const space = watchSpaceKey(() => undefined);
    for (const make of [
      () => document.createElement('input'),
      () => document.createElement('button'),
      () => {
        const a = document.createElement('a');
        a.href = '#x';
        return a;
      },
      () => {
        const d = document.createElement('div');
        d.setAttribute('role', 'button');
        return d;
      },
    ]) {
      const el = make();
      document.body.append(el);
      const e = key('keydown');
      el.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(false);
      el.remove();
      el.dispatchEvent(key('keyup'));
    }
    const plain = key('keydown');
    document.body.dispatchEvent(plain);
    expect(plain.defaultPrevented).toBe(true);
    window.dispatchEvent(key('keyup'));
    space.dispose();
  });
});

describe('isEditable', () => {
  it('campos de texto, botões e conteúdo editável', () => {
    expect(isEditable(document.createElement('textarea'))).toBe(true);
    expect(isEditable(document.createElement('button'))).toBe(true);
    const div = document.createElement('div');
    expect(isEditable(div)).toBe(false);
    div.contentEditable = 'true';
    // jsdom não calcula `isContentEditable`: simula o navegador.
    Object.defineProperty(div, 'isContentEditable', { value: true });
    expect(isEditable(div)).toBe(true);
    expect(isEditable(null)).toBe(false);
  });
});
