import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { replaceImage, setMarkingLocked } from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { sampleProject } from '../../model/fixtures';
import { changeOf, propose } from '../../model/proposalFixtures';
import { showReviewPanel } from './reviewHarness';

// "Outras mudanças" (fase 9.6, HANDOFF-REVIEW-DETAILS 5.6): o que não tem campo no painel
// normal numa linha com o tipo, o resumo e o mesmo marcador e popover dos campos; a imagem
// trocada tem o marcador no campo Arquivo, com Comparar no popover.

beforeEach(() => {
  locale.value = 'pt-BR';
  localStorage.clear();
});
afterEach(cleanup);

describe('Outras mudanças', () => {
  it('marcação: a trava vira uma linha com tipo, resumo e marcador; recolhida, a seção conta', async () => {
    const base = sampleProject();
    const proposal = propose(base, setMarkingLocked(base, 'M4', true));
    const h = await showReviewPanel(
      { project: base, proposals: [proposal] },
      { level: 'item', id: 'M4' },
    );
    const section = screen.getByRole('region', { name: 'Outras mudanças' });
    const row = within(section).getByRole('listitem');
    expect(within(row).getByText('Trava')).toBeTruthy();
    expect(within(row).getByRole('img', { name: 'Alterada' })).toBeTruthy();
    const mark = within(row).getByRole('button', {
      name: /^Trava: alterado, pendente\./,
    });
    expect(mark.getAttribute('data-change')).toBe(proposal.changes[0]?.id);
    // O popover é o mesmo dos campos, com a decisão.
    fireEvent.click(mark);
    const pop = screen.getByRole('dialog', { name: 'Trava · alterado' });
    fireEvent.click(within(pop).getByRole('button', { name: 'Aceitar Trava' }));
    await waitFor(() =>
      expect(h.review.derived.levels.value.get('item:M4')?.state).toBe('accepted'),
    );
    expect(mark.getAttribute('data-state')).toBe('accepted');

    // Recolhida, a seção diz quantas mudanças tem.
    fireEvent.click(within(section).getByRole('button', { name: /^Outras mudanças/ }));
    expect(
      within(screen.getByRole('region', { name: 'Outras mudanças' })).getByText(
        '1 mudança(s)',
      ),
    ).toBeTruthy();
  });

  it('imagem trocada: o marcador do Arquivo tem Comparar; a posição vai para "Outras mudanças"', async () => {
    const base = sampleProject();
    const after = replaceImage(base, 'I2', {
      file: 'images/frente-2.jpg',
      width: 2000,
      height: 2000,
    });
    const proposal = propose(base, after);
    const h = await showReviewPanel(
      { project: base, proposals: [proposal] },
      { level: 'image', id: 'I2' },
    );
    const header = screen.getByRole('region', { name: 'Decisão' });
    expect(within(header).getByText('Imagem alterada')).toBeTruthy();
    expect(
      within(header).getByRole('button', { name: /^Aceitar .*frente/ }).textContent,
    ).toBe('Aceitar imagem');

    const file = screen.getByRole('button', {
      name: /^Arquivo da imagem: trocado, pendente\./,
    });
    fireEvent.click(file);
    const pop = screen.getByRole('dialog');
    fireEvent.click(within(pop).getByRole('button', { name: 'Comparar' }));
    expect(h.ui.compareImage.value).toBe('I2');
    // O popover fecha (o foco volta ao marcador, que abre o diálogo de comparar).
    expect(
      screen.queryByRole('dialog', { name: 'Arquivo da imagem · trocado' }),
    ).toBeNull();

    // A posição no canvas não tem campo: fica em "Outras mudanças".
    const others = screen.getByRole('region', { name: 'Outras mudanças' });
    expect(
      within(others).getByRole('button', {
        name: /^Posição no canvas: (movido|alterado)/,
      }),
    ).toBeTruthy();
    expect(
      screen
        .getAllByRole('button', { name: /^Posição no canvas/ })
        .every((el) => others.contains(el)),
    ).toBe(true);
    expect(changeOf(proposal, 'image', 'I2', 'placement').id).toBeTruthy();
  });
});
