import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { ICON_NAMES, Icon } from '../../src/ui/icons';

afterEach(cleanup);

describe('ícones', () => {
  it('o conjunto novo tem pelo menos 60 ícones, sem nome repetido', () => {
    expect(ICON_NAMES.length).toBeGreaterThanOrEqual(60);
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
  });

  it.each(ICON_NAMES)('%s: 16px, traço de 1,25, currentColor e decorativo', (name) => {
    const { container } = render(<Icon name={name} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 16 16');
    expect(svg?.getAttribute('stroke')).toBe('currentColor');
    expect(svg?.getAttribute('stroke-width')).toBe('1.25');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    // Todo ícone desenha alguma coisa e fica dentro da grade de 16px.
    expect(container.querySelectorAll('path, circle').length).toBeGreaterThan(0);
    for (const path of container.querySelectorAll('path')) {
      expect(path.getAttribute('d')).toMatch(/^[MmLlHhVvCcSsAaZz0-9 .,-]+$/);
    }
  });

  it('não usa cor fixa', () => {
    const { container } = render(<Icon name="sun" />);
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,8}|rgb/i);
  });
});
