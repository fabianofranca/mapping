import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ListToggleButton } from '../../src/app/EditorTools';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

// Etapa #515 (FN1, #436): o nome do botão não troca com o estado (WCAG 2.5.3); o estado
// fica só no aria-pressed.
describe('botão Lista', () => {
  it.each([false, true])('o nome é "Lista" com a lista aberta = %s', (open) => {
    const { container } = render(<ListToggleButton open={open} onToggle={vi.fn()} />);
    const button = screen.getByRole('button', { name: t('view.list') });
    expect(button.getAttribute('aria-pressed')).toBe(String(open));
    expect(t('view.list')).toBe('Lista');
    // A dica é igual ao nome nos dois estados (como nos cadeados e no "Tornar ativa").
    expect(container.querySelector('.tooltip')?.textContent).toBe('Lista');
  });
});
