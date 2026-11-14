import { afterEach, describe, expect, it } from 'vitest';
import { place } from '../../src/ui/Popover';

// `place` with a limit (stage #676, AR1, decision 5): the panel never invades the area above
// the limit (the review bar); without a limit, the position is the usual one.

const VIEW = { width: 1000, height: 700 };

function setup(anchorTop: number, panelHeight: number) {
  Object.defineProperty(globalThis, 'innerWidth', {
    value: VIEW.width,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'innerHeight', {
    value: VIEW.height,
    configurable: true,
  });
  const host = document.createElement('span');
  host.getBoundingClientRect = () =>
    ({ top: anchorTop, bottom: anchorTop + 18, left: 100, right: 118 }) as DOMRect;
  const panel = document.createElement('div');
  Object.defineProperty(panel, 'offsetWidth', { value: 300 });
  Object.defineProperty(panel, 'offsetHeight', { value: panelHeight });
  return { host, panel };
}
const top = (el: HTMLElement) => Number.parseFloat(el.style.top);
afterEach(() => undefined);

describe('place', () => {
  it('without a limit, opens below and, when it does not fit, above, as usual', () => {
    const a = setup(100, 200);
    place(a.host, a.panel, 'start');
    expect(top(a.panel)).toBe(122);
    const b = setup(600, 300);
    place(b.host, b.panel, 'start');
    expect(top(b.panel)).toBe(600 - 4 - 300);
    expect(b.panel.style.maxHeight).toBe('');
  });

  it('with a limit and the trigger near the top, does not invade the bar', () => {
    // It does not fit below (422 + 450 > 692) and above the panel would rise to the window edge.
    const { host, panel } = setup(400, 450);
    place(host, panel, 'start', { top: 60 });
    expect(top(panel)).toBeGreaterThanOrEqual(60);
  });

  it('with no room below or above, opens on the side with more room, with a maximum height and scrolling', () => {
    const { host, panel } = setup(400, 900);
    place(host, panel, 'start', { top: 60 });
    expect(panel.style.overflowY).toBe('auto');
    const max = Number.parseFloat(panel.style.maxHeight);
    // below: 700 - 8 - 422 = 270; above: 400 - 4 - 64 = 332 (limit 60 + margin 4).
    expect(max).toBeGreaterThan(0);
    expect(top(panel)).toBeGreaterThanOrEqual(60);
    expect(top(panel) + max).toBeLessThanOrEqual(VIEW.height - 8);
    expect(top(panel) + max).toBeLessThanOrEqual(400);
  });

  it('with a limit and room below, opens below', () => {
    const { host, panel } = setup(100, 200);
    place(host, panel, 'start', { top: 60 });
    expect(top(panel)).toBe(122);
  });
});
