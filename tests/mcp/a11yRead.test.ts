import { rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  A11Y_SCREEN,
  a11yCall,
  a11yWorkspace,
  type A11yWorkspace,
} from './a11yWorkspace';

// Stage #1128 (A3, decision 9 of #1081): the accessibility audit reaches the MCP reads. `accessible-label-missing` (a
// pending item) comes in `issues` with the `part`, through the same path as the drawing's items; `touch-target-small`
// (a warning, not a pending item) comes in `audit`, with the annotation's reference; `list_markings` counts the
// pending item in `incomplete` and does not count the warning.

let ws: A11yWorkspace;

const call = (name: string, args: Record<string, unknown>) => a11yCall(ws, name, args);

interface Row {
  ref: string;
  name: string | null;
  incomplete?: number;
  warnings?: number;
}

async function rows(args: Record<string, unknown> = {}): Promise<Row[]> {
  const list = await call('list_markings', {
    project: 'a11y',
    container: A11Y_SCREEN,
    ...args,
  });
  return list.markings as Row[];
}

async function refOf(name: string): Promise<string> {
  const found = (await rows()).find((r) => r.name === name);
  if (found === undefined) throw new Error(`no marking ${name}`);
  return found.ref;
}

/** The annotations of `get_marking` (one layer in these projects). */
async function annotationsOf(name: string): Promise<Record<string, unknown>[]> {
  const marking = await call('get_marking', { ref: await refOf(name) });
  return (marking.layers as { annotations: Record<string, unknown>[] }[]).flatMap(
    (l) => l.annotations,
  );
}

beforeAll(async () => {
  ws = await a11yWorkspace((add) => {
    // 108 x 120 px at 3x = 36 x 40 units, below the 44 x 44 of the root.
    add('small', 'button', {
      name: 'small',
      rect: { x: 100, y: 100, width: 108, height: 120 },
    });
    // 132 x 132 px at 3x = 44 x 44 units: exactly the minimum.
    add('fits', 'button', {
      name: 'fits',
      rect: { x: 100, y: 400, width: 132, height: 132 },
    });
    // 360 x 120 px at 3x = 120 x 40 units: small on one axis only, and the component fits (no other pending item).
    add('wide', 'button', {
      name: 'wide',
      rect: { x: 100, y: 600, width: 360, height: 120 },
    });
    // The bar's two action icons come from the preview and have no description.
    add('bare', 'bar', {
      name: 'bare',
      rect: { x: 100, y: 800, width: 800, height: 168 },
    });
    // The same bar, both companions filled in.
    add('named', 'bar', {
      name: 'named',
      rect: { x: 100, y: 1100, width: 800, height: 168 },
      values: { actionIcon1Description: 'Search', actionIcon2Description: 'More' },
    });
  });
});

afterAll(async () => {
  await ws.client.close();
  rmSync(ws.base, { recursive: true, force: true });
});

describe('get_marking: accessibility in issues and audit', () => {
  it('a bar whose action icons have no description lists accessible-label-missing with the part', async () => {
    const [annotation] = await annotationsOf('bare');
    expect(annotation!.issues).toEqual([
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
    // A pending item is not an audit warning.
    expect(annotation!.audit).toBeUndefined();
  });

  it('a bar with the companion fields filled in has no issues', async () => {
    const [annotation] = await annotationsOf('named');
    expect(annotation!.issues).toBeUndefined();
  });

  it('a button of 108 x 120 px at 3x has audit with the size in units, the minimum in units and px, and the density', async () => {
    const [annotation] = await annotationsOf('small');
    const codes = ((annotation!.issues ?? []) as { code: string }[]).map((i) => i.code);
    expect(codes).not.toContain('accessible-label-missing');
    expect(annotation!.audit).toEqual([
      {
        code: 'touch-target-small',
        annotation: annotation!.ref,
        actual: { width: 36, height: 40 },
        min: { width: 44, height: 44 },
        minPx: { width: 132, height: 132 },
        density: 3,
      },
    ]);
  });

  it('the same button at 132 x 132 px has no audit', async () => {
    const [annotation] = await annotationsOf('fits');
    expect(annotation!.audit).toBeUndefined();
  });

  it('get_annotation carries the same issues and audit', async () => {
    const [bare] = await annotationsOf('bare');
    const [small] = await annotationsOf('small');
    expect((await call('get_annotation', { ref: bare!.ref })).issues).toHaveLength(2);
    expect((await call('get_annotation', { ref: small!.ref })).audit).toHaveLength(1);
  });
});

describe('list_markings: accessibility', () => {
  it('incomplete counts the unlabeled bar, not the small button', async () => {
    const incomplete = (await rows({ incomplete: true })).map((r) => r.name);
    expect(incomplete).toContain('bare');
    // The warning is not a pending item: `wide` (small, but nothing else is pending) is not incomplete.
    expect(incomplete).not.toContain('wide');
    expect(incomplete).not.toContain('named');
    const all = await rows();
    expect(all.find((r) => r.name === 'bare')!.incomplete).toBe(1);
    expect(all.find((r) => r.name === 'wide')!.incomplete).toBeUndefined();
  });

  it('the row of the small button carries the count of warnings, never the audit array; the others do not', async () => {
    const all = await rows();
    const small = all.find((r) => r.name === 'small')!;
    expect(small.warnings).toBe(1);
    expect(all.some((r) => 'audit' in r)).toBe(false);
    expect(all.filter((r) => r.warnings !== undefined).map((r) => r.name)).toEqual([
      'small',
      'wide',
    ]);
  });

  it('get_project lists the unlabeled bar among the pending annotations', async () => {
    const project = await call('get_project', { project: 'a11y' });
    const byCode = project.issues.byCode as Record<string, number>;
    expect(byCode['accessible-label-missing']).toBe(2);
    expect(
      project.issues.annotations.map((a: { annotation: string }) => a.annotation),
    ).toContain((await annotationsOf('bare'))[0]!.ref);
  });
});

describe('the type resolved: get_component and get_annotation', () => {
  it('get_component carries accessibility with the defaults filled in', async () => {
    const button = await call('get_component', {
      project: 'a11y',
      specId: 'accessibility',
      type: 'button',
    });
    expect(button.accessibility).toEqual({
      role: 'button',
      label: { fields: ['label'], required: true },
      touchTarget: { width: 44, height: 44, mode: 'visual' },
    });
    const bar = await call('get_component', {
      project: 'a11y',
      specId: 'accessibility',
      type: 'bar',
    });
    expect(bar.accessibility.parts[0]).toEqual({
      id: 'action1',
      name: 'First action',
      when: 'actionIcon1',
      role: 'button',
      label: { fields: ['actionIcon1Description'], required: true },
    });
    expect(bar.accessibility.role).toBeUndefined();
    expect(bar.accessibility.touchTarget).toBeUndefined();
  });

  it('the annotation view carries the same accessibility in its type', async () => {
    const [annotation] = await annotationsOf('small');
    expect((annotation!.type as { accessibility: unknown }).accessibility).toMatchObject({
      role: 'button',
      touchTarget: { width: 44, height: 44, mode: 'visual' },
    });
  });
});
