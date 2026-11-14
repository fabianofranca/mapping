// MC4 (decisões 11 a 13 da #898): `layout.wrap`, `lineGap`, `maxPerLine` e `maxLines` no quadro,
// no `repeat` e a validação das chaves novas.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  APPROX_ASCENT_RATIO,
  APPROX_DESCENT_RATIO,
  lineBaseline,
} from '../../../src/model/components/baseline';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
  measureComponent,
} from '../../../src/model/components/instantiate';
import { validateComponent } from '../../../src/model/components/parseComponent';
import { absoluteBoxes, walk, type SceneNode } from '../../../src/model/components/scene';
import { checkSchema } from '../../support/jsonSchema';

const schema: Record<string, unknown> = JSON.parse(
  readFileSync(new URL('../../../docs/component.schema.json', import.meta.url), 'utf8'),
);

type Json = Record<string, unknown>;
const V4 = 'only allowed with formatVersion 4';

function file(template: Json, formatVersion = 4, extra: Json = {}): Json {
  return {
    format: COMPONENT_FORMAT,
    formatVersion,
    id: 'c',
    name: 'C',
    size: { width: 320, height: 200 },
    template,
    ...extra,
  };
}

/** Um retângulo de lado `w` × `h` com o nome dado (filho do quadro de teste). */
function rect(name: string, w = 100, h = 20, extra: Json = {}): Json {
  return { type: 'rect', name, width: w, height: h, ...extra };
}

function kids(n: number, w = 100, h = 20): Json[] {
  return Array.from({ length: n }, (_, i) => rect(`k${i}`, w, h));
}

function frame(layout: Json, children: Json[], extra: Json = {}): Json {
  return {
    type: 'frame',
    name: 'host',
    width: 'fill',
    height: 'fill',
    layout: { type: 'row', ...layout },
    children,
    ...extra,
  };
}

const BOX = { x: 0, y: 0, width: 320, height: 200 };

function build(template: Json, box = BOX, formatVersion = 4) {
  const result = instantiate(file(template, formatVersion) as never, {}, box, {
    measure: approximateMeasurer,
  });
  const boxes = absoluteBoxes(result.root);
  const nodes = [...walk(result.root)];
  const at = (name: string): { x: number; y: number; width: number; height: number } => {
    const node = nodes.find((n) => n.name === name) as SceneNode | undefined;
    if (node === undefined) throw new Error(`sem nó ${name}`);
    const b = boxes.get(node.id) ?? { x: 0, y: 0 };
    return { x: b.x, y: b.y, width: node.width, height: node.height };
  };
  const has = (name: string): boolean => nodes.some((n) => n.name === name);
  return { ...result, at, has };
}

describe('wrap: o FlowRow (decisão 13)', () => {
  it('5 filhos de 100 numa row de 320, gap 8, lineGap 12: 3 + 2 nas posições do FlowRow', () => {
    const { at, warnings } = build(
      frame({ wrap: 'wrap', gap: 8, lineGap: 12, align: 'start' }, kids(5)),
    );
    // 3 × 100 + 2 × 8 = 316 ≤ 320; o quarto não cabe (316 + 8 + 100 > 320).
    expect([0, 1, 2].map((i) => at(`k${i}`).x)).toEqual([0, 108, 216]);
    expect([0, 1, 2].map((i) => at(`k${i}`).y)).toEqual([0, 0, 0]);
    expect([3, 4].map((i) => at(`k${i}`).x)).toEqual([0, 108]);
    expect([3, 4].map((i) => at(`k${i}`).y)).toEqual([32, 32]);
    expect(warnings).toEqual([]);
  });

  it('sem wrap (padrão), os mesmos filhos ficam numa linha só, como hoje', () => {
    const { at } = build(frame({ gap: 8 }, kids(5)));
    expect(at('k4').y).toBe(0);
    expect(at('k4').x).toBe(432);
  });

  it('wrap: "none" literal vale como sem wrap', () => {
    const { at } = build(frame({ wrap: 'none', gap: 8 }, kids(5)));
    expect(at('k4').y).toBe(0);
  });

  it('column com wrap: as colunas se enfileiram da esquerda para a direita', () => {
    const { at } = build(
      {
        ...frame({ type: 'column', wrap: 'wrap', gap: 4, lineGap: 10 }, kids(5, 60, 80)),
      },
      { x: 0, y: 0, width: 320, height: 200 },
    );
    // 2 × 80 + 4 = 164 ≤ 200; o terceiro não cabe (164 + 4 + 80 > 200).
    expect([0, 1].map((i) => at(`k${i}`).y)).toEqual([0, 84]);
    expect([2, 3].map((i) => at(`k${i}`).y)).toEqual([0, 84]);
    expect([0, 2, 4].map((i) => at(`k${i}`).x)).toEqual([0, 70, 140]);
    expect(at('k4').y).toBe(0);
  });

  it('wrap-reverse: a linha nova fica acima da primeira', () => {
    const { at } = build(frame({ wrap: 'wrap-reverse', gap: 8, lineGap: 12 }, kids(5)));
    // duas linhas de 20, lineGap 12 → bloco de 52; a primeira linha vai embaixo.
    expect([0, 1, 2].map((i) => at(`k${i}`).y)).toEqual([32, 32, 32]);
    expect([3, 4].map((i) => at(`k${i}`).y)).toEqual([0, 0]);
    expect(at('k0').x).toBe(0);
    expect(at('k3').x).toBe(0);
  });

  it('justify vale em cada linha: space-between e space-evenly', () => {
    const between = build(
      frame({ wrap: 'wrap', gap: 8, justify: 'space-between' }, kids(5)),
    );
    // linha 1: 3 filhos em 320 → extra (320 − 300) / 2 = 10; linha 2: 2 filhos, folga 120.
    expect([0, 1, 2].map((i) => between.at(`k${i}`).x)).toEqual([0, 110, 220]);
    expect([3, 4].map((i) => between.at(`k${i}`).x)).toEqual([0, 220]);
    const evenly = build(
      frame({ wrap: 'wrap', gap: 0, justify: 'space-evenly' }, kids(5)),
    );
    // linha 1: 3 × 100, folga 20 → 5 por vão; linha 2: 2 × 100, folga 120 → 40 por vão.
    expect([0, 1, 2].map((i) => evenly.at(`k${i}`).x)).toEqual([5, 110, 215]);
    expect([3, 4].map((i) => evenly.at(`k${i}`).x)).toEqual([40, 180]);
  });

  it('reverse espelha cada linha (não a pilha de linhas)', () => {
    const { at } = build(frame({ wrap: 'wrap', gap: 8, reverse: true }, kids(5)));
    // linha 1 (k0..k2) espelhada: k0 no fim; linha 2 (k3, k4), `start` passa a ser o fim.
    expect([0, 1, 2].map((i) => at(`k${i}`).x)).toEqual([220, 112, 4]);
    expect([3, 4].map((i) => at(`k${i}`).x)).toEqual([220, 112]);
    expect(at('k3').y).toBe(20);
  });

  it('align center no eixo cruzado vale dentro de cada linha', () => {
    const children = [
      rect('a', 100, 40),
      rect('b', 100, 20),
      rect('c', 100, 20),
      rect('d', 100, 10),
    ];
    const { at } = build(
      frame({ wrap: 'wrap', gap: 8, align: 'center', lineGap: 6 }, children),
    );
    // linha 1: a, b, c (altura 40): b e c centrados; linha 2: d sozinho (altura 10) em y = 46.
    expect(at('a').y).toBe(0);
    expect(at('b').y).toBe(10);
    expect(at('c').y).toBe(10);
    expect(at('d').y).toBe(46);
  });

  it('align baseline vale por linha, pela primeira linha de base de cada linha', () => {
    const text = (name: string, size: number, lineHeight: number): Json => ({
      type: 'text',
      name,
      text: 'Ok',
      width: 'hug',
      font: { size, lineHeight },
    });
    const children = [
      text('a', 14, 20),
      text('b', 22, 28),
      text('c', 14, 20),
      text('d', 14, 20),
      text('e', 22, 28),
    ];
    // Larguras: o texto "Ok" mede pouco; força a quebra com `maxPerLine` 2.
    const { at } = build(
      frame(
        { wrap: 'wrap', align: 'baseline', maxPerLine: 2, gap: 4, lineGap: 2 },
        children,
      ),
    );
    const small = lineBaseline(0, 20, {
      ascent: APPROX_ASCENT_RATIO * 14,
      descent: APPROX_DESCENT_RATIO * 14,
    });
    const big = lineBaseline(0, 28, {
      ascent: APPROX_ASCENT_RATIO * 22,
      descent: APPROX_DESCENT_RATIO * 22,
    });
    // linha 1 (a, b): as linhas de base coincidem; linha 2 (c, d): iguais, sem deslocar; linha 3: e sozinho.
    expect(at('a').y + small).toBeCloseTo(at('b').y + big, 6);
    expect(at('c').y).toBeCloseTo(at('d').y, 6);
    // a linha 2 começa depois da linha 1 (a altura da linha 1 + lineGap).
    const line1 = Math.max(at('a').y + 20, at('b').y + 28);
    expect(at('c').y).toBeCloseTo(line1 + 2, 6);
  });
});

describe('wrap: maxPerLine, maxLines e filho maior que a linha', () => {
  it('maxPerLine 2 quebra a cada 2 filhos mesmo com espaço', () => {
    const { at } = build(frame({ wrap: 'wrap', maxPerLine: 2, gap: 4 }, kids(5, 50)));
    expect([0, 1].map((i) => at(`k${i}`).y)).toEqual([0, 0]);
    expect([2, 3].map((i) => at(`k${i}`).y)).toEqual([20, 20]);
    expect(at('k4').y).toBe(40);
    expect(at('k1').x).toBe(54);
  });

  it('maxLines 1 não desenha o que passa da linha e avisa "<n> filhos fora de maxLines: <nó>"', () => {
    const result = build(frame({ wrap: 'wrap', gap: 8, maxLines: 1 }, kids(5)));
    expect(result.has('k2')).toBe(true);
    expect(result.has('k3')).toBe(false);
    expect(result.has('k4')).toBe(false);
    expect(result.warnings).toContain('2 filhos fora de maxLines: host');
    expect(result.messages.map((m) => m.code)).toContain(
      'engine.childrenOutsideMaxLines',
    );
  });

  it('maxLines com todos os filhos dentro não avisa', () => {
    const result = build(frame({ wrap: 'wrap', gap: 8, maxLines: 2 }, kids(5)));
    expect(result.has('k4')).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('um filho maior que a linha inteira fica sozinho numa linha (e avisa que não cabe)', () => {
    const children = [rect('a', 100), rect('big', 400), rect('b', 100)];
    const { at, warnings } = build(frame({ wrap: 'wrap', gap: 8, lineGap: 4 }, children));
    expect(at('a')).toMatchObject({ x: 0, y: 0 });
    expect(at('big')).toMatchObject({ x: 0, y: 24 });
    expect(at('b')).toMatchObject({ x: 0, y: 48 });
    expect(warnings).toContain('conteúdo maior que a caixa: host');
  });
});

describe('wrap: hug', () => {
  function measured(
    layout: Json,
    children: Json[],
    size: { width: number | null; height: number | null },
  ) {
    return measureComponent(
      file(
        frame(layout, children, {
          width: size.width ?? 'hug',
          height: size.height ?? 'hug',
        }),
        4,
        { sizing: { width: size.width === null ? 'hug' : size.width, height: 'hug' } },
      ) as never,
      {},
      size,
      { measure: approximateMeasurer },
    );
  }

  it('hug no eixo principal sem largura dada mede uma linha só (max-content)', () => {
    const size = measured({ wrap: 'wrap', gap: 8, lineGap: 12 }, kids(5), {
      width: null,
      height: null,
    });
    expect(size.width).toBe(5 * 100 + 4 * 8);
    expect(size.height).toBe(20);
  });

  it('hug no eixo cruzado é a soma das linhas com os lineGap', () => {
    const size = measured({ wrap: 'wrap', gap: 8, lineGap: 12 }, kids(5), {
      width: 320,
      height: null,
    });
    expect(size.height).toBe(20 + 12 + 20);
  });

  it('hug nos dois eixos com maxPerLine: a largura é a da linha mais cheia', () => {
    const size = measured({ wrap: 'wrap', gap: 8, lineGap: 4, maxPerLine: 2 }, kids(5), {
      width: null,
      height: null,
    });
    expect(size.width).toBe(2 * 100 + 8);
    expect(size.height).toBe(3 * 20 + 2 * 4);
  });
});

describe('wrap: repeat', () => {
  function repeatFile(extra: Json): Json {
    return frame({ type: 'column' }, [
      {
        type: 'repeat',
        name: 'rep',
        count: 5,
        direction: 'row',
        gap: 8,
        width: 'fill',
        template: { type: 'frame', name: 'cell', width: 100, height: 20, children: [] },
        ...extra,
      },
    ]);
  }

  it('um repeat em linha com wrap, lineGap e maxLines quebra as linhas como o quadro', () => {
    const result = build(repeatFile({ wrap: 'wrap', lineGap: 12 }));
    const cells = [...walk(result.root)].filter((n) => n.name === 'cell');
    expect(cells).toHaveLength(5);
    const boxes = absoluteBoxes(result.root);
    const ys = cells.map((c) => boxes.get(c.id)?.y);
    expect(ys).toEqual([0, 0, 0, 32, 32]);
    const limited = build(repeatFile({ wrap: 'wrap', lineGap: 12, maxLines: 1 }));
    expect([...walk(limited.root)].filter((n) => n.name === 'cell')).toHaveLength(3);
    expect(limited.warnings).toContain('2 filhos fora de maxLines: rep');
  });

  it('um repeat em linha com wrap e sem largura ocupa a largura do pai (senão não teria onde quebrar)', () => {
    const result = build(
      frame({ type: 'column' }, [
        {
          type: 'repeat',
          name: 'rep',
          count: 5,
          direction: 'row',
          gap: 8,
          wrap: 'wrap',
          lineGap: 12,
          template: { type: 'frame', name: 'cell', width: 100, height: 20, children: [] },
        },
      ]),
    );
    const boxes = absoluteBoxes(result.root);
    const cells = [...walk(result.root)].filter((n) => n.name === 'cell');
    expect(cells.map((c) => boxes.get(c.id)?.y)).toEqual([0, 0, 0, 32, 32]);
  });

  it('o repeat sem wrap continua numa linha só', () => {
    const result = build(repeatFile({}));
    const boxes = absoluteBoxes(result.root);
    const cells = [...walk(result.root)].filter((n) => n.name === 'cell');
    expect(new Set(cells.map((c) => boxes.get(c.id)?.y))).toEqual(new Set([0]));
  });
});

describe('wrap: validação', () => {
  const issues = (template: Json, version = 4): string[] =>
    validateComponent(file(template, version));

  const flow = (layout: Json): Json => frame(layout, kids(2));

  it('as chaves novas válidas passam, também por expressão', () => {
    expect(
      issues(
        flow({
          wrap: 'wrap-reverse',
          lineGap: { $field: 'g', default: 4 },
          maxPerLine: 3,
          maxLines: 2,
        }),
      ),
    ).toEqual([]);
    expect(issues(flow({ wrap: { $field: 'w' }, lineGap: 2 }))).toEqual([]);
  });

  it('lineGap, maxPerLine e maxLines sem wrap (ausente ou "none") são erro', () => {
    expect(issues(flow({ lineGap: 4 }))).toContain(
      'template.layout.lineGap: only valid with wrap',
    );
    expect(issues(flow({ wrap: 'none', maxPerLine: 2 }))).toContain(
      'template.layout.maxPerLine: only valid with wrap',
    );
    expect(issues(flow({ maxLines: 2 }))).toContain(
      'template.layout.maxLines: only valid with wrap',
    );
  });

  it('valores inválidos', () => {
    expect(issues(flow({ wrap: 'sim' })).join('\n')).toMatch(/template\.layout\.wrap/);
    expect(issues(flow({ wrap: 'wrap', lineGap: -1 })).join('\n')).toMatch(
      /template\.layout\.lineGap: .*greater than or equal to 0/,
    );
    expect(issues(flow({ wrap: 'wrap', maxPerLine: 0 })).join('\n')).toMatch(
      /template\.layout\.maxPerLine: .*integer/,
    );
    expect(issues(flow({ wrap: 'wrap', maxLines: 1.5 })).join('\n')).toMatch(
      /template\.layout\.maxLines: .*integer/,
    );
  });

  it('layout none não aceita wrap (só type vale)', () => {
    const list = issues(frame({ type: 'none', wrap: 'wrap' }, kids(1)));
    expect(list.join('\n')).toMatch(/template\.layout\.wrap: unknown key: wrap/);
  });

  it.each([1, 2, 3])('numa formatVersion %i as chaves novas são erro', (version) => {
    const list = issues(
      flow({ wrap: 'wrap', lineGap: 4, maxPerLine: 2, maxLines: 2 }),
      version,
    );
    for (const key of ['wrap', 'lineGap', 'maxPerLine', 'maxLines'])
      expect(list).toContain(`template.layout.${key}: ${V4}`);
  });

  it('o repeat aceita as quatro chaves e confere os valores', () => {
    const repeat = (extra: Json): Json =>
      frame({ type: 'column' }, [
        {
          type: 'repeat',
          count: 3,
          direction: 'row',
          template: { type: 'frame', children: [] },
          ...extra,
        },
      ]);
    expect(
      issues(repeat({ wrap: 'wrap', lineGap: 4, maxPerLine: 2, maxLines: 3 })),
    ).toEqual([]);
    expect(issues(repeat({ lineGap: 4 }))).toContain(
      'template.children[0].lineGap: only valid with wrap',
    );
    expect(issues(repeat({ wrap: 'x' })).join('\n')).toMatch(
      /template\.children\[0\]\.wrap/,
    );
    expect(issues(repeat({ wrap: 'wrap' }), 3)).toContain(
      `template.children[0].wrap: ${V4}`,
    );
  });

  it('o schema JSON aceita as chaves novas (quadro, slot e repeat)', () => {
    const doc = file(
      frame({ wrap: 'wrap', lineGap: 4, maxPerLine: 3, maxLines: 2 }, [
        {
          type: 'repeat',
          count: 3,
          wrap: 'wrap-reverse',
          lineGap: 2,
          maxPerLine: 2,
          maxLines: 2,
          template: { type: 'frame', children: [] },
        },
        { type: 'slot', layout: { type: 'row', wrap: 'wrap', lineGap: 1 } },
      ]),
    );
    expect(checkSchema(schema, doc)).toEqual([]);
    // Expressão em `wrap` (`$if`, `$switch`) vale os valores de `wrap`, não os do `justify`.
    const byField = (wrap: Json) => file(frame({ wrap }, kids(1)));
    expect(
      checkSchema(
        schema,
        byField({ $if: { $field: 'x' }, then: 'wrap', else: 'wrap-reverse' }),
      ),
    ).toEqual([]);
    expect(
      checkSchema(
        schema,
        byField({ $switch: 'm', cases: { a: 'wrap' }, default: 'none' }),
      ),
    ).toEqual([]);
    expect(
      checkSchema(
        schema,
        byField({ $if: { $field: 'x' }, then: 'space-between', else: 'none' }),
      ).length,
    ).toBeGreaterThan(0);
    const bad = file(frame({ wrap: 'zig' }, []));
    expect(checkSchema(schema, bad).length).toBeGreaterThan(0);
  });
});
