// RT5 of #2916: runs from a `table` field. A `runs` item `{ "field", "template": { …run… } }` gives
// one run per row, between the fixed ones: parse, expansion (`expandRepeats`) and layout.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkSchema } from '../../support/jsonSchema';
import type {
  ComponentFile,
  FieldValues,
} from '../../../src/model/components/componentFormat';
import type { IconSet } from '../../../src/model/components/icons';
import {
  approximateMeasurer,
  instantiate,
  measureComponent,
} from '../../../src/model/components/instantiate';
import {
  collectFieldKeys,
  parseComponent,
  validateComponent,
} from '../../../src/model/components/parseComponent';
import { referencedFields } from '../../../src/model/components/expressions';
import { expandRepeats, hasRepeat } from '../../../src/model/components/repeat';
import { walk, type TextNode } from '../../../src/model/components/scene';

const V4 = 'only allowed with formatVersion 4';

type Raw = Record<string, unknown>;

function component(runs: unknown, version = 4, extra: Raw = {}): Raw {
  return {
    format: 'mapping-component',
    formatVersion: version,
    id: 'c',
    name: 'C',
    size: { width: 100, height: 60 },
    template: {
      type: 'frame',
      layout: { type: 'none' },
      children: [
        {
          type: 'text',
          anchors: { left: 0, top: 0 },
          width: 100,
          height: 'hug',
          runs,
          font: { size: 14, lineHeight: 16.8 },
          ...extra,
        },
      ],
    },
  };
}

const TABLE = { field: 'pieces', template: { text: { $field: 'text' } } };

const errors = (runs: unknown, version = 4): string[] =>
  validateComponent(component(runs, version));

describe('parse of a runs table item', () => {
  it('{ field, template } is valid between fixed runs', () => {
    expect(errors([{ text: 'Hello ' }, TABLE, { text: ' end' }])).toEqual([]);
    expect(parseComponent(component([TABLE])).ok).toBe(true);
  });

  it('the template is a text run with expressions or an icon run', () => {
    const style = { text: { $field: 'text' }, weight: { $field: 'weight' } };
    expect(errors([{ field: 'pieces', template: style }])).toEqual([]);
    expect(errors([{ field: 'pieces', template: { icon: 'check' } }])).toEqual([]);
  });

  it('the template is checked like a run (an unknown key is an error inside it)', () => {
    expect(errors([{ field: 'pieces', template: { text: 'a', bold: true } }])).toEqual([
      'template.children[0].runs[0].template.bold: unknown key: bold',
    ]);
  });

  it('a key other than field and template is an unknown key', () => {
    expect(errors([{ ...TABLE, count: 3 }])).toEqual([
      'template.children[0].runs[0].count: unknown key: count',
    ]);
  });

  it('field must be text', () => {
    expect(errors([{ field: 3, template: { text: 'a' } }])).toEqual([
      'template.children[0].runs[0].field: expected text',
    ]);
  });

  it('template is required', () => {
    expect(errors([{ field: 'pieces' }])).toEqual([
      'template.children[0].runs[0].template: required field',
    ]);
  });

  it('field is required next to template', () => {
    expect(errors([{ template: { text: 'a' } }])).toEqual([
      'template.children[0].runs[0].field: required field',
    ]);
  });

  it('a runs table inside the template of a repeat is an error', () => {
    const raw = component([{ text: 'x' }]);
    raw.template = {
      type: 'frame',
      children: [
        {
          type: 'repeat',
          field: 'rows',
          template: {
            type: 'frame',
            children: [{ type: 'text', runs: [TABLE] }],
          },
        },
      ],
    };
    expect(validateComponent(raw)).toEqual([
      'template.children[0].template.children[0].runs[0]: a runs table cannot be inside a repeat',
    ]);
  });

  it('formatVersion 3 refuses the item, at its path', () => {
    const found = errors([TABLE], 3);
    expect(found).toContain(`template.children[0].runs: ${V4}`);
  });

  it('collectFieldKeys counts the table field, not the template columns', () => {
    const raw = component([TABLE, { text: { $field: 'suffix' } }]);
    const parsed = parseComponent(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect([...collectFieldKeys(parsed.component)].sort()).toEqual(['pieces', 'suffix']);
  });

  it('$index is valid in the template of a runs table, and outside one it is not', () => {
    const inside = [{ field: 'pieces', template: { text: { $field: '$index' } } }];
    expect(errors(inside)).toEqual([]);
    expect(errors([{ text: { $field: '$index' } }])).toEqual([
      'template.children[0].runs[0].text.$field: $index is only valid inside a repeat',
    ]);
  });

  it('the color and family warnings read the template of the item', () => {
    const raw = component([
      {
        field: 'pieces',
        template: { text: 'a', color: '#12', family: 'Inter, "aberta' },
      },
    ]);
    const parsed = parseComponent(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const paths = parsed.warnings.map((w) => w.path);
    expect(paths).toContain('template.children[0].runs[0].template.color');
    expect(paths).toContain('template.children[0].runs[0].template.family');
  });

  it('the JSON schema accepts the item and refuses an unknown key in it', () => {
    const schema = JSON.parse(readFileSync('docs/component.schema.json', 'utf8'));
    const ok = component([{ text: 'a' }, TABLE]);
    const bad = component([{ ...TABLE, count: 2 }]);
    expect(checkSchema(schema, ok)).toEqual([]);
    expect(checkSchema(schema, bad).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------------------
// Expansion
// ---------------------------------------------------------------------------------------

const asFile = (raw: Raw): ComponentFile => raw as unknown as ComponentFile;

const ROWS = [{ text: 'one' }, { text: 'two' }, { text: 'three' }];

/** The runs of the first text node of the expanded component. */
function expandedRuns(
  runs: unknown,
  values: FieldValues,
  extra: Raw = {},
): { runs: Record<string, unknown>[]; values: FieldValues; warnings: readonly string[] } {
  const out = expandRepeats(asFile(component(runs, 4, extra)), values);
  const frame = out.component.template as unknown as { children: Raw[] };
  return {
    runs: frame.children[0]!.runs as Record<string, unknown>[],
    values: out.values,
    warnings: out.warnings,
  };
}

describe('expandRepeats: runs table', () => {
  it('without a runs table it returns the same objects', () => {
    const file = asFile(component([{ text: 'a' }, { text: 'b' }]));
    const values: FieldValues = { x: 1 };
    const out = expandRepeats(file, values);
    expect(out.component).toBe(file);
    expect(out.values).toBe(values);
    expect(out.warnings).toEqual([]);
  });

  it('hasRepeat sees a text node with a runs table item', () => {
    const file = asFile(component([TABLE]));
    expect(hasRepeat(file.template)).toBe(true);
  });

  it('3 rows give 3 runs in order, between the fixed ones', () => {
    const out = expandedRuns([{ text: 'A ' }, TABLE, { text: ' Z' }], {
      pieces: ROWS,
    });
    expect(out.runs).toHaveLength(5);
    expect(out.runs[0]).toEqual({ text: 'A ' });
    expect(out.runs[4]).toEqual({ text: ' Z' });
    expect(out.runs.slice(1, 4).map((r) => r.text)).toEqual([
      { $field: '$r0_0:text' },
      { $field: '$r0_1:text' },
      { $field: '$r0_2:text' },
    ]);
    expect(out.values['$r0_0:text']).toBe('one');
    expect(out.values['$r0_2:text']).toBe('three');
  });

  it('a column shadows a type field of the same name', () => {
    const out = expandedRuns([TABLE, { text: { $field: 'text' } }], {
      pieces: ROWS.slice(0, 1),
      text: 'type field',
    });
    expect(out.runs).toEqual([
      { text: { $field: '$r0_0:text' } },
      { text: { $field: 'text' } },
    ]);
    expect(out.values['$r0_0:text']).toBe('one');
    expect(out.values.text).toBe('type field');
  });

  it('$index is the index of the row', () => {
    const out = expandedRuns(
      [{ field: 'pieces', template: { text: { $field: '$index' } } }],
      { pieces: ROWS },
    );
    expect(out.runs).toHaveLength(3);
    expect([0, 1, 2].map((i) => out.values[`$r0_${i}:$index`])).toEqual([0, 1, 2]);
  });

  it('an empty table gives no run', () => {
    const out = expandedRuns([{ text: 'A' }, TABLE, { text: 'Z' }], { pieces: [] });
    expect(out.runs).toEqual([{ text: 'A' }, { text: 'Z' }]);
    expect(out.warnings).toEqual([]);
  });

  it('a table that is the only item and has no rows leaves an empty text', () => {
    const raw = component([TABLE]);
    const nodes = textNodes(raw, { pieces: [] }, 100);
    expect(nodes[0]!.text).toBe('');
  });

  it('a field not provided gives engine.fieldMissing and no run', () => {
    const file = asFile(component([{ text: 'A' }, TABLE]));
    const out = expandRepeats(file, {});
    expect(out.messages.map((m) => m.code)).toEqual(['engine.fieldMissing']);
    const frame = out.component.template as unknown as { children: Raw[] };
    expect(frame.children[0]!.runs).toEqual([{ text: 'A' }]);
  });

  it('two runs tables get their own rows', () => {
    const out = expandedRuns(
      [TABLE, { field: 'other', template: { text: { $field: 'text' } } }],
      { pieces: [{ text: 'p' }], other: [{ text: 'o' }] },
    );
    expect(out.runs).toEqual([
      { text: { $field: '$r0_0:text' } },
      { text: { $field: '$r1_0:text' } },
    ]);
    expect(out.values['$r0_0:text']).toBe('p');
    expect(out.values['$r1_0:text']).toBe('o');
  });

  it('operations inside the template read the row (the same scoping as a repeat)', () => {
    const template = {
      text: { $field: 'text' },
      weight: { $switch: 'style', cases: { b: 700 }, default: 400 },
    };
    const out = expandedRuns([{ field: 'pieces', template }], {
      pieces: [
        { text: 'a', style: 'b' },
        { text: 'c', style: 'n' },
      ],
    });
    expect(out.runs[0]!.weight).toMatchObject({ $switch: '$r0_0:style' });
    expect(out.runs[1]!.weight).toMatchObject({ $switch: '$r0_1:style' });
  });
});

// ---------------------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------------------

const ICONS: IconSet = {
  viewBox: [24, 24],
  icons: {
    check: { paths: [{ d: 'M5 12l5 5L20 7', stroke: true, width: 2, cap: 'round' }] },
  },
};

function textNodes(raw: Raw, values: FieldValues, width: number): TextNode[] {
  const options = { measure: approximateMeasurer, icons: ICONS };
  const { height } = measureComponent(
    asFile(raw),
    values,
    { width, height: null },
    options,
  );
  const { root } = instantiate(
    asFile(raw),
    values,
    { x: 0, y: 0, width, height },
    options,
  );
  return [...walk(root)].filter((n): n is TextNode => n.type === 'text');
}

const lineTexts = (node: TextNode): string[] =>
  (node.runLayout?.lines ?? []).map((l) => l.pieces.map((p) => p.text).join(''));

describe('layout of a runs table', () => {
  const rows = [{ text: 'alpha beta ' }, { text: 'gamma delta epsilon ' }];

  it('the rows wrap as ONE text, by word, with the fixed runs', () => {
    const viaTable = textNodes(
      component([{ text: 'start ' }, TABLE, { text: 'end' }]),
      { pieces: rows },
      100,
    )[0]!;
    const literal = textNodes(
      component([
        { text: 'start ' },
        { text: rows[0]!.text },
        { text: rows[1]!.text },
        { text: 'end' },
      ]),
      {},
      100,
    )[0]!;
    expect(lineTexts(viaTable)).toEqual(lineTexts(literal));
    // A long row breaks in the middle: no row jumps whole to the next line.
    const lines = lineTexts(viaTable);
    expect(lines.length).toBeGreaterThan(2);
    expect(lines.some((l) => l.includes('delta') && l.includes('gamma'))).toBe(false);
    expect(lines.join(' ').replace(/\s+/g, ' ').trim()).toBe(
      'start alpha beta gamma delta epsilon end',
    );
  });

  it('a row that does not fit in the rest of the line starts there and goes on in the next', () => {
    const node = textNodes(
      component([
        { text: 'start ' },
        { field: 'pieces', template: { text: { $field: 'text' } } },
      ]),
      { pieces: [{ text: 'one two three four five' }] },
      100,
    )[0]!;
    const lines = lineTexts(node);
    expect(lines[0]!.startsWith('start one')).toBe(true);
    expect(lines.length).toBeGreaterThan(1);
  });

  it('an icon run template gives one icon per row', () => {
    const node = textNodes(
      component([{ text: 'ok ' }, { field: 'pieces', template: { icon: 'check' } }]),
      { pieces: [{}, {}, {}] },
      300,
    )[0]!;
    const pieces = (node.runLayout?.lines ?? []).flatMap((l) => l.pieces);
    expect(pieces.filter((p) => p.inline === true)).toHaveLength(3);
  });

  it('a style column picks the weight per row', () => {
    const template = {
      text: { $field: 'text' },
      weight: { $switch: 'style', cases: { b: 700 }, default: 400 },
    };
    const node = textNodes(
      component([{ field: 'pieces', template }]),
      {
        pieces: [
          { text: 'plain ', style: 'n' },
          { text: 'bold', style: 'b' },
        ],
      },
      300,
    )[0]!;
    const pieces = (node.runLayout?.lines ?? []).flatMap((l) => l.pieces);
    expect(pieces.length).toBeGreaterThan(1);
    expect(node.runs?.map((r) => [r.text, r.fontWeight])).toEqual([
      ['plain ', 400],
      ['bold', 700],
    ]);
  });
});

describe('a runs table out of the `runs` list', () => {
  it('a `let` object with field and template is not read as a runs table', () => {
    const letNode = { let: { field: 'title', template: { $field: 'x' } } };
    expect(
      [...referencedFields({ type: 'frame', ...letNode, children: [] })].sort(),
    ).toEqual(['x']);
  });
});
