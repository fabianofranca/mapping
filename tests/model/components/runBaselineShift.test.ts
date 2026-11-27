// RT2 of #2916: `baselineShift` on a rich-text run (v4): px or a percentage of the run's size,
// resolved by the engine to px (`SceneTextRun.baselineShift`); the drawing only, never the measurement.
import { describe, expect, it } from 'vitest';
import type {
  ComponentFile,
  FieldValues,
} from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
  measureComponent,
} from '../../../src/model/components/instantiate';
import { validateComponent } from '../../../src/model/components/parseComponent';
import { walk, type TextNode } from '../../../src/model/components/scene';

const V4 = 'only allowed with formatVersion 4';

function component(runs: unknown, version = 4): Record<string, unknown> {
  return {
    format: 'mapping-component',
    formatVersion: version,
    id: 'c',
    name: 'C',
    size: { width: 100, height: 40 },
    template: { type: 'frame', children: [{ type: 'text', runs }] },
  };
}

const shifted = (baselineShift: unknown, version = 4) =>
  validateComponent(component([{ text: 'x', baselineShift }], version));

describe('parse of runs[i].baselineShift', () => {
  it.each([[4], [-2.5], ['33%'], ['-20%'], [{ $field: 'rise' }]])(
    'accepts %j',
    (value) => {
      expect(shifted(value)).toEqual([]);
    },
  );

  it.each([['abc'], ['33'], [true]])('%j is not a number or a percentage', (value) => {
    expect(shifted(value)).toEqual([
      'template.children[0].runs[0].baselineShift: expected a number or a percentage ("33%")',
    ]);
  });

  it('in formatVersion 3 it is only allowed with formatVersion 4', () => {
    expect(shifted('33%', 3)).toContain(`template.children[0].runs: ${V4}`);
  });
});

function file(runs: unknown[], extra: Record<string, unknown> = {}): ComponentFile {
  return {
    format: 'mapping-component',
    formatVersion: 4,
    id: 'r',
    name: 'R',
    size: { width: 100, height: 40 },
    template: {
      type: 'frame',
      layout: { type: 'none' },
      children: [
        {
          type: 'text',
          name: 't',
          anchors: { left: 0, top: 0 },
          width: 100,
          height: 'hug',
          font: { size: 12 },
          runs,
          ...extra,
        },
      ],
    } as ComponentFile['template'],
  };
}

function build(f: ComponentFile, values: FieldValues = {}) {
  const { height } = measureComponent(
    f,
    values,
    { width: 100, height: null },
    { measure: approximateMeasurer },
  );
  const result = instantiate(
    f,
    values,
    { x: 0, y: 0, width: 100, height },
    { measure: approximateMeasurer },
  );
  const text = [...walk(result.root)].find((n): n is TextNode => n.type === 'text');
  if (!text) throw new Error('no text node');
  return { text, height, warnings: result.warnings };
}

describe('the engine resolves baselineShift to px', () => {
  it('a number is px', () => {
    const { text } = build(file([{ text: 'a', baselineShift: 5 }, { text: 'b' }]));
    expect(text.runs?.[0]?.baselineShift).toBe(5);
    expect(text.runs?.[1]?.baselineShift).toBeUndefined();
  });

  it('a percentage is of the run size ("33%" of 12 is 3.96)', () => {
    const { text } = build(file([{ text: 'a', baselineShift: '33%' }]));
    expect(text.runs?.[0]?.baselineShift).toBeCloseTo(3.96, 10);
  });

  it('a percentage uses the run own size, and a negative one goes down', () => {
    const { text } = build(file([{ text: 'a', size: 20, baselineShift: '-20%' }]));
    expect(text.runs?.[0]?.baselineShift).toBeCloseTo(-4, 10);
  });

  it('an invalid value from an expression is engine.invalidValue and 0', () => {
    const { text, warnings } = build(
      file([{ text: 'a', baselineShift: { $field: 'r' } }]),
      {
        r: 'abc',
      },
    );
    expect(text.runs?.[0]?.baselineShift ?? 0).toBe(0);
    expect(warnings).toContain('invalid value in baselineShift: abc');
  });
});

describe('the measurement does not change', () => {
  const plain = [{ text: 'Water is H' }, { text: '2' }, { text: 'O and more text here' }];
  const withShift = [
    { text: 'Water is H' },
    { text: '2', size: 8, baselineShift: '-33%' },
    { text: 'O and more text here' },
  ];
  const noShift = [
    { text: 'Water is H' },
    { text: '2', size: 8 },
    { text: 'O and more text here' },
  ];

  it('hug height, the lines and the pieces are the same with and without the shift', () => {
    const a = build(file(noShift));
    const b = build(file(withShift));
    expect(b.height).toBe(a.height);
    expect(b.text.runLayout).toEqual(a.text.runLayout);
    expect(b.text.text).toBe(a.text.text);
    expect(build(file(plain)).text.runs).toHaveLength(3);
  });

  it('$lines counts the same', () => {
    const lines = (runs: unknown[]) => build(file(runs), {}).text.runLayout?.lines.length;
    expect(lines(withShift)).toBe(lines(noShift));
  });
});
