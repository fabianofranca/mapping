// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as model from '../../src/model';
import { openHarness, richScenario } from './proposalHarness';

// `freshIds` (sempre inscrito pela faixa, pela barra de status e pela ToolStrip) não pode
// pagar o cálculo de conflitos das propostas: ele só sai quando a lista de propostas pede.
vi.mock('../../src/model', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/model')>();
  return { ...actual, changeStatus: vi.fn(actual.changeStatus) };
});

afterEach(() => vi.clearAllMocks());

describe('freshIds sem calcular conflitos', () => {
  it('uma edição com a janela Propostas fechada não chama changeStatus', async () => {
    const { proposal } = richScenario();
    const { session, review } = await openHarness({ proposals: [proposal] });
    const seen: string[][] = [];
    const { effect } = await import('@preact/signals');
    const stop = effect(() => {
      seen.push([...review.derived.freshIds.value]);
    });
    try {
      vi.mocked(model.changeStatus).mockClear();
      session.actions.renameProject('Outro nome');
      expect(seen.at(-1)).toEqual(['P1']);
      expect(model.changeStatus).not.toHaveBeenCalled();
    } finally {
      stop();
    }
  });
});
