import { rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { a11yCall, a11yWorkspace, type A11yWorkspace } from './a11yWorkspace';

// Phase A6 (R6): a plan or proposal computes the drawings of the project before and after the batch once each,
// and the audit, the touch warnings and the drawing items share the result.

const drawn = { calls: 0 };

vi.mock('../../src/model', async (importOriginal) => {
  const model = await importOriginal<typeof import('../../src/model')>();
  return {
    ...model,
    createDrawingCache: (...args: Parameters<typeof model.createDrawingCache>) => {
      const cache = model.createDrawingCache(...args);
      const counted: typeof cache = (...rest) => {
        drawn.calls += 1;
        return cache(...rest);
      };
      return counted;
    },
  };
});

let ws: A11yWorkspace;

beforeAll(async () => {
  ws = await a11yWorkspace((add) => {
    add('small', 'button', {
      name: 'small',
      rect: { x: 100, y: 100, width: 108, height: 120 },
    });
  });
});

afterAll(async () => {
  await ws.client.close();
  rmSync(ws.base, { recursive: true, force: true });
});

describe('the drawings of a batch', () => {
  it('one plan_changes draws the project before and after the batch once each', async () => {
    drawn.calls = 0;
    const reply = await a11yCall(ws, 'plan_changes', {
      project: 'a11y',
      operations: [
        {
          op: 'update_marking',
          marking: 'mapping://a11y/m/mksmall',
          rect: { x: 100, y: 100, width: 60, height: 60 },
        },
      ],
    });
    expect(reply.errors).toBeUndefined();
    expect(drawn.calls).toBe(2);
  });
});
