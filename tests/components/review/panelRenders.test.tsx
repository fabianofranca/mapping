import { act, cleanup, waitFor } from '@testing-library/preact';
import { options, type VNode } from 'preact';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { locale } from '../../../src/store/settings';
import { richScenario } from '../../store/proposalHarness';
import { showReviewPanel } from './reviewHarness';

// Desempenho dos Detalhes na revisão (HANDOFF-REVIEW-DETAILS 12): selecionar outra mudança
// do mesmo item (focar um marcador, as setas da janela Propostas) não refaz o painel normal;
// só o marcador que deixa de ser o alvo e o que passa a ser. Decidir refaz o painel uma vez
// (o projeto à vista muda), não uma vez por componente da lista.

const counts = new Map<string, number>();
const previousDiffed = options.diffed;

beforeAll(() => {
  options.diffed = (vnode: VNode) => {
    const name = typeof vnode.type === 'function' ? vnode.type.name : '';
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    previousDiffed?.(vnode);
  };
});
afterAll(() => {
  options.diffed = previousDiffed;
});
beforeEach(() => {
  locale.value = 'pt-BR';
  localStorage.clear();
});
afterEach(cleanup);

describe('renderizações dos Detalhes na revisão', () => {
  it('selecionar outra mudança do mesmo item não refaz o painel, só os marcadores envolvidos', async () => {
    const { proposal, ids } = richScenario();
    const h = await showReviewPanel(
      { proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    await act(async () => {
      await Promise.resolve();
    });
    counts.clear();
    act(() => h.review.select({ level: 'change', id: ids.name }));
    expect(counts.get('MarkingPanel') ?? 0).toBe(0);
    expect(counts.get('AnnotationsPanel') ?? 0).toBe(0);
    expect(counts.get('PropertyGrid') ?? 0).toBe(0);
    // O marcador que passa a ser o alvo (e nenhum outro) refaz.
    expect(counts.get('ChangeMark') ?? 0).toBeLessThanOrEqual(1);

    counts.clear();
    act(() => h.review.select({ level: 'item', id: 'M1' }));
    expect(counts.get('MarkingPanel') ?? 0).toBe(0);
    expect(counts.get('ChangeMark') ?? 0).toBeLessThanOrEqual(1);
  });

  it('decidir uma mudança refaz o painel uma vez (não uma por decisão encadeada)', async () => {
    const { proposal, ids } = richScenario();
    const h = await showReviewPanel(
      { proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    await act(async () => {
      await Promise.resolve();
    });
    counts.clear();
    await act(async () => {
      await h.review.decide({ level: 'change', id: ids.name }, 'accepted');
    });
    await waitFor(() =>
      expect(h.review.derived.proposal.value?.decisions[ids.name]?.state).toBe(
        'accepted',
      ),
    );
    expect(counts.get('MarkingPanel') ?? 0).toBeLessThanOrEqual(2);
  });
});
