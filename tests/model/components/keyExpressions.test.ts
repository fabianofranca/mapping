// Format 4, "drawing fidelity" stage (DG1): an expression in each `cornerRadius` item, in `image.fit`
// and in the shadow numbers (`x`, `y`, `blur`, `spread`): validator, version and scene.
import { describe, expect, it } from 'vitest';
import type {
  ComponentFile,
  FieldValues,
} from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
} from '../../../src/model/components/instantiate';
import {
  parseComponent,
  validateComponent,
} from '../../../src/model/components/parseComponent';
import type { FrameNode, SceneNode } from '../../../src/model/components/scene';
import { resolveTokens } from '../../../src/model/components/tokens';

type Raw = Record<string, unknown>;

const V4 = 'only allowed with formatVersion 4';
const URL_A = 'https://cdn.example.com/a.png';
const TOKENS = { modes: ['light'], values: { 'radius-md': 12 } };

const t = (name: string) => ({ $token: name });
const choose = (field: string, cases: Record<string, unknown>, fallback?: unknown) => ({
  $switch: field,
  cases,
  ...(fallback === undefined ? {} : { default: fallback }),
});

function file(child: Raw, version = 4): Raw {
  return {
    format: 'mapping-component',
    formatVersion: version,
    id: 'c',
    name: 'C',
    size: { width: 100, height: 60 },
    template: { type: 'frame', children: [child] },
  };
}

function parse(child: Raw): ComponentFile {
  const r = parseComponent(file(child));
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.component;
}

function run(child: Raw, values: FieldValues = {}) {
  const tokens = resolveTokens(TOKENS, {}, 'light');
  const { root, warnings } = instantiate(
    parse(child),
    values,
    { x: 0, y: 0, width: 100, height: 60 },
    { measure: approximateMeasurer, tokens },
  );
  return { node: (root as FrameNode).children[0] as SceneNode, warnings };
}

const rect = (extra: Raw): Raw => ({ type: 'rect', width: 50, height: 20, ...extra });

describe('DG1: an expression in each cornerRadius item', () => {
  const radius = [
    choose('top', { round: 16, square: 0 }, 0),
    0,
    t('radius-md'),
    { $mul: [2, 4] },
  ];

  it('parses and draws [16, 0, <token>, 8]', () => {
    const { node, warnings } = run(rect({ cornerRadius: radius }), { top: 'round' });
    expect((node as { cornerRadius?: unknown }).cornerRadius).toEqual([16, 0, 12, 8]);
    expect(warnings).toEqual([]);
  });

  it('the switch item follows the field', () => {
    const { node } = run(rect({ cornerRadius: radius }), { top: 'square' });
    expect((node as { cornerRadius?: unknown }).cornerRadius).toEqual([0, 0, 12, 8]);
  });

  it('a negative result warns and draws 0', () => {
    const { node, warnings } = run(rect({ cornerRadius: [{ $mul: [-1, 4] }, 2, 2, 2] }));
    expect((node as { cornerRadius?: unknown }).cornerRadius).toEqual([0, 2, 2, 2]);
    expect(warnings).toContain('invalid value in cornerRadius: -4');
  });

  it('a literal list and a number draw as before', () => {
    expect(
      (run(rect({ cornerRadius: [1, 2, 3, 4] })).node as { cornerRadius?: unknown })
        .cornerRadius,
    ).toEqual([1, 2, 3, 4]);
    expect(
      (run(rect({ cornerRadius: 6 })).node as { cornerRadius?: unknown }).cornerRadius,
    ).toBe(6);
  });

  it('in a version before 4 each expression item is only allowed with formatVersion 4', () => {
    expect(
      validateComponent(
        file(
          rect({
            cornerRadius: [
              choose('top', { round: 16 }, 0),
              0,
              { $field: 'x', default: 1 },
              3,
            ],
          }),
          3,
        ),
      ),
    ).toEqual([
      `template.children[0].cornerRadius[0]: ${V4}`,
      `template.children[0].cornerRadius[2]: ${V4}`,
    ]);
  });

  it('a list that is not 4 items or has a bad literal item is still refused', () => {
    const message =
      'template.children[0].cornerRadius: expected a number greater than or equal to 0 or a list of 4 numbers';
    expect(
      validateComponent(file(rect({ cornerRadius: [{ $mul: [1, 2] }, 1, 2] }))),
    ).toEqual([message]);
    expect(
      validateComponent(file(rect({ cornerRadius: [{ $mul: [1, 2] }, -1, 0, 0] }))),
    ).toEqual([message]);
  });
});

describe('DG1: an expression in image.fit', () => {
  const image = (fit: unknown): Raw => ({
    type: 'image',
    src: URL_A,
    width: 40,
    height: 40,
    fit,
  });
  const fitOf = (fit: unknown, values: FieldValues) => {
    const { node, warnings } = run(image(fit), values);
    const fill = (
      node as unknown as { fills: { type: string; fit?: string }[] }
    ).fills.find((f) => f.type === 'image');
    return { fit: fill?.fit, warnings };
  };
  const byField = { $field: 'fit' };

  it.each([
    'cover',
    'contain',
    'fill',
    'fill-width',
    'fill-height',
    'scale-down',
    'none',
  ])('draws %s', (fit) => {
    expect(fitOf(byField, { fit })).toEqual({ fit, warnings: [] });
  });

  it('a $switch gives the fit', () => {
    const fit = choose('mode', { crop: 'cover', whole: 'contain' }, 'fill');
    expect(fitOf(fit, { mode: 'whole' }).fit).toBe('contain');
    expect(fitOf(fit, { mode: 'other' }).fit).toBe('fill');
  });

  it('a value outside the fits warns and draws cover', () => {
    expect(fitOf(byField, { fit: 'bogus' })).toEqual({
      fit: 'cover',
      warnings: ['invalid value in image.fit: bogus'],
    });
  });

  it('a literal still parses, and a bad literal is still refused', () => {
    expect(validateComponent(file(image('contain')))).toEqual([]);
    expect(validateComponent(file(image('bogus')))).toEqual([
      'template.children[0].fit: expected one of: cover, contain, fill, fill-width, fill-height, scale-down, none',
    ]);
  });

  it('in a version before 4 an expression is only allowed with formatVersion 4', () => {
    expect(validateComponent(file(image(byField), 3))).toEqual([
      `template.children[0].fit: ${V4}`,
    ]);
    expect(validateComponent(file(image('cover'), 3))).toEqual([]);
  });
});

describe('DG1: an expression in the shadow numbers', () => {
  const sized = choose('size', { s: 2, m: 6, l: 12 }, 0);
  const effectsOf = (shadow: unknown, values: FieldValues = {}) => {
    const { node, warnings } = run(rect({ shadow }), values);
    return {
      effects: (node as unknown as { effects: Raw[] }).effects,
      warnings,
    };
  };

  it.each([
    ['x', 'offset', { x: 2, y: 0 }],
    ['y', 'offset', { x: 0, y: 2 }],
    ['blur', 'blur', 2],
    ['spread', 'spread', 2],
  ] as const)('%s by $switch draws each value in a single shadow', (key, prop, small) => {
    const shadow = (size: string) =>
      effectsOf({ color: '#000', [key]: sized }, { size }).effects[0]?.[prop];
    expect(shadow('s')).toEqual(small);
    const large = key === 'x' ? { x: 12, y: 0 } : key === 'y' ? { x: 0, y: 12 } : 12;
    expect(shadow('l')).toEqual(large);
  });

  it('draws each value in a list, in each item', () => {
    const { effects, warnings } = effectsOf(
      [
        { color: '#000', y: sized, blur: sized },
        { color: '#fff', x: sized, spread: sized },
      ],
      { size: 'm' },
    );
    expect(effects[0]).toMatchObject({ offset: { x: 0, y: 6 }, blur: 6 });
    expect(effects[1]).toMatchObject({ offset: { x: 6, y: 0 }, spread: 6 });
    expect(warnings).toEqual([]);
  });

  it('a negative blur warns and draws 0; a non-numeric value warns and falls back', () => {
    const negative = effectsOf({ color: '#000', blur: { $mul: [-1, 3] } });
    expect(negative.effects[0]?.blur).toBe(0);
    expect(negative.warnings).toContain('invalid value in shadow.blur: -3');
    const text = effectsOf({ color: '#000', y: { $field: 'y' } }, { y: 'abc' });
    expect(text.effects[0]).toMatchObject({ offset: { x: 0, y: 0 } });
    expect(text.warnings).toContain('invalid value in shadow.y: abc');
  });

  it('a literal and a $token still draw as before', () => {
    const { effects } = effectsOf({ color: '#000', x: 1, y: t('radius-md'), blur: 3 });
    expect(effects[0]).toMatchObject({ offset: { x: 1, y: 12 }, blur: 3 });
  });

  it('in a version before 4 each expression is only allowed with formatVersion 4, at its path', () => {
    const shadow = { color: '#000', x: sized, y: sized, blur: sized, spread: sized };
    expect(validateComponent(file(rect({ shadow }), 3)).sort()).toEqual(
      ['x', 'y', 'blur', 'spread']
        .map((key) => `template.children[0].shadow.${key}: ${V4}`)
        .sort(),
    );
    expect(
      validateComponent(
        file(rect({ shadow: { color: '#000', x: 1, y: 2, blur: 3 } }), 3),
      ),
    ).toEqual([]);
  });

  it('in a list each item is checked at its own path (v4 accepts, v3 refuses the list itself)', () => {
    expect(
      validateComponent(
        file(
          rect({
            shadow: [
              { color: '#000', blur: sized },
              { color: '#fff', y: sized },
            ],
          }),
        ),
      ),
    ).toEqual([]);
  });

  it('a bad literal is still refused', () => {
    expect(
      validateComponent(file(rect({ shadow: { color: '#000', blur: -1 } }))),
    ).toEqual([
      'template.children[0].shadow.blur: expected a number greater than or equal to 0',
    ]);
  });
});
