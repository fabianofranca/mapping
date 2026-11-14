import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { locale } from '../../../src/store/settings';
import { ImageCompare } from '../../../src/ui/review/ImageCompare';

// ImageCompare (HANDOFF-PROPOSALS 2.1): three modes and the handle as `role="slider"`.

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

describe('ImageCompare', () => {
  it('slide: the handle moves with the arrows; Home shows only the before, End only the after', () => {
    render(
      <ImageCompare
        before={{ status: 'loading' }}
        after={{ status: 'missing' }}
        beforeName="images/cart.png"
        afterName="images/cart-v2.png"
      />,
    );
    const slider = screen.getByRole('slider', { name: 'Divider between before and after' });
    expect(slider.getAttribute('aria-valuenow')).toBe('50');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(slider.getAttribute('aria-valuenow')).toBe('55');
    fireEvent.keyDown(slider, { key: 'Home' });
    expect(slider.getAttribute('aria-valuenow')).toBe('0');
    fireEvent.keyDown(slider, { key: 'End' });
    expect(slider.getAttribute('aria-valuenow')).toBe('100');
    // The file names are always in view.
    expect(
      screen.getByText('Before: images/cart.png · After: images/cart-v2.png'),
    ).toBeTruthy();
    expect(
      screen.getByRole('img', { name: 'After: images/cart-v2.png' }).textContent,
    ).toBe('Image unavailable');
  });

  it('aria-valuetext per mode: Slide says % of the before, Overlay % of the after', () => {
    render(
      <ImageCompare
        before={undefined}
        after={undefined}
        beforeName="a.png"
        afterName="b.png"
      />,
    );
    const slide = screen.getByRole('slider', { name: 'Divider between before and after' });
    const layer = () => document.querySelector<HTMLElement>('.image-compare-before')!;
    fireEvent.keyDown(slide, { key: 'Home' });
    expect(slide.getAttribute('aria-valuetext')).toBe('0% of the before');
    expect(layer().style.clipPath).toBe('inset(0 100% 0 0)'); // only the after
    fireEvent.keyDown(slide, { key: 'End' });
    expect(slide.getAttribute('aria-valuetext')).toBe('100% of the before');
    expect(layer().style.clipPath).toBe('inset(0 0% 0 0)'); // only the before
    fireEvent.click(screen.getByRole('button', { name: 'Overlay' }));
    const blend = screen.getByRole('slider', { name: 'Blend between before and after' });
    expect(blend.getAttribute('aria-valuetext')).toBe('100% of the after');
  });

  it('side by side and overlay', () => {
    render(
      <ImageCompare
        before={undefined}
        after={undefined}
        beforeName="a.png"
        afterName="b.png"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Side by side' }));
    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.getByRole('img', { name: 'Before: a.png' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Overlay' }));
    expect(
      screen.getByRole('slider', { name: 'Blend between before and after' }),
    ).toBeTruthy();
  });
});
