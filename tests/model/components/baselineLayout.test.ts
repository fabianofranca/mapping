// MC1 (decisões 2 a 5 da #898): a linha de base nos medidores, `baselinePadding` no nó `text` e
// `layout.align: "baseline"` (quadro, `repeat`) e a validação das chaves novas.
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
  type MeasureFont,
  type TextMeasurer,
} from '../../../src/model/components/instantiate';
import { validateComponent } from '../../../src/model/components/parseComponent';
import {
  absoluteBoxes,
  walk,
  type SceneNode,
  type TextNode,
} from '../../../src/model/components/scene';
import { checkSchema } from '../../support/jsonSchema';

const schema: Record<string, unknown> = JSON.parse(
  readFileSync(new URL('../../../docs/component.schema.json', import.meta.url), 'utf8'),
);

const V4 = 'only allowed with formatVersion 4';
type Json = Record<string, unknown>;

/** Roboto 14/20 do Compose: a linha de base do aproximado dá ≈ 15 (14,83). */
const FONT: MeasureFont = {
  family: 'Inter',
  size: 14,
  weight: 400,
  italic: false,
  lineHeight: 20,
  letterSpacing: 0,
};
const BASE_14 = lineBaseline(0, 20, {
  ascent: APPROX_ASCENT_RATIO * 14,
  descent: APPROX_DESCENT_RATIO * 14,
});
const BASE_22 = lineBaseline(0, 28, {
  ascent: APPROX_ASCENT_RATIO * 22,
  descent: APPROX_DESCENT_RATIO * 22,
});

function file(template: Json, formatVersion = 4): Json {
  return {
    format: COMPONENT_FORMAT,
    formatVersion,
    id: 'c',
    name: 'C',
    size: { width: 300, height: 100 },
    template,
  };
}

function text(name: string, size: number, lineHeight: number, extra: Json = {}): Json {
  return {
    type: 'text',
    name,
    text: 'Ok',
    font: { size, lineHeight },
    ...extra,
  };
}

function build(template: Json, box = { x: 0, y: 0, width: 300, height: 100 }) {
  const result = instantiate(file(template) as never, {}, box, {
    measure: approximateMeasurer,
  });
  const boxes = absoluteBoxes(result.root);
  const nodes = [...walk(result.root)];
  const at = (name: string): { node: SceneNode; box: { x: number; y: number } } => {
    const node = nodes.find((n) => n.name === name);
    if (node === undefined) throw new Error(`sem nó ${name}`);
    return { node, box: boxes.get(node.id) ?? { x: 0, y: 0 } };
  };
  return { ...result, at };
}

describe('medidor aproximado: linha de base', () => {
  it('Roboto 14/20 dá 15 na primeira linha (14,83 sem arredondar)', () => {
    const m = approximateMeasurer('Ok', FONT);
    expect(m.firstBaseline).toBeCloseTo(BASE_14, 6);
    expect(Math.round(m.firstBaseline ?? 0)).toBe(15);
    expect(m.lastBaseline).toBe(m.firstBaseline);
    expect(m.lineCount).toBe(1);
  });

  it('com duas linhas a última está uma altura de linha abaixo', () => {
    const m = approximateMeasurer('Ok', { ...FONT }, 1);
    expect(m.lineCount).toBeGreaterThanOrEqual(1);
    const two = approximateMeasurer('um\ndois', FONT);
    expect(two.lineCount).toBe(2);
    expect((two.lastBaseline ?? 0) - (two.firstBaseline ?? 0)).toBeCloseTo(20, 6);
  });
});

describe('baselinePadding no nó text', () => {
  const column = (node: Json): Json => ({
    type: 'frame',
    layout: { type: 'column', align: 'start' },
    height: 'hug',
    children: [node],
  });

  it('top maior que a linha de base da fonte: o hug mede top + o que sobra embaixo', () => {
    const { at } = build(column(text('t', 14, 20, { baselinePadding: { top: 30 } })), {
      x: 0,
      y: 0,
      width: 300,
      height: 100,
    });
    const t = at('t').node as TextNode;
    expect(t.style.baselineTop).toBe(30);
    expect(t.height).toBeCloseTo(30 + (20 - BASE_14), 6);
  });

  it('top menor que a da fonte: vale a da fonte (como o paddingFromBaseline do Compose)', () => {
    const { at } = build(column(text('t', 14, 20, { baselinePadding: { top: 5 } })));
    const t = at('t').node as TextNode;
    expect(t.style.baselineTop).toBeCloseTo(BASE_14, 6);
    expect(t.height).toBeCloseTo(20, 6);
  });

  it('bottom: a distância da última linha de base ao fundo, nunca menor que a da fonte', () => {
    const big = build(column(text('t', 14, 20, { baselinePadding: { bottom: 10 } })));
    expect(big.at('t').node.height).toBeCloseTo(BASE_14 + 10, 6);
    expect((big.at('t').node as TextNode).style.baselineTop).toBeUndefined();
    const small = build(column(text('t', 14, 20, { baselinePadding: { bottom: 1 } })));
    expect(small.at('t').node.height).toBeCloseTo(20, 6);
  });

  it('top e bottom juntos somam as duas distâncias', () => {
    const { at } = build(
      column(text('t', 14, 20, { baselinePadding: { top: 30, bottom: 12 } })),
    );
    expect(at('t').node.height).toBeCloseTo(30 + 12, 6);
  });

  it('duas linhas: a altura soma a distância entre a primeira e a última linha de base', () => {
    const { at } = build(
      column({
        type: 'text',
        name: 't',
        text: 'a\nb',
        font: { size: 14, lineHeight: 20 },
        baselinePadding: { top: 30, bottom: 12 },
      }),
    );
    expect(at('t').node.height).toBeCloseTo(30 + 20 + 12, 6);
  });

  it('sem baselinePadding nada muda: a altura é a medida e a cena não traz baselineTop', () => {
    const { at } = build(column(text('t', 14, 20)));
    expect(at('t').node.height).toBe(20);
    expect((at('t').node as TextNode).style.baselineTop).toBeUndefined();
  });

  it('o verticalAlign vindo de expressão deixa de valer no nó que tem top', () => {
    const { at } = build({
      type: 'frame',
      children: [
        {
          type: 'text',
          name: 't',
          anchors: { left: 0, top: 0 },
          width: 100,
          height: 60,
          text: 'Ok',
          font: {
            size: 14,
            lineHeight: 20,
            verticalAlign: { $switch: 'm', cases: { a: 'middle' }, default: 'bottom' },
          },
          baselinePadding: { top: 30 },
        },
      ],
    });
    const t = at('t').node as TextNode;
    expect(t.style.baselineTop).toBe(30);
    expect(t.style.verticalAlign).toBe('top');
  });

  it('o top aceita expressão (campo)', () => {
    const result = instantiate(
      file({
        type: 'frame',
        layout: { type: 'column' },
        children: [text('t', 14, 20, { baselinePadding: { top: { $field: 'top' } } })],
      }) as never,
      { top: 40 },
      { x: 0, y: 0, width: 300, height: 100 },
      { measure: approximateMeasurer },
    );
    const t = [...walk(result.root)].find((n): n is TextNode => n.type === 'text');
    expect(t?.style.baselineTop).toBe(40);
  });
});

describe('layout.align: "baseline"', () => {
  const row = (children: Json[], extra: Json = {}): Json => ({
    type: 'frame',
    layout: { type: 'column' },
    children: [
      {
        type: 'frame',
        name: 'r',
        height: 'hug',
        layout: { type: 'row', align: 'baseline', gap: 4, ...extra },
        children,
      },
    ],
  });

  it('textos de 14 e 22 px ficam na mesma linha de base e a fileira mede do topo ao fundo', () => {
    const { at } = build(row([text('a', 14, 20), text('b', 22, 28)]));
    const a = at('a');
    const b = at('b');
    expect(a.box.y + BASE_14).toBeCloseTo(b.box.y + BASE_22, 6);
    expect(Math.min(a.box.y, b.box.y)).toBeCloseTo(0, 6);
    const top = Math.max(BASE_14, BASE_22);
    const low = Math.max(20 - BASE_14, 28 - BASE_22);
    expect(at('r').node.height).toBeCloseTo(top + low, 6);
  });

  it('o baselinePadding.top do texto entra na linha de base do filho', () => {
    const { at } = build(
      row([text('a', 14, 20, { baselinePadding: { top: 30 } }), text('b', 22, 28)]),
    );
    expect(at('a').box.y + 30).toBeCloseTo(at('b').box.y + BASE_22, 6);
  });

  it('um quadro com texto dentro usa a linha de base do primeiro filho que tem uma', () => {
    const { at } = build(
      row([
        {
          type: 'frame',
          name: 'f',
          width: 80,
          height: 'hug',
          layout: { type: 'column', padding: 6 },
          children: [{ type: 'rect', height: 4 }, text('in', 22, 28)],
        },
        text('b', 14, 20),
      ]),
    );
    const inner = at('in');
    expect(inner.box.y + BASE_22).toBeCloseTo(at('b').box.y + BASE_14, 6);
  });

  it('um rect sem linha de base alinha o fundo da caixa com a linha de base dos textos', () => {
    const { at } = build(
      row([{ type: 'rect', name: 'r1', width: 10, height: 12 }, text('b', 14, 20)]),
    );
    const bottomOfRect = at('r1').box.y + 12;
    expect(bottomOfRect).toBeCloseTo(at('b').box.y + BASE_14, 6);
  });

  it('num repeat em linha, as linhas também alinham pela linha de base', () => {
    const { at } = build({
      type: 'frame',
      name: 'host',
      layout: { type: 'column' },
      children: [
        {
          type: 'repeat',
          name: 'rep',
          count: 2,
          direction: 'row',
          gap: 4,
          template: {
            type: 'frame',
            layout: { type: 'row', align: 'baseline' },
            height: 'hug',
            children: [text('x', 14, 20), text('y', 22, 28)],
          },
        },
      ],
    });
    const boxes = absoluteBoxes(at('host').node as never);
    const xs = [...walk(at('host').node as never)].filter((n) => n.name === 'x');
    const ys = [...walk(at('host').node as never)].filter((n) => n.name === 'y');
    expect(xs.length).toBe(2);
    xs.forEach((n, i) => {
      const other = ys[i] as SceneNode;
      expect((boxes.get(n.id)?.y ?? 0) + BASE_14).toBeCloseTo(
        (boxes.get(other.id)?.y ?? 0) + BASE_22,
        6,
      );
    });
  });

  it('numa column, baseline vindo de expressão cai em start com o aviso de valor inválido', () => {
    const result = instantiate(
      file({
        type: 'frame',
        layout: { type: 'column', align: { $field: 'a' } },
        children: [text('a', 14, 20)],
      }) as never,
      { a: 'baseline' },
      { x: 0, y: 0, width: 300, height: 100 },
      { measure: approximateMeasurer },
    );
    expect(result.warnings).toContain('valor inválido em layout.align: baseline');
  });

  it('numa versão 3, baseline vindo de expressão também cai em start com o aviso', () => {
    const result = instantiate(
      file(
        {
          type: 'frame',
          layout: { type: 'row', align: { $field: 'a' } },
          children: [text('a', 14, 20)],
        },
        3,
      ) as never,
      { a: 'baseline' },
      { x: 0, y: 0, width: 300, height: 100 },
      { measure: approximateMeasurer },
    );
    expect(result.warnings).toContain('valor inválido em layout.align: baseline');
  });
});

describe('medidor sem linha de base', () => {
  it('cai na conta do aproximado', () => {
    const bare: TextMeasurer = (value, font, maxWidth) => {
      const { width, height, lines } = approximateMeasurer(value, font, maxWidth);
      return { width, height, ...(lines ? { lines } : {}) };
    };
    const result = instantiate(
      file({
        type: 'frame',
        layout: { type: 'column' },
        height: 'hug',
        children: [text('t', 14, 20, { baselinePadding: { top: 30 } })],
      }) as never,
      {},
      { x: 0, y: 0, width: 300, height: 100 },
      { measure: bare },
    );
    const t = [...walk(result.root)].find((n): n is TextNode => n.type === 'text');
    expect(t?.style.baselineTop).toBe(30);
    expect(t?.height).toBeCloseTo(30 + 20 - BASE_14, 6);
  });
});

describe('validação de baselinePadding e align: "baseline"', () => {
  const label = (extra: Json, version = 4): Json =>
    file(
      {
        type: 'frame',
        children: [{ type: 'text', text: 'Ok', font: { size: 14 }, ...extra } as Json],
      },
      version,
    );
  const rowAlign = (align: unknown, type = 'row', version = 4): Json =>
    file(
      {
        type: 'frame',
        layout: { type, align },
        children: [text('a', 14, 20)],
      },
      version,
    );

  it('aceita top, bottom e expressão no formato 4', () => {
    expect(validateComponent(label({ baselinePadding: { top: 30, bottom: 8 } }))).toEqual(
      [],
    );
    expect(
      validateComponent(label({ baselinePadding: { top: { $field: 'x', default: 1 } } })),
    ).toEqual([]);
    expect(validateComponent(rowAlign('baseline'))).toEqual([]);
  });

  it.each([1, 2, 3])('numa versão %i as chaves novas falham com v4Only', (version) => {
    expect(validateComponent(label({ baselinePadding: { top: 30 } }, version))).toEqual([
      `template.children[0].baselinePadding: ${V4}`,
    ]);
    expect(validateComponent(rowAlign('baseline', 'row', version))).toEqual([
      `template.layout.align: ${V4}`,
    ]);
  });

  it('baseline literal numa column é erro', () => {
    expect(validateComponent(rowAlign('baseline', 'column'))).toEqual([
      'template.layout.align: baseline is only valid in row',
    ]);
  });

  it('baselinePadding.top não combina com verticalAlign literal', () => {
    for (const verticalAlign of ['top', 'middle', 'bottom', 'cap-middle'])
      expect(
        validateComponent(
          label({ baselinePadding: { top: 30 }, font: { size: 14, verticalAlign } }),
        ),
      ).toEqual([
        'template.children[0].baselinePadding.top: does not combine with verticalAlign',
      ]);
    expect(
      validateComponent(
        label({
          baselinePadding: { bottom: 8 },
          font: { size: 14, verticalAlign: 'middle' },
        }),
      ),
    ).toEqual([]);
  });

  it('rejeita números negativos, chave desconhecida e tipo errado', () => {
    expect(validateComponent(label({ baselinePadding: { top: -1 } }))).toEqual([
      'template.children[0].baselinePadding.top: expected a number greater than or equal to 0',
    ]);
    expect(validateComponent(label({ baselinePadding: { bottom: -2 } }))).toEqual([
      'template.children[0].baselinePadding.bottom: expected a number greater than or equal to 0',
    ]);
    expect(validateComponent(label({ baselinePadding: { left: 1 } }))).toEqual([
      'template.children[0].baselinePadding.left: unknown key: left',
    ]);
    expect(validateComponent(label({ baselinePadding: 4 }))).toEqual([
      'template.children[0].baselinePadding: expected an object',
    ]);
  });

  it('o schema JSON aceita as chaves novas', () => {
    expect(
      checkSchema(schema, label({ baselinePadding: { top: 30, bottom: 8 } })),
    ).toEqual([]);
    expect(checkSchema(schema, rowAlign('baseline'))).toEqual([]);
  });
});
