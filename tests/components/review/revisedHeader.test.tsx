import { act, cleanup, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { locale } from '../../../src/store/settings';
import { formatFullDate } from '../../../src/ui/review/format';
import { revisionParts } from '../../../src/ui/review/revisedText';
import { ReviewDetails } from '../../../src/ui/review/ReviewDetails';
import { NEW_IMAGE_PATH, richScenario } from '../../store/proposalHarness';
import { openReviewHarness, renderInEditor } from './reviewHarness';
import { REVISED_AT, revisedScenario } from './revisedFixture';

// Cabeçalho da proposta revisada (etapa #644, CP3): "Revisada pelo agente em <data>: …",
// sem as contagens zeradas.

beforeEach(() => {
  locale.value = 'pt-BR';
  localStorage.clear();
});
afterEach(cleanup);

async function showProposal(proposal = revisedScenario().proposal) {
  const h = await openReviewHarness({
    proposals: [proposal],
    files: { [NEW_IMAGE_PATH]: 'imagem' },
  });
  expect(h.review.open('P1').ok).toBe(true);
  act(() => h.review.select({ level: 'proposal', id: null }));
  renderInEditor(h, <ReviewDetails />);
  return h;
}

describe('linha da revisão no cabeçalho da proposta', () => {
  it('diz a data e só as contagens maiores que zero', async () => {
    await showProposal();
    const date = formatFullDate(REVISED_AT, 'pt-BR');
    expect(
      screen.getByText(`Revisada pelo agente em ${date}: 1 trocada(s), 1 nova(s)`),
    ).toBeTruthy();
    expect(screen.queryByText(/retirada/)).toBeNull();
  });

  it('proposta sem revisão não mostra a linha', async () => {
    await showProposal(richScenario().proposal);
    expect(screen.queryByText(/^Revisada pelo agente/)).toBeNull();
  });
});

describe('revisionParts', () => {
  it('omite as partes zeradas e diz "nenhuma mudança" quando todas são zero', () => {
    expect(revisionParts({ changed: 0, added: 0, dropped: 2 })).toBe('2 retirada(s)');
    expect(revisionParts({ changed: 3, added: 0, dropped: 1 })).toBe(
      '3 trocada(s), 1 retirada(s)',
    );
    expect(revisionParts({ changed: 0, added: 0, dropped: 0 })).toBe('nenhuma mudança');
  });
});
