// Accessibility audit (stage #1126, A1; decisions 5 and 7 of #1081): `accessible-label-missing`
// (a pending item, not produced by `projectIssues`) and the `touch-target-small` warning, from the
// `accessibility` of the specialization (`formatVersion` 18).
import { describe, expect, it } from 'vitest';
import {
  accessibilityAudit,
  addContainer,
  addTableRow,
  addTypedAnnotation,
  annotationAccessibility,
  applySpecialization,
  createArrow,
  createMarking,
  densityText,
  parseSpec,
  projectIssues,
  setContainerDensity,
  setFieldValue,
  setTableCell,
  type ComponentDrawings,
  type Project,
  type Rect,
  type Spec,
  typeAccessibility,
} from '../../src/model';
import { emptyProject } from './fixtures';
import { idGen, layerOf } from './specFixtures';

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
    const [finding] = findingsOf(p, 'A');
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
    expect(findingsOf(p, 'A')[0]?.min).toEqual({ width: 48, height: 48 });
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
    const [finding] = findingsOf(p, 'A');
    expect(finding?.density).toBe(2.625);
    expect(finding?.minPx).toEqual({ width: 116, height: 116 });
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
        { id: 'close', role: 'button', label: 'T' },
        { id: 'noName', role: 'button', label: '1' },
        { id: 'plain', role: 'button', label: '1' },
      ],
    });
    const bare = put(world(), 'bar', 'B', BIG, { title: 'T' });
    expect(of(bare, 'B')!.parts).toEqual([
      { id: 'noName', role: 'button', label: null, missing: true },
      { id: 'plain', role: 'button', label: null },
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
      { id: 'row', role: 'button', label: 'First', row: 0 },
      { id: 'row', role: 'button', label: 'Second', row: 1 },
      { id: 'row', role: 'button', label: null, missing: true, row: 2 },
    ]);
    // `<table>.<column>`: only the rows where the column has a value.
    expect(of(p, 'A')!.parts!.filter((part) => part.id === 'cell')).toEqual([
      { id: 'cell', role: 'button', label: null, missing: true, row: 1 },
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
