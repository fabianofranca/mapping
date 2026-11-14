// Formato 4, etapa "extensões" (FX3): $token em sombra, raios e tracejado, stroke.dash por expressão,
// justify space-around/space-evenly, layout.reverse, alpha no $token e stroke.offset — validador.
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

describe('A1: $token em shadow.x, shadow.y e shadow.blur', () => {
  const shadow = { color: '#000', x: t('e-x'), y: t('e-y'), blur: t('e-blur') };

  it('vale na v4 e coleta as referências como número', () => {
    const r = parseComponent(withChild({ type: 'rect', width: 10, height: 10, shadow }));
    if (!r.ok) throw new Error(r.errors.join('\n'));
    expect([...r.tokenRefs].map((x) => [x.path, x.kind]).sort()).toEqual([
      ['template.children[0].shadow.blur', 'number'],
      ['template.children[0].shadow.x', 'number'],
      ['template.children[0].shadow.y', 'number'],
    ]);
  });

  it('nas versões 1 a 3 dá o erro de versão, no caminho da chave', () => {
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

  it('só $token: outra expressão em x continua erro', () => {
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

  it('o literal continua valendo em qualquer versão', () => {
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

describe('A2: $token em cada item da lista de cornerRadius', () => {
  const radius = [t('corner-xs'), 0, 0, t('corner-xs')];

  it('vale na v4 e coleta um token por item', () => {
    const r = parseComponent(
      withChild({ type: 'rect', width: 10, height: 10, cornerRadius: radius }),
    );
    if (!r.ok) throw new Error(r.errors.join('\n'));
    expect(r.tokenRefs.map((x) => x.path)).toEqual([
      'template.children[0].cornerRadius[0]',
      'template.children[0].cornerRadius[3]',
    ]);
  });

  it('nas versões 1 a 3 dá o erro de versão, no caminho do item', () => {
    expect(
      validateComponent(
        withChild({ type: 'rect', width: 10, height: 10, cornerRadius: radius }, 3),
      ),
    ).toEqual([
      `template.children[0].cornerRadius[0]: ${V4}`,
      `template.children[0].cornerRadius[3]: ${V4}`,
    ]);
  });

  it('a lista continua com 4 itens e cada item é número ≥ 0 ou $token', () => {
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

describe('A19: stroke.dash por expressão e $token nos itens', () => {
  const stroke = (dash: unknown, version = 4) =>
    validateComponent(
      withChild(
        { type: 'rect', width: 10, height: 10, stroke: { color: '#000', dash } },
        version,
      ),
    );

  it('vale $switch, $if e $field na v4', () => {
    expect(stroke({ $switch: 'estilo', cases: { a: [4, 2] }, default: [1, 1] })).toEqual(
      [],
    );
    expect(stroke({ $if: { $has: 'x' }, then: [3, 3], else: [] })).toEqual([]);
    expect(stroke({ $field: 'tracejado' })).toEqual([]);
  });

  it('aceita $token de número em cada item', () => {
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

  it('numa versão 1 a 3 a expressão e o $token dão o erro de versão; a lista literal continua valendo', () => {
    expect(stroke([4, 2], 3)).toEqual([]);
    expect(stroke({ $field: 'tracejado' }, 3)).toEqual([
      `template.children[0].stroke.dash: ${V4}`,
    ]);
    expect(stroke([t('d'), 2], 3)).toEqual([
      `template.children[0].stroke.dash[0]: ${V4}`,
    ]);
  });

  it('item literal negativo ou que não é número continua erro', () => {
    expect(stroke([4, -1])).toEqual([
      'template.children[0].stroke.dash[1]: expected a number greater than or equal to 0',
    ]);
  });
});

describe('A4: justify space-around/space-evenly e layout.reverse', () => {
  const frame = (layout: Record<string, unknown>, version = 4) =>
    validateComponent(withFrame({ layout }, version));

  it('space-around e space-evenly valem na v4', () => {
    expect(frame({ type: 'row', justify: 'space-around' })).toEqual([]);
    expect(frame({ type: 'column', justify: 'space-evenly' })).toEqual([]);
  });

  it('nas versões 1 a 3 o literal novo dá o erro de versão, no caminho de justify', () => {
    expect(frame({ type: 'row', justify: 'space-around' }, 3)).toEqual([
      `template.layout.justify: ${V4}`,
    ]);
    expect(frame({ type: 'row', justify: 'space-evenly' }, 1)).toEqual([
      `template.layout.justify: ${V4}`,
    ]);
  });

  it('valor fora do conjunto é "esperava um de"', () => {
    expect(frame({ type: 'row', justify: 'spread' })).toEqual([
      'template.layout.justify: expected one of: start, center, end, space-between, space-around, space-evenly',
    ]);
  });

  it('reverse: booleano ou expressão na v4', () => {
    expect(frame({ type: 'row', reverse: true })).toEqual([]);
    expect(frame({ type: 'row', reverse: { $field: 'rtl' } })).toEqual([]);
    expect(frame({ type: 'row', reverse: 'sim' })).toEqual([
      'template.layout.reverse: expected a boolean',
    ]);
  });

  it('reverse nas versões 1 a 3 dá o erro de versão, no caminho da chave', () => {
    expect(frame({ type: 'row', reverse: true }, 3)).toEqual([
      `template.layout.reverse: ${V4}`,
    ]);
  });

  it('reverse com type none é chave desconhecida (como align e justify)', () => {
    expect(frame({ type: 'none', reverse: true })).toEqual([
      'template.layout.reverse: unknown key: reverse',
    ]);
  });
});

describe('A10: alpha no $token de cor', () => {
  const fill = (ref: unknown, version = 4) =>
    validateComponent(
      withChild({ type: 'rect', width: 10, height: 10, fill: ref }, version),
    );

  it('alpha literal de 0 a 1 vale em cor', () => {
    expect(fill(t('scrim', { alpha: 0.32 }))).toEqual([]);
    expect(fill(t('scrim', { alpha: 0 }))).toEqual([]);
    expect(fill(t('scrim', { alpha: 1 }))).toEqual([]);
  });

  it('alpha como $token de número é coletado como número', () => {
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

  it('fora de 0..1 é "expected a number between 0 and 1"', () => {
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

  it('fora de posição de cor dá "alpha is only valid on a color $token", no caminho do $token', () => {
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

  it('na parada de um degradê também vale', () => {
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

  it('nas versões 1 a 3 o $token já é o erro de versão', () => {
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

  it('literal ≥ 0 ou $token de número valem em frame, rect e ellipse na v4', () => {
    for (const type of ['frame', 'rect', 'ellipse']) {
      expect(stroke({ offset: 2 }, 4, type)).toEqual([]);
      expect(stroke({ offset: t('focus-offset') }, 4, type)).toEqual([]);
    }
    expect(stroke({ offset: 0 })).toEqual([]);
  });

  it('negativo ou que não é número é erro', () => {
    expect(stroke({ offset: -1 })).toEqual([
      'template.children[0].stroke.offset: expected a number greater than or equal to 0',
    ]);
    expect(stroke({ offset: 'x' })).toEqual([
      'template.children[0].stroke.offset: expected a number greater than or equal to 0',
    ]);
  });

  it('nas versões 1 a 3 dá o erro de versão, no caminho da chave', () => {
    expect(stroke({ offset: 2 }, 3)).toEqual([
      `template.children[0].stroke.offset: ${V4}`,
    ]);
  });

  it('em path e text não vale (só frame, rect e ellipse)', () => {
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
