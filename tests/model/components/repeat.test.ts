// The `repeat` node (ME4, component `formatVersion` 2): validation, expansion and drawing.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type {
  ComponentFile,
  FieldValues,
  FrameTemplate,
  TemplateNode,
} from '../../../src/model/components/componentFormat';
import {
  evaluateCondition,
  isEmpty,
  referencedFields,
  repeatInnerFields,
  truthy,
} from '../../../src/model/components/expressions';
import {
  approximateMeasurer,
  instantiate,
  measureComponent,
  type Box,
} from '../../../src/model/components/instantiate';
import { parseComponent } from '../../../src/model/components/parseComponent';
import {
  columnsOf,
  expandRepeats,
  hasRepeat,
  rowsOf,
} from '../../../src/model/components/repeat';
import type { FrameNode, SceneNode, TextNode } from '../../../src/model/components/scene';
import { collectFieldKeys } from '../../../src/model/components/parseComponent';
import { checkSchema } from '../../support/jsonSchema';

const schema: Record<string, unknown> = JSON.parse(
  readFileSync(new URL('../../../docs/component.schema.json', import.meta.url), 'utf8'),
);

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const row = (children: Raw[] = []): Raw => ({
  type: 'frame',
  name: 'row',
  layout: { type: 'row', gap: 10 },
  children,
});

const text = (field: string, extra: Raw = {}): Raw => ({
  type: 'text',
  text: { $field: field },
  font: { size: 10, lineHeight: 12 },
  ...extra,
});

/** Component with a `repeat` of `rows` inside a column with a title. */
function raw(over: Raw = {}, repeat: Raw = {}, version = 2): Raw {
  return {
    format: 'mapping-component',
    formatVersion: version,
    id: 'table',
    name: 'Table',
    size: { width: 200, height: 100 },
    template: {
      type: 'frame',
      layout: { type: 'column', gap: 6, padding: 8 },
      children: [
        text('title', { name: 'heading' }),
        {
          type: 'repeat',
          field: 'rows',
          gap: 2,
          template: row([
            text('key', { width: 'hug' }),
            text('value', { width: 'fill' }),
          ]),
          ...repeat,
        },
      ],
    },
    ...over,
  };
}

function component(over: Raw = {}, repeat: Raw = {}, version = 2): ComponentFile {
  const parsed = parseComponent(raw(over, repeat, version));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.component;
}

function errorsOf(input: unknown): string[] {
  const parsed = parseComponent(input);
  if (parsed.ok) throw new Error('was expected to fail');
  return parsed.errors;
}

const BOX: Box = { x: 0, y: 0, width: 200, height: 100 };

const ROWS = [
  { key: 'origin', value: 'cart' },
  { key: 'total', value: '149,90' },
  { key: 'items', value: '3' },
];

function draw(c: ComponentFile, values: FieldValues, box: Box = BOX) {
  return instantiate(c, values, box, { measure: approximateMeasurer });
}

interface Placed {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly node: TextNode;
}

function texts(root: FrameNode): Placed[] {
  const out: Placed[] = [];
  const visit = (node: SceneNode, ox: number, oy: number): void => {
    const x = ox + node.transform[4];
    const y = oy + node.transform[5];
    if (node.type === 'text') out.push({ text: node.text, x, y, node });
    if (node.type === 'frame') for (const child of node.children) visit(child, x, y);
  };
  visit(root, 0, 0);
  return out;
}

function ids(node: SceneNode, found: string[] = []): string[] {
  found.push(node.id);
  if (node.type === 'frame') for (const child of node.children) ids(child, found);
  return found;
}

describe('parseComponent: repeat', () => {
  it('accepts the repeat in formatVersion 2, with direction and gap', () => {
    expect(parseComponent(raw()).ok).toBe(true);
    expect(
      parseComponent(raw({}, { direction: 'row', gap: { $field: 'space' } })).ok,
    ).toBe(true);
  });

  it('the JSON schema accepts the same component and formatVersion 1 without repeat', () => {
    expect(checkSchema(schema, raw())).toEqual([]);
    expect(checkSchema(schema, raw({}, { direction: 'row' }))).toEqual([]);
    const v1 = raw({}, {}, 1);
    v1.template.children.pop();
    expect(checkSchema(schema, v1)).toEqual([]);
    expect(parseComponent(v1).ok).toBe(true);
  });

  it('repeat in a formatVersion 1 is an error, at the node path', () => {
    expect(errorsOf(raw({}, {}, 1))).toEqual([
      'template.children[1].type: the repeat node only exists in formatVersion 2',
    ]);
  });

  it('formatVersion 5 is refused and the accepted ones are cited', () => {
    const v4 = raw({ formatVersion: 5 });
    v4.template.children.pop();
    expect(errorsOf(v4)).toEqual(['formatVersion: expected 1, 2, 3 or 4']);
  });

  it('the repeat is also valid in formatVersion 3', () => {
    expect(parseComponent(raw({ formatVersion: 3 })).ok).toBe(true);
  });

  it('field and template are required; field cannot be empty', () => {
    const noField = raw();
    delete noField.template.children[1].field;
    expect(errorsOf(noField)).toContain('template.children[1].field: required field');
    const noTemplate = raw();
    delete noTemplate.template.children[1].template;
    expect(errorsOf(noTemplate)).toContain(
      'template.children[1].template: required field',
    );
    expect(errorsOf(raw({}, { field: '' }))[0]).toContain('template.children[1].field:');
  });

  it('direction only accepts column and row; gap is not negative', () => {
    expect(errorsOf(raw({}, { direction: 'grid' }))[0]).toContain(
      'template.children[1].direction: expected one of: column, row',
    );
    expect(errorsOf(raw({}, { gap: -1 }))[0]).toContain('template.children[1].gap:');
  });

  it('the template of a row is a frame', () => {
    expect(errorsOf(raw({}, { template: text('key') }))).toContain(
      'template.children[1].template.type: the template of a row must be of type "frame"',
    );
  });

  it('fill, stroke, shadow and cornerRadius are not valid on the repeat (the drawing belongs to the template)', () => {
    for (const key of ['fill', 'stroke', 'shadow', 'cornerRadius']) {
      expect(errorsOf(raw({}, { [key]: key === 'fill' ? '#fff' : {} }))[0]).toContain(
        `template.children[1].${key}: not valid in a repeat`,
      );
    }
  });

  it('repeat and slot inside the repeat are refused', () => {
    const nested = errorsOf(
      raw(
        {},
        {
          template: row([
            { type: 'repeat', field: 'other', template: row() },
            { type: 'slot' },
          ]),
        },
      ),
    );
    expect(nested).toContain(
      'template.children[1].template.children[0].type: repeat is not allowed inside a repeat',
    );
    expect(nested).toContain(
      'template.children[1].template.children[1].type: slot is not allowed inside a repeat',
    );
  });

  it('slot inside a nested repeat is reported once', () => {
    const errors = errorsOf(
      raw(
        {},
        {
          template: row([
            { type: 'repeat', field: 'other', template: row([{ type: 'slot' }]) },
          ]),
        },
      ),
    );
    const slotPath =
      'template.children[1].template.children[0].template.children[0].type';
    const slotErrors = errors.filter((e) => e.startsWith(`${slotPath}:`));
    expect(slotErrors).toEqual([`${slotPath}: slot is not allowed inside a repeat`]);
  });

  it('the repeat template is checked like any node', () => {
    const errors = errorsOf(
      raw({}, { template: row([{ type: 'text', text: 3, bogus: 1 }]) }),
    );
    expect(errors).toContain(
      'template.children[1].template.children[0].bogus: unknown key: bogus',
    );
  });

  it('the preview accepts rows (list of objects) and checks each cell', () => {
    expect(parseComponent(raw({ preview: { title: 'T', rows: ROWS } })).ok).toBe(true);
    expect(checkSchema(schema, raw({ preview: { title: 'T', rows: ROWS } }))).toEqual(
      [],
    );
    expect(errorsOf(raw({ preview: { rows: ['x'] } }))).toContain(
      'preview.rows[0]: expected an object (a row)',
    );
    expect(errorsOf(raw({ preview: { rows: [{ key: true }] } }))).toContain(
      'preview.rows[0].key: expected text, a number or null',
    );
    expect(errorsOf(raw({ preview: { x: true } }))[0]).toContain('preview.x:');
  });
});

describe('cited fields', () => {
  it('collectFieldKeys counts the table field of the repeat and the expressions of the node itself, not those of the template', () => {
    const c = component({}, { visible: { $has: 'show' }, gap: { $field: 'space' } });
    expect(collectFieldKeys(c)).toEqual(['rows', 'show', 'space', 'title']);
    expect([...repeatInnerFields(c.template)].sort()).toEqual(['key', 'value']);
    expect([...referencedFields(c.template)].sort()).toEqual(
      ['rows', 'show', 'space', 'title'].sort(),
    );
  });

  it('without a repeat, repeatInnerFields is empty', () => {
    expect(repeatInnerFields({ type: 'frame', children: [text('a')] }).size).toBe(0);
  });

  it('isEmpty and truthy read the list of rows', () => {
    expect(isEmpty([])).toBe(true);
    expect(isEmpty(ROWS)).toBe(false);
    expect(truthy([])).toBe(false);
    expect(truthy(ROWS)).toBe(true);
    expect(evaluateCondition({ $has: 'rows' }, { rows: ROWS })).toBe(true);
    expect(evaluateCondition({ $has: 'rows' }, { rows: [] })).toBe(false);
  });
});

describe('expandRepeats', () => {
  it('without a repeat it returns the same objects', () => {
    const plain = component({}, {});
    const noRepeat: ComponentFile = {
      ...plain,
      template: { ...plain.template, children: [plain.template.children![0]!] },
    };
    const values: FieldValues = { title: 'x' };
    const out = expandRepeats(noRepeat, values);
    expect(hasRepeat(noRepeat.template)).toBe(false);
    expect(out.component).toBe(noRepeat);
    expect(out.values).toBe(values);
    expect(out.warnings).toEqual([]);
  });

  it('replaces the repeat with a frame holding one copy of the template per row and each row own values', () => {
    const out = expandRepeats(component(), { title: 'T', rows: ROWS });
    expect(hasRepeat(out.component.template)).toBe(false);
    const frame = out.component.template.children![1] as FrameTemplate;
    expect(frame).toMatchObject({
      type: 'frame',
      name: 'repeat',
      width: 'fill',
      height: 'hug',
      layout: { type: 'column', gap: 2 },
    });
    expect(frame.children).toHaveLength(3);
    // Each copy reads the extra fields of its own row.
    const first = frame.children![0] as FrameTemplate;
    expect(first.height).toBe('hug');
    expect(JSON.stringify(first)).toContain('$r0_0:key');
    expect(out.values['$r0_0:key']).toBe('origin');
    expect(out.values['$r0_2:value']).toBe('3');
    expect(out.values.title).toBe('T');
  });

  it('the columns inside operations and comparisons become the own field of the row (formatVersion 4)', () => {
    const c = component(
      {},
      {
        template: row([
          text('key', {
            width: { $mul: [{ $field: 'value' }, 2] },
            visible: { $gt: [{ $add: [{ $field: 'value' }, 1] }, 0] },
          }),
        ]),
      },
      4,
    );
    const out = expandRepeats(c, { rows: ROWS });
    const frame = out.component.template.children![1] as FrameTemplate;
    const json = JSON.stringify(frame.children![0]);
    expect(json).toContain('"$mul":[{"$field":"$r0_0:value"},2]');
    expect(json).toContain('"$gt":[{"$add":[{"$field":"$r0_0:value"},1]},0]');
    expect(out.values['$r0_0:value']).toBe('cart');
    expect(referencedFields(frame.children![0]).has('$r0_0:value')).toBe(true);
  });

  it('the row repeat is hug in width and fill in height; the row template is hug in width', () => {
    const out = expandRepeats(component({}, { direction: 'row' }), { rows: ROWS });
    const frame = out.component.template.children![1] as FrameTemplate;
    expect(frame).toMatchObject({
      width: 'hug',
      height: 'fill',
      layout: { type: 'row' },
    });
    expect((frame.children![0] as FrameTemplate).width).toBe('hug');
  });

  it('the width/height of the template and of the node prevail over the default', () => {
    const out = expandRepeats(
      component({}, { height: 80, template: { ...row([text('key')]), height: 20 } }),
      { rows: ROWS },
    );
    const frame = out.component.template.children![1] as FrameTemplate;
    expect(frame.height).toBe(80);
    expect((frame.children![0] as FrameTemplate).height).toBe(20);
  });

  it('only the column shadows the type field; the rest keeps reading the field', () => {
    const c = component(
      {},
      {
        template: row([text('key'), text('title')]),
      },
    );
    const out = expandRepeats(c, { title: 'T', rows: [{ key: 'a' }] });
    const body = JSON.stringify(out.component.template.children![1]);
    expect(body).toContain('$r0_0:key');
    expect(body).not.toContain('$r0_0:title');
    expect(body).toContain('"$field":"title"');
  });

  it('rewrites $has, $eq, $switch and the nested expressions', () => {
    const c = component(
      {},
      {
        template: row([
          text('key', { visible: { $has: 'value' } }),
          text('value', {
            color: {
              $if: { $eq: ['key', 'total'] },
              then: '#ff0000',
              else: { $switch: 'key', cases: { a: '#00ff00' }, default: '#000000' },
            },
          }),
        ]),
      },
    );
    const out = expandRepeats(c, { rows: [{ key: 'total', value: '1' }] });
    const body = JSON.stringify(out.component.template.children![1]);
    expect(body).toContain('"$has":"$r0_0:value"');
    expect(body).toContain('"$eq":["$r0_0:key","total"]');
    expect(body).toContain('"$switch":"$r0_0:key"');
  });

  it('two repeats in the same component do not mix the rows', () => {
    const base = raw();
    base.template.children.push({
      ...base.template.children[1],
      field: 'outras',
      template: row([text('key')]),
    });
    const parsed = parseComponent(base);
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    const out = expandRepeats(parsed.component, {
      rows: [{ key: 'a', value: 'b' }],
      outras: [{ key: 'z' }],
    });
    expect(out.values['$r0_0:key']).toBe('a');
    expect(out.values['$r1_0:key']).toBe('z');
  });

  it('sparse rows: a column missing from a row stays empty, it does not read the type field', () => {
    const out = expandRepeats(component(), {
      key: 'OF TYPE',
      rows: [{ key: 'a', value: 'b' }, { key: 'c' }],
    });
    expect(out.values['$r0_1:value']).toBeNull();
    expect(out.values['$r0_1:key']).toBe('c');
  });

  it('a column that no row brings (old project) stays empty, with no field not provided warning', () => {
    const c = component(
      {},
      {
        template: row([
          text('key', { width: 'hug' }),
          text('selected', {
            width: 'fill',
            visible: { $eq: ['selected', 'true'] },
          }),
        ]),
      },
    );
    const out = expandRepeats(c, { rows: [{ key: 'a' }, { key: 'b' }] });
    expect(out.values['$r0_0:selected']).toBeNull();
    expect(out.values['$r0_1:selected']).toBeNull();
    const drawn = instantiate(c, { title: 'T', rows: [{ key: 'a' }] }, BOX, {
      measure: approximateMeasurer,
    });
    expect(drawn.warnings.filter((w) => w.startsWith('field not provided'))).toEqual([]);
  });

  it('the table field not provided becomes a warning; provided empty or null, it does not', () => {
    expect(expandRepeats(component(), {}).warnings).toEqual([
      'field not provided: rows',
    ]);
    expect(expandRepeats(component(), { rows: null }).warnings).toEqual([]);
    expect(expandRepeats(component(), { rows: [] }).warnings).toEqual([]);
  });

  it('rowsOf e columnsOf', () => {
    expect(rowsOf(ROWS)).toEqual(ROWS);
    expect(rowsOf('x')).toEqual([]);
    expect(rowsOf(null)).toEqual([]);
    expect(
      columnsOf([
        { _id: 'R1', a: 1 },
        { b: 2, a: 3 },
      ]),
    ).toEqual(['a', 'b']);
  });
});

describe('instantiate with repeat', () => {
  it('draws the title and one row per record, stacked, with the key on the left and the value on the right', () => {
    const { root, warnings } = draw(component(), { title: 'T', rows: ROWS });
    expect(warnings).toEqual([]);
    const all = texts(root);
    expect(all.map((t) => t.text)).toEqual([
      'T',
      'origin',
      'cart',
      'total',
      '149,90',
      'items',
      '3',
    ]);
    const [, k1, v1, k2, , k3] = all;
    // Same row: key before the value, at the same y. Following rows below, with the gap.
    expect(v1!.x).toBeGreaterThan(k1!.x);
    expect(v1!.y).toBe(k1!.y);
    expect(k2!.y).toBeGreaterThan(k1!.y);
    expect(k3!.y).toBeGreaterThan(k2!.y);
    // The row height is that of the text (12) and the gap between rows, 2.
    expect(k2!.y - k1!.y).toBe(14);
    expect(k3!.y - k2!.y).toBe(14);
  });

  it('the value takes the rest of the row (fill) and the key width is that of the text', () => {
    const { root } = draw(component(), { title: 'T', rows: ROWS });
    const [, key, value] = texts(root);
    expect(value!.node.width).toBeGreaterThan(key!.node.width);
    expect(key!.x + key!.node.width + 10).toBeCloseTo(value!.x, 5);
    expect(value!.x + value!.node.width).toBeCloseTo(200 - 8, 5);
  });

  it('without rows (or with a null table) it draws only the title', () => {
    for (const rows of [[], null, undefined]) {
      const { root, warnings } = draw(component(), { title: 'T', rows });
      expect(texts(root).map((t) => t.text)).toEqual(['T']);
      expect(warnings).toEqual([]);
    }
  });

  it('the row repeat (row) places the records side by side', () => {
    const c = component({}, { direction: 'row' });
    const { root } = draw(
      c,
      { title: 'T', rows: ROWS.slice(0, 2) },
      { ...BOX, width: 400 },
    );
    const keys = texts(root).filter((t) => ['origin', 'total'].includes(t.text));
    expect(keys[1]!.x).toBeGreaterThan(keys[0]!.x);
    expect(keys[1]!.y).toBe(keys[0]!.y);
  });

  it('visible on the repeat hides the whole table', () => {
    const c = component({}, { visible: { $has: 'show' } });
    expect(
      texts(draw(c, { title: 'T', show: null, rows: ROWS }).root),
    ).toHaveLength(1);
    expect(
      texts(draw(c, { title: 'T', show: 'yes', rows: ROWS }).root),
    ).toHaveLength(7);
  });

  it('the row axis is hug: more rows, more measured height; the frame is not split with the fill ones', () => {
    const c = component();
    const measure = (rows: FieldValues[string]) =>
      measureComponent(
        c,
        { title: 'T', rows },
        { width: 200, height: null },
        { measure: approximateMeasurer },
      );
    const none = measure([]);
    const one = measure(ROWS.slice(0, 1));
    const three = measure(ROWS);
    // 8 + 12 (title) + 6 + 8 = 34 without rows (the empty repeat takes 0 but enters the gap).
    expect(none.warnings).toEqual([]);
    expect(one.height - none.height).toBeGreaterThan(0);
    expect(three.height - one.height).toBe(2 * 14);
  });

  it('the columns shadow the type fields and the type fields keep applying', () => {
    const c = component(
      {},
      { template: row([text('key'), text('title', { name: 'of type' })]) },
    );
    const { root } = draw(c, {
      title: 'OF TYPE',
      key: 'field',
      rows: [{ key: 'column' }],
    });
    expect(texts(root).map((t) => t.text)).toEqual(['OF TYPE', 'column', 'OF TYPE']);
  });

  it('a condition that cites the column chooses the branch of each row', () => {
    const c = component(
      {},
      {
        template: row([
          text('key', {
            color: { $if: { $eq: ['key', 'total'] }, then: '#ff0000', else: '#00ff00' },
          }),
        ]),
      },
    );
    const { root } = draw(c, { title: 'T', rows: ROWS });
    const fills = texts(root)
      .filter((t) => ['origin', 'total', 'items'].includes(t.text))
      .map((t) => t.node.fills[0] && 'color' in t.node.fills[0] && t.node.fills[0].color);
    expect(fills).toEqual(['#00ff00', '#ff0000', '#00ff00']);
  });

  it('the node ids are unique and stable (prefix/path.index)', () => {
    const a = ids(draw(component(), { title: 'T', rows: ROWS }).root);
    const b = ids(draw(component(), { title: 'T', rows: ROWS }).root);
    expect(new Set(a).size).toBe(a.length);
    expect(b).toEqual(a);
  });

  it('columns with numbers become text; an empty cell becomes empty text', () => {
    const { root } = draw(component(), {
      title: 'T',
      rows: [
        { key: 'n', value: 42 },
        { key: 'empty', value: null },
      ],
    });
    expect(texts(root).map((t) => t.text)).toEqual(['T', 'n', '42', 'empty', '']);
  });

  it('the content larger than the box warning applies to the rows that overflow', () => {
    const { warnings } = draw(
      component(),
      { title: 'T', rows: [...ROWS, ...ROWS, ...ROWS] },
      { ...BOX, height: 40 },
    );
    expect(warnings.some((w) => w.startsWith('content larger than the box'))).toBe(true);
  });

  it('a formatVersion 1 component (without repeat) draws as before', () => {
    const base = raw({}, {}, 1);
    base.template.children.pop();
    const parsed = parseComponent(base);
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    const { root } = draw(parsed.component, { title: 'only the title' });
    expect(texts(root).map((t) => t.text)).toEqual(['only the title']);
  });
});

describe('the drawing does not depend on the repeat being in a fixed position', () => {
  it('a repeat inside a nested frame is also expanded', () => {
    const base = raw();
    const repeat = base.template.children.pop() as TemplateNode;
    base.template.children.push({
      type: 'frame',
      name: 'box',
      layout: { type: 'column' },
      children: [repeat],
    });
    const parsed = parseComponent(base);
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    const { root } = draw(parsed.component, { title: 'T', rows: ROWS });
    expect(texts(root)).toHaveLength(7);
  });
});

// --- EX2 (format 4): `count`, `$index`, `$rows`, `$size` and anchors by expression ---------------

const num = (expr: unknown): Raw => ({
  type: 'text',
  text: expr,
  font: { size: 10, lineHeight: 12 },
});
const indexPlus1 = { $add: [{ $field: '$index' }, 1] };

/** v4 component with a `repeat` by `count` (each row shows the index + 1, except the `template`). */
function countRaw(repeat: Raw = {}, over: Raw = {}): Raw {
  return {
    format: 'mapping-component',
    formatVersion: 4,
    id: 'counting',
    name: 'Counting',
    size: { width: 200, height: 100 },
    template: {
      type: 'frame',
      layout: { type: 'column' },
      children: [
        {
          type: 'repeat',
          name: 'list',
          count: 3,
          template: row([num(indexPlus1)]),
          ...repeat,
        },
      ],
    },
    ...over,
  };
}

function countComponent(repeat: Raw = {}): ComponentFile {
  const parsed = parseComponent(countRaw(repeat));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.component;
}

const drawn = (c: ComponentFile, values: FieldValues = {}) => draw(c, values);

describe('repeat by count (format 4)', () => {
  it('count 31 with $index + 1 draws from 1 to 31', () => {
    const { root } = drawn(countComponent({ count: 31 }));
    expect(texts(root).map((t) => t.text)).toEqual(
      Array.from({ length: 31 }, (_, i) => String(i + 1)),
    );
  });

  it('count 0, 7 and 3.9 (floor)', () => {
    expect(texts(drawn(countComponent({ count: 0 })).root)).toHaveLength(0);
    expect(texts(drawn(countComponent({ count: 7 })).root)).toHaveLength(7);
    const fraction = countComponent({ count: { $add: [3, 0.9] } });
    expect(texts(drawn(fraction).root).map((t) => t.text)).toEqual(['1', '2', '3']);
  });

  it('count by expression: negative is 0, the field rules, without a value it is 0', () => {
    const negative = countComponent({ count: { $sub: [0, 5] } });
    expect(texts(drawn(negative).root)).toHaveLength(0);
    const byField = countComponent({ count: { $field: 'n' } });
    expect(texts(drawn(byField, { n: 4 }).root)).toHaveLength(4);
    expect(texts(drawn(byField, { n: '2' }).root)).toHaveLength(2);
    expect(texts(drawn(byField, {}).root)).toHaveLength(0);
  });

  it('above 1000 it draws 1000 rows with the warning naming the node', () => {
    const c = countComponent({ count: 1500, template: row([]) });
    const expanded = expandRepeats(c, {});
    expect(expanded.warnings).toEqual(['repeat limited to 1000 rows: list']);
    const wrapper = (expanded.component.template as FrameTemplate).children?.[0];
    expect((wrapper as FrameTemplate).children).toHaveLength(1000);
    expect(drawn(c).warnings).toContain('repeat limited to 1000 rows: list');
  });

  it('without a name, the warning uses "repeat"', () => {
    const raw1001 = countRaw({ count: 1001, template: row([]) });
    delete raw1001.template.children[0].name;
    const parsed = parseComponent(raw1001);
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    const c = parsed.component;
    expect(expandRepeats(c, {}).warnings).toEqual([
      'repeat limited to 1000 rows: repeat',
    ]);
  });

  it('$index reads the type field of the same name only outside the index (the index shadows)', () => {
    const c = countComponent({ count: 2 });
    const { root } = drawn(c, { $index: 'field' });
    expect(texts(root).map((t) => t.text)).toEqual(['1', '2']);
  });

  it('$index also applies in the repeat by field', () => {
    const base = raw(
      {},
      { template: row([num({ $field: '$index' }), text('key')]) },
      4,
    );
    const parsed = parseComponent(base);
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    const { root } = draw(parsed.component, { title: 'T', rows: ROWS });
    expect(texts(root).map((t) => t.text)).toEqual([
      'T',
      '0',
      'origin',
      '1',
      'total',
      '2',
      'items',
    ]);
  });

  it('in a repeat inside another the $index of the innermost applies', () => {
    const inner: Raw = {
      type: 'repeat',
      count: 2,
      direction: 'row',
      template: row([num({ $field: '$index' })]),
    };
    const outerRow = row([num({ $field: '$index' }), inner]);
    const c = countRaw({ count: 2, template: outerRow });
    // The validator refuses a repeat inside a repeat; the engine expands it anyway.
    const component = c as unknown as ComponentFile;
    const { root } = draw(component, {});
    expect(texts(root).map((t) => t.text)).toEqual(['0', '0', '1', '1', '0', '1']);
  });

  it('the index enters as an extra field of each row, not as a type field', () => {
    const { values } = expandRepeats(countComponent({ count: 2 }), {});
    expect(Object.keys(values).sort()).toEqual(['$r0_0:$index', '$r0_1:$index']);
    expect(values['$r0_1:$index']).toBe(1);
  });
});

describe('$rows', () => {
  const rowsComponent = (): ComponentFile => {
    const c = countRaw();
    c.template.children = [num({ $rows: 'rows' })];
    const parsed = parseComponent(c);
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    return parsed.component;
  };

  it('is the number of rows of the table field (0 without rows)', () => {
    const c = rowsComponent();
    expect(texts(drawn(c, { rows: ROWS }).root).map((t) => t.text)).toEqual(['3']);
    expect(texts(drawn(c, { rows: [] }).root).map((t) => t.text)).toEqual(['0']);
    expect(texts(drawn(c, {}).root).map((t) => t.text)).toEqual(['0']);
  });

  it('serves as the count of another repeat', () => {
    const parsed = parseComponent(countRaw({ count: { $rows: 'rows' } }));
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    expect(texts(drawn(parsed.component, { rows: ROWS }).root)).toHaveLength(3);
  });

  it('counts the field in referencedFields', () => {
    expect([...referencedFields({ text: { $rows: 'rows' } })]).toEqual(['rows']);
  });
});

describe('$size', () => {
  const sizeComponent = (expr: unknown): ComponentFile => {
    const c = countRaw();
    c.template.children = [num(expr)];
    const parsed = parseComponent(c);
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    return parsed.component;
  };

  it('in instantiation it is the rectangle of the instance', () => {
    const c = sizeComponent({ $size: 'width' });
    const at = (width: number, height: number) =>
      texts(draw(c, {}, { x: 0, y: 0, width, height }).root);
    expect(at(320, 40)[0]?.text).toBe('320');
    const h = sizeComponent({ $size: 'height' });
    expect(texts(draw(h, {}, { x: 0, y: 0, width: 320, height: 48 }).root)[0]?.text).toBe(
      '48',
    );
  });

  it('in measureComponent without a given size it is the size of the component', () => {
    const c = countRaw();
    c.template.width = 'hug';
    c.template.height = 'hug';
    c.template.children = [
      {
        type: 'rect',
        width: { $mul: [{ $size: 'width' }, 0.5] },
        height: { $size: 'height' },
      },
    ];
    const parsed = parseComponent(c);
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    const measured = measureComponent(
      parsed.component,
      {},
      { width: null, height: null },
      { measure: approximateMeasurer },
    );
    expect(measured.width).toBe(100);
    expect(measured.height).toBe(100);
    const given = measureComponent(
      parsed.component,
      {},
      { width: 60, height: null },
      { measure: approximateMeasurer },
    );
    expect(given.width).toBe(60);
  });
});

describe('anchors by expression', () => {
  const anchored = (anchors: Raw, width = 10): ComponentFile => {
    const c = countRaw();
    c.template.layout = { type: 'none' };
    c.template.children = [{ type: 'rect', name: 'r', width, height: 10, anchors }];
    const parsed = parseComponent(c);
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    return parsed.component;
  };
  const xOf = (c: ComponentFile, values: FieldValues, width = 200): number =>
    (draw(c, values, { x: 0, y: 0, width, height: 100 }).root.children[0] as SceneNode)
      .transform[4] as number;

  it('left by the width of the instance', () => {
    const c = anchored({ left: { $mul: [{ $size: 'width' }, 0.5] }, top: 0 });
    expect(xOf(c, {}, 200)).toBe(100);
    expect(xOf(c, {}, 300)).toBe(150);
  });

  it('right by field', () => {
    const c = anchored({ right: { $field: 'm' }, top: 0 });
    expect(xOf(c, { m: 20 })).toBe(170);
  });

  it('centerX by condition', () => {
    const c = anchored({ centerX: { $gt: [{ $field: 'n' }, 5] }, left: 7, top: 0 });
    expect(xOf(c, { n: 9 })).toBe(95);
    expect(xOf(c, { n: 2 })).toBe(7);
  });

  it('an anchor without a value counts as absent', () => {
    const c = anchored({ left: { $field: 'nothing' }, right: 30, top: 0 });
    expect(xOf(c, {})).toBe(160);
    const d = anchored({ left: { $div: [1, 0] }, top: 0 });
    expect(xOf(d, {})).toBe(0);
  });
});

describe('referencedFields and repeatInnerFields with the EX2 keys', () => {
  it('$index is not a type field', () => {
    expect([...referencedFields({ text: { $field: '$index' } })]).toEqual([]);
    expect([
      ...referencedFields({ visible: { $gt: [{ $field: '$index' }, 1] } }),
    ]).toEqual([]);
    const node = { type: 'repeat', count: 2, template: { text: { $field: '$index' } } };
    expect([...repeatInnerFields(node)]).toEqual([]);
  });

  it('$rows and what is inside an operation count', () => {
    expect([
      ...referencedFields({ w: { $mul: [{ $rows: 'a' }, { $field: 'b' }] } }),
    ]).toEqual(['a', 'b']);
  });

  it('the count of the repeat counts; the template does not', () => {
    const node = {
      type: 'repeat',
      count: { $field: 'n' },
      template: { t: { $field: 'x' } },
    };
    expect([...referencedFields(node)]).toEqual(['n']);
    expect([...repeatInnerFields({ children: [node] })]).toEqual(['x']);
  });
});

describe('validation of the repeat by count and of the EX2 keys', () => {
  const problems = (repeat: Raw = {}, version = 4): string[] => {
    const c = countRaw(repeat);
    c.formatVersion = version;
    const parsed = parseComponent(c);
    return parsed.ok ? [] : parsed.errors;
  };
  const sizeProblems = (expr: unknown, version = 4): string[] => {
    const c = countRaw();
    c.formatVersion = version;
    c.template.children = [num(expr)];
    const parsed = parseComponent(c);
    return parsed.ok ? [] : parsed.errors;
  };

  it('exactly one of count and field', () => {
    expect(problems({})).toEqual([]);
    expect(problems({ field: 'rows' }).join('\n')).toContain(
      'template.children[0]: use count or field, not both',
    );
    const neither = countRaw();
    delete neither.template.children[0].count;
    const parsed = parseComponent(neither);
    expect(parsed.ok ? [] : parsed.errors).toContain(
      'template.children[0].field: required field',
    );
  });

  it('literal count negative or non-integer', () => {
    expect(problems({ count: -1 }).join('\n')).toContain(
      'template.children[0].count: expected an integer greater than or equal to 0',
    );
    expect(problems({ count: 2.5 }).join('\n')).toContain(
      'template.children[0].count: expected an integer greater than or equal to 0',
    );
    expect(problems({ count: { $field: 'n' } })).toEqual([]);
  });

  it('$size only accepts width or height', () => {
    expect(sizeProblems({ $size: 'width' })).toEqual([]);
    expect(sizeProblems({ $size: 'depth' }).join('\n')).toContain(
      'template.children[0].text.$size: expected "width" or "height"',
    );
  });

  it('$rows asks for the name of a field', () => {
    expect(sizeProblems({ $rows: 'rows' })).toEqual([]);
    expect(sizeProblems({ $rows: 3 }).join('\n')).toContain(
      'template.children[0].text.$rows: expected a field key',
    );
  });

  it('$index outside a repeat is refused', () => {
    expect(sizeProblems({ $field: '$index' }).join('\n')).toContain(
      'template.children[0].text.$field: $index is only valid inside a repeat',
    );
    expect(problems({ gap: { $field: '$index' } }).join('\n')).toContain(
      '$index is only valid inside a repeat',
    );
  });

  it('in versions 1 to 3 all of this gives only allowed with formatVersion 4', () => {
    for (const version of [2, 3]) {
      expect(problems({}, version)).toContain(
        'template.children[0].count: only allowed with formatVersion 4',
      );
      expect(sizeProblems({ $size: 'width' }, version)).toContain(
        'template.children[0].text.$size: only allowed with formatVersion 4',
      );
      expect(sizeProblems({ $rows: 'a' }, version)).toContain(
        'template.children[0].text.$rows: only allowed with formatVersion 4',
      );
    }
    const c = countRaw({ field: 'rows' });
    delete c.template.children[0].count;
    c.formatVersion = 3;
    c.template.children[0].template = row([num({ $field: '$index' })]);
    const parsed = parseComponent(c);
    expect(parsed.ok ? [] : parsed.errors).toContain(
      'template.children[0].template.children[0].text.$field: only allowed with formatVersion 4',
    );
  });

  it('anchors with an expression only in version 4', () => {
    const c = countRaw();
    c.template.layout = { type: 'none' };
    c.template.children = [
      {
        type: 'rect',
        width: 4,
        height: 4,
        anchors: { left: { $field: 'x' }, centerX: { $has: 'y' } },
      },
    ];
    expect(parseComponent(c).ok).toBe(true);
    c.formatVersion = 3;
    const parsed = parseComponent(c);
    expect(parsed.ok ? [] : parsed.errors).toEqual([
      'template.children[0].anchors.left: only allowed with formatVersion 4',
      'template.children[0].anchors.centerX: only allowed with formatVersion 4',
    ]);
  });

  it('an anchor with an invalid literal is still an error', () => {
    const c = countRaw();
    c.template.layout = { type: 'none' };
    c.template.children = [{ type: 'rect', anchors: { left: 'x', centerX: 3 } }];
    const parsed = parseComponent(c);
    const errors = parsed.ok ? [] : parsed.errors;
    expect(errors).toContain('template.children[0].anchors.left: expected a number');
    expect(errors).toContain('template.children[0].anchors.centerX: expected a boolean');
  });
});

describe('the JSON schema knows the EX2 keys', () => {
  it('repeat by count, $rows, $size and anchors by expression', () => {
    expect(checkSchema(schema, countRaw())).toEqual([]);
    expect(checkSchema(schema, countRaw({ count: { $rows: 'rows' } }))).toEqual([]);
    const c = countRaw();
    c.template.layout = { type: 'none' };
    c.template.children = [
      {
        type: 'rect',
        width: { $size: 'width' },
        height: 4,
        anchors: {
          left: { $mul: [{ $size: 'width' }, 0.5] },
          centerY: { $gt: [{ $rows: 'a' }, 2] },
        },
      },
    ];
    expect(checkSchema(schema, c)).toEqual([]);
  });

  it('the repeat requires exactly one of field and count', () => {
    expect(checkSchema(schema, countRaw({ field: 'rows' })).length).toBeGreaterThan(0);
    const neither = countRaw();
    delete neither.template.children[0].count;
    expect(checkSchema(schema, neither).length).toBeGreaterThan(0);
  });

  it('$size refuses another value', () => {
    const c = countRaw();
    c.template.children = [num({ $size: 'depth' })];
    expect(checkSchema(schema, c).length).toBeGreaterThan(0);
  });
});

describe('findings of the EX2 review', () => {
  it('count by $size follows the width of the instance', () => {
    const c = countComponent({ count: { $div: [{ $size: 'width' }, 20] } });
    const at = (width: number) =>
      texts(draw(c, {}, { x: 0, y: 0, width, height: 100 }).root);
    expect(at(100)).toHaveLength(5);
    expect(at(200)).toHaveLength(10);
  });

  it('$index in $eq, $has and $switch is not a type field', () => {
    expect([...referencedFields({ v: { $eq: ['$index', 0] } })]).toEqual([]);
    expect([...referencedFields({ v: { $has: '$index' } })]).toEqual([]);
    expect([...referencedFields({ v: { $switch: '$index', cases: {} } })]).toEqual([]);
  });

  it('the first row by $eq of the index draws only row 0', () => {
    const c = countComponent({
      count: 3,
      template: row([{ ...num('x'), visible: { $eq: ['$index', 0] } }]),
    });
    expect(texts(drawn(c).root).map((t) => t.text)).toEqual(['x']);
  });
});

describe('repeat: span and weight go to the generated frame (code-review of L3)', () => {
  it('the generated frame inherits span and weight from the repeat', () => {
    const c = {
      format: 'mapping-component',
      formatVersion: 4,
      id: 'sw',
      name: 'Sw',
      size: { width: 100, height: 100 },
      template: {
        type: 'frame',
        children: [
          { type: 'repeat', count: 2, span: 2, weight: 3, template: { type: 'frame' } },
        ],
      },
    } as unknown as ComponentFile;
    const out = expandRepeats(c, {});
    const frame = out.component.template.children![0] as FrameTemplate & {
      span?: number;
      weight?: number;
    };
    expect(frame.span).toBe(2);
    expect(frame.weight).toBe(3);
  });
});

describe('repeat.layout (L3, decision 14 of #1078)', () => {
  const OPTIONS = [{ label: 'A' }, { label: 'Average' }, { label: 'Yes' }];
  const BOX400: Box = { x: 0, y: 0, width: 400, height: 100 };

  /** A formatVersion 4 component with the `repeat` in a row (without going through the validator). */
  function v4(repeat: Raw): ComponentFile {
    return {
      format: 'mapping-component',
      formatVersion: 4,
      id: 'seg',
      name: 'Seg',
      size: { width: 400, height: 100 },
      template: {
        type: 'frame',
        name: 'root',
        layout: { type: 'row' },
        children: [{ type: 'repeat', name: 'seg', ...repeat }],
      },
    } as unknown as ComponentFile;
  }

  /** Position and size of the `cell` frames, in order. */
  function cells(c: ComponentFile, values: FieldValues, box: Box = BOX400) {
    const { root } = draw(c, values, box);
    const out: { x: number; y: number; width: number; height: number }[] = [];
    const visit = (node: SceneNode, ox: number, oy: number): void => {
      const x = ox + node.transform[4];
      const y = oy + node.transform[5];
      if (node.name === 'cell') out.push({ x, y, width: node.width, height: node.height });
      if (node.type === 'frame') for (const child of node.children) visit(child, x, y);
    };
    visit(root, 0, 0);
    return out;
  }

  const labelCell: Raw = {
    type: 'frame',
    name: 'cell',
    layout: { type: 'row', padding: 10 },
    children: [text('label', { font: { size: 14, lineHeight: 16 } })],
  };

  it('grid with columns { $rows } and width hug: equal segments by the widest label', () => {
    const c = v4({
      field: 'options',
      width: 'hug',
      layout: { type: 'grid', columns: { $rows: 'options' } },
      template: labelCell,
    });
    const placed = cells(c, { options: OPTIONS });
    // "Average": 7 × 7.7 = 53.9 + 20 of padding.
    const wide = 7 * 7.7 + 20;
    expect(placed).toHaveLength(3);
    for (const [i, cell] of placed.entries()) {
      expect(cell.width).toBeCloseTo(wide, 9);
      expect(cell.x).toBeCloseTo(i * wide, 9);
      expect(cell.y).toBe(0);
    }
    const { warnings } = draw(c, { options: OPTIONS }, BOX400);
    expect(warnings).toEqual([]);
  });

  it('the template cell is fill in the cell; the grid repeat hugs the height', () => {
    const c = v4({
      field: 'options',
      width: 'hug',
      layout: { type: 'grid', columns: 2, gap: 4, lineGap: 6 },
      template: labelCell,
    });
    const placed = cells(c, { options: OPTIONS });
    // 2 columns × 2 rows (the last with 1); the row has the content height (16 + 20).
    expect(placed.map((p) => p.height)).toEqual([36, 36, 36]);
    expect(placed[2]).toMatchObject({ x: 0, y: 36 + 6 });
    expect(placed[1]!.x).toBeCloseTo(placed[0]!.width + 4, 9);
  });

  it('the width of the repeat itself rules: the tracks divide the width', () => {
    const c = v4({
      field: 'options',
      width: 300,
      layout: { type: 'grid', columns: 3 },
      template: labelCell,
    });
    expect(cells(c, { options: OPTIONS }).map((p) => p.width)).toEqual([100, 100, 100]);
  });

  it('layout row with gap is equivalent to direction row + gap', () => {
    const base = { field: 'options', height: 'hug' };
    const tpl = { ...labelCell, width: 'hug' };
    const withLayout = cells(
      v4({ ...base, layout: { type: 'row', gap: 5 }, template: tpl }),
      { options: OPTIONS },
    );
    const withDirection = cells(
      v4({ ...base, direction: 'row', gap: 5, template: tpl }),
      { options: OPTIONS },
    );
    expect(withLayout).toEqual(withDirection);
    expect(withLayout[1]!.x).toBeCloseTo(withLayout[0]!.width + 5, 9);
  });

  it('layout row with align end aligns the cells at the bottom', () => {
    const tpl = {
      type: 'frame',
      name: 'cell',
      width: 20,
      height: { $field: 'h' },
      layout: { type: 'row' },
      children: [],
    };
    const c = v4({
      field: 'options',
      height: 'hug',
      layout: { type: 'row', align: 'end' },
      template: tpl,
    });
    const placed = cells(c, { options: [{ h: 10 }, { h: 30 }] });
    expect(placed.map((p) => p.y)).toEqual([20, 0]);
    const start = cells(
      v4({
        field: 'options',
        height: 'hug',
        layout: { type: 'row' },
        template: tpl,
      }),
      { options: [{ h: 10 }, { h: 30 }] },
    );
    expect(start.map((p) => p.y)).toEqual([0, 0]);
  });

  it('layout column with gap is equivalent to direction column + gap', () => {
    const tpl = { ...labelCell, height: 'hug' };
    const a = cells(
      v4({ field: 'options', layout: { type: 'column', gap: 3 }, template: tpl }),
      { options: OPTIONS },
    );
    const b = cells(v4({ field: 'options', direction: 'column', gap: 3, template: tpl }), {
      options: OPTIONS,
    });
    expect(a).toEqual(b);
  });

  it('expandRepeats takes the layout to the generated frame, without loose direction or gap', () => {
    const layout = { type: 'grid', columns: 2, gap: 4 };
    const c = v4({ field: 'options', layout, template: labelCell });
    const expanded = expandRepeats(c, { options: OPTIONS });
    const wrapper = (expanded.component.template as FrameTemplate).children?.[0];
    expect((wrapper as FrameTemplate).layout).toEqual(layout);
    expect((wrapper as FrameTemplate).children).toHaveLength(3);
  });

  it('without layout, the generated frame is the usual one (direction + gap)', () => {
    const c = v4({ field: 'options', direction: 'row', gap: 5, template: labelCell });
    const expanded = expandRepeats(c, { options: OPTIONS });
    const wrapper = (expanded.component.template as FrameTemplate).children?.[0];
    expect((wrapper as FrameTemplate).layout).toEqual({ type: 'row', gap: 5 });
  });
});
