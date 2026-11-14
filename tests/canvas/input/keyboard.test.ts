import { describe, expect, it, vi } from 'vitest';
import { isEditable, watchSpaceKey } from '../../../src/canvas/input/keyboard';

const key = (type: 'keydown' | 'keyup', code = 'Space') =>
  new KeyboardEvent(type, { code, bubbles: true, cancelable: true });

describe('watchSpaceKey', () => {
  it('follows Space and reports each change', () => {
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

  it('ignores other keys and Space typed in a field', () => {
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

  it('losing focus releases the key; after `dispose` it no longer listens', () => {
    const space = watchSpaceKey(() => undefined);
    window.dispatchEvent(key('keydown'));
    window.dispatchEvent(new Event('blur'));
    expect(space.down()).toBe(false);
    space.dispose();
    window.dispatchEvent(key('keydown'));
    expect(space.down()).toBe(false);
  });
});

describe('watchSpaceKey: focus in a field (CR canvas/store, item 18)', () => {
  it('releasing Space in a field resets the state', () => {
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

  it('keydown is not cancelled on a link, button or role=button, nor in a field', () => {
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
  it('text fields, buttons and editable content', () => {
    expect(isEditable(document.createElement('textarea'))).toBe(true);
    expect(isEditable(document.createElement('button'))).toBe(true);
    const div = document.createElement('div');
    expect(isEditable(div)).toBe(false);
    div.contentEditable = 'true';
    // jsdom does not compute `isContentEditable`: simulates the browser.
    Object.defineProperty(div, 'isContentEditable', { value: true });
    expect(isEditable(div)).toBe(true);
    expect(isEditable(null)).toBe(false);
  });
});
