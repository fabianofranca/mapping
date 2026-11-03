import { cleanup, fireEvent, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renameMarking, replaceContainer } from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { sampleProject } from '../../model/fixtures';
import { propose } from '../../model/proposalFixtures';
import { richScenario } from '../../store/proposalHarness';
import { showReviewPanel } from './reviewHarness';

// SA1 (etapa #347, decisão 3): todo botão com texto visível tem um nome acessível que
// começa por esse texto ("<visível>: <alvo>"), para o comando de voz (WCAG 2.5.3). O
// estado fica só no `aria-pressed`; o conflito vai para a descrição.

beforeEach(() => {
  locale.value = 'pt-BR';
  localStorage.clear();
});
afterEach(cleanup);

const header = () => screen.getByRole('region', { name: 'Decisão' });
const describedText = (el: HTMLElement) =>
  (el.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');

describe('nomes acessíveis da revisão', () => {
  it('imagem: "Aceitar imagem: <nome>" mesmo marcada; o estado está no aria-pressed', async () => {
    const base = sampleProject();
    const after = replaceContainer(base, 'I2', {
      file: 'images/frente-2.jpg',
      width: 2000,
      height: 2000,
    });
    const h = await showReviewPanel(
      { project: base, proposals: [propose(base, after)] },
      { level: 'image', id: 'I2' },
    );
    const accept = within(header()).getByRole('button', { name: /^Aceitar imagem/ });
    expect(accept.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(accept);
    await vi_waitPressed(accept);
    expect(
      within(header())
        .getByRole('button', { name: /^Aceitar imagem/ })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(h.review.selected.value).toEqual({ level: 'image', id: 'I2' });
  });

  it('marcação: "Rejeitar marcação: <nome>"', async () => {
    const { proposal } = richScenario();
    await showReviewPanel({ proposals: [proposal] }, { level: 'item', id: 'M1' });
    const reject = within(header()).getByRole('button', { name: /^Rejeitar marcação/ });
    expect(reject.getAttribute('aria-label')).toBe('Rejeitar marcação: Porta');
  });

  it('conflito: "Sobrescrever" começa o nome e o efeito vai para a descrição', async () => {
    const { proposal } = richScenario();
    const edited = renameMarking(sampleProject(), 'M1', 'Topo');
    await showReviewPanel(
      { project: edited, proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    fireEvent.click(
      screen.getByRole('button', { name: /^Nome: alterado, pendente, em conflito/ }),
    );
    const pop = screen.getByRole('dialog');
    const overwrite = within(pop).getByRole('button', { name: /^Sobrescrever/ });
    expect(describedText(overwrite)).toContain('sobrescreve Topo por Porta dianteira');
    const keep = within(pop).getByRole('button', { name: /^Manter atual/ });
    expect(describedText(keep)).toContain('mantém Topo');
  });
});

async function vi_waitPressed(el: HTMLElement) {
  const { waitFor } = await import('@testing-library/preact');
  await waitFor(() => expect(el.getAttribute('aria-pressed')).toBe('true'));
}
