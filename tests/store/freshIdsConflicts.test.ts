// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as model from '../../src/model';
import { openHarness, richScenario } from './proposalHarness';

// `freshIds` (always subscribed by the strip, the status bar and the ToolStrip) must not
// pay for the proposals conflict computation: it only comes out when the proposals list asks.
vi.mock('../../src/model', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/model')>();
  return { ...actual, changeStatus: vi.fn(actual.changeStatus) };
});

afterEach(() => vi.clearAllMocks());

describe('freshIds without computing conflicts', () => {
  it('an edit with the Proposals window closed does not call changeStatus', async () => {
    const { proposal } = richScenario();
    const { session, review } = await openHarness({ proposals: [proposal] });
    const seen: string[][] = [];
    const { effect } = await import('@preact/signals');
    const stop = effect(() => {
      seen.push([...review.derived.freshIds.value]);
    });
    try {
      vi.mocked(model.changeStatus).mockClear();
      session.actions.renameProject('Another name');
      expect(seen.at(-1)).toEqual(['P1']);
      expect(model.changeStatus).not.toHaveBeenCalled();
    } finally {
      stop();
    }
  });
});
