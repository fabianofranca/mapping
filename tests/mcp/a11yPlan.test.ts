import { rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  A11Y_SCREEN,
  a11yCall,
  a11yWorkspace,
  type A11yWorkspace,
} from './a11yWorkspace';

// Stage #1128 (A3, decision 9 of #1081): `plan_changes` reports the accessibility audit of what the batch created or
// changed. `accessible-label-missing` (a pending item) goes in `issues.new`, like the drawing's items; `touch-target-small`
// (a warning) goes in `warnings`, next to `library-warning`, `deprecated-op` and `role-cleared`. Neither lists what
// the batch did not touch.

interface Item {
  code: string;
  key?: string;
  part?: { id: string; name: string };
  [key: string]: unknown;
}
interface Entry {
  annotation: string;
  issues: Item[];
}
interface Warning {
  code: string;
  [key: string]: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}
interface Plan {
  errors?: unknown;
  issues: { before: number; after: number; resolved: number; new: Entry[] };
  warnings?: Warning[];
}

let ws: A11yWorkspace;

async function plan(operations: unknown[]): Promise<Plan> {
  return (await a11yCall(ws, 'plan_changes', {
    project: 'a11y',
    operations,
  })) as unknown as Plan;
}

async function refOf(name: string): Promise<string> {
  const list = await a11yCall(ws, 'list_markings', {
    project: 'a11y',
    container: A11Y_SCREEN,
  });
  const found = (list.markings as { ref: string; name: string | null }[]).find(
    (m) => m.name === name,
  );
  if (found === undefined) throw new Error(`no marking ${name}`);
  return found.ref;
}

const labelItems = (reply: Plan): Item[] =>
  reply.issues.new
    .flatMap((e) => e.issues)
    .filter((i) => i.code === 'accessible-label-missing');
const touchWarnings = (reply: Plan): Warning[] =>
  (reply.warnings ?? []).filter((w) => w.code === 'touch-target-small');

const createButton = (rect: Record<string, number>, values?: Record<string, string>) => ({
  op: 'create_marking',
  container: A11Y_SCREEN,
  rect,
  annotation: { type: 'accessibility/button', ...(values ? { values } : {}) },
});

beforeAll(async () => {
  ws = await a11yWorkspace((add) => {
    // A button that is small and a bar with two unlabeled icons, both untouched by most of the batches below.
    add('small', 'button', {
      name: 'small',
      rect: { x: 100, y: 100, width: 108, height: 120 },
    });
    add('fits', 'button', {
      name: 'fits',
      rect: { x: 100, y: 400, width: 132, height: 132 },
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

describe('plan_changes: touch-target-small in warnings', () => {
  it('a new button of 108 x 120 px at 3x warns with the size, the minimum, the density and a message', async () => {
    const reply = await plan([createButton({ x: 500, y: 100, width: 108, height: 120 })]);
    expect(reply.errors).toBeUndefined();
    const warnings = touchWarnings(reply);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      code: 'touch-target-small',
      actual: { width: 36, height: 40 },
      min: { width: 44, height: 44 },
      minPx: { width: 132, height: 132 },
      density: 3,
      message: '36 × 40; minimum 44 × 44 units (132 × 132 px at 3x)',
    });
    expect(warnings[0]!.annotation).toMatch(/\/a\//);
    expect(warnings[0]!.marking).toMatch(/\/m\//);
  });

  it('at 132 x 132 px there is no warning', async () => {
    const reply = await plan([createButton({ x: 500, y: 100, width: 132, height: 132 })]);
    expect(touchWarnings(reply)).toEqual([]);
  });

  it('only what the batch touched: the small button already in the project does not show', async () => {
    const reply = await plan([createButton({ x: 500, y: 500, width: 132, height: 132 })]);
    expect(touchWarnings(reply)).toEqual([]);
  });

  it('shrinking a marking below the minimum warns; growing a small one to it clears the warning', async () => {
    const shrunk = await plan([
      {
        op: 'update_marking',
        marking: await refOf('fits'),
        rect: { x: 100, y: 400, width: 108, height: 120 },
      },
    ]);
    expect(touchWarnings(shrunk)).toHaveLength(1);
    const grown = await plan([
      {
        op: 'update_marking',
        marking: await refOf('small'),
        rect: { x: 100, y: 100, width: 132, height: 132 },
      },
    ]);
    expect(touchWarnings(grown)).toEqual([]);
  });

  it('a batch that makes an existing warning worse warns again, in warnings and not in issues.new', async () => {
    const reply = await plan([
      {
        op: 'update_marking',
        marking: await refOf('small'),
        rect: { x: 100, y: 100, width: 60, height: 60 },
      },
    ]);
    const warnings = touchWarnings(reply);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ actual: { width: 20, height: 20 } });
    expect(
      reply.issues.new
        .flatMap((e) => e.issues)
        .some((i) => i.code === 'touch-target-small'),
    ).toBe(false);
  });

  it('it is not a pending item: no accessible-label-missing and nothing in issues.new for the small button', async () => {
    const reply = await plan([createButton({ x: 500, y: 100, width: 108, height: 120 })]);
    expect(labelItems(reply)).toEqual([]);
    expect(
      reply.issues.new
        .flatMap((e) => e.issues)
        .some((i) => i.code === 'touch-target-small'),
    ).toBe(false);
  });
});

describe('plan_changes: accessible-label-missing in issues.new', () => {
  const createBar = (values?: Record<string, string>) => ({
    op: 'create_marking',
    container: A11Y_SCREEN,
    rect: { x: 100, y: 1200, width: 800, height: 168 },
    annotation: { type: 'accessibility/bar', ...(values ? { values } : {}) },
  });

  it('a bar created with action icons and no description lists one item per part', async () => {
    const reply = await plan([createBar({ actionIcon1: 'Search', actionIcon2: 'More' })]);
    expect(reply.errors).toBeUndefined();
    expect(labelItems(reply)).toEqual([
      {
        code: 'accessible-label-missing',
        key: 'actionIcon1Description',
        part: { id: 'action1', name: 'First action' },
      },
      {
        code: 'accessible-label-missing',
        key: 'actionIcon2Description',
        part: { id: 'action2', name: 'Second action' },
      },
    ]);
    expect(reply.issues.after).toBeGreaterThan(reply.issues.before);
  });

  it('the same bar with the companions filled in has nothing', async () => {
    const reply = await plan([
      createBar({ actionIcon1Description: 'Search', actionIcon2Description: 'More' }),
    ]);
    expect(labelItems(reply)).toEqual([]);
  });

  it('a button created with an empty label lists the type-level item, with no part', async () => {
    const reply = await plan([
      createButton({ x: 500, y: 100, width: 132, height: 132 }, { label: '' }),
    ]);
    expect(labelItems(reply)).toEqual([
      { code: 'accessible-label-missing', key: 'label' },
    ]);
  });

  it('only what the batch touched: the unlabeled bar already there does not show in issues.new', async () => {
    const reply = await plan([createButton({ x: 500, y: 100, width: 132, height: 132 })]);
    expect(labelItems(reply)).toEqual([]);
  });

  it('filling the companion of the existing bar resolves it', async () => {
    const reply = await plan([
      {
        op: 'update_annotation',
        annotation: 'mapping://a11y/a/anbare',
        values: { actionIcon1Description: 'Search', actionIcon2Description: 'More' },
      },
    ]);
    expect(reply.errors).toBeUndefined();
    expect(reply.issues.resolved).toBe(1);
    expect(labelItems(reply)).toEqual([]);
  });

  it('filling only one companion leaves the other part pending (it is not new: it was there before)', async () => {
    const reply = await plan([
      {
        op: 'update_annotation',
        annotation: 'mapping://a11y/a/anbare',
        values: { actionIcon1Description: 'Search' },
      },
    ]);
    expect(reply.issues.resolved).toBe(0);
    expect(labelItems(reply)).toEqual([]);
  });

  it('a child in the bar slot: the field parts stop being audited and the child answers by its own type', async () => {
    const reply = await plan([
      {
        op: 'create_marking',
        inside: await refOf('bare'),
        annotation: { type: 'accessibility/icon-button' },
      },
    ]);
    expect(reply.errors).toBeUndefined();
    // The bar's pending parts are gone (the slot is full: the fields draw nothing)...
    expect(reply.issues.resolved).toBeGreaterThanOrEqual(1);
    // ...and the new icon button has no `contentDescription`: a type-level item, never a part.
    expect(labelItems(reply)).toEqual([
      { code: 'accessible-label-missing', key: 'contentDescription' },
    ]);
  });
});

// Stage #1998 (TA2, decision 8): `touch-target-overlap` in the plan's `warnings`, for the markings the batch created or
// changed. `IconA` and `IconB` are 40 x 40 and 4 apart (the root minimum 48 is `expanded`, density 1); `IconC` is alone.
describe('plan_changes: touch-target-overlap in warnings', () => {
  let ows: A11yWorkspace;
  const planOf = async (operations: unknown[]): Promise<Plan> =>
    (await a11yCall(ows, 'plan_changes', {
      project: 'a11y',
      operations,
    })) as unknown as Plan;
  const refIn = async (name: string): Promise<string> => {
    const list = await a11yCall(ows, 'list_markings', {
      project: 'a11y',
      container: A11Y_SCREEN,
    });
    return (list.markings as { ref: string; name: string }[]).find(
      (m) => m.name === name,
    )!.ref;
  };
  const overlaps = (reply: Plan): Warning[] =>
    (reply.warnings ?? []).filter((w) => w.code === 'touch-target-overlap');
  const icon = (x: number, y = 100) => ({
    op: 'create_marking',
    container: A11Y_SCREEN,
    rect: { x, y, width: 40, height: 40 },
    annotation: { type: 'accessibility/button', values: { label: 'N' } },
  });

  beforeAll(async () => {
    ows = await a11yWorkspace(
      (_add, plain) => {
        plain(
          'IconA',
          'button',
          { x: 100, y: 100, width: 40, height: 40 },
          { label: 'A' },
        );
        plain(
          'IconB',
          'button',
          { x: 144, y: 100, width: 40, height: 40 },
          { label: 'B' },
        );
        plain(
          'IconC',
          'button',
          { x: 600, y: 600, width: 40, height: 40 },
          { label: 'C' },
        );
      },
      {
        density: 1,
        tweak: (spec: Record<string, any>) => {
          // eslint-disable-line @typescript-eslint/no-explicit-any
          spec.accessibility.touchTarget = { width: 48, height: 48, mode: 'expanded' };
        },
      },
    );
  });

  afterAll(async () => {
    await ows.client.close();
    rmSync(ows.base, { recursive: true, force: true });
  });

  it('a new marking 4 apart gives one entry for the new marking only, naming the neighbor', async () => {
    const reply = await planOf([icon(644, 600)]);
    expect(reply.errors).toBeUndefined();
    const warnings = overlaps(reply);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      code: 'touch-target-overlap',
      overlap: { width: 4, height: 48 },
      overlapPx: { width: 4, height: 48 },
      density: 1,
      message: 'overlaps the touch area of IconC by 4 × 48 units (4 × 48 px at 1x)',
    });
    expect(warnings[0]!.other.marking).toBe(await refIn('IconC'));
    expect(warnings[0]!.marking).not.toBe(await refIn('IconC'));
  });

  it('a pair the batch does not change is not repeated, even when a marking of it is touched', async () => {
    const renamed = await planOf([
      { op: 'update_marking', marking: await refIn('IconB'), name: 'IconB2' },
    ]);
    expect(overlaps(renamed)).toEqual([]);
    expect(overlaps(await planOf([icon(300, 300)]))).toEqual([]);
  });

  it('a batch that grows the overlap lists it for the marking it changed only', async () => {
    const reply = await planOf([
      {
        op: 'update_marking',
        marking: await refIn('IconB'),
        rect: { x: 142, y: 100, width: 40, height: 40 },
      },
    ]);
    const warnings = overlaps(reply);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ overlap: { width: 6, height: 48 } });
    expect(warnings[0]!.marking).toBe(await refIn('IconB'));
    expect(warnings[0]!.other.marking).toBe(await refIn('IconA'));
  });

  it('a batch that moves the neighbor away lists nothing', async () => {
    const reply = await planOf([
      {
        op: 'update_marking',
        marking: await refIn('IconB'),
        rect: { x: 300, y: 100, width: 40, height: 40 },
      },
    ]);
    expect(overlaps(reply)).toEqual([]);
  });
});
