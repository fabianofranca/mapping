import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { locale } from '../../../src/store/settings';
import { ImageCompare } from '../../../src/ui/review/ImageCompare';

// ImageCompare (HANDOFF-PROPOSALS 2.1): três modos e a alça como `role="slider"`.

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

describe('ImageCompare', () => {
  it('deslizar: a alça anda com as setas; Home só o antes, End só o depois', () => {
    render(
      <ImageCompare
        before={{ status: 'loading' }}
        after={{ status: 'missing' }}
        beforeName="images/carrinho.png"
        afterName="images/carrinho-v2.png"
      />,
    );
    const slider = screen.getByRole('slider', { name: 'Divisória entre antes e depois' });
    expect(slider.getAttribute('aria-valuenow')).toBe('50');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(slider.getAttribute('aria-valuenow')).toBe('55');
    fireEvent.keyDown(slider, { key: 'Home' });
    expect(slider.getAttribute('aria-valuenow')).toBe('0');
    fireEvent.keyDown(slider, { key: 'End' });
    expect(slider.getAttribute('aria-valuenow')).toBe('100');
    // Os nomes dos arquivos ficam sempre à vista.
    expect(
      screen.getByText('Antes: images/carrinho.png · Depois: images/carrinho-v2.png'),
    ).toBeTruthy();
    expect(
      screen.getByRole('img', { name: 'Depois: images/carrinho-v2.png' }).textContent,
    ).toBe('Imagem indisponível');
  });

  it('aria-valuetext por modo: Deslizar diz % do antes, Sobrepor % do depois', () => {
    render(
      <ImageCompare
        before={undefined}
        after={undefined}
        beforeName="a.png"
        afterName="b.png"
      />,
    );
    const slide = screen.getByRole('slider', { name: 'Divisória entre antes e depois' });
    const layer = () => document.querySelector<HTMLElement>('.image-compare-before')!;
    fireEvent.keyDown(slide, { key: 'Home' });
    expect(slide.getAttribute('aria-valuetext')).toBe('0% do antes');
    expect(layer().style.clipPath).toBe('inset(0 100% 0 0)'); // só o depois
    fireEvent.keyDown(slide, { key: 'End' });
    expect(slide.getAttribute('aria-valuetext')).toBe('100% do antes');
    expect(layer().style.clipPath).toBe('inset(0 0% 0 0)'); // só o antes
    fireEvent.click(screen.getByRole('button', { name: 'Sobrepor' }));
    const blend = screen.getByRole('slider', { name: 'Mistura entre antes e depois' });
    expect(blend.getAttribute('aria-valuetext')).toBe('100% do depois');
  });

  it('lado a lado e sobrepor', () => {
    render(
      <ImageCompare
        before={undefined}
        after={undefined}
        beforeName="a.png"
        afterName="b.png"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Lado a lado' }));
    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.getByRole('img', { name: 'Antes: a.png' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sobrepor' }));
    expect(
      screen.getByRole('slider', { name: 'Mistura entre antes e depois' }),
    ).toBeTruthy();
  });
});
