import { cleanup, render, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { locale } from '../../src/store/settings';
import { HelpTip } from '../../src/ui/controls';
import { Property, PropertyGrid } from '../../src/ui/PropertyGrid';
import { TextField } from '../../src/ui/controls';
import { descriptionOf } from './describedBy';

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

// Decisão 4 da etapa #353: explicação = ícone com dica, acessível pelo teclado e pelo leitor de tela.

describe('HelpTip', () => {
  it('é um botão "Sobre {name}" focável pelo Tab', async () => {
    const user = userEvent.setup();
    render(<HelpTip name="Largura" text="Em pixels da imagem." />);
    await user.tab();
    const button = screen.getByRole('button', { name: 'Sobre Largura' });
    expect(document.activeElement).toBe(button);
    expect(button.querySelector('svg')).not.toBeNull();
  });

  it('a descrição acessível do botão é o texto da explicação', () => {
    render(<HelpTip name="Largura" text="Em pixels da imagem." />);
    expect(descriptionOf(screen.getByRole('button', { name: 'Sobre Largura' }))).toBe(
      'Em pixels da imagem.',
    );
  });

  it('a dica existe no DOM para o hover e o foco, aria-hidden', () => {
    const { container } = render(<HelpTip name="Largura" text="Em pixels da imagem." />);
    const tip = container.querySelector('[data-tooltip]');
    expect(tip?.textContent).toBe('Em pixels da imagem.');
    expect(tip?.getAttribute('aria-hidden')).toBe('true');
  });

  it('Enter fixa a dica (aria-expanded) e Esc fecha', async () => {
    const user = userEvent.setup();
    render(<HelpTip name="Largura" text="Em pixels da imagem." />);
    const button = screen.getByRole('button', { name: 'Sobre Largura' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    await user.tab();
    await user.keyboard('{Enter}');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    await user.keyboard('{Escape}');
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('reabre por Enter e por clique depois de um Esc', async () => {
    const user = userEvent.setup();
    const { container } = render(<HelpTip name="Largura" text="Em pixels da imagem." />);
    const button = screen.getByRole('button', { name: 'Sobre Largura' });
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

  it('o clique fixa a dica e um clique fora fecha', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <HelpTip name="Largura" text="Em pixels da imagem." />
        <p>fora</p>
      </div>,
    );
    const button = screen.getByRole('button', { name: 'Sobre Largura' });
    await user.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    await user.click(screen.getByText('fora'));
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('Property com hint', () => {
  it('mostra o HelpTip ao lado do rótulo, sem .props-note e sem title', () => {
    const { container } = render(
      <PropertyGrid>
        <Property label="Altura" for="h" hint="Em pixels.">
          <TextField id="h" value="" onInput={() => undefined} />
        </Property>
      </PropertyGrid>,
    );
    expect(container.querySelector('.props-note')).toBeNull();
    expect(screen.getByRole('button', { name: 'Sobre Altura' })).toBeTruthy();
    expect(container.querySelector('.props-label')?.getAttribute('title')).toBeNull();
  });

  it('o controle ligado por for tem a descrição acessível igual ao hint', () => {
    render(
      <PropertyGrid>
        <Property label="Altura" for="h" hint="Em pixels.">
          <TextField id="h" value="" onInput={() => undefined} />
        </Property>
      </PropertyGrid>,
    );
    expect(descriptionOf(screen.getByLabelText('Altura'))).toBe('Em pixels.');
  });

  it('sem hint não há ícone nem descrição', () => {
    render(
      <PropertyGrid>
        <Property label="Altura" for="h">
          <TextField id="h" value="" onInput={() => undefined} />
        </Property>
      </PropertyGrid>,
    );
    expect(screen.queryByRole('button', { name: /^Sobre / })).toBeNull();
    expect(descriptionOf(screen.getByLabelText('Altura'))).toBe('');
  });
});
