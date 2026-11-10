// docs/component.schema.json contra os componentes reais e contra o parser.
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
  it('cobre os quinze componentes do Material 3 e os de exemplo do laboratório', () => {
    expect(M3_COMPONENTS).toHaveLength(15);
    expect(SAMPLE_COMPONENTS.length).toBeGreaterThan(0);
  });

  it.each(all.map((c) => [c.id, c] as const))('aceita %s', (_id, component) => {
    expect(checkSchema(schema, component)).toEqual([]);
  });

  it('todo componente aceito pelo schema é aceito por parseComponent', () => {
    for (const component of all) {
      if (checkSchema(schema, component).length === 0)
        expect(parseComponent(component).ok, component.id).toBe(true);
    }
  });

  it('recusa chave desconhecida na raiz e em nó', () => {
    const root = { ...clone(), extra: 1 };
    expect(checkSchema(schema, root).join('\n')).toContain('$.extra: chave desconhecida');
    const node = clone();
    (node.template as Record<string, unknown>).bogus = true;
    expect(checkSchema(schema, node).length).toBeGreaterThan(0);
  });

  it('recusa type de nó inválido', () => {
    const c = clone();
    (c.template as { children: Record<string, unknown>[] }).children[0] = {
      type: 'polygon',
    };
    expect(checkSchema(schema, c).length).toBeGreaterThan(0);
  });

  it('recusa componente sem size', () => {
    const c = clone();
    delete c.size;
    expect(checkSchema(schema, c)).toContain('$.size: obrigatório');
  });

  it('recusa id fora do padrão', () => {
    expect(checkSchema(schema, { ...clone(), id: 'Ruim' }).length).toBeGreaterThan(0);
  });

  describe('nó image (formatVersion 3)', () => {
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

    it('aceita image com $field e com literal https, e o parseComponent também', () => {
      for (const node of [image(), image({ src: 'https://exemplo.invalid/a.png' })]) {
        const c = withImage(node);
        expect(checkSchema(schema, c)).toEqual([]);
        expect(parseComponent(c).ok).toBe(true);
      }
    });

    it('aceita image dentro de repeat', () => {
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

    it('recusa image sem src', () => {
      const node = image();
      delete node.src;
      expect(checkSchema(schema, withImage(node)).length).toBeGreaterThan(0);
    });

    it('recusa src com $concat, com default e literal que não é https', () => {
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

    it('recusa fit inválido e hug em width ou height', () => {
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

  describe('stroke.cap, join e sides (formatVersion 4)', () => {
    const v4 = (stroke: Record<string, unknown>): Record<string, unknown> => ({
      format: 'mapping-component',
      formatVersion: 4,
      id: 'borda',
      name: 'Borda',
      size: { width: 100, height: 40 },
      template: { type: 'frame', stroke: { color: '#000', ...stroke } },
    });

    it('aceita cap, join e sides, literais ou por expressão', () => {
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

    it('recusa valores inválidos e formatVersion 5', () => {
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

  describe('limites, expressão de tamanho e layout, distribute (formatVersion 4)', () => {
    const v4 = (template: Record<string, unknown>): Record<string, unknown> => ({
      format: 'mapping-component',
      formatVersion: 4,
      id: 'layout',
      name: 'Layout',
      size: { width: 200, height: 100 },
      template,
    });

    it('aceita as chaves novas, e o parseComponent também', () => {
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

    it('recusa valores inválidos', () => {
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
  describe('expressões de wrap e maxLines em $if e $switch (formatVersion 4)', () => {
    const v4 = (font: Record<string, unknown>): Record<string, unknown> => ({
      format: 'mapping-component',
      formatVersion: 4,
      id: 'texto',
      name: 'Texto',
      size: { width: 100, height: 40 },
      template: { type: 'frame', children: [{ type: 'text', text: 'oi', font }] },
    });

    it('aceita $if e $switch com ramos do tipo do campo (o parser também)', () => {
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

    it('recusa ramo fora do tipo (maxLines 0 ou texto, wrap sublinhado)', () => {
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

  describe('chaves da etapa "extensões" (formatVersion 4)', () => {
    const t = (name: string, extra: object = {}) => ({ $token: name, ...extra });
    const v4 = (child: Record<string, unknown>, layout?: Record<string, unknown>) => ({
      format: 'mapping-component',
      formatVersion: 4,
      id: 'c',
      name: 'C',
      size: { width: 100, height: 40 },
      template: { type: 'frame', ...(layout ? { layout } : {}), children: [child] },
    });

    it('aceita $token em sombra, raios e tracejado, alpha, offset, justify e reverse (o parser também)', () => {
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

    it('recusa alpha fora de 0..1, offset negativo e justify desconhecido', () => {
      const bad = [
        v4({ type: 'rect', width: 1, height: 1, fill: t('x', { alpha: 2 }) }),
        v4({ type: 'rect', width: 1, height: 1, stroke: { color: '#000', offset: -1 } }),
        v4({ type: 'rect', width: 1, height: 1 }, { type: 'row', justify: 'spread' }),
      ];
      for (const c of bad)
        expect(checkSchema(schema, c).length, JSON.stringify(c)).toBeGreaterThan(0);
    });
  });
  it('aceita as operações numéricas e as comparações (formatVersion 4) e o parser concorda', () => {
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

describe('component.schema.json — rotation (EX3)', () => {
  it('aceita rotation, literal ou expressão, em qualquer nó, e recusa o que não é número', () => {
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
});
