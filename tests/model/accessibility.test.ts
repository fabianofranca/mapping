// Accessibility audit (stage #1126, A1; decisions 5 and 7 of #1081): `accessible-label-missing`
// (a pending item, not produced by `projectIssues`) and the `touch-target-small` warning, from the
// `accessibility` of the specialization (`formatVersion` 18).
import { describe, expect, it } from 'vitest';
import {
  accessibilityAudit,
  addAnnotation,
  addContainer,
  addTableRow,
  addTypedAnnotation,
  annotationAccessibility,
  applySpecialization,
  createArrow,
  createMarking,
  createPage,
  densityText,
  moveContainer,
  parseSpec,
  projectIssues,
  setContainerDensity,
  setFieldValue,
  setTableCell,
  sweepTouchBoxes,
  type ComponentDrawings,
  type Project,
  type Rect,
  type Spec,
  type TouchBox,
  type TouchTargetSmallFinding,
  typeAccessibility,
} from '../../src/model';
import { emptyProject } from './fixtures';
import { idGen, layerOf } from './specFixtures';
import { a11yMcpProject } from '../mcp/a11yProject';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const ROOT_TOUCH = { width: 44, height: 44, mode: 'visual' };

function rawSpec(edit?: (s: Json) => void): Json {
  const text = (key: string) => ({ key, type: 'string' });
  const s: Json = {
    format: 'mapping-spec',
    formatVersion: 18,
    id: 'a11y',
    name: 'A11y',
    version: 1,
    accessibility: { touchTarget: ROOT_TOUCH },
    layers: [
      {
        id: 'ui',
        name: 'UI',
        color: '#112233',
        annotationTypes: [
          {
            id: 'button',
            name: 'Button',
            appliesTo: ['marking', 'arrow'],
            fields: [text('label'), text('alt')],
            accessibility: { role: 'button', label: { fields: ['label', 'alt'] } },
          },
          {
            id: 'slider',
            name: 'Slider',
            fields: [text('label')],
            accessibility: { role: 'slider' },
          },
          {
            id: 'wide',
            name: 'Wide',
            fields: [text('label')],
            accessibility: {
              role: 'button',
              touchTarget: { width: 48, height: 48, mode: 'expanded' },
            },
          },
          {
            id: 'own',
            name: 'Own',
            fields: [text('label')],
            accessibility: {
              role: 'button',
              touchTarget: { width: 48, height: 48 },
            },
          },
          {
            id: 'off',
            name: 'Off',
            fields: [text('label')],
            accessibility: { role: 'button', touchTarget: false },
          },
          {
            id: 'optional',
            name: 'Optional',
            fields: [text('label')],
            accessibility: {
              role: 'button',
              label: { fields: ['label'], required: false },
            },
          },
          {
            id: 'image',
            name: 'Image',
            fields: [text('label')],
            accessibility: { role: 'image', label: { fields: ['label'] } },
          },
          {
            id: 'bar',
            name: 'Bar',
            fields: [
              text('title'),
              text('badge'),
              {
                key: 'items',
                type: 'table',
                columns: [text('name'), text('hint'), { key: 'qty', type: 'number' }],
              },
            ],
            accessibility: {
              parts: [
                {
                  id: 'close',
                  name: 'Close',
                  when: 'badge',
                  label: { fields: ['title'] },
                },
                { id: 'noName', when: 'title', label: { fields: ['badge'] } },
                {
                  id: 'row',
                  name: 'Row',
                  when: 'items',
                  label: { fields: ['items.name', 'items.hint'] },
                },
                {
                  id: 'cell',
                  name: 'Cell',
                  when: 'items.hint',
                  label: { fields: ['items.name'] },
                },
                {
                  id: 'plain',
                  when: 'title',
                  label: { fields: ['badge'], required: false },
                },
              ],
            },
          },
          {
            id: 'none',
            name: 'None',
            fields: [text('title'), text('note')],
            accessibility: {
              role: 'none',
              label: { fields: ['title'], required: true },
              parts: [{ id: 'p', when: 'note', label: { fields: ['title'] } }],
            },
          },
        ],
      },
    ],
  };
  edit?.(s);
  return s;
}

function specOf(edit?: (s: Json) => void): Spec {
  const parsed = parseSpec(rawSpec(edit));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.spec;
}

const SIZE = { width: 1000, height: 1000 };

function world(spec: Spec = specOf(), density = 1): Project {
  let p = applySpecialization(emptyProject(), spec, { newId: idGen('SL') });
  p = addContainer(p, { id: 'I1', file: 'a.png', ...SIZE });
  return density === 1 ? p : setContainerDensity(p, 'I1', density);
}

const BIG: Rect = { x: 0, y: 0, width: 500, height: 500 };

function put(
  p: Project,
  typeId: string,
  id: string,
  rect: Rect = BIG,
  values: Record<string, string> = {},
): Project {
  let q = createMarking(p, { id: `M_${id}`, containerId: 'I1', rect, name: id });
  q = addTypedAnnotation(q, {
    id,
    markingId: `M_${id}`,
    layerId: layerOf(q, 'a11y', 'ui'),
    type: { specId: 'a11y', typeId },
  });
  for (const [key, value] of Object.entries(values)) q = setFieldValue(q, id, key, value);
  return q;
}

function withRows(p: Project, id: string, rows: Record<string, string>[]): Project {
  let q = p;
  rows.forEach((row, i) => {
    q = addTableRow(q, id, 'items', `R${i + 1}`);
    for (const [column, value] of Object.entries(row)) {
      q = setTableCell(q, id, 'items', `R${i + 1}`, column, value);
    }
  });
  return q;
}

const rect = (width: number, height: number): Rect => ({ x: 0, y: 0, width, height });

const issuesOf = (p: Project, id: string, ctx?: { drawings?: ComponentDrawings }) =>
  accessibilityAudit(p, ctx).get(id)?.issues ?? [];
const findingsOf = (p: Project, id: string) =>
  accessibilityAudit(p).get(id)?.findings ?? [];
const smallOf = (p: Project, id: string) =>
  findingsOf(p, id).filter(
    (f): f is TouchTargetSmallFinding => f.code === 'touch-target-small',
  );

describe('touch-target-small', () => {
  it('density 1: a marking below the root minimum warns, with units, pixels and density', () => {
    const p = put(world(), 'button', 'A', rect(40, 44), { label: 'Ok' });
    expect(findingsOf(p, 'A')).toEqual([
      {
        code: 'touch-target-small',
        annotationId: 'A',
        markingId: 'M_A',
        actual: { width: 40, height: 44 },
        min: { width: 44, height: 44 },
        minPx: { width: 44, height: 44 },
        density: 1,
      },
    ]);
  });

  it('density 3: 108x120 px is 36x40 units; the minimum 44x44 is 132x132 px', () => {
    const p = put(world(specOf(), 3), 'button', 'A', rect(108, 120), { label: 'Ok' });
    const [finding] = smallOf(p, 'A');
    expect(finding?.actual).toEqual({ width: 36, height: 40 });
    expect(finding?.minPx).toEqual({ width: 132, height: 132 });
    expect(finding?.density).toBe(3);
  });

  it('tolerates 1 px per axis: 43 px passes, 42 px warns', () => {
    const ok = put(world(), 'button', 'A', rect(43, 43), { label: 'Ok' });
    expect(findingsOf(ok, 'A')).toEqual([]);
    const small = put(world(), 'button', 'A', rect(42, 80), { label: 'Ok' });
    expect(findingsOf(small, 'A')).toHaveLength(1);
  });

  it('the type touch target replaces the root one', () => {
    const p = put(world(), 'own', 'A', rect(46, 46));
    expect(smallOf(p, 'A')[0]?.min).toEqual({ width: 48, height: 48 });
  });

  it('expanded mode, touchTarget false and a non-interactive role do not warn', () => {
    let p = put(world(), 'wide', 'A', rect(10, 10));
    p = put(p, 'off', 'B', rect(10, 10));
    p = put(p, 'image', 'C', rect(10, 10), { label: 'x' });
    expect(findingsOf(p, 'A')).toEqual([]);
    expect(findingsOf(p, 'B')).toEqual([]);
    expect(findingsOf(p, 'C')).toEqual([]);
  });

  it('an interactive role without label audits only the touch', () => {
    const p = put(world(), 'slider', 'A', rect(10, 10));
    const entry = accessibilityAudit(p).get('A');
    expect(entry?.issues).toEqual([]);
    expect(entry?.findings).toHaveLength(1);
  });

  it('an annotation owned by an arrow audits the label, never the touch', () => {
    let p = world();
    p = createMarking(p, { id: 'F', containerId: 'I1', rect: BIG, name: 'F' });
    p = createMarking(p, {
      id: 'T',
      containerId: 'I1',
      rect: { x: 600, y: 600, width: 100, height: 100 },
      name: 'T',
    });
    p = createArrow(p, { id: 'AR', from: 'F', to: 'T' });
    p = addTypedAnnotation(p, {
      id: 'A',
      markingId: 'AR',
      layerId: layerOf(p, 'a11y', 'ui'),
      type: { specId: 'a11y', typeId: 'button' },
    });
    const entry = accessibilityAudit(p).get('A');
    expect(entry?.findings).toEqual([]);
    expect(entry?.issues.map((i) => i.code)).toEqual(['accessible-label-missing']);
  });

  it('prints the density with up to 3 decimals and no trailing zeros', () => {
    expect(densityText(2.625)).toBe('2.625');
    expect(densityText(3)).toBe('3');
    expect(densityText(1.5)).toBe('1.5');
    expect(densityText(2.6250001)).toBe('2.625');
    const p = put(world(specOf(), 2.625), 'button', 'A', rect(10, 10), { label: 'Ok' });
    const [finding] = smallOf(p, 'A');
    expect(finding?.density).toBe(2.625);
    expect(finding?.minPx).toEqual({ width: 116, height: 116 });
  });
});

// Stage #1998 (TA2, decisions 2 to 6): `touch-target-overlap`, two neighbors whose touch areas overlap.
describe('touch-target-overlap', () => {
  /** `wide` (and any `expanded` type) as the audit sees it: grown to 48 around the center. */
  const wideArrows = (s: Json) => {
    const wide = s.layers[0].annotationTypes.find((t: Json) => t.id === 'wide');
    wide.appliesTo = ['marking', 'arrow'];
  };
  const at = (x: number, y: number, size = 40): Rect => ({
    x,
    y,
    width: size,
    height: size,
  });
  const overlapsOf = (p: Project, id: string) =>
    findingsOf(p, id).filter((f) => f.code === 'touch-target-overlap');
  const pair = (gap: number, dy = 0): Project => {
    const p = put(world(), 'wide', 'A', at(0, 0));
    return put(p, 'wide', 'B', at(40 + gap, dy));
  };

  it('two expanded 40 x 40 neighbors 4 apart give one finding each, naming the other', () => {
    const p = pair(4);
    expect(findingsOf(p, 'A')).toEqual([
      {
        code: 'touch-target-overlap',
        annotationId: 'A',
        markingId: 'M_A',
        other: { annotationId: 'B', markingId: 'M_B' },
        overlap: { width: 4, height: 48 },
        overlapPx: { width: 4, height: 48 },
        density: 1,
      },
    ]);
    expect(findingsOf(p, 'B')).toEqual([
      {
        code: 'touch-target-overlap',
        annotationId: 'B',
        markingId: 'M_B',
        other: { annotationId: 'A', markingId: 'M_A' },
        overlap: { width: 4, height: 48 },
        overlapPx: { width: 4, height: 48 },
        density: 1,
      },
    ]);
  });

  it('8 apart gives nothing; 5 apart (3 px) gives the finding', () => {
    expect(accessibilityAudit(pair(8)).size).toBe(0);
    expect(overlapsOf(pair(5), 'A')[0]?.overlap).toEqual({ width: 3, height: 48 });
  });

  it('an intersection of exactly 1 px on an axis gives nothing (the 1 px tolerance)', () => {
    expect(accessibilityAudit(pair(7)).size).toBe(0);
    expect(overlapsOf(pair(6), 'A')).toHaveLength(1);
    // 1 px on the y axis, the full width on x.
    expect(accessibilityAudit(pair(-40, 47)).size).toBe(0);
    expect(overlapsOf(pair(-40, 46), 'A')).toHaveLength(1);
  });

  it('an expanded next to a visual participant overlaps the visual rectangle', () => {
    let p = put(world(), 'wide', 'A', at(0, 0));
    p = put(p, 'button', 'B', at(42, 0, 50), { label: 'Ok' });
    expect(overlapsOf(p, 'A')[0]).toMatchObject({
      other: { annotationId: 'B', markingId: 'M_B' },
      overlap: { width: 2, height: 44 },
    });
    expect(overlapsOf(p, 'B')[0]).toMatchObject({
      other: { annotationId: 'A', markingId: 'M_A' },
      overlap: { width: 2, height: 44 },
    });
  });

  it('two visual participants that overlap give nothing', () => {
    let p = put(world(), 'button', 'A', at(0, 0, 60), { label: 'Ok' });
    p = put(p, 'button', 'B', at(40, 0, 60), { label: 'Ok' });
    expect(accessibilityAudit(p).size).toBe(0);
  });

  it('parent and child give nothing; different parents in the same space give the finding', () => {
    let p = put(world(), 'wide', 'A', at(0, 0, 200));
    p = put(p, 'wide', 'B', at(10, 10));
    expect(p.markings.find((m) => m.id === 'M_B')?.parentId).toBe('M_A');
    expect(accessibilityAudit(p).size).toBe(0);

    let q = createMarking(world(), {
      id: 'P1',
      containerId: 'I1',
      rect: { x: 0, y: 0, width: 100, height: 100 },
      name: 'P1',
    });
    q = createMarking(q, {
      id: 'P2',
      containerId: 'I1',
      rect: { x: 102, y: 0, width: 100, height: 100 },
      name: 'P2',
    });
    q = put(q, 'wide', 'A', at(60, 10));
    q = put(q, 'wide', 'B', at(104, 10));
    expect(q.markings.find((m) => m.id === 'M_A')?.parentId).toBe('P1');
    expect(q.markings.find((m) => m.id === 'M_B')?.parentId).toBe('P2');
    expect(overlapsOf(q, 'A')).toHaveLength(1);
  });

  it('different spaces give nothing: two containers, or a container and the canvas', () => {
    let p = addContainer(world(), { id: 'I2', file: 'b.png', ...SIZE });
    p = put(p, 'wide', 'A', at(0, 0));
    p = createMarking(p, { id: 'M_B', containerId: 'I2', rect: at(44, 0), name: 'B' });
    p = addTypedAnnotation(p, {
      id: 'B',
      markingId: 'M_B',
      layerId: layerOf(p, 'a11y', 'ui'),
      type: { specId: 'a11y', typeId: 'wide' },
    });
    expect(accessibilityAudit(p).size).toBe(0);

    // The container sits far from the canvas origin, so the canvas marking is not adopted by it.
    let q = moveContainer(put(world(), 'wide', 'A', at(0, 0)), 'I1', 5000, 5000);
    q = createMarking(q, { id: 'M_C', containerId: null, rect: at(44, 0), name: 'C' });
    q = addTypedAnnotation(q, {
      id: 'C',
      markingId: 'M_C',
      layerId: layerOf(q, 'a11y', 'ui'),
      type: { specId: 'a11y', typeId: 'wide' },
    });
    expect(q.markings.find((m) => m.id === 'M_C')?.containerId).toBeNull();
    expect(accessibilityAudit(q).size).toBe(0);
  });

  it('two canvas markings are in the same space and overlap', () => {
    let p = moveContainer(world(), 'I1', 5000, 5000);
    for (const [id, x] of [
      ['A', 0],
      ['B', 44],
    ] as const) {
      p = createMarking(p, {
        id: `M_${id}`,
        containerId: null,
        rect: at(x, 0),
        name: id,
      });
      p = addTypedAnnotation(p, {
        id,
        markingId: `M_${id}`,
        layerId: layerOf(p, 'a11y', 'ui'),
        type: { specId: 'a11y', typeId: 'wide' },
      });
    }
    expect(p.markings.every((m) => m.containerId === null)).toBe(true);
    expect(overlapsOf(p, 'A')).toHaveLength(1);
  });

  it('canvas markings on different pages are in different spaces (code review)', () => {
    let p = createPage(moveContainer(world(), 'I1', 5000, 5000), {
      id: 'PG2',
      name: 'Two',
    });
    for (const [id, x, pageId] of [
      ['A', 0, undefined],
      ['B', 44, 'PG2'],
    ] as const) {
      p = createMarking(p, {
        id: `M_${id}`,
        containerId: null,
        rect: at(x, 0),
        name: id,
        pageId,
      });
      p = addTypedAnnotation(p, {
        id,
        markingId: `M_${id}`,
        layerId: layerOf(p, 'a11y', 'ui'),
        type: { specId: 'a11y', typeId: 'wide' },
      });
    }
    expect(p.markings.find((m) => m.id === 'M_A')?.pageId).not.toBe('PG2');
    expect(accessibilityAudit(p).size).toBe(0);
  });

  it('sweepTouchBoxes: a pair that meets by 1 px or less on the x axis is not visited, whichever box is narrow (code review)', () => {
    const box = (left: number, right: number): TouchBox => ({
      space: 'I1',
      kind: 'expanded',
      left,
      top: 0,
      right,
      bottom: 100,
    });
    const visited = (boxes: TouchBox[]): [number, number][] => {
      const out: [number, number][] = [];
      sweepTouchBoxes(boxes, (i, j) => out.push([i, j]));
      return out;
    };
    // A narrow box (0.5 px) inside a wide one: the real intersection is 0.5 px.
    expect(visited([box(0, 100), box(50, 50.5)])).toEqual([]);
    // 2 px wide: the intersection is 2 px, more than the tolerance.
    expect(visited([box(0, 100), box(50, 52)])).toEqual([[0, 1]]);
  });

  it('an arrow annotation, touchTarget false, a non-interactive role and a free annotation give nothing', () => {
    let p = world(specOf(wideArrows));
    p = put(p, 'wide', 'A', at(0, 0));
    p = createMarking(p, { id: 'T', containerId: 'I1', rect: at(300, 300), name: 'T' });
    p = createArrow(p, { id: 'AR', from: 'M_A', to: 'T' });
    p = addTypedAnnotation(p, {
      id: 'ARA',
      markingId: 'AR',
      layerId: layerOf(p, 'a11y', 'ui'),
      type: { specId: 'a11y', typeId: 'wide' },
    });
    p = put(p, 'off', 'B', at(44, 0));
    p = put(p, 'image', 'C', at(0, 44), { label: 'x' });
    p = createMarking(p, { id: 'M_F', containerId: 'I1', rect: at(44, 44), name: 'F' });
    const free = p.layers.find((l) => !l.spec);
    if (free === undefined) throw new Error('no free layer');
    p = addAnnotation(p, { id: 'F', markingId: 'M_F', layerId: free.id });
    expect(accessibilityAudit(p).size).toBe(0);
  });

  it('density 3 converts the minimum and the overlap like touch-target-small', () => {
    // 100 px = 33.3 units, grown to 48 units = 144 px; 8 px apart.
    let p = world(specOf(), 3);
    p = put(p, 'wide', 'A', at(0, 0, 100));
    p = put(p, 'wide', 'B', at(108, 0, 100));
    const [finding] = overlapsOf(p, 'A');
    expect(finding).toMatchObject({
      overlapPx: { width: 36, height: 144 },
      overlap: { width: 12, height: 48 },
      density: 3,
    });
  });

  it('keeps touch-target-small first, then the overlaps in the project order of the other marking', () => {
    // E (right) is created before D (left), so A names E first.
    let p = put(world(), 'wide', 'E', at(225, 0, 30));
    p = put(p, 'wide', 'D', at(155, 0, 30));
    p = put(p, 'button', 'A', at(190, 0, 40), { label: 'Ok' });
    const codes = findingsOf(p, 'A').map((f) =>
      f.code === 'touch-target-overlap' ? `overlap:${f.other.annotationId}` : f.code,
    );
    expect(codes).toEqual(['touch-target-small', 'overlap:E', 'overlap:D']);
  });

  it('the overlap is not an issue: it does not make the annotation incomplete', () => {
    const p = pair(4);
    expect(accessibilityAudit(p).get('A')?.issues).toEqual([]);
    expect(projectIssues(p).has('A')).toBe(false);
  });

  it('the audit stays the same object for the same project', () => {
    const p = pair(4);
    expect(accessibilityAudit(p)).toBe(accessibilityAudit(p));
  });
});

// Stage #1998 (TA4, decisions 17 to 20): the WCAG 2.5.8 spacing. With `touchTarget.spacing` an undersized `visual`
// target passes when a circle with the minimum's diameter, centered on its rectangle, hits nothing.
describe('touch-target-small with the WCAG 2.5.8 spacing', () => {
  /** `formatVersion` 27 with the root `{ 24, 24, visual, spacing: true }`; the type `own` (48, no spacing) is untouched. */
  const spacingSpec = (edit?: (s: Json) => void): Spec =>
    specOf((s) => {
      s.formatVersion = 27;
      s.accessibility.touchTarget = {
        width: 24,
        height: 24,
        mode: 'visual',
        spacing: true,
      };
      edit?.(s);
    });
  const sworld = (density = 1): Project => world(spacingSpec(), density);
  const sq = (x: number, y: number, size = 20): Rect => ({
    x,
    y,
    width: size,
    height: size,
  });
  const button = (p: Project, id: string, r: Rect): Project =>
    put(p, 'button', id, r, { label: 'Ok' });
  const smallA = (p: Project, id = 'A') => smallOf(p, id)[0];

  it('centers 24 apart (the circles just touch, depth 0) give no finding', () => {
    const p = button(button(sworld(), 'A', sq(0, 0)), 'B', sq(24, 0));
    expect(accessibilityAudit(p).size).toBe(0);
  });

  it('centers 20 apart (circle depth 4) warn on each, with the usual numbers and the neighbor', () => {
    const p = button(button(sworld(), 'A', sq(0, 0)), 'B', sq(20, 0));
    expect(findingsOf(p, 'A')).toEqual([
      {
        code: 'touch-target-small',
        annotationId: 'A',
        markingId: 'M_A',
        actual: { width: 20, height: 20 },
        min: { width: 24, height: 24 },
        minPx: { width: 24, height: 24 },
        density: 1,
        spacing: { other: { annotationId: 'B', markingId: 'M_B' } },
      },
    ]);
    expect(smallA(p, 'B')?.spacing).toEqual({
      other: { annotationId: 'A', markingId: 'M_A' },
    });
  });

  it('a depth of exactly 1 px gives nothing; 2 px warns (the 1 px tolerance)', () => {
    const one = button(button(sworld(), 'A', sq(0, 0)), 'B', sq(23, 0));
    expect(accessibilityAudit(one).size).toBe(0);
    const two = button(button(sworld(), 'A', sq(0, 0)), 'B', sq(22, 0));
    expect(smallOf(two, 'A')).toHaveLength(1);
  });

  it('a full-size visual neighbor blocks the circle by its rectangle and has no finding', () => {
    let p = button(sworld(), 'A', sq(0, 0));
    p = button(p, 'B', sq(20, 0, 30));
    expect(smallA(p)?.spacing?.other).toEqual({ annotationId: 'B', markingId: 'M_B' });
    expect(findingsOf(p, 'B')).toEqual([]);
    // 25 px away the circle (radius 12, centered 10) clears it.
    const clear = button(button(sworld(), 'A', sq(0, 0)), 'B', sq(25, 0, 30));
    expect(accessibilityAudit(clear).size).toBe(0);
  });

  it('an expanded neighbor blocks the circle by its grown area, not by its rectangle', () => {
    // `wide` 40 x 40 at x 24 grows to 48: it starts at x 20, 10 from the circle's center (radius 12).
    const p = put(button(sworld(), 'A', sq(0, 0)), 'wide', 'W', sq(24, 0, 40));
    expect(smallA(p)?.spacing?.other).toEqual({ annotationId: 'W', markingId: 'M_W' });
    expect(findingsOf(p, 'W')).toEqual([]);
    // Its rectangle alone (14 away) would not have blocked it.
    const far = put(button(sworld(), 'A', sq(0, 0)), 'wide', 'W', sq(31, 0, 40));
    expect(accessibilityAudit(far).size).toBe(0);
  });

  it('the circle of an undersized neighbor whose specialization has no spacing still blocks', () => {
    // `own` (48 x 48, no spacing) is 40 x 40: its circle (radius 24) reaches 4 px past its rectangle.
    // A's circle is 12 from the rectangle (depth 0) but 32 from the center: 12 + 24 - 32 = 4.
    let p = put(sworld(), 'own', 'N', sq(100, 100, 40));
    p = button(p, 'A', sq(110, 78));
    expect(smallA(p)?.spacing?.other).toEqual({ annotationId: 'N', markingId: 'M_N' });
    const [own] = smallOf(p, 'N');
    expect(own).toBeDefined();
    expect(own).not.toHaveProperty('spacing');
    expect(own?.min).toEqual({ width: 48, height: 48 });
  });

  it('two undersized neighbors that do not switch spacing on do not audit it', () => {
    const p = put(put(sworld(), 'own', 'N', sq(0, 0, 40)), 'own', 'M', sq(40, 0, 40));
    for (const id of ['N', 'M']) {
      expect(smallOf(p, id)).toHaveLength(1);
      expect(smallOf(p, id)[0]).not.toHaveProperty('spacing');
    }
  });

  it('a parent, an arrow annotation, touchTarget false, another space and a non-interactive role never block', () => {
    // The child's circle is inside its parent, which does not count.
    let p = put(sworld(), 'wide', 'P', { x: 0, y: 0, width: 200, height: 200 });
    p = button(p, 'A', sq(10, 10));
    expect(p.markings.find((m) => m.id === 'M_A')?.parentId).toBe('M_P');
    expect(accessibilityAudit(p).size).toBe(0);

    p = put(sworld(), 'off', 'O', sq(20, 0, 30));
    p = put(p, 'image', 'G', sq(0, 20, 30), { label: 'x' });
    p = button(p, 'A', sq(0, 0));
    expect(smallOf(p, 'A')).toEqual([]);

    let q = button(sworld(), 'A', sq(0, 0));
    q = createMarking(q, { id: 'F', containerId: 'I1', rect: sq(300, 0), name: 'F' });
    q = createMarking(q, { id: 'T', containerId: 'I1', rect: sq(0, 300), name: 'T' });
    q = createArrow(q, { id: 'AR', from: 'F', to: 'T' });
    q = addTypedAnnotation(q, {
      id: 'X',
      markingId: 'AR',
      layerId: layerOf(q, 'a11y', 'ui'),
      type: { specId: 'a11y', typeId: 'button' },
    });
    expect(smallOf(q, 'A')).toEqual([]);

    let other = addContainer(sworld(), { id: 'I2', file: 'b.png', ...SIZE });
    other = button(other, 'A', sq(0, 0));
    other = createMarking(other, {
      id: 'M_B',
      containerId: 'I2',
      rect: sq(20, 0, 30),
      name: 'B',
    });
    other = addTypedAnnotation(other, {
      id: 'B',
      markingId: 'M_B',
      layerId: layerOf(other, 'a11y', 'ui'),
      type: { specId: 'a11y', typeId: 'button' },
    });
    other = setFieldValue(other, 'B', 'label', 'Ok');
    expect(smallOf(other, 'A')).toEqual([]);
  });

  it('the neighbor must be a different marking: two annotations of one marking never block each other', () => {
    let p = button(sworld(), 'A', sq(0, 0));
    p = addTypedAnnotation(p, {
      id: 'A2',
      markingId: 'M_A',
      layerId: layerOf(p, 'a11y', 'ui'),
      type: { specId: 'a11y', typeId: 'button' },
    });
    p = setFieldValue(p, 'A2', 'label', 'Two');
    expect(accessibilityAudit(p).size).toBe(0);
  });

  it('density 3 converts the diameter as ceil(24 x 3) = 72 px', () => {
    // 60 px = 20 units; circles of radius 36, centers 72 apart touch, 66 apart go 6 deep.
    const touching = button(button(sworld(3), 'A', sq(0, 0, 60)), 'B', sq(72, 0, 60));
    expect(accessibilityAudit(touching).size).toBe(0);
    const near = button(button(sworld(3), 'A', sq(0, 0, 60)), 'B', sq(66, 0, 60));
    expect(smallA(near)).toMatchObject({
      actual: { width: 20, height: 20 },
      minPx: { width: 72, height: 72 },
      density: 3,
      spacing: { other: { annotationId: 'B' } },
    });
  });

  it('the diameter is rounded up in pixels: ceil(24 x 1.3) = 32, not 31.2', () => {
    // Radius 16 each: centers 30.5 apart (26 px at 0 and 25 px at 31) go 1.5 deep (31.2 would be 0.7 and pass).
    const p = button(button(sworld(1.3), 'A', sq(0, 0, 26)), 'B', sq(31, 0, 25));
    expect(smallA(p)?.minPx).toEqual({ width: 32, height: 32 });
    expect(smallA(p)?.spacing?.other.annotationId).toBe('B');
  });

  it('with several neighbors, other is the first in the project order of the other marking', () => {
    // C is created before B, but B is the leftmost one: the sweep meets B first.
    let p = button(sworld(), 'C', sq(50, 0));
    p = button(p, 'A', sq(30, 0));
    p = button(p, 'B', sq(10, 0));
    expect(smallA(p)?.spacing?.other).toEqual({ annotationId: 'C', markingId: 'M_C' });
  });

  it('keeps the spacing finding before the overlap findings of the same annotation', () => {
    // `wide` grown to 48 overlaps A's rectangle and, within 12 px of its center, blocks the circle.
    const p = put(button(sworld(), 'A', sq(0, 0)), 'wide', 'W', sq(10, 0, 40));
    expect(findingsOf(p, 'A').map((f) => f.code)).toEqual([
      'touch-target-small',
      'touch-target-overlap',
    ]);
    expect(smallA(p)?.spacing?.other.annotationId).toBe('W');
  });

  it('a type that does not switch spacing on keeps touch-target-small as before', () => {
    // The default specialization (formatVersion 18, no spacing): the same layout, the usual finding only.
    const p = put(put(world(), 'own', 'A', sq(0, 0, 40)), 'own', 'B', sq(40, 0, 40));
    expect(smallA(p)).not.toHaveProperty('spacing');
    expect(findingsOf(p, 'A').map((f) => f.code)).toEqual(['touch-target-small']);
    const off = world(
      specOf((s) => {
        s.formatVersion = 27;
      }),
    );
    expect(
      smallOf(put(put(off, 'own', 'A', sq(0, 0, 40)), 'own', 'B', sq(40, 0, 40)), 'A'),
    ).toEqual(smallOf(p, 'A'));
  });

  it('a lone undersized target with spacing has no finding; the audit stays the same object', () => {
    const p = button(sworld(), 'A', sq(0, 0));
    expect(accessibilityAudit(p).size).toBe(0);
    const q = button(button(sworld(), 'A', sq(0, 0)), 'B', sq(20, 0));
    expect(accessibilityAudit(q)).toBe(accessibilityAudit(q));
  });
});

describe('accessible-label-missing on the type', () => {
  it('an empty required label is an issue on its first field', () => {
    const p = put(world(), 'button', 'A');
    expect(issuesOf(p, 'A')).toEqual([
      { code: 'accessible-label-missing', key: 'label' },
    ]);
  });

  it('the first field with a value wins; any value completes the label', () => {
    expect(issuesOf(put(world(), 'button', 'A', BIG, { alt: 'x' }), 'A')).toEqual([]);
    expect(issuesOf(put(world(), 'button', 'A', BIG, { label: 'x' }), 'A')).toEqual([]);
  });

  it('required: false does not audit', () => {
    expect(issuesOf(put(world(), 'optional', 'A'), 'A')).toEqual([]);
  });

  it('a non-interactive role has required false by default; true when declared', () => {
    expect(issuesOf(put(world(), 'image', 'A'), 'A')).toEqual([]);
    const spec = specOf((s) => {
      s.layers[0].annotationTypes[6].accessibility.label.required = true;
    });
    expect(issuesOf(put(world(spec), 'image', 'A'), 'A')).toEqual([
      { code: 'accessible-label-missing', key: 'label' },
    ]);
  });

  it('is not produced by projectIssues', () => {
    const p = put(world(), 'button', 'A');
    expect(
      projectIssues(p)
        .get('A')
        ?.map((i) => i.code) ?? [],
    ).not.toContain('accessible-label-missing');
  });
});

describe('accessible-label-missing on parts', () => {
  it('a field part: one per field with a value; the issue carries the part (name or id)', () => {
    const p = put(world(), 'bar', 'A', BIG, { badge: '1', title: 'T' });
    // `close` (when badge, label title) is fine; `noName` (when title, label badge) is fine too.
    expect(issuesOf(p, 'A')).toEqual([]);
    const q = put(world(), 'bar', 'B', BIG, { badge: '1' });
    expect(issuesOf(q, 'B')).toEqual([
      {
        code: 'accessible-label-missing',
        key: 'title',
        part: { id: 'close', name: 'Close' },
      },
    ]);
    const r = put(world(), 'bar', 'C', BIG, { title: 'T' });
    expect(issuesOf(r, 'C')).toEqual([
      {
        code: 'accessible-label-missing',
        key: 'badge',
        part: { id: 'noName', name: 'noName' },
      },
    ]);
  });

  it('a part whose when field is empty does not exist; required false is not audited', () => {
    const p = put(world(), 'bar', 'A');
    expect(issuesOf(p, 'A')).toEqual([]);
    const q = put(world(), 'bar', 'B', BIG, { title: 'T', badge: 'b' });
    expect(issuesOf(q, 'B')).toEqual([]);
  });

  it('a table part: one per row, with the row id and the column of the first label field', () => {
    let p = put(world(), 'bar', 'A');
    p = withRows(p, 'A', [{ name: 'a' }, {}, { name: 'c' }]);
    expect(issuesOf(p, 'A')).toEqual([
      {
        code: 'accessible-label-missing',
        key: 'items',
        column: 'name',
        rowId: 'R2',
        part: { id: 'row', name: 'Row' },
      },
    ]);
  });

  it('<table>.<column> parts exist only in the rows where the column has a value', () => {
    let p = put(world(), 'bar', 'A');
    p = withRows(p, 'A', [{ name: 'a', hint: 'h' }, { hint: 'h2' }, { name: 'z' }]);
    const cell = issuesOf(p, 'A').filter((i) => i.part?.id === 'cell');
    expect(cell.map((i) => i.rowId)).toEqual(['R2']);
    const row = issuesOf(p, 'A').filter((i) => i.part?.id === 'row');
    expect(row).toEqual([]);
  });

  it('a type with role none audits its parts, not itself', () => {
    const p = put(world(), 'none', 'A', rect(10, 10), { note: 'n' });
    expect(issuesOf(p, 'A')).toEqual([
      { code: 'accessible-label-missing', key: 'title', part: { id: 'p', name: 'p' } },
    ]);
    expect(findingsOf(p, 'A')).toEqual([]);
    expect(issuesOf(put(world(), 'none', 'B'), 'B')).toEqual([]);
  });

  it('a type without role audits its parts but not the touch', () => {
    const p = put(world(), 'bar', 'A', rect(10, 10), { badge: '1' });
    const entry = accessibilityAudit(p).get('A');
    expect(entry?.findings).toEqual([]);
    expect(entry?.issues).toHaveLength(1);
  });

  it('skips a part whose field is inactive in the drawing; audits it without drawings', () => {
    const p = put(world(), 'bar', 'A', BIG, { badge: '1' });
    const drawing = {
      annotationId: 'A',
      inactiveFields: new Map([['badge', 'slot']]),
    };
    const drawings = new Map([['M_A', drawing]]) as unknown as ComponentDrawings;
    expect(issuesOf(p, 'A', { drawings })).toEqual([]);
    expect(issuesOf(p, 'A', {})).toHaveLength(1);
    expect(issuesOf(p, 'A')).toHaveLength(1);
    const other = new Map([
      ['M_A', { annotationId: 'other', inactiveFields: drawing.inactiveFields }],
    ]) as unknown as ComponentDrawings;
    expect(issuesOf(p, 'A', { drawings: other })).toHaveLength(1);
  });
});

describe('the audit as a whole', () => {
  it('no accessibility in the specialization: an empty audit', () => {
    const spec = specOf((s) => {
      s.formatVersion = 17;
      delete s.accessibility;
      for (const type of s.layers[0].annotationTypes) delete type.accessibility;
    });
    let p = put(world(spec), 'button', 'A', rect(10, 10));
    p = put(p, 'bar', 'B', BIG, { badge: '1' });
    expect(accessibilityAudit(p).size).toBe(0);
  });

  it('only annotations with something appear; free annotations are ignored', () => {
    let p = put(world(), 'button', 'A', BIG, { label: 'x' });
    p = put(p, 'button', 'B');
    expect([...accessibilityAudit(p).keys()]).toEqual(['B']);
  });

  it('is the same object for the same project and context', () => {
    const p = put(world(), 'button', 'A');
    expect(accessibilityAudit(p)).toBe(accessibilityAudit(p));
    const drawings = new Map() as ComponentDrawings;
    expect(accessibilityAudit(p, { drawings })).toBe(accessibilityAudit(p, { drawings }));
  });
});

// Stage #1128 (A3): what the code needs (`get_code_hints`) and the resolved type (`get_component`).
describe('annotationAccessibility (the code view)', () => {
  const of = (p: Project, id: string, inactive?: ReadonlyMap<string, string>) =>
    annotationAccessibility(
      p,
      p.annotations.find((a) => a.id === id)!,
      inactive,
    );

  it('the role and the value of the first label field that has one', () => {
    const p = put(world(), 'button', 'A', BIG, { alt: 'Close' });
    expect(of(p, 'A')).toEqual({ role: 'button', label: 'Close' });
  });

  it('a required label that is empty is label null and missing', () => {
    expect(of(put(world(), 'button', 'A'), 'A')).toEqual({
      role: 'button',
      label: null,
      missing: true,
    });
  });

  it('an optional label that is empty is label null, without missing', () => {
    expect(of(put(world(), 'optional', 'A'), 'A')).toEqual({
      role: 'button',
      label: null,
    });
  });

  it('an interactive role with no label declared is label null; a non-interactive one has no label key', () => {
    expect(of(put(world(), 'slider', 'A'), 'A')).toEqual({ role: 'slider', label: null });
    expect(of(put(world(), 'image', 'A', BIG, { label: 'Logo' }), 'A')).toEqual({
      role: 'image',
      label: 'Logo',
    });
  });

  it('role none says only the role', () => {
    expect(of(put(world(), 'none', 'A'), 'A')).toEqual({ role: 'none' });
  });

  it('field parts exist when their field has a value, each with its label or missing', () => {
    const p = put(world(), 'bar', 'A', BIG, { title: 'T', badge: '1' });
    expect(of(p, 'A')).toEqual({
      parts: [
        { id: 'close', name: 'Close', role: 'button', label: 'T' },
        { id: 'noName', name: 'noName', role: 'button', label: '1' },
        { id: 'plain', name: 'plain', role: 'button', label: '1' },
      ],
    });
    const bare = put(world(), 'bar', 'B', BIG, { title: 'T' });
    expect(of(bare, 'B')!.parts).toEqual([
      { id: 'noName', name: 'noName', role: 'button', label: null, missing: true },
      { id: 'plain', name: 'plain', role: 'button', label: null },
    ]);
  });

  it('table parts come one per row, from 0, with the first label column that has a value', () => {
    const p = withRows(put(world(), 'bar', 'A'), 'A', [
      { name: 'First' },
      { hint: 'Second' },
      {},
    ]);
    const rows = of(p, 'A')!.parts!.filter((part) => part.id === 'row');
    expect(rows).toEqual([
      { id: 'row', name: 'Row', role: 'button', label: 'First', row: 0 },
      { id: 'row', name: 'Row', role: 'button', label: 'Second', row: 1 },
      { id: 'row', name: 'Row', role: 'button', label: null, missing: true, row: 2 },
    ]);
    // `<table>.<column>`: only the rows where the column has a value.
    expect(of(p, 'A')!.parts!.filter((part) => part.id === 'cell')).toEqual([
      { id: 'cell', name: 'Cell', role: 'button', label: null, missing: true, row: 1 },
    ]);
  });

  it('a part whose field a slot child takes over is not there; without parts the key goes away', () => {
    const p = put(world(), 'bar', 'A', BIG, { title: 'T' });
    const inactive = new Map([['title', 'slot']]);
    expect(of(p, 'A', inactive)).toBeNull();
  });

  it('a type with no accessibility, an annotation without type and the audit-free spec give null', () => {
    const spec = specOf((s) => {
      s.formatVersion = 17;
      delete s.accessibility;
      for (const type of s.layers[0].annotationTypes) delete type.accessibility;
    });
    const p = put(world(spec), 'button', 'A');
    expect(of(p, 'A')).toBeNull();
  });
});

describe('typeAccessibility (the resolved type)', () => {
  const typeOf = (id: string, spec = specOf()) => {
    const type = spec.layers[0]!.annotationTypes.find((t) => t.id === id)!;
    return typeAccessibility(spec, type);
  };

  it('fills the defaults: label required by the role, the root touch target with its mode, part name and role', () => {
    expect(typeOf('button')).toEqual({
      role: 'button',
      label: { fields: ['label', 'alt'], required: true },
      touchTarget: { width: 44, height: 44, mode: 'visual' },
    });
    expect(typeOf('bar')!.parts![1]).toEqual({
      id: 'noName',
      name: 'noName',
      when: 'title',
      role: 'button',
      label: { fields: ['badge'], required: true },
    });
  });

  it('the type touch target replaces the root one; false opts out; a non-interactive type has none', () => {
    expect(typeOf('own')!.touchTarget).toEqual({ width: 48, height: 48, mode: 'visual' });
    expect(typeOf('wide')!.touchTarget).toEqual({
      width: 48,
      height: 48,
      mode: 'expanded',
    });
    expect(typeOf('off')!.touchTarget).toBe(false);
    expect(typeOf('image')).not.toHaveProperty('touchTarget');
    expect(typeOf('image')!.label!.required).toBe(false);
  });

  it('null for a type with no accessibility', () => {
    const spec = specOf((s) => {
      delete s.layers[0].annotationTypes[0].accessibility;
    });
    expect(typeOf('button', spec)).toBeNull();
  });
});

// TA1 (stage #1998, decision 9): one enumeration of the parts. The parts that `annotationAccessibility` marks
// `missing` (the code view) are exactly the part issues of `accessibilityAudit`: same `id` and, in a table, same row.
// A guard: it passes before and after the refactor that makes both read the same generator.
describe('the part enumeration agrees between the audit and the code view', () => {
  type PartKey = string;

  const project = a11yMcpProject((add, _plain, rows) => {
    const at = (y: number) => ({ x: 100, y, width: 800, height: 168 });
    add('bar-bare', 'bar', { name: 'bare', rect: at(100) });
    add('bar-one', 'bar', {
      name: 'one',
      rect: at(400),
      values: { actionIcon1: 'search' },
    });
    add('bar-both', 'bar', {
      name: 'both',
      rect: at(700),
      values: { actionIcon1: 'search', actionIcon2: 'more' },
    });
    add('bar-named', 'bar', {
      name: 'named',
      rect: at(1000),
      values: {
        actionIcon1: 'search',
        actionIcon1Description: 'Search',
        actionIcon2: 'more',
      },
    });
    add('bar-full', 'bar', {
      name: 'full',
      rect: at(1300),
      values: { actionIcon1: 'search', actionIcon2: 'more' },
    });
    add('tabs-none', 'tabs', { name: 'tabs-none', rect: at(1600) });
    add('tabs-rows', 'tabs', { name: 'tabs-rows', rect: at(1900) });
    rows('tabs-rows', [
      { label: 'Home' },
      {},
      { iconDescription: 'Search' },
      { label: '', iconDescription: '' },
    ]);
  });

  /** A drawing where a full slot takes over the default content of `actionIcon1`. */
  const fullSlot = new Map([
    [
      'mk-bar-full',
      {
        annotationId: 'an-bar-full',
        inactiveFields: new Map([['actionIcon1', 'actions']]),
      },
    ],
  ]) as unknown as ComponentDrawings;

  /** The part issues of the audit, as `id` or `id#row` (the row from 0, found by the row id). */
  function auditKeys(p: Project, annotationId: string, drawings?: ComponentDrawings) {
    const annotation = p.annotations.find((a) => a.id === annotationId)!;
    const rowIds = ((annotation.values?.items ?? []) as { _id: string }[]).map(
      (r) => r._id,
    );
    const audit = accessibilityAudit(p, drawings === undefined ? {} : { drawings });
    return (audit.get(annotationId)?.issues ?? [])
      .filter((i) => i.part !== undefined)
      .map((i): PartKey =>
        i.rowId === undefined ? i.part!.id : `${i.part!.id}#${rowIds.indexOf(i.rowId)}`,
      )
      .sort();
  }

  /** The parts of the code view that carry `missing`, in the same shape. */
  function codeKeys(p: Project, annotationId: string, inactive?: Set<string>) {
    const annotation = p.annotations.find((a) => a.id === annotationId)!;
    const view = annotationAccessibility(p, annotation, inactive);
    return (view?.parts ?? [])
      .filter((part) => part.missing === true)
      .map((part): PartKey =>
        part.row === undefined ? part.id : `${part.id}#${part.row}`,
      )
      .sort();
  }

  const ids = [
    'an-bar-bare',
    'an-bar-one',
    'an-bar-both',
    'an-bar-named',
    'an-tabs-none',
    'an-tabs-rows',
  ];

  it.each(ids)('%s: the same missing parts', (id) => {
    expect(codeKeys(project, id)).toEqual(auditKeys(project, id));
  });

  it('the fixture exercises both kinds: a field part and a table part with rows', () => {
    expect(codeKeys(project, 'an-bar-both')).toEqual(['action1', 'action2']);
    // Row 0 has a label, row 2 has the icon description: only rows 1 and 3 lack a name.
    expect(codeKeys(project, 'an-tabs-rows')).toEqual(['tab#1', 'tab#3']);
  });

  it('a full slot: the part whose field a child takes over is in neither', () => {
    const id = 'an-bar-full';
    const inactive = new Set(['actionIcon1']);
    expect(codeKeys(project, id, inactive)).toEqual(['action2']);
    expect(auditKeys(project, id, fullSlot)).toEqual(['action2']);
    // Without the drawing both still list the two parts.
    expect(codeKeys(project, id)).toEqual(['action1', 'action2']);
    expect(auditKeys(project, id)).toEqual(['action1', 'action2']);
  });
});
