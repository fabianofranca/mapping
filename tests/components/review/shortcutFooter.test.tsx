import { cleanup, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { locale } from '../../../src/store/settings';
import { ReviewLevels } from '../../../src/ui/review/ReviewLevels';
import { NEW_IMAGE_PATH, richScenario } from '../../store/proposalHarness';
import { openReviewHarness, renderInEditor } from './reviewHarness';

// Rodapé de atalhos da revisão: em janela estreita (até BREAKPOINTS.compact) mostra só
// Aceitar, Rejeitar e Próxima pendente; acima disso, os seis.

/** `matchMedia` que casa as consultas de `max-width` só quando `narrow` é verdadeiro. */
function stubMatchMedia(narrow: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: /max-width/.test(query) ? narrow : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

beforeEach(() => {
  locale.value = 'pt-BR';
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function renderLevels() {
  const { proposal } = richScenario();
  const h = await openReviewHarness({
    proposals: [proposal],
    files: { [NEW_IMAGE_PATH]: 'imagem' },
  });
  expect(h.review.open('P1').ok).toBe(true);
  renderInEditor(h, <ReviewLevels />);
  return screen.getByLabelText('Atalhos da revisão');
}

describe('rodapé de atalhos da revisão', () => {
  it('em janela estreita mostra só os três atalhos principais', async () => {
    stubMatchMedia(true);
    const footer = await renderLevels();
    expect(footer.querySelectorAll('span')).toHaveLength(3);
    expect(footer.className).toContain('review-footer-compact');
  });

  it('em janela larga mostra os seis atalhos', async () => {
    stubMatchMedia(false);
    const footer = await renderLevels();
    expect(footer.querySelectorAll('span')).toHaveLength(6);
    expect(footer.className).not.toContain('review-footer-compact');
  });
});
