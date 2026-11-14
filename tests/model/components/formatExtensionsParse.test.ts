// Format 4, "extensions" stage (FX3): $token in shadow, radii and dashed, stroke.dash by expression,
// justify space-around/space-evenly, layout.reverse, alpha on the $token and stroke.offset — validator.
import { describe, expect, it } from 'vitest';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import {
  parseComponent,
  validateComponent,
} from '../../../src/model/components/parseComponent';

const V4 = 'only allowed with formatVersion 4';
const t = (name: string, extra: Record<string, unknown> = {}) => ({
  $token: name,
  ...extra,
});

function withChild(child: Record<string, unknown>, version = 4): unknown {
  return {
    format: COMPONENT_FORMAT,
    formatVersion: version,
    id: 'c',
    name: 'C',
    size: { width: 100, height: 40 },
    template: { type: 'frame', children: [child] },
  };
}

function withFrame(frame: Record<string, unknown>, version = 4): unknown {
  return {
    format: COMPONENT_FORMAT,
    formatVersion: version,
    id: 'c',
    name: 'C',
    size: { width: 100, height: 40 },
    template: { type: 'frame', children: [], ...frame },
  };
}

describe('A1: $token in shadow.x, shadow.y and shadow.blur', () => {
  const shadow = { color: '#000', x: t('e-x'), y: t('e-y'), blur: t('e-blur') };

  it('is valid in v4 and collects the references as a number', () => {
    const r = parseComponent(withChild({ type: 'rect', width: 10, height: 10, shadow }));
    if (!r.ok) throw new Error(r.errors.join('\n'));
    expect([...r.tokenRefs].map((x) => [x.path, x.kind]).sort()).toEqual([
      ['template.children[0].shadow.blur', 'number'],
      ['template.children[0].shadow.x', 'number'],
      ['template.children[0].shadow.y', 'number'],
    ]);
  });

  it('in versions 1 to 3 it gives the version error, on the key path', () => {
    for (const version of [1, 2, 3]) {
      expect(
        validateComponent(
          withChild({ type: 'rect', width: 10, height: 10, shadow }, version),
        ),
      ).toEqual([
        `template.children[0].shadow.x: ${V4}`,
        `template.children[0].shadow.y: ${V4}`,
        `template.children[0].shadow.blur: ${V4}`,
      ]);
    }
  });

  it('only $token: another expression in x is still an error', () => {
    expect(
      validateComponent(
        withChild({
          type: 'rect',
          width: 10,
          height: 10,
          shadow: { color: '#000', x: { $field: 'dx' } },
        }),
      ),
    ).toEqual(['template.children[0].shadow.x: expected a number']);
  });

  it('the literal keeps applying in any version', () => {
    expect(
      validateComponent(
        withChild(
          { type: 'rect', width: 1, height: 1, shadow: { color: '#000', x: 1, blur: 2 } },
          2,
        ),
      ),
    ).toEqual([]);
  });
});

describe('A2: $token in each item of the cornerRadius list', () => {
  const radius = [t('corner-xs'), 0, 0, t('corner-xs')];

  it('is valid in v4 and collects one token per item', () => {
    const r = parseComponent(
      withChild({ type: 'rect', width: 10, height: 10, cornerRadius: radius }),
    );
    if (!r.ok) throw new Error(r.errors.join('\n'));
    expect(r.tokenRefs.map((x) => x.path)).toEqual([
      'template.children[0].cornerRadius[0]',
      'template.children[0].cornerRadius[3]',
    ]);
  });

  it('in versions 1 to 3 it gives the version error, on the item path', () => {
    expect(
      validateComponent(
        withChild({ type: 'rect', width: 10, height: 10, cornerRadius: radius }, 3),
      ),
    ).toEqual([
      `template.children[0].cornerRadius[0]: ${V4}`,
      `template.children[0].cornerRadius[3]: ${V4}`,
    ]);
  });

  it('the list still has 4 items and each item is a number ≥ 0 or $token', () => {
    const bad = (cornerRadius: unknown) =>
      validateComponent(withChild({ type: 'rect', width: 1, height: 1, cornerRadius }));
    expect(bad([t('a'), 1, 2])).toEqual([
      'template.children[0].cornerRadius: expected a number greater than or equal to 0 or a list of 4 numbers',
    ]);
    expect(bad([t('a'), -1, 0, 0])).toEqual([
      'template.children[0].cornerRadius: expected a number greater than or equal to 0 or a list of 4 numbers',
    ]);
    expect(bad([t('a'), { $field: 'x' }, 0, 0]).length).toBeGreaterThan(0);
  });
});

describe('A19: stroke.dash by expression and $token in the items', () => {
  const stroke = (dash: unknown, version = 4) =>
    validateComponent(
      withChild(
        { type: 'rect', width: 10, height: 10, stroke: { color: '#000', dash } },
        version,
      ),
    );

  it('$switch, $if and $field are valid in v4', () => {
    expect(stroke({ $switch: 'estilo', cases: { a: [4, 2] }, default: [1, 1] })).toEqual(
      [],
    );
    expect(stroke({ $if: { $has: 'x' }, then: [3, 3], else: [] })).toEqual([]);
    expect(stroke({ $field: 'tracejado' })).toEqual([]);
  });

  it('accepts a number $token in each item', () => {
    const r = parseComponent(
      withChild({
        type: 'rect',
        width: 10,
        height: 10,
        stroke: { color: '#000', dash: [t('dash-on'), 2] },
      }),
    );
    if (!r.ok) throw new Error(r.errors.join('\n'));
    expect(r.tokenRefs).toEqual([
      { path: 'template.children[0].stroke.dash[0]', name: 'dash-on', kind: 'number' },
    ]);
  });

  it('in a version 1 to 3 the expression and the $token give the version error; the literal list keeps applying', () => {
    expect(stroke([4, 2], 3)).toEqual([]);
    expect(stroke({ $field: 'tracejado' }, 3)).toEqual([
      `template.children[0].stroke.dash: ${V4}`,
    ]);
    expect(stroke([t('d'), 2], 3)).toEqual([
      `template.children[0].stroke.dash[0]: ${V4}`,
    ]);
  });

  it('a negative literal item or one that is not a number is still an error', () => {
    expect(stroke([4, -1])).toEqual([
      'template.children[0].stroke.dash[1]: expected a number greater than or equal to 0',
    ]);
  });
});

describe('A4: justify space-around/space-evenly and layout.reverse', () => {
  const frame = (layout: Record<string, unknown>, version = 4) =>
    validateComponent(withFrame({ layout }, version));

  it('space-around and space-evenly are valid in v4', () => {
    expect(frame({ type: 'row', justify: 'space-around' })).toEqual([]);
    expect(frame({ type: 'column', justify: 'space-evenly' })).toEqual([]);
  });

  it('in versions 1 to 3 the new literal gives the version error, on the justify path', () => {
    expect(frame({ type: 'row', justify: 'space-around' }, 3)).toEqual([
      `template.layout.justify: ${V4}`,
    ]);
    expect(frame({ type: 'row', justify: 'space-evenly' }, 1)).toEqual([
      `template.layout.justify: ${V4}`,
    ]);
  });

  it('a value outside the set is "expected one of"', () => {
    expect(frame({ type: 'row', justify: 'spread' })).toEqual([
      'template.layout.justify: expected one of: start, center, end, space-between, space-around, space-evenly',
    ]);
  });

  it('reverse: boolean or expression in v4', () => {
    expect(frame({ type: 'row', reverse: true })).toEqual([]);
    expect(frame({ type: 'row', reverse: { $field: 'rtl' } })).toEqual([]);
    expect(frame({ type: 'row', reverse: 'yes' })).toEqual([
      'template.layout.reverse: expected a boolean',
    ]);
  });

  it('reverse in versions 1 to 3 gives the version error, on the key path', () => {
    expect(frame({ type: 'row', reverse: true }, 3)).toEqual([
      `template.layout.reverse: ${V4}`,
    ]);
  });

  it('reverse with type none is an unknown key (like align and justify)', () => {
    expect(frame({ type: 'none', reverse: true })).toEqual([
      'template.layout.reverse: unknown key: reverse',
    ]);
  });
});

describe('A10: alpha on the color $token', () => {
  const fill = (ref: unknown, version = 4) =>
    validateComponent(
      withChild({ type: 'rect', width: 10, height: 10, fill: ref }, version),
    );

  it('a literal alpha from 0 to 1 is valid on a color', () => {
    expect(fill(t('scrim', { alpha: 0.32 }))).toEqual([]);
    expect(fill(t('scrim', { alpha: 0 }))).toEqual([]);
    expect(fill(t('scrim', { alpha: 1 }))).toEqual([]);
  });

  it('alpha as a number $token is collected as a number', () => {
    const r = parseComponent(
      withChild({
        type: 'rect',
        width: 10,
        height: 10,
        fill: t('scrim', { alpha: t('scrim-alpha') }),
      }),
    );
    if (!r.ok) throw new Error(r.errors.join('\n'));
    expect(r.tokenRefs).toEqual([
      { path: 'template.children[0].fill', name: 'scrim', kind: 'color' },
      {
        path: 'template.children[0].fill.alpha',
        name: 'scrim-alpha',
        kind: 'number',
      },
    ]);
  });

  it('outside 0..1 is "expected a number between 0 and 1"', () => {
    expect(fill(t('scrim', { alpha: 1.5 }))).toEqual([
      'template.children[0].fill.alpha: expected a number between 0 and 1',
    ]);
    expect(fill(t('scrim', { alpha: -0.1 }))).toEqual([
      'template.children[0].fill.alpha: expected a number between 0 and 1',
    ]);
    expect(fill(t('scrim', { alpha: 'meio' }))).toEqual([
      'template.children[0].fill.alpha: expected a number between 0 and 1',
    ]);
  });

  it('outside a color position gives "alpha is only valid on a color $token", on the $token path', () => {
    expect(
      validateComponent(
        withChild({
          type: 'rect',
          width: 10,
          height: 10,
          cornerRadius: t('radius', { alpha: 0.5 }),
        }),
      ),
    ).toEqual([
      'template.children[0].cornerRadius.$token: alpha is only valid on a color $token',
    ]);
  });

  it('on a gradient stop it also applies', () => {
    expect(
      fill({
        type: 'linear',
        angle: 90,
        stops: [
          { offset: 0, color: t('scrim', { alpha: 0 }) },
          { offset: 1, color: t('scrim', { alpha: 0.32 }) },
        ],
      }),
    ).toEqual([]);
  });

  it('in versions 1 to 3 the $token is already the version error', () => {
    expect(fill(t('scrim', { alpha: 0.5 }), 3)).toEqual([
      `template.children[0].fill: ${V4}`,
    ]);
  });
});

describe('A15: stroke.offset', () => {
  const stroke = (extra: Record<string, unknown>, version = 4, type = 'rect') =>
    validateComponent(
      withChild(
        {
          type,
          width: 10,
          height: 10,
          ...(type === 'frame' ? { children: [] } : {}),
          stroke: { color: '#000', ...extra },
        },
        version,
      ),
    );

  it('literal ≥ 0 or number $token are valid on frame, rect and ellipse in v4', () => {
    for (const type of ['frame', 'rect', 'ellipse']) {
      expect(stroke({ offset: 2 }, 4, type)).toEqual([]);
      expect(stroke({ offset: t('focus-offset') }, 4, type)).toEqual([]);
    }
    expect(stroke({ offset: 0 })).toEqual([]);
  });

  it('negative or not a number is an error', () => {
    expect(stroke({ offset: -1 })).toEqual([
      'template.children[0].stroke.offset: expected a number greater than or equal to 0',
    ]);
    expect(stroke({ offset: 'x' })).toEqual([
      'template.children[0].stroke.offset: expected a number greater than or equal to 0',
    ]);
  });

  it('in versions 1 to 3 it gives the version error, on the key path', () => {
    expect(stroke({ offset: 2 }, 3)).toEqual([
      `template.children[0].stroke.offset: ${V4}`,
    ]);
  });

  it('in path and text it does not apply (only frame, rect and ellipse)', () => {
    const issues = validateComponent(
      withChild({
        type: 'path',
        d: 'M0 0 L10 10',
        viewBox: [10, 10],
        stroke: { color: '#000', offset: 2 },
      }),
    );
    expect(issues).toEqual([
      'template.children[0].stroke.offset: only valid in frame, rect and ellipse (this is path)',
    ]);
  });
});
