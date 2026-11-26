import { describe, expect, it } from 'vitest';
import { parseIconsFile } from '../../../src/model/components/icons';
import { parseComponent } from '../../../src/model/components/parseComponent';

/** A minimal valid component (format 4) whose template is `template`. */
function componentWith(template: Record<string, unknown>): Record<string, unknown> {
  return {
    format: 'mapping-component',
    formatVersion: 4,
    id: 'swatch',
    name: 'Swatch',
    description: 'Colors under test.',
    size: { width: 100, height: 40 },
    preview: {},
    template,
  };
}

function warningsOf(template: Record<string, unknown>) {
  const result = parseComponent(componentWith(template));
  if (!result.ok) throw new Error(result.errors.join('; '));
  return result.warnings.filter((w) => w.code === 'component.colorUnknown');
}

const frame = (extra: Record<string, unknown>): Record<string, unknown> => ({
  type: 'frame',
  ...extra,
});

describe('component.colorUnknown: one case per place', () => {
  it('a node fill', () => {
    expect(warningsOf(frame({ fill: 'banana' }))).toEqual([
      {
        path: 'template.fill',
        message:
          'not a color of the format: "banana" (use #rrggbb, rgb(), hsl(), transparent or none)',
        code: 'component.colorUnknown',
        params: { value: '"banana"' },
      },
    ]);
  });

  it('a gradient stop', () => {
    const fill = {
      type: 'linear',
      angle: 90,
      stops: [
        { offset: 0, color: '#ff0000' },
        { offset: 1, color: 'red' },
      ],
    };
    expect(warningsOf(frame({ fill })).map((w) => w.path)).toEqual([
      'template.fill.stops[1].color',
    ]);
  });

  it('stroke.color', () => {
    const stroke = { color: 'red', width: 1 };
    expect(warningsOf(frame({ stroke })).map((w) => w.path)).toEqual([
      'template.stroke.color',
    ]);
  });

  it('the color of a text', () => {
    const child = { type: 'text', text: 'x', color: 'red' };
    expect(warningsOf(frame({ children: [child] })).map((w) => w.path)).toEqual([
      'template.children[0].color',
    ]);
  });

  it('the color of an icon node', () => {
    const child = { type: 'icon', name: 'back', color: 'red' };
    expect(warningsOf(frame({ children: [child] })).map((w) => w.path)).toEqual([
      'template.children[0].color',
    ]);
  });

  it('shadow.color, an object and an item of a list', () => {
    expect(
      warningsOf(frame({ shadow: { color: 'red', x: 0, y: 1, blur: 2 } })).map(
        (w) => w.path,
      ),
    ).toEqual(['template.shadow.color']);
    const list = [
      { color: '#00000033', x: 0, y: 1, blur: 2 },
      { color: 'red', x: 0, y: 2, blur: 4 },
    ];
    expect(warningsOf(frame({ shadow: list })).map((w) => w.path)).toEqual([
      'template.shadow[1].color',
    ]);
  });

  it("a run's color and background", () => {
    const child = {
      type: 'text',
      runs: [{ text: 'tag', color: 'red', background: 'blue' }],
    };
    expect(warningsOf(frame({ children: [child] })).map((w) => w.path)).toEqual([
      'template.children[0].runs[0].color',
      'template.children[0].runs[0].background',
    ]);
  });

  it('a node inside a template of a repeat and a slot fallback', () => {
    const slot = { type: 'slot', name: 'content', fallback: frame({ fill: 'red' }) };
    expect(warningsOf(frame({ children: [slot] })).map((w) => w.path)).toEqual([
      'template.children[0].fallback.fill',
    ]);
  });
});

describe('component.colorUnknown: what does not warn', () => {
  it.each(['none', 'transparent', 'NONE', '#fff', '#12345678', 'rgb(1, 2, 3)'])(
    'the format color %s',
    (fill) => {
      expect(warningsOf(frame({ fill }))).toEqual([]);
    },
  );

  it.each(['hsl(210, 100%, 50%)', 'hsla(0, 100%, 50%, 0.5)', 'hsl(0.5turn 100% 50%)'])(
    'the hsl color %s',
    (fill) => {
      expect(warningsOf(frame({ fill }))).toEqual([]);
    },
  );

  it('a $switch with "banana" in a case: expressions are not checked', () => {
    const fill = { $switch: 'variant', cases: { a: 'banana' }, default: '#ffffff' };
    expect(warningsOf(frame({ fill }))).toEqual([]);
  });

  it('a $field and an $if', () => {
    const stroke = {
      color: { $if: { $field: 'on' }, then: 'banana', else: 'none' },
      width: 1,
    };
    expect(warningsOf(frame({ fill: { $field: 'tint' }, stroke }))).toEqual([]);
  });

  it('is a warning only: the component stays ok', () => {
    const result = parseComponent(componentWith(frame({ fill: 'banana' })));
    expect(result.ok).toBe(true);
  });
});

describe('iconsFile.colorUnknown', () => {
  const iconsFile = (path: Record<string, unknown>): Record<string, unknown> => ({
    format: 'mapping-icons',
    formatVersion: 3,
    viewBox: [24, 24],
    icons: { dot: { paths: [{ d: 'M0 0h8v8H0z', ...path }] } },
  });
  const parsed = (path: Record<string, unknown>) => {
    const result = parseIconsFile(iconsFile(path));
    if (!result.ok) throw new Error(result.errors.join('; '));
    return result;
  };

  it('a path fill and a path stroke text are warnings at their paths; ok stays true', () => {
    const result = parsed({ fill: 'banana', stroke: 'red' });
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([
      {
        path: 'icons.dot.paths[0].fill',
        message:
          'not a color of the format: "banana" (use #rrggbb, rgb(), hsl(), transparent or none)',
        code: 'iconsFile.colorUnknown',
        params: { value: '"banana"' },
      },
      {
        path: 'icons.dot.paths[0].stroke',
        message:
          'not a color of the format: "red" (use #rrggbb, rgb(), hsl(), transparent or none)',
        code: 'iconsFile.colorUnknown',
        params: { value: '"red"' },
      },
    ]);
  });

  it.each([true, false, 'none', 'transparent', '#abc', 'rgb(1, 2, 3)', 'hsl(0 50% 50%)'])(
    'no warning for %s',
    (fill) => {
      expect(parsed({ fill, stroke: fill }).warnings).toEqual([]);
    },
  );
});
