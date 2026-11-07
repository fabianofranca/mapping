import { afterEach, describe, expect, it } from 'vitest';
import { place } from '../../src/ui/Popover';

// `place` com limite (etapa #676, AR1, decisão 5): o painel nunca invade a área acima do
// limite (a barra da revisão); sem limite, a posição é a de sempre.

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
  it('sem limite, abre embaixo e, sem caber, em cima, como sempre', () => {
    const a = setup(100, 200);
    place(a.host, a.panel, 'start');
    expect(top(a.panel)).toBe(122);
    const b = setup(600, 300);
    place(b.host, b.panel, 'start');
    expect(top(b.panel)).toBe(600 - 4 - 300);
    expect(b.panel.style.maxHeight).toBe('');
  });

  it('com limite e o gatilho perto do alto, não invade a barra', () => {
    // Embaixo não cabe (422 + 450 > 692) e em cima o painel subiria até a borda da janela.
    const { host, panel } = setup(400, 450);
    place(host, panel, 'start', { top: 60 });
    expect(top(panel)).toBeGreaterThanOrEqual(60);
  });

  it('sem espaço embaixo nem em cima, abre do lado com mais espaço, com altura máxima e rolagem', () => {
    const { host, panel } = setup(400, 900);
    place(host, panel, 'start', { top: 60 });
    expect(panel.style.overflowY).toBe('auto');
    const max = Number.parseFloat(panel.style.maxHeight);
    // embaixo: 700 - 8 - 422 = 270; em cima: 400 - 4 - 64 = 332 (limite 60 + folga 4).
    expect(max).toBeGreaterThan(0);
    expect(top(panel)).toBeGreaterThanOrEqual(60);
    expect(top(panel) + max).toBeLessThanOrEqual(VIEW.height - 8);
    expect(top(panel) + max).toBeLessThanOrEqual(400);
  });

  it('com limite e espaço embaixo, abre embaixo', () => {
    const { host, panel } = setup(100, 200);
    place(host, panel, 'start', { top: 60 });
    expect(top(panel)).toBe(122);
  });
});
