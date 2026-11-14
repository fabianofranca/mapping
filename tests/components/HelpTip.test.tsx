import { cleanup, render, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { locale } from '../../src/store/settings';
import { HelpTip } from '../../src/ui/controls';
import { Property, PropertyGrid } from '../../src/ui/PropertyGrid';
import { TextField } from '../../src/ui/controls';
import { descriptionOf } from './describedBy';

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

// Decision 4 of stage #353: explanation = icon with a tip, reachable by keyboard and by screen reader.

describe('HelpTip', () => {
  it('is an "About {name}" button focusable with Tab', async () => {
    const user = userEvent.setup();
    render(<HelpTip name="Width" text="In image pixels." />);
    await user.tab();
    const button = screen.getByRole('button', { name: 'About Width' });
    expect(document.activeElement).toBe(button);
    expect(button.querySelector('svg')).not.toBeNull();
  });

  it('the accessible description of the button is the explanation text', () => {
    render(<HelpTip name="Width" text="In image pixels." />);
    expect(descriptionOf(screen.getByRole('button', { name: 'About Width' }))).toBe(
      'In image pixels.',
    );
  });

  it('the tip exists in the DOM for hover and focus, aria-hidden', () => {
    const { container } = render(<HelpTip name="Width" text="In image pixels." />);
    const tip = container.querySelector('[data-tooltip]');
    expect(tip?.textContent).toBe('In image pixels.');
    expect(tip?.getAttribute('aria-hidden')).toBe('true');
  });

  it('Enter pins the tip (aria-expanded) and Esc closes it', async () => {
    const user = userEvent.setup();
    render(<HelpTip name="Width" text="In image pixels." />);
    const button = screen.getByRole('button', { name: 'About Width' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    await user.tab();
    await user.keyboard('{Enter}');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    await user.keyboard('{Escape}');
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('reopens with Enter and with a click after an Esc', async () => {
    const user = userEvent.setup();
    const { container } = render(<HelpTip name="Width" text="In image pixels." />);
    const button = screen.getByRole('button', { name: 'About Width' });
    const anchor = container.querySelector('.tooltip-anchor') as HTMLElement;
    await user.tab();
    await user.keyboard('{Enter}');
    await user.keyboard('{Escape}');
    expect(anchor.classList.contains('tooltip-open')).toBe(false);
    await user.keyboard('{Enter}');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(anchor.classList.contains('tooltip-open')).toBe(true);
    expect(anchor.classList.contains('tooltip-dismissed')).toBe(false);
    await user.keyboard('{Escape}');
    await user.click(button);
    expect(anchor.classList.contains('tooltip-open')).toBe(true);
    expect(anchor.classList.contains('tooltip-dismissed')).toBe(false);
  });

  it('a click pins the tip and a click outside closes it', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <HelpTip name="Width" text="In image pixels." />
        <p>outside</p>
      </div>,
    );
    const button = screen.getByRole('button', { name: 'About Width' });
    await user.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    await user.click(screen.getByText('outside'));
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('Property with hint', () => {
  it('shows the HelpTip next to the label, without .props-note and without title', () => {
    const { container } = render(
      <PropertyGrid>
        <Property label="Height" for="h" hint="In pixels.">
          <TextField id="h" value="" onInput={() => undefined} />
        </Property>
      </PropertyGrid>,
    );
    expect(container.querySelector('.props-note')).toBeNull();
    expect(screen.getByRole('button', { name: 'About Height' })).toBeTruthy();
    expect(container.querySelector('.props-label')?.getAttribute('title')).toBeNull();
  });

  it('the control linked by for has an accessible description equal to the hint', () => {
    render(
      <PropertyGrid>
        <Property label="Height" for="h" hint="In pixels.">
          <TextField id="h" value="" onInput={() => undefined} />
        </Property>
      </PropertyGrid>,
    );
    expect(descriptionOf(screen.getByLabelText('Height'))).toBe('In pixels.');
  });

  it('without a hint there is no icon or description', () => {
    render(
      <PropertyGrid>
        <Property label="Height" for="h">
          <TextField id="h" value="" onInput={() => undefined} />
        </Property>
      </PropertyGrid>,
    );
    expect(screen.queryByRole('button', { name: /^About / })).toBeNull();
    expect(descriptionOf(screen.getByLabelText('Height'))).toBe('');
  });
});
