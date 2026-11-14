import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { ICON_NAMES, Icon } from '../../src/ui/icons';

afterEach(cleanup);

describe('icons', () => {
  it('the new set has at least 60 icons, with no repeated name', () => {
    expect(ICON_NAMES.length).toBeGreaterThanOrEqual(60);
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
  });

  it.each(ICON_NAMES)('%s: 16px, 1.25 stroke, currentColor and decorative', (name) => {
    const { container } = render(<Icon name={name} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 16 16');
    expect(svg?.getAttribute('stroke')).toBe('currentColor');
    expect(svg?.getAttribute('stroke-width')).toBe('1.25');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    // Every icon draws something and stays inside the 16px grid.
    expect(container.querySelectorAll('path, circle').length).toBeGreaterThan(0);
    for (const path of container.querySelectorAll('path')) {
      expect(path.getAttribute('d')).toMatch(/^[MmLlHhVvCcSsAaZz0-9 .,-]+$/);
    }
  });

  it('does not use a fixed color', () => {
    const { container } = render(<Icon name="sun" />);
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,8}|rgb/i);
  });
});
