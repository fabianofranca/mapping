// docs/component.schema.json against the real components and against the parser.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SAMPLE_COMPONENTS } from '../../../viewer/samples/samples';
import { M3_COMPONENTS } from '../../../viewer/samples/samplesMaterial3';
import { parseComponent } from '../../../src/model/components/parseComponent';
import { checkSchema } from '../../support/jsonSchema';

const schema: Record<string, unknown> = JSON.parse(
  readFileSync(new URL('../../../docs/component.schema.json', import.meta.url), 'utf8'),
);

const all = [...M3_COMPONENTS, ...SAMPLE_COMPONENTS];

function clone(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(M3_COMPONENTS[0])) as Record<string, unknown>;
}

describe('component.schema.json', () => {
  it('covers the fifteen Material 3 components and the lab example ones', () => {
    expect(M3_COMPONENTS).toHaveLength(15);
    expect(SAMPLE_COMPONENTS.length).toBeGreaterThan(0);
  });

  it.each(all.map((c) => [c.id, c] as const))('accepts %s', (_id, component) => {
    expect(checkSchema(schema, component)).toEqual([]);
  });

  it('every component accepted by the schema is accepted by parseComponent', () => {
    for (const component of all) {
      if (checkSchema(schema, component).length === 0)
        expect(parseComponent(component).ok, component.id).toBe(true);
    }
  });

  it('rejects an unknown key at the root and in a node', () => {
    const root = { ...clone(), extra: 1 };
    expect(checkSchema(schema, root).join('\n')).toContain('$.extra: unknown key');
    const node = clone();
    (node.template as Record<string, unknown>).bogus = true;
    expect(checkSchema(schema, node).length).toBeGreaterThan(0);
  });

  it('rejects an invalid node type', () => {
    const c = clone();
    (c.template as { children: Record<string, unknown>[] }).children[0] = {
      type: 'polygon',
    };
    expect(checkSchema(schema, c).length).toBeGreaterThan(0);
  });

  it('rejects a component without size', () => {
    const c = clone();
    delete c.size;
    // (message emitted by tests/support/jsonSchema.ts)
    expect(checkSchema(schema, c)).toContain('$.size: required');
  });

  it('rejects an id outside the pattern', () => {
    expect(checkSchema(schema, { ...clone(), id: 'Ruim' }).length).toBeGreaterThan(0);
  });

  describe('component node (formatVersion 4)', () => {
    const v4 = (node: Record<string, unknown>): Record<string, unknown> => ({
      format: 'mapping-component',
      formatVersion: 4,
      id: 'icon-button',
      name: 'Icon button',
      size: { width: 48, height: 48 },
      template: { type: 'frame', children: [node] },
    });
    const node = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
      type: 'component',
      id: 'spinner',
      values: { size: 24, label: { $field: 'title' }, extra: null },
      provide: { tone: 'primary' },
      width: 24,
      height: 'hug',
      ...extra,
    });

    it('accepts a component node with values and provide', () => {
      expect(checkSchema(schema, v4(node()))).toEqual([]);
    });

    it('rejects fill, stroke, shadow, cornerRadius and children on it', () => {
      for (const key of ['fill', 'stroke', 'shadow', 'cornerRadius', 'children'])
        expect(
          checkSchema(schema, v4(node({ [key]: key === 'children' ? [] : 1 }))).length,
          key,
        ).toBeGreaterThan(0);
    });

    it('rejects a node without id and an id outside the pattern', () => {
      const bare = node();
      delete bare.id;
      expect(checkSchema(schema, v4(bare)).length).toBeGreaterThan(0);
      expect(checkSchema(schema, v4(node({ id: 'Bad' }))).length).toBeGreaterThan(0);
    });
  });

  describe('format gaps, FG4 (formatVersion 4)', () => {
    const v4 = (
      template: Record<string, unknown>,
      extra: Record<string, unknown> = {},
    ): Record<string, unknown> => ({
      format: 'mapping-component',
      formatVersion: 4,
      id: 'tag',
      name: 'Tag',
      size: { width: 80, height: 24 },
      template: { type: 'frame', children: [], ...template },
      ...extra,
    });
    const token = (name: string) => ({ $token: name });

    it('accepts the letter spacing in percent, also by expression, and rejects other text', () => {
      const text = (letterSpacing: unknown) =>
        v4({ children: [{ type: 'text', text: 'x', font: { letterSpacing } }] });
      for (const ok of [
        '2%',
        '-1.5%',
        1,
        token('tracking'),
        { $switch: 's', cases: { a: '2%' }, default: 0 },
      ]) {
        const c = text(ok);
        expect(checkSchema(schema, c), JSON.stringify(ok)).toEqual([]);
        expect(parseComponent(c).ok).toBe(true);
      }
      for (const bad of ['2px', '%', 'abc'])
        expect(checkSchema(schema, text(bad)).length, bad).toBeGreaterThan(0);
    });

    it('accepts expressions as padding items, in a frame and in a run', () => {
      const frame = v4({
        layout: {
          type: 'row',
          padding: [{ $field: 'pad' }, token('spacing-24'), { $mul: [2, 4] }, 4],
        },
      });
      const run = v4({
        children: [{ type: 'text', runs: [{ text: 'x', padding: [0, token('chip')] }] }],
      });
      for (const c of [frame, run]) {
        expect(checkSchema(schema, c)).toEqual([]);
        expect(parseComponent(c).ok).toBe(true);
      }
      const negative = v4({ layout: { type: 'row', padding: [0, -1] } });
      expect(checkSchema(schema, negative).length).toBeGreaterThan(0);
    });

    it('accepts a number $token in sizing, alone and in a $switch', () => {
      for (const width of [
        token('size-48'),
        { $switch: 'size', cases: { s: token('size-24') }, default: 'hug' },
      ]) {
        const c = v4({}, { sizing: { width } });
        expect(checkSchema(schema, c)).toEqual([]);
        expect(parseComponent(c).ok).toBe(true);
      }
    });
  });

  describe('image node (formatVersion 3)', () => {
    const image = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
      type: 'image',
      src: { $field: 'foto' },
      fit: 'cover',
      width: 40,
      height: 40,
      cornerRadius: 20,
      ...extra,
    });
    const v3 = (children: Record<string, unknown>[]): Record<string, unknown> => ({
      format: 'mapping-component',
      formatVersion: 3,
      id: 'avatar',
      name: 'Avatar',
      size: { width: 200, height: 56 },
      template: { type: 'frame', layout: { type: 'row', gap: 8 }, children },
    });
    const withImage = (node: Record<string, unknown>): Record<string, unknown> =>
      v3([node]);

    it('accepts image with $field and with an https literal, and parseComponent too', () => {
      for (const node of [image(), image({ src: 'https://exemplo.invalid/a.png' })]) {
        const c = withImage(node);
        expect(checkSchema(schema, c)).toEqual([]);
        expect(parseComponent(c).ok).toBe(true);
      }
    });

    it('accepts image inside repeat', () => {
      const c = v3([
        {
          type: 'repeat',
          field: 'pessoas',
          template: { type: 'frame', children: [image({ src: { $field: 'foto' } })] },
        },
      ]);
      expect(checkSchema(schema, c)).toEqual([]);
      expect(parseComponent(c).ok).toBe(true);
    });

    it('rejects image without src', () => {
      const node = image();
      delete node.src;
      expect(checkSchema(schema, withImage(node)).length).toBeGreaterThan(0);
    });

    it('rejects src with $concat, with default and a literal that is not https', () => {
      for (const src of [
        { $concat: ['https://', { $field: 'host' }] },
        { $field: 'foto', default: 'https://exemplo.invalid/a.png' },
        'http://exemplo.invalid/a.png',
        'a.png',
      ])
        expect(
          checkSchema(schema, withImage(image({ src }))).length,
          JSON.stringify(src),
        ).toBeGreaterThan(0);
    });

    it('rejects invalid fit and hug in width or height', () => {
      expect(
        checkSchema(schema, withImage(image({ fit: 'stretch' }))).length,
      ).toBeGreaterThan(0);
      for (const key of ['width', 'height'])
        expect(
          checkSchema(schema, withImage(image({ [key]: 'hug' }))).length,
          key,
        ).toBeGreaterThan(0);
      expect(
        checkSchema(schema, withImage(image({ width: 'fill', height: '50%' }))),
      ).toEqual([]);
    });
  });

  describe('stroke.cap, join and sides (formatVersion 4)', () => {
    const v4 = (stroke: Record<string, unknown>): Record<string, unknown> => ({
      format: 'mapping-component',
      formatVersion: 4,
      id: 'borda',
      name: 'Borda',
      size: { width: 100, height: 40 },
      template: { type: 'frame', stroke: { color: '#000', ...stroke } },
    });

    it('accepts cap, join and sides, literal or by expression', () => {
      for (const stroke of [
        { cap: 'round', join: 'bevel', sides: ['top', 'bottom'] },
        { cap: { $field: 'ponta', default: 'square' } },
        { sides: { $switch: 'modo', cases: { a: ['left'] }, default: ['top', 'right'] } },
      ]) {
        const c = v4(stroke);
        expect(checkSchema(schema, c), JSON.stringify(stroke)).toEqual([]);
        expect(parseComponent(c).ok, JSON.stringify(stroke)).toBe(true);
      }
    });

    it('rejects invalid values and formatVersion 5', () => {
      for (const stroke of [
        { cap: 'pontudo' },
        { join: 'redondo' },
        { sides: [] },
        { sides: ['meio'] },
      ])
        expect(
          checkSchema(schema, v4(stroke)).length,
          JSON.stringify(stroke),
        ).toBeGreaterThan(0);
      expect(checkSchema(schema, { ...v4({}), formatVersion: 5 }).length).toBeGreaterThan(
        0,
      );
    });
  });

  describe('limits, size expression and layout, distribute (formatVersion 4)', () => {
    const v4 = (template: Record<string, unknown>): Record<string, unknown> => ({
      format: 'mapping-component',
      formatVersion: 4,
      id: 'layout',
      name: 'Layout',
      size: { width: 200, height: 100 },
      template,
    });

    it('accepts the new keys, and parseComponent too', () => {
      for (const template of [
        { type: 'frame', minWidth: 10, maxWidth: { $field: 'm', default: 90 } },
        { type: 'frame', width: { $field: 'w', default: 'fill' }, height: '50%' },
        {
          type: 'frame',
          layout: {
            type: { $switch: 'dir', cases: { h: 'row' }, default: 'none' },
            gap: 4,
            align: { $field: 'a', default: 'center' },
            justify: { $field: 'j', default: 'space-between' },
          },
        },
        {
          type: 'frame',
          children: [
            { type: 'slot', layout: { type: { $field: 'd', default: 'column' } } },
            {
              type: 'repeat',
              field: 'rows',
              distribute: 'fill',
              minHeight: 20,
              template: { type: 'frame' },
            },
            { type: 'image', src: { $field: 'f' }, width: { $field: 'w', default: 8 } },
          ],
        },
      ]) {
        const c = v4(template);
        expect(checkSchema(schema, c), JSON.stringify(template)).toEqual([]);
        expect(parseComponent(c).ok, JSON.stringify(template)).toBe(true);
      }
    });

    it('rejects invalid values', () => {
      for (const template of [
        { type: 'frame', minWidth: -1 },
        { type: 'frame', width: { $field: 'w', default: 'enorme' } },
        {
          type: 'frame',
          layout: { type: 'row', align: { $field: 'a', default: 'meio' } },
        },
        { type: 'frame', layout: { type: 'none', gap: 4 } },
        { type: 'frame', layout: { type: { $field: 'd', default: 'grade' } } },
        { type: 'frame', children: [{ type: 'rect', distribute: 'fill' }] },
        {
          type: 'frame',
          children: [
            { type: 'repeat', field: 'r', distribute: 'x', template: { type: 'frame' } },
          ],
        },
        {
          type: 'frame',
          children: [
            {
              type: 'image',
              src: { $field: 'f' },
              width: { $field: 'w', default: 'hug' },
            },
          ],
        },
      ])
        expect(
          checkSchema(schema, v4(template)).length,
          JSON.stringify(template),
        ).toBeGreaterThan(0);
    });
  });
  describe('wrap and maxLines expressions in $if and $switch (formatVersion 4)', () => {
    const v4 = (font: Record<string, unknown>): Record<string, unknown> => ({
      format: 'mapping-component',
      formatVersion: 4,
      id: 'texto',
      name: 'Texto',
      size: { width: 100, height: 40 },
      template: { type: 'frame', children: [{ type: 'text', text: 'oi', font }] },
    });

    it('accepts $if and $switch with branches of the field type (the parser too)', () => {
      for (const font of [
        { maxLines: { $if: { $field: 'curto' }, then: 2, else: 3 } },
        { maxLines: { $switch: 'modo', cases: { a: 2 }, default: 3 } },
        { wrap: { $if: { $field: 'curto' }, then: 'none', else: 'word' } },
        { wrap: { $switch: 'modo', cases: { a: 'none' }, default: 'word' } },
      ]) {
        const c = v4(font);
        expect(checkSchema(schema, c), JSON.stringify(font)).toEqual([]);
        expect(parseComponent(c).ok, JSON.stringify(font)).toBe(true);
      }
    });

    it('rejects a branch outside the type (maxLines 0 or text, underlined wrap)', () => {
      for (const font of [
        { maxLines: { $if: { $field: 'curto' }, then: 0, else: 3 } },
        { maxLines: { $switch: 'modo', cases: { a: 'underline' }, default: 3 } },
        { wrap: { $if: { $field: 'curto' }, then: 'underline', else: 'word' } },
      ])
        expect(
          checkSchema(schema, v4(font)).length,
          JSON.stringify(font),
        ).toBeGreaterThan(0);
    });
  });

  describe('keys of the "extensions" stage (formatVersion 4)', () => {
    const t = (name: string, extra: object = {}) => ({ $token: name, ...extra });
    const v4 = (child: Record<string, unknown>, layout?: Record<string, unknown>) => ({
      format: 'mapping-component',
      formatVersion: 4,
      id: 'c',
      name: 'C',
      size: { width: 100, height: 40 },
      template: { type: 'frame', ...(layout ? { layout } : {}), children: [child] },
    });

    it('accepts $token in shadow, radii and dashed, alpha, offset, justify and reverse (the parser too)', () => {
      const cases = [
        v4({
          type: 'rect',
          width: 10,
          height: 10,
          shadow: { color: '#000', x: t('a'), y: t('b'), blur: t('c') },
          cornerRadius: [t('r'), 0, 0, t('r')],
          fill: t('scrim', { alpha: 0.32 }),
          stroke: {
            color: t('scrim', { alpha: t('opacity') }),
            dash: [t('on'), 2],
            offset: t('focus-offset'),
          },
        }),
        v4({
          type: 'rect',
          width: 10,
          height: 10,
          stroke: { color: '#000', dash: { $field: 'tracejado' }, offset: 2 },
        }),
        v4(
          { type: 'rect', width: 10, height: 10 },
          { type: 'row', justify: 'space-evenly', reverse: true },
        ),
        v4(
          { type: 'rect', width: 10, height: 10 },
          { type: 'column', justify: 'space-around', reverse: { $field: 'rtl' } },
        ),
      ];
      for (const c of cases) {
        expect(checkSchema(schema, c), JSON.stringify(c)).toEqual([]);
        expect(parseComponent(c).ok, JSON.stringify(c)).toBe(true);
      }
    });

    it('rejects alpha outside 0..1, negative offset and unknown justify', () => {
      const bad = [
        v4({ type: 'rect', width: 1, height: 1, fill: t('x', { alpha: 2 }) }),
        v4({ type: 'rect', width: 1, height: 1, stroke: { color: '#000', offset: -1 } }),
        v4({ type: 'rect', width: 1, height: 1 }, { type: 'row', justify: 'spread' }),
      ];
      for (const c of bad)
        expect(checkSchema(schema, c).length, JSON.stringify(c)).toBeGreaterThan(0);
    });
  });
  it('accepts the numeric operations and the comparisons (formatVersion 4) and the parser agrees', () => {
    const c: Record<string, unknown> = { ...clone(), formatVersion: 4 };
    (c.template as Record<string, unknown>).children = [
      {
        type: 'rect',
        width: { $mul: [{ $field: 'p', default: 0.37 }, 200] },
        height: { $clamp: [{ $add: [4, { $sin: 30 }] }, 0, { $abs: -8 }] },
        visible: { $gte: [{ $field: 'p' }, { $round: 0.5 }] },
      },
    ];
    expect(checkSchema(schema, c)).toEqual([]);
    expect(parseComponent(c).ok).toBe(true);
    const bad = clone();
    (bad.template as Record<string, unknown>).children = [
      { type: 'rect', width: { $sub: [1] }, visible: { $gt: [1, 2, 3] } },
    ];
    expect(checkSchema(schema, bad).length).toBeGreaterThan(0);
  });
});

describe('component.schema.json — scale and filter (FG5)', () => {
  it('accepts scale and filter.grayscale on any node, the root included, and rejects the rest', () => {
    const component = { ...clone(), formatVersion: 4 } as Record<string, unknown>;
    const template = component.template as Record<string, unknown> & {
      children?: Record<string, unknown>[];
    };
    template.scale = 0.96;
    template.filter = { grayscale: { $if: { $field: 'off' }, then: 1, else: 0 } };
    template.children = [
      { type: 'rect', width: 4, height: 4, scale: { $field: 'k', default: 1 } },
      {
        type: 'frame',
        scale: { $token: 'press' },
        filter: { grayscale: 0.5 },
        children: [],
      },
    ];
    expect(checkSchema(schema, component)).toEqual([]);
    template.children = [{ type: 'rect', width: 4, height: 4, scale: 'big' }];
    expect(checkSchema(schema, component)).not.toEqual([]);
    template.children = [{ type: 'rect', width: 4, height: 4, filter: { blur: 2 } }];
    expect(checkSchema(schema, component)).not.toEqual([]);
    template.children = [{ type: 'rect', width: 4, height: 4, filter: 1 }];
    expect(checkSchema(schema, component)).not.toEqual([]);
  });
});

describe('component.schema.json — rotation (EX3)', () => {
  it('accepts rotation, literal or expression, on any node, and rejects what is not a number', () => {
    const component = clone();
    const template = component.template as { children?: Record<string, unknown>[] };
    const turned = { type: 'rect', width: 4, height: 4, rotation: 45 };
    template.children = [
      turned,
      { ...turned, rotation: { $mul: [{ $field: 'a' }, 90] } },
      { type: 'frame', rotation: -30, children: [] },
    ];
    expect(checkSchema(schema, component)).toEqual([]);
    template.children = [{ ...turned, rotation: 'girado' }];
    expect(checkSchema(schema, component)).not.toEqual([]);
  });

  it('accepts $lines and the sizing by expression (MC2), and rejects $lines without a name', () => {
    const c = clone();
    c.formatVersion = 4;
    c.sizing = {
      width: 'fill',
      height: { $switch: 'style', cases: { small: 64, large: 152, tall: 'hug' } },
    };
    (c.template as Record<string, unknown>).minHeight = {
      $if: { $gt: [{ $lines: 'msg' }, 1] },
      then: 68,
      else: 48,
    };
    expect(checkSchema(schema, c)).toEqual([]);
    expect(parseComponent(c).ok).toBe(false); // the `msg` node does not exist in this component
    (c.template as Record<string, unknown>).minHeight = { $lines: '' };
    expect(checkSchema(schema, c).length).toBeGreaterThan(0);
  });

  it('accepts let in the frame and $var where an expression or condition applies (formatVersion 4)', () => {
    const c = clone();
    c.formatVersion = 4;
    const template = c.template as Record<string, unknown>;
    template.let = {
      pad: 8,
      show: { $has: 'label' },
      ink: '#112233',
      big: { $add: [1, 2] },
    };
    template.children = [
      {
        type: 'rect',
        width: { $var: 'big' },
        height: { $add: [{ $var: 'pad' }, 1] },
        visible: { $var: 'show' },
        fill: { $if: { $var: 'show' }, then: { $var: 'ink' }, else: '#ffffff' },
      },
      { type: 'frame', let: { pad: 2 }, children: [] },
    ];
    expect(checkSchema(schema, c)).toEqual([]);
    expect(parseComponent(c).ok).toBe(true);
  });

  it('rejects a variable name outside the pattern, $var with another key and let outside a frame', () => {
    const c = clone();
    c.formatVersion = 4;
    const template = c.template as Record<string, unknown>;
    template.let = { Pad: 8 };
    template.children = [];
    // (message emitted by tests/support/jsonSchema.ts)
    expect(checkSchema(schema, c).join('\n')).toContain('name outside the pattern');
    template.let = { pad: 8 };
    template.children = [{ type: 'rect', width: { $var: 'pad', default: 1 }, height: 4 }];
    expect(checkSchema(schema, c)).not.toEqual([]);
    template.children = [{ type: 'rect', width: { $var: 'Pad' }, height: 4 }];
    expect(checkSchema(schema, c)).not.toEqual([]);
    template.children = [{ type: 'rect', width: 4, height: 4, let: { a: 1 } }];
    expect(checkSchema(schema, c)).not.toEqual([]);
  });
});

describe('component.schema.json — arcs on ellipse (FG6)', () => {
  it('accepts startAngle and sweepAngle on ellipse only', () => {
    const component = { ...clone(), formatVersion: 4 } as Record<string, unknown>;
    const template = component.template as Record<string, unknown> & {
      children?: Record<string, unknown>[];
    };
    template.children = [
      { type: 'ellipse', width: 4, height: 4, startAngle: -90, sweepAngle: 216 },
      {
        type: 'ellipse',
        width: 4,
        height: 4,
        sweepAngle: { $field: 'pct', default: 360 },
        startAngle: { $token: 'start' },
      },
    ];
    expect(checkSchema(schema, component)).toEqual([]);
    template.children = [{ type: 'ellipse', width: 4, height: 4, sweepAngle: 'wide' }];
    expect(checkSchema(schema, component)).not.toEqual([]);
    template.children = [{ type: 'rect', width: 4, height: 4, sweepAngle: 90 }];
    expect(checkSchema(schema, component)).not.toEqual([]);
  });

  describe('radial and angular gradients (formatVersion 4)', () => {
    const stops = [
      { offset: 0, color: '#fff' },
      { offset: 1, color: '#1a73e8' },
    ];
    const withFill = (fill: unknown): Record<string, unknown> => ({
      format: 'mapping-component',
      formatVersion: 4,
      id: 'glow',
      name: 'Glow',
      size: { width: 40, height: 40 },
      template: { type: 'frame', fill, children: [] },
    });

    it('accepts linear, radial and angular, with and without the optional keys', () => {
      for (const fill of [
        { type: 'linear', angle: 90, stops },
        { type: 'radial', stops },
        { type: 'radial', center: [0.25, 1], radius: 12, stops },
        { type: 'angular', stops },
        { type: 'angular', center: [0, 0.5], angle: -90, stops },
        { $if: { $field: 'on' }, then: { type: 'radial', stops }, else: 'none' },
        {
          type: 'angular',
          stops: [
            { offset: 0, color: { $field: 'from', default: '#fff' } },
            { offset: 1, color: { $token: 'brand' } },
          ],
        },
      ]) {
        const c = withFill(fill);
        expect(checkSchema(schema, c), JSON.stringify(fill)).toEqual([]);
        expect(parseComponent(c).ok, JSON.stringify(fill)).toBe(true);
      }
    });

    it('rejects what the parser rejects', () => {
      for (const fill of [
        { type: 'conic', stops },
        { type: 'radial', center: [0.5], stops },
        { type: 'radial', center: [0.5, 2], stops },
        { type: 'radial', radius: 0, stops },
        { type: 'radial', radius: -3, stops },
        { type: 'radial', stops: [stops[0]] },
        { type: 'radial', angle: 90, stops },
        { type: 'angular', radius: 10, stops },
        { type: 'angular', stops: [{ offset: 2, color: '#fff' }, stops[1]] },
      ]) {
        const c = withFill(fill);
        expect(checkSchema(schema, c).length, JSON.stringify(fill)).toBeGreaterThan(0);
        expect(parseComponent(c).ok, JSON.stringify(fill)).toBe(false);
      }
    });
  });
});
