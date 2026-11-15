import { rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  A11Y_SCREEN,
  a11yCall,
  a11yWorkspace,
  type A11yWorkspace,
} from './a11yWorkspace';

// Phase A5 (fix round of #1081): D1 (a warning that already existed is not new), D3 (a compact row stays
// small) and D8 (one audit per project per batch).

interface Row {
  ref: string;
  name: string | null;
  incomplete?: number;
  warnings?: number;
  audit?: unknown[];
}

const computed = { calls: 0 };

vi.mock('../../src/model/accessibility', async (importOriginal) => {
  const model = await importOriginal<typeof import('../../src/model/accessibility')>();
  return {
    ...model,
    accessibilityAudit: (...args: Parameters<typeof model.accessibilityAudit>) => {
      computed.calls += 1;
      return model.accessibilityAudit(...args);
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
    add('long', 'button', {
      name: 'long',
      rect: { x: 500, y: 100, width: 108, height: 120 },
      values: { label: 'Button' },
    });
    add('pay', 'button', {
      name: 'pay',
      rect: { x: 700, y: 100, width: 108, height: 120 },
      values: { label: 'Pay' },
    });
    add('bare', 'bar', {
      name: 'bare',
      rect: { x: 100, y: 800, width: 800, height: 168 },
    });
  });
});

afterAll(async () => {
  await ws.client.close();
  rmSync(ws.base, { recursive: true, force: true });
});

const plan = (operations: unknown[]) =>
  a11yCall(ws, 'plan_changes', { project: 'a11y', operations });

describe('D1: a warning that already existed is not new', () => {
  it('moving the small button (still small) does not warn again', async () => {
    const reply = await plan([
      {
        op: 'update_marking',
        marking: 'mapping://a11y/m/mksmall',
        rect: { x: 300, y: 100, width: 108, height: 120 },
      },
    ]);
    expect(reply.warnings ?? []).toEqual([]);
  });

  it('shrinking a button that was already small, to another small size, does not warn again', async () => {
    const reply = await plan([
      {
        op: 'update_marking',
        marking: 'mapping://a11y/m/mksmall',
        rect: { x: 100, y: 100, width: 90, height: 100 },
      },
    ]);
    expect(
      (reply.warnings ?? []).filter(
        (w: { code: string }) => w.code === 'touch-target-small',
      ),
    ).toEqual([]);
  });
});

describe('D3: the compact row of list_markings', () => {
  it('carries a count of warnings, not the full audit array, and get_marking keeps the full audit', async () => {
    const list = await a11yCall(ws, 'list_markings', {
      project: 'a11y',
      container: A11Y_SCREEN,
    });
    const row = (list.markings as Row[]).find((m) => m.name === 'small')!;
    expect('audit' in row).toBe(false);
    expect(row.warnings).toBe(1);
    const marking = await a11yCall(ws, 'get_marking', { ref: row.ref });
    const annotations = (marking.layers as { annotations: Row[] }[]).flatMap(
      (l) => l.annotations,
    );
    expect(annotations.some((a) => Array.isArray(a.audit) && a.audit.length === 1)).toBe(
      true,
    );
  });
});

describe('D8: the audit runs once per project in a batch', () => {
  it('a plan that changes a marking audits the project after and before once each', async () => {
    computed.calls = 0;
    await plan([
      {
        op: 'update_marking',
        marking: 'mapping://a11y/m/mksmall',
        rect: { x: 100, y: 100, width: 132, height: 132 },
      },
    ]);
    // Before and after, one audit each (two calls); the reload in the same call does not add a third.
    expect(computed.calls).toBeLessThanOrEqual(2);
  });
});

describe('F4: the label of the 108 x 120 button in the test scripts', () => {
  it('`Button` overflows at 108 x 120 px (3x); `Pay` does not, and both are small', async () => {
    const list = await a11yCall(ws, 'list_markings', {
      project: 'a11y',
      container: A11Y_SCREEN,
    });
    const rows = list.markings as Row[];
    const row = (name: string) => rows.find((m) => m.name === name)!;
    expect(row('long').incomplete).toBe(1);
    expect(row('pay').incomplete).toBeUndefined();
    expect(row('pay').warnings).toBe(1);
  });
});
