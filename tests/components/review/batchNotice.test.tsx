import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { locale } from '../../../src/store/settings';
import { ReviewHeader } from '../../../src/ui/review/ReviewHeader';
import { richScenario } from '../../store/proposalHarness';
import { openReviewHarness, renderInEditor } from './reviewHarness';

// Etapa #950, item 6 (#963): "Aceitar as N que faltam" e "Rejeitar as N que causam" são uma
// decisão só (uma gravação, um Desfazer), não N decisões.

beforeEach(() => {
  locale.value = 'pt-BR';
  localStorage.clear();
});
afterEach(cleanup);

/**
 * Um aviso de dependência com várias mudanças: a validação é substituída por um aviso
 * montado (o cenário natural exige uma proposta adulterada).
 */
async function openWithIssue() {
  const { base, proposal, ids } = richScenario();
  const h = await openReviewHarness({ project: base, proposals: [proposal] });
  expect(h.review.open('P1').ok).toBe(true);
  const real = h.review.derived.validation.value;
  if (!real) throw new Error('sem validação');
  vi.spyOn(h.review.derived.validation, 'value', 'get').mockReturnValue({
    ...real,
    ok: false,
    issues: [
      {
        code: 'missing-specialization',
        id: 'M1',
        changeIds: [ids.name, ids.rect],
        related: [ids.marking, ids.annotation],
      },
    ],
  });
  act(() => h.review.select({ level: 'proposal', id: null }));
  renderInEditor(h, <ReviewHeader target={{ level: 'proposal', id: null }} />);
  return { h, ids };
}

const stateOf = (h: Awaited<ReturnType<typeof openWithIssue>>['h'], id: string) =>
  h.review.derived.proposal.value?.decisions[id]?.state ?? null;

describe('aviso de dependência: decisão em lote', () => {
  it('"Aceitar as N que faltam" decide numa chamada só e o Desfazer devolve todas ao pendente', async () => {
    const { h, ids } = await openWithIssue();
    const decideMany = vi.spyOn(h.review, 'decideMany');
    const decide = vi.spyOn(h.review, 'decide');
    fireEvent.click(
      await screen.findByRole('button', { name: /^Aceitar a\(s\) que falta/ }),
    );
    await waitFor(() => expect(stateOf(h, ids.annotation)).toBe('accepted'));
    expect(stateOf(h, ids.marking)).toBe('accepted');
    expect(decideMany).toHaveBeenCalledTimes(1);
    expect(decide).not.toHaveBeenCalled();
    await act(async () => {
      await h.review.undoLastDecision();
    });
    expect(stateOf(h, ids.marking)).toBeNull();
    expect(stateOf(h, ids.annotation)).toBeNull();
  });

  it('"Rejeitar as N que causam" decide numa chamada só e o Desfazer devolve todas', async () => {
    const { h, ids } = await openWithIssue();
    const decideMany = vi.spyOn(h.review, 'decideMany');
    fireEvent.click(
      await screen.findByRole('button', { name: /^Rejeitar a\(s\) que causa/ }),
    );
    await waitFor(() => expect(stateOf(h, ids.name)).toBe('rejected'));
    expect(stateOf(h, ids.rect)).toBe('rejected');
    expect(decideMany).toHaveBeenCalledTimes(1);
    await act(async () => {
      await h.review.undoLastDecision();
    });
    expect(stateOf(h, ids.name)).toBeNull();
    expect(stateOf(h, ids.rect)).toBeNull();
  });
});
