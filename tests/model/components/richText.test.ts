// Formato 4, fase CF4: texto rico (`runs`): trechos com estilo próprio que quebram linha como UM
// texto só, e a caixa em linha (chip: `background` + `radius` + `padding`).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkSchema } from '../../support/jsonSchema';
import type {
  ComponentFile,
  FieldValues,
} from '../../../src/model/components/componentFormat';
import { referencedFields } from '../../../src/model/components/expressions';
import {
  approximateMeasurer,
  instantiate,
  measureComponent,
  type MeasureFont,
} from '../../../src/model/components/instantiate';
import {
  collectFieldKeys,
  parseComponent,
  validateComponent,
} from '../../../src/model/components/parseComponent';
import {
  layoutRuns,
  measureRichText,
  type RichBase,
  type RichRun,
} from '../../../src/model/components/richText';
import { expandRepeats } from '../../../src/model/components/repeat';
import { walk, type TextNode } from '../../../src/model/components/scene';

const V4 = 'só é permitido com formatVersion 4';

// ---------------------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------------------

function component(
  child: Record<string, unknown>,
  version = 4,
  size = { width: 100, height: 40 },
): Record<string, unknown> {
  return {
    format: 'mapping-component',
    formatVersion: version,
    id: 'c',
    name: 'C',
    size,
    template: { type: 'frame', children: [child] },
  };
}

const richNode = (runs: unknown, extra: Record<string, unknown> = {}) => ({
  type: 'text',
  runs,
  ...extra,
});

const RUNS = [{ text: 'Vence em ' }, { text: '3 dias', weight: 700 }];

describe('validação de runs', () => {
  it('aceita trechos na formatVersion 4', () => {
    expect(validateComponent(component(richNode(RUNS)))).toEqual([]);
    const result = parseComponent(component(richNode(RUNS)));
    expect(result.ok).toBe(true);
  });

  it('aceita todas as chaves do trecho, com literal ou expressão', () => {
    const run = {
      text: { $field: 'nome', default: 'x' },
      weight: { $switch: 'tom', cases: { forte: 700 }, default: 400 },
      italic: { $field: 'it' },
      color: { $if: { $has: 'nome' }, then: '#ff0000', else: '#000000' },
      decoration: 'underline',
      family: 'Inter',
      size: 12,
      background: '#eeeeee',
      radius: 4,
      padding: [2, 6],
    };
    expect(validateComponent(component(richNode([run, { ...run, padding: 3 }])))).toEqual(
      [],
    );
  });

  it('na formatVersion 3 falha só com "só é permitido com formatVersion 4" em …runs', () => {
    expect(validateComponent(component(richNode(RUNS), 3))).toEqual([
      `template.children[0].runs: ${V4}`,
    ]);
  });

  it('text e runs no mesmo nó falha no caminho do nó', () => {
    expect(validateComponent(component(richNode(RUNS, { text: 'a' })))).toEqual([
      'template.children[0]: text e runs juntos: use um ou outro',
    ]);
  });

  it('sem text nem runs mantém o erro de hoje', () => {
    expect(validateComponent(component({ type: 'text' }))).toEqual([
      'template.children[0].text: campo obrigatório',
    ]);
  });

  it.each([[[]], ['texto'], [{ text: 'a' }]])('runs %j não é lista não vazia', (bad) => {
    expect(validateComponent(component(richNode(bad)))).toEqual([
      'template.children[0].runs: esperava lista não vazia de trechos',
    ]);
  });

  it('chave desconhecida no trecho falha no caminho do trecho', () => {
    expect(
      validateComponent(component(richNode([{ text: 'a' }, { text: 'b', bogus: 1 }]))),
    ).toEqual(['template.children[0].runs[1].bogus: chave desconhecida: bogus']);
  });

  it('trecho sem text falha', () => {
    expect(validateComponent(component(richNode([{ weight: 700 }])))).toEqual([
      'template.children[0].runs[0].text: campo obrigatório',
    ]);
  });

  it('valores inválidos dos trechos falham no caminho da chave', () => {
    const bad = (key: string, value: unknown) =>
      validateComponent(component(richNode([{ text: 'a', [key]: value }]))).map(
        (e) => e.split(':')[0],
      );
    expect(bad('weight', 50)).toEqual(['template.children[0].runs[0].weight']);
    expect(bad('radius', -1)).toEqual(['template.children[0].runs[0].radius']);
    expect(bad('padding', -1)).toEqual(['template.children[0].runs[0].padding']);
    expect(bad('padding', [1, 2, 3, 4])).toEqual([
      'template.children[0].runs[0].padding',
    ]);
    expect(bad('background', 3)).toEqual(['template.children[0].runs[0].background']);
    expect(bad('size', 'grande')).toEqual(['template.children[0].runs[0].size']);
    expect(bad('decoration', 'blink')).toEqual([
      'template.children[0].runs[0].decoration',
    ]);
  });

  it('família literal inválida num trecho vira aviso', () => {
    const result = parseComponent(
      component(richNode([{ text: 'a', family: 'Inter, "aberta' }])),
    );
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.warnings.map((w) => w.path)).toEqual([
        'template.children[0].runs[0].family',
      ]);
  });
});

// ---------------------------------------------------------------------------------------
// Campos por instância
// ---------------------------------------------------------------------------------------

function richFile(node: Record<string, unknown>, width = 100): ComponentFile {
  return {
    format: 'mapping-component',
    formatVersion: 4,
    id: 'r',
    name: 'R',
    size: { width, height: 40 },
    template: {
      type: 'frame',
      layout: { type: 'none' },
      children: [
        {
          type: 'text',
          name: 't',
          anchors: { left: 0, top: 0 },
          width,
          height: 'hug',
          ...node,
        },
      ],
    } as ComponentFile['template'],
  };
}

function textOf(file: ComponentFile, values: FieldValues, width = 100): TextNode {
  const { height } = measureComponent(
    file,
    values,
    { width, height: null },
    { measure: approximateMeasurer },
  );
  const { root } = instantiate(
    file,
    values,
    { x: 0, y: 0, width, height },
    { measure: approximateMeasurer },
  );
  const found = [...walk(root)].find((n): n is TextNode => n.type === 'text');
  if (!found) throw new Error('sem nó de texto');
  return found;
}

describe('runs por instância', () => {
  const file = richFile({
    font: { size: 14 },
    color: '#111111',
    runs: [
      { text: 'Vence em ' },
      {
        text: { $field: 'dias' },
        weight: 700,
        color: { $switch: 'urgencia', cases: { alta: '#ff0000' }, default: '#00ff00' },
      },
    ],
  });

  it('$field no text do trecho e $switch na cor resolvem por instância', () => {
    const a = textOf(file, { dias: '3 dias', urgencia: 'alta' });
    const b = textOf(file, { dias: '10 dias', urgencia: 'baixa' });
    expect(a.runs?.map((r) => r.text)).toEqual(['Vence em ', '3 dias']);
    expect(b.runs?.map((r) => r.text)).toEqual(['Vence em ', '10 dias']);
    expect(a.runs?.[1]?.color).toBe('#ff0000');
    expect(b.runs?.[1]?.color).toBe('#00ff00');
    expect(a.text).toBe('Vence em 3 dias');
    expect(a).not.toEqual(b);
  });

  it('o trecho herda a fonte e a cor do nó e sobrepõe o que declara', () => {
    const a = textOf(file, { dias: '3', urgencia: 'alta' });
    expect(a.runs?.[0]).toMatchObject({
      fontSize: 14,
      fontWeight: 400,
      color: '#111111',
      italic: false,
    });
    expect(a.runs?.[1]).toMatchObject({ fontWeight: 700, fontSize: 14 });
    expect(a.runs?.[0]?.background).toBeUndefined();
  });

  it('um trecho literal só de espaços fica (o vão entre o negrito e o chip); o de campo vazio some', () => {
    const spaced = richFile({
      font: { size: 14 },
      runs: [
        { text: 'Mmmm' },
        { text: ' ' },
        { text: { $field: 'dias' }, background: '#00ACC1', padding: [3, 6] },
      ],
    });
    const node = textOf(spaced, { dias: 'novo' }, 200);
    expect(node.runs?.map((r) => r.text)).toEqual(['Mmmm', ' ', 'novo']);
    const [word, space, chip] = node.runLayout?.lines[0]?.pieces ?? [];
    expect(space?.width).toBeGreaterThan(0);
    expect(chip?.x).toBeCloseTo((word?.width ?? 0) + (space?.width ?? 0), 6);
    // Campo cheio de espaços continua vazio (cai no fallback).
    const blank = textOf(spaced, { dias: '   ' }, 200);
    expect(blank.runs?.map((r) => r.text)).toEqual(['Mmmm', ' ', '']);
  });

  it('nó sem runs não ganha runs nem runLayout', () => {
    const plain = textOf(richFile({ text: 'oi' }), {});
    expect(plain.runs).toBeUndefined();
    expect(plain.runLayout).toBeUndefined();
  });

  it('trecho com background vira caixa em linha na cena (padding [v, h])', () => {
    const chip = richFile({
      font: { size: 14 },
      runs: [{ text: 'ok', background: '#eeeeee', radius: 4, padding: [2, 6] }],
    });
    const node = textOf(chip, {});
    expect(node.runs?.[0]).toMatchObject({
      background: '#eeeeee',
      radius: 4,
      padding: [2, 6],
    });
  });

  it('$field dentro de runs conta como campo citado', () => {
    const keys = collectFieldKeys(file);
    expect(keys).toEqual(['dias', 'urgencia']);
    expect([...referencedFields(file.template)].sort()).toEqual(['dias', 'urgencia']);
  });

  it('runs dentro de repeat: a coluna sombreia o campo e cada linha tem seu texto', () => {
    const table: ComponentFile = {
      format: 'mapping-component',
      formatVersion: 4,
      id: 'tab',
      name: 'Tab',
      size: { width: 100, height: 80 },
      template: {
        type: 'frame',
        layout: { type: 'column' },
        children: [
          {
            type: 'repeat',
            field: 'rows',
            template: {
              type: 'frame',
              children: [
                { type: 'text', runs: [{ text: 'Item ' }, { text: { $field: 'nome' } }] },
              ],
            },
          },
        ],
      },
    };
    const values: FieldValues = {
      nome: 'do tipo',
      rows: [{ nome: 'A' }, { nome: 'B' }],
    };
    const { root } = instantiate(
      table,
      values,
      { x: 0, y: 0, width: 100, height: 80 },
      { measure: approximateMeasurer },
    );
    const texts = [...walk(root)]
      .filter((n): n is TextNode => n.type === 'text')
      .map((n) => n.text);
    expect(texts).toEqual(['Item A', 'Item B']);
    // a expansão reescreve o `$field` do trecho para o campo da linha
    const expanded = expandRepeats(table, values);
    expect(JSON.stringify(expanded.component.template)).toContain('$r0_0:nome');
  });
});

// ---------------------------------------------------------------------------------------
// Layout dos trechos
// ---------------------------------------------------------------------------------------

/** 14 px: 7,7 px por caractere (peso 400) ou 8,4 (peso 700); linha de 16,8 px. */
const FONT: MeasureFont = {
  family: 'Inter',
  size: 14,
  weight: 400,
  italic: false,
  lineHeight: 16.8,
  letterSpacing: 0,
};
const BASE: RichBase = { size: 14, lineHeight: 16.8 };
const CHIP = { padding: [2, 6] as const };

const run = (
  text: string,
  font: Partial<MeasureFont> = {},
  chip?: { padding: readonly [number, number] },
): RichRun => ({ text, font: { ...FONT, ...font }, ...(chip ? { chip } : {}) });

const lineTexts = (layout: ReturnType<typeof layoutRuns>): string[] =>
  layout.lines.map((l) => l.pieces.map((p) => p.text).join(''));

describe('quebra de linha dos trechos', () => {
  const runs = [run('Pagar '), run('fatura do cartão', { weight: 700 })];

  it('quebra pela palavra como um texto só, não por trecho', () => {
    const layout = layoutRuns(runs, BASE, approximateMeasurer, 100);
    expect(lineTexts(layout)).toEqual(['Pagar fatura', 'do cartão']);
    // a primeira linha mistura os dois trechos
    expect(layout.lines[0]?.pieces.map((p) => p.run)).toEqual([0, 1]);
  });

  it('a altura medida (hug) é igual à runLayout.height da cena', () => {
    const file = richFile({
      font: { size: 14 },
      runs: [{ text: 'Pagar ' }, { text: 'fatura do cartão', weight: 700 }],
    });
    const { height } = measureComponent(
      file,
      {},
      { width: 100, height: null },
      { measure: approximateMeasurer },
    );
    const node = textOf(file, {});
    expect(node.runLayout?.height).toBeCloseTo(height, 6);
    expect(node.runLayout?.lines).toHaveLength(2);
    expect(height).toBeCloseTo(2 * 16.8, 6);
  });

  it('palavra que atravessa trechos sem espaço entre eles é uma palavra só', () => {
    const layout = layoutRuns(
      [run('um Pa'), run('gar', { weight: 700 })],
      BASE,
      approximateMeasurer,
      30,
    );
    // "Pa"+"gar" não se separa: vai inteira para a segunda linha
    expect(lineTexts(layout)).toEqual(['um', 'Pagar']);
    expect(layout.lines[1]?.pieces.map((p) => p.run)).toEqual([0, 1]);
  });

  it('palavra maior que a largura fica sozinha na linha', () => {
    const layout = layoutRuns([run('a ccccccccccc b')], BASE, approximateMeasurer, 40);
    expect(lineTexts(layout)).toEqual(['a', 'ccccccccccc', 'b']);
  });

  it('\\n num trecho sem fundo força quebra', () => {
    const layout = layoutRuns([run('a\nb')], BASE, approximateMeasurer, 500);
    expect(lineTexts(layout)).toEqual(['a', 'b']);
    expect(layout.height).toBeCloseTo(2 * 16.8, 6);
  });

  it('a altura de linha de um trecho maior escala com o tamanho', () => {
    const layout = layoutRuns(
      [run('a '), run('B', { size: 28 })],
      BASE,
      approximateMeasurer,
      200,
    );
    expect(layout.lines[0]?.height).toBeCloseTo(33.6, 6);
  });

  it('align centraliza cada linha contra a largura da caixa', () => {
    const layout = layoutRuns(
      [run('abc')],
      { ...BASE, align: 'center' },
      approximateMeasurer,
      100,
    );
    const piece = layout.lines[0]?.pieces[0];
    expect(piece?.x).toBeCloseTo((100 - 3 * 7.7) / 2, 6);
    const right = layoutRuns(
      [run('abc')],
      { ...BASE, align: 'right' },
      approximateMeasurer,
      100,
    );
    expect(right.lines[0]?.pieces[0]?.x).toBeCloseTo(100 - 3 * 7.7, 6);
  });
});

describe('caixa em linha (chip)', () => {
  it('largura = texto + 2·h, altura = linha + 2·v', () => {
    const layout = layoutRuns([run('vencida', {}, CHIP)], BASE, approximateMeasurer, 200);
    const piece = layout.lines[0]?.pieces[0];
    expect(piece?.text).toBe('vencida');
    expect(piece?.width).toBeCloseTo(7 * 7.7 + 12, 6);
    expect(piece?.height).toBeCloseTo(16.8 + 4, 6);
    expect(layout.lines[0]?.height).toBeCloseTo(20.8, 6);
  });

  it('não cabe no resto da linha: vai inteiro para a linha de baixo', () => {
    // "Pagar" 38,5 + espaço 7,7 + chip 65,9 = 112,1 > 100
    const layout = layoutRuns(
      [run('Pagar '), run('vencida', {}, CHIP)],
      BASE,
      approximateMeasurer,
      100,
    );
    expect(lineTexts(layout)).toEqual(['Pagar', 'vencida']);
    expect(layout.lines[1]?.pieces).toHaveLength(1);
    expect(layout.lines[1]?.pieces[0]?.width).toBeCloseTo(65.9, 6);
  });

  it('maior que a linha inteira fica sozinho e passa da largura, sem quebrar', () => {
    const layout = layoutRuns(
      [run('vencida muito longa', {}, CHIP)],
      BASE,
      approximateMeasurer,
      50,
    );
    expect(layout.lines).toHaveLength(1);
    expect(layout.lines[0]?.pieces[0]?.text).toBe('vencida muito longa');
    expect(layout.width).toBeGreaterThan(50);
  });

  it('\\n dentro do chip vira espaço', () => {
    const layout = layoutRuns([run('a\nb', {}, CHIP)], BASE, approximateMeasurer, 500);
    expect(layout.lines).toHaveLength(1);
    expect(layout.lines[0]?.pieces[0]?.text).toBe('a b');
  });

  it('chip no começo da linha mantém o espaço inicial; trecho sem fundo o perde', () => {
    // linha 1: "Pagar a" (53,9); o resto não cabe em 90
    const withChip = layoutRuns(
      [run('Pagar a '), run(' novo', {}, CHIP)],
      BASE,
      approximateMeasurer,
      90,
    );
    expect(withChip.lines).toHaveLength(2);
    const chipPiece = withChip.lines[1]?.pieces[0];
    expect(chipPiece?.text).toBe(' novo');
    expect(chipPiece?.width).toBeCloseTo(5 * 7.7 + 12, 6);

    const plain = layoutRuns(
      [run('Pagar a '), run(' novo')],
      BASE,
      approximateMeasurer,
      90,
    );
    expect(lineTexts(plain)).toEqual(['Pagar a', 'novo']);
    expect(plain.lines[1]?.pieces[0]?.width).toBeCloseTo(4 * 7.7, 6);
  });

  it('o espaço do trecho sem fundo antes do chip conta como espaço entre eles', () => {
    const layout = layoutRuns(
      [run('a '), run('b', {}, CHIP), run(' c')],
      BASE,
      approximateMeasurer,
      500,
    );
    expect(lineTexts(layout)).toEqual(['a b c']);
    const xs = layout.lines[0]?.pieces.map((p) => p.x);
    expect(xs?.[0]).toBe(0);
    // "a " (2 caracteres) e depois o chip
    expect(xs?.[1]).toBeCloseTo(2 * 7.7, 6);
  });
});

describe('wrap, ellipsis e maxLines nos trechos', () => {
  const runs = [run('Pagar '), run('fatura do cartão', { weight: 700 })];

  it('wrap "none": só \\n quebra', () => {
    const layout = layoutRuns(runs, { ...BASE, wrap: 'none' }, approximateMeasurer, 100);
    expect(lineTexts(layout)).toEqual(['Pagar fatura do cartão']);
    expect(layout.width).toBeGreaterThan(100);
    const two = layoutRuns(
      [run('a\nb')],
      { ...BASE, wrap: 'none' },
      approximateMeasurer,
      100,
    );
    expect(lineTexts(two)).toEqual(['a', 'b']);
  });

  it('wrap "none" + ellipsis: a linha termina em … e cabe na caixa', () => {
    const layout = layoutRuns(
      runs,
      { ...BASE, wrap: 'none', ellipsis: true },
      approximateMeasurer,
      100,
    );
    expect(layout.lines).toHaveLength(1);
    expect(lineTexts(layout)[0]?.endsWith('…')).toBe(true);
    expect(layout.width).toBeLessThanOrEqual(100 + 1e-6);
  });

  it('maxLines sem ellipsis mantém as N primeiras linhas', () => {
    const layout = layoutRuns(runs, { ...BASE, maxLines: 1 }, approximateMeasurer, 100);
    expect(lineTexts(layout)).toEqual(['Pagar fatura']);
    expect(layout.height).toBeCloseTo(16.8, 6);
  });

  it('maxLines 1 + ellipsis corta no meio de um trecho e termina em …', () => {
    const layout = layoutRuns(
      runs,
      { ...BASE, maxLines: 1, ellipsis: true },
      approximateMeasurer,
      100,
    );
    expect(lineTexts(layout)).toEqual(['Pagar fatur…']);
    // o … usa a fonte do último pedaço que sobrou (o trecho em negrito)
    const pieces = layout.lines[0]?.pieces;
    expect(pieces?.map((p) => [p.run, p.text])).toEqual([
      [0, 'Pagar '],
      [1, 'fatur…'],
    ]);
    expect(layout.width).toBeLessThanOrEqual(100 + 1e-6);
  });

  it('o corte do … é por ponto de código: emoji não vira surrogate solto', () => {
    for (let limit = 8; limit <= 60; limit += 1) {
      const layout = layoutRuns(
        [run('😀😀😀😀😀😀')],
        { ...BASE, wrap: 'none', ellipsis: true },
        approximateMeasurer,
        limit,
      );
      const text = lineTexts(layout)[0] ?? '';
      expect(text.endsWith('…'), `limit ${limit}`).toBe(true);
      expect(LONE_SURROGATE.test(text), `limit ${limit}: ${JSON.stringify(text)}`).toBe(
        false,
      );
    }
  });

  it('o chip que não cabe com o … sai inteiro', () => {
    const layout = layoutRuns(
      [run('ab '), run('vencida', {}, CHIP)],
      { ...BASE, wrap: 'none', ellipsis: true },
      approximateMeasurer,
      50,
    );
    const text = lineTexts(layout)[0];
    expect(text?.endsWith('…')).toBe(true);
    expect(text).not.toContain('venc');
  });
});

describe('measureRichText', () => {
  it('3 trechos: altura = nº de linhas × altura de linha', () => {
    const font: MeasureFont = {
      ...FONT,
      size: 10,
      lineHeight: 12,
    };
    const runs: RichRun[] = [
      { text: 'Um ', font },
      { text: 'dois três ', font: { ...font, italic: true } },
      { text: 'quatro cinco seis', font },
    ];
    const metrics = measureRichText(
      runs,
      { size: 10, lineHeight: 12 },
      approximateMeasurer,
      70,
    );
    expect(metrics.lines).toEqual(['Um dois três', 'quatro cinco', 'seis']);
    expect(metrics.height).toBeCloseTo(3 * 12, 6);
    expect(metrics.width).toBeCloseTo(66, 6);
  });

  it('sem largura máxima mede uma linha por parágrafo', () => {
    const metrics = measureRichText([run('abc def')], BASE, approximateMeasurer);
    expect(metrics.lines).toEqual(['abc def']);
    expect(metrics.height).toBeCloseTo(16.8, 6);
  });
});

// ---------------------------------------------------------------------------------------
// component.schema.json
// ---------------------------------------------------------------------------------------

describe('component.schema.json: runs', () => {
  const schema = JSON.parse(
    readFileSync(new URL('../../../docs/component.schema.json', import.meta.url), 'utf8'),
  ) as Record<string, unknown>;
  const accepts = (child: Record<string, unknown>) =>
    checkSchema(schema, component(child)).length === 0;

  it('aceita os trechos, com literal e expressão em cada chave', () => {
    expect(accepts(richNode(RUNS))).toBe(true);
    expect(
      accepts(
        richNode([
          {
            text: { $field: 'nome' },
            weight: { $switch: 'tom', cases: { forte: 700 } },
            italic: true,
            color: { $field: 'cor', default: '#000000' },
            decoration: 'line-through',
            family: 'Inter',
            size: 12,
            background: { $if: { $has: 'nome' }, then: '#eee' },
            radius: { $field: 'raio', default: 4 },
            padding: [2, 6],
          },
          { text: 'x', padding: { $field: 'respiro', default: 3 } },
        ]),
      ),
    ).toBe(true);
  });

  it('recusa text e runs juntos, nenhum dos dois, runs vazio e lixo no trecho', () => {
    expect(accepts(richNode(RUNS, { text: 'a' }))).toBe(false);
    expect(accepts({ type: 'text' })).toBe(false);
    expect(accepts(richNode([]))).toBe(false);
    expect(accepts(richNode([{ weight: 700 }]))).toBe(false);
    expect(accepts(richNode([{ text: 'a', bogus: 1 }]))).toBe(false);
    expect(accepts(richNode([{ text: 'a', padding: [1, 2, 3, 4] }]))).toBe(false);
  });

  it('o texto simples continua aceito', () => {
    expect(accepts({ type: 'text', text: 'oi' })).toBe(true);
  });
});

/** Surrogate sem par (alto sem baixo, ou baixo sem alto). */
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
