// Formato 4, etapa "extensões" (FX3): a cena recebe sombra, raios, tracejado e cor já resolvidos;
// justify space-around/space-evenly e layout.reverse arrumam os filhos; stroke.offset chega ao
// traço e ao recorte ampliado.
import { describe, expect, it } from 'vitest';
import type {
  ComponentFile,
  FieldValues,
} from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
} from '../../../src/model/components/instantiate';
import { parseComponent } from '../../../src/model/components/parseComponent';
import type { FrameNode, SceneNode } from '../../../src/model/components/scene';
import { applyTokens, resolveTokens } from '../../../src/model/components/tokens';

type Raw = Record<string, unknown>;

const TOKENS = {
  modes: ['light'],
  values: {
    'elev-y': 4,
    'elev-blur': 8,
    'elev-neg': -3,
    corner: 12,
    'dash-on': 6,
    'dash-bad': -2,
    scrim: '#00000080',
    'scrim-a': 0.5,
    ink: '#112233',
    'focus-offset': 2,
  },
};

function parse(template: Raw, version = 4): ComponentFile {
  const r = parseComponent({
    format: 'mapping-component',
    formatVersion: version,
    id: 't',
    name: 'T',
    size: { width: 200, height: 100 },
    template,
  });
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.component;
}

function run(template: Raw, values: FieldValues = {}, width = 200, height = 100) {
  const tokens = resolveTokens(TOKENS, {}, 'light');
  return instantiate(
    parse(template),
    values,
    { x: 0, y: 0, width, height },
    { measure: approximateMeasurer, tokens },
  );
}

const rootOf = (template: Raw, values: FieldValues = {}) =>
  run(template, values).root as FrameNode;

const t = (name: string, extra: Raw = {}) => ({ $token: name, ...extra });

describe('A1 na cena: $token em shadow', () => {
  const rect = (shadow: Raw) => ({
    type: 'frame',
    children: [{ type: 'rect', width: 50, height: 20, shadow }],
  });

  it('x, y e blur chegam resolvidos ao efeito', () => {
    const root = rootOf(
      rect({ color: '#000', x: 1, y: t('elev-y'), blur: t('elev-blur') }),
    );
    expect(root.children[0]?.effects[0]).toMatchObject({
      offset: { x: 1, y: 4 },
      blur: 8,
    });
  });

  it('blur resolvido negativo cai em 0 com o aviso valor inválido em shadow.blur', () => {
    const { root, warnings } = run(rect({ color: '#000', blur: t('elev-neg') }));
    expect((root as FrameNode).children[0]?.effects[0]?.blur).toBe(0);
    expect(warnings).toContain('valor inválido em shadow.blur: -3');
  });
});

describe('A2 na cena: $token nos itens de cornerRadius', () => {
  it('cada item resolve; os literais ficam', () => {
    const root = rootOf({
      type: 'frame',
      children: [
        {
          type: 'rect',
          width: 50,
          height: 20,
          cornerRadius: [t('corner'), 0, 0, t('corner')],
        },
      ],
    });
    const rect = root.children[0] as SceneNode & { cornerRadius?: unknown };
    expect(rect.cornerRadius).toEqual([12, 0, 0, 12]);
  });
});

describe('A19 na cena: stroke.dash por expressão e $token', () => {
  const dashOf = (dash: unknown, values: FieldValues = {}) => {
    const { root, warnings } = run(
      {
        type: 'frame',
        children: [
          { type: 'rect', width: 50, height: 20, stroke: { color: '#000', dash } },
        ],
      },
      values,
    );
    return { dash: (root as FrameNode).children[0]?.stroke?.dash, warnings };
  };

  it('$switch escolhe a lista', () => {
    const dash = {
      $switch: 'estilo',
      cases: { tracejado: [4, 2], pontilhado: [1, 3] },
      default: [],
    };
    expect(dashOf(dash, { estilo: 'tracejado' }).dash).toEqual([4, 2]);
    expect(dashOf(dash, { estilo: 'pontilhado' }).dash).toEqual([1, 3]);
  });

  it('$token de número em cada item', () => {
    expect(dashOf([t('dash-on'), 2]).dash).toEqual([6, 2]);
  });

  it('valor resolvido inválido: sem tracejado e com o aviso', () => {
    const bad = dashOf([t('dash-bad'), 2]);
    expect(bad.dash).toBeUndefined();
    expect(bad.warnings).toContain('valor inválido em stroke.dash: [-2,2]');
    const notList = dashOf({ $field: 'x' }, { x: 'abc' });
    expect(notList.dash).toBeUndefined();
    expect(notList.warnings).toContain('valor inválido em stroke.dash: abc');
  });

  it('a lista literal de sempre continua igual', () => {
    expect(dashOf([4, 2]).dash).toEqual([4, 2]);
  });
});

describe('A10: alpha no $token de cor', () => {
  const colorOf = (ref: unknown) => {
    const component = parse({
      type: 'frame',
      children: [{ type: 'rect', width: 5, height: 5, fill: ref }],
    });
    const tokens = resolveTokens(TOKENS, {}, 'light');
    const resolved = applyTokens(component, tokens);
    const { root } = instantiate(
      resolved,
      {},
      { x: 0, y: 0, width: 5, height: 5 },
      { measure: approximateMeasurer, tokens },
    );
    const fills = (root as FrameNode).children[0]?.fills ?? [];
    return fills[0] && 'color' in fills[0] ? fills[0].color : undefined;
  };

  it('multiplica o alfa de uma cor opaca', () => {
    expect(colorOf(t('ink', { alpha: 0.5 }))).toBe('#11223380');
  });

  it('multiplica o alfa que a cor já tinha (#rrggbbaa)', () => {
    // #00000080 (alfa 128/255 ≈ 0,5) com alpha 0,5 dá ≈ 0,25 → 0x40
    expect(colorOf(t('scrim', { alpha: 0.5 }))).toBe('#00000040');
  });

  it('alpha 0 é transparente e alpha 1 não muda a cor', () => {
    expect(colorOf(t('ink', { alpha: 0 }))).toBe('#11223300');
    expect(colorOf(t('ink', { alpha: 1 }))).toBe('#112233ff');
  });

  it('alpha pode ser $token de número', () => {
    expect(colorOf(t('ink', { alpha: t('scrim-a') }))).toBe('#11223380');
  });

  it('sem alpha o $token continua como era', () => {
    expect(colorOf(t('ink'))).toBe('#112233');
  });

  it('none continua none', () => {
    const none = resolveTokens(
      { modes: ['light'], values: { nada: 'none' } },
      {},
      'light',
    );
    const component = parse({
      type: 'frame',
      children: [{ type: 'rect', width: 5, height: 5, fill: t('nada', { alpha: 0.5 }) }],
    });
    const { root } = instantiate(
      applyTokens(component, none),
      {},
      { x: 0, y: 0, width: 5, height: 5 },
      { measure: approximateMeasurer, tokens: none },
    );
    expect((root as FrameNode).children[0]?.fills).toEqual([]);
  });

  it('o alfa vale também nas paradas de um degradê (parada transparente)', () => {
    const root = rootOf({
      type: 'frame',
      children: [
        {
          type: 'rect',
          width: 5,
          height: 5,
          fill: {
            type: 'linear',
            angle: 90,
            stops: [
              { offset: 0, color: t('ink', { alpha: 0 }) },
              { offset: 1, color: t('ink', { alpha: 0.5 }) },
            ],
          },
        },
      ],
    });
    const paint = root.children[0]?.fills[0];
    expect(paint?.type === 'linear' && paint.stops.map((s) => s.color)).toEqual([
      '#11223300',
      '#11223380',
    ]);
  });
});

// ---------------------------------------------------------------------------------------
// A4: justify e reverse
// ---------------------------------------------------------------------------------------

const box = (w: number, h: number): Raw => ({ type: 'rect', width: w, height: h });

function rootAt(w: number, h: number, template: Raw): FrameNode {
  return run(template, {}, w, h).root as FrameNode;
}

function xs(layout: Raw, kids: Raw[], width = 100): number[] {
  const root = rootAt(width, 20, { type: 'frame', layout, children: kids });
  return root.children.map((c) => c.transform[4] ?? 0);
}

function ys(layout: Raw, kids: Raw[], height = 100): number[] {
  const root = rootAt(20, height, { type: 'frame', layout, children: kids });
  return root.children.map((c) => c.transform[5] ?? 0);
}

describe('A4: justify space-around e space-evenly', () => {
  const kids = [box(10, 10), box(10, 10), box(10, 10)];

  function rowXs(justify: string, children: Raw[] = kids): number[] {
    const root = rootAt(100, 20, {
      type: 'frame',
      layout: { type: 'row', justify },
      children: children,
    });
    return root.children.map((c) => c.transform[4] ?? 0);
  }

  it('space-around: meia folga nas pontas e folga inteira entre os filhos', () => {
    // livre = 100 - 30 = 70; por filho 70/3; ponta 35/3
    const p = rowXs('space-around');
    expect(p[0]).toBeCloseTo(70 / 6, 6);
    expect(p[1]).toBeCloseTo(70 / 6 + 10 + 70 / 3, 6);
    expect(p[2]).toBeCloseTo(70 / 6 + 20 + 140 / 3, 6);
  });

  it('space-evenly: a mesma folga nas pontas e entre os filhos', () => {
    // livre 70, 4 vãos de 17,5
    const p = rowXs('space-evenly');
    expect(p[0]).toBeCloseTo(17.5, 6);
    expect(p[1]).toBeCloseTo(17.5 + 10 + 17.5, 6);
    expect(p[2]).toBeCloseTo(17.5 + 20 + 35, 6);
  });

  it('com um filho só, os dois centram', () => {
    expect(rowXs('space-around', [box(10, 10)])).toEqual([45]);
    expect(rowXs('space-evenly', [box(10, 10)])).toEqual([45]);
  });

  it('vale em column', () => {
    const root = rootAt(20, 100, {
      type: 'frame',
      layout: { type: 'column', justify: 'space-evenly' },
      children: kids,
    });
    const p = root.children.map((c) => c.transform[5] ?? 0);
    expect(p[0]).toBeCloseTo(17.5, 6);
    expect(p[2]).toBeCloseTo(17.5 + 20 + 35, 6);
  });

  it('respeita gap e padding', () => {
    const root = rootAt(100, 20, {
      type: 'frame',
      layout: { type: 'row', justify: 'space-evenly', gap: 5, padding: [0, 10] },
      children: [box(10, 10), box(10, 10)],
    });
    // conteúdo 80; usados 10+5+10=25; livre 55; em 3 vãos de 55/3
    const p = root.children.map((c) => c.transform[4] ?? 0);
    expect(p[0]).toBeCloseTo(10 + 55 / 3, 6);
    expect(p[1]).toBeCloseTo(10 + 55 / 3 + 10 + 5 + 55 / 3, 6);
  });
});

describe('A4: layout.reverse', () => {
  const kids = [box(10, 10), box(20, 10), box(30, 10)];

  it('row: o primeiro filho vai para o fim e o start passa a ser o fim', () => {
    // start (padrão): empacotados à direita, na ordem inversa: [30][20][10] da esquerda p/ direita? não:
    // o primeiro filho (10) fica mais à direita.
    const p = xs({ type: 'row', reverse: true }, kids);
    expect(p).toEqual([90, 70, 40]);
  });

  it('row: justify end sob reverse empacota à esquerda', () => {
    expect(xs({ type: 'row', reverse: true, justify: 'end' }, kids)).toEqual([50, 30, 0]);
  });

  it('row: com gap', () => {
    expect(xs({ type: 'row', reverse: true, gap: 4 }, kids)).toEqual([90, 66, 32]);
  });

  it('row: space-between põe o primeiro filho na ponta direita', () => {
    const p = xs({ type: 'row', reverse: true, justify: 'space-between' }, kids);
    expect(p[0]).toBe(90);
    expect(p[2]).toBe(0);
    expect(p[1]).toBeCloseTo(100 - 10 - 20 - (100 - 60) / 2, 6);
  });

  it('column: o primeiro filho vai para baixo', () => {
    const tall = [box(10, 10), box(10, 20), box(10, 30)];
    expect(ys({ type: 'column', reverse: true }, tall)).toEqual([90, 70, 40]);
  });

  it('reverse por expressão', () => {
    const layout = { type: 'row', reverse: { $field: 'rtl' } };
    const root = (rtl: string) =>
      run(
        { type: 'frame', layout, children: kids, width: 100, height: 20 },
        { rtl },
        100,
        20,
      ).root as FrameNode;
    expect(root('sim').children.map((c) => c.transform[4])).toEqual([90, 70, 40]);
    expect(root('não').children.map((c) => c.transform[4])).toEqual([0, 10, 30]);
  });

  it('reverse falso é a ordem de sempre', () => {
    expect(xs({ type: 'row', reverse: false }, kids)).toEqual([0, 10, 30]);
  });

  it('combina com space-evenly', () => {
    const p = xs({ type: 'row', reverse: true, justify: 'space-evenly' }, kids);
    // livre 40, 4 vãos de 10: normal [10, 30, 60]; espelhado em 100: 100-10-10=80? [80, 50, 10]
    expect(p).toEqual([80, 50, 10]);
  });

  it('um quadro hug mede igual e espelha dentro dele', () => {
    const root = rootAt(300, 100, {
      type: 'frame',
      layout: { type: 'column' },
      children: [
        {
          type: 'frame',
          width: 'hug',
          height: 20,
          layout: { type: 'row', reverse: true, gap: 2 },
          children: kids,
        },
      ],
    });
    const hug = root.children[0] as FrameNode;
    expect(hug.width).toBe(10 + 20 + 30 + 4);
    expect(hug.children.map((c) => c.transform[4])).toEqual([54, 32, 0]);
  });

  it('em repeat: o bloco das linhas anda como um filho só e as linhas guardam a ordem', () => {
    const root = run(
      {
        type: 'frame',
        layout: { type: 'row', reverse: true },
        children: [
          { type: 'rect', width: 10, height: 10 },
          {
            type: 'repeat',
            field: 'itens',
            direction: 'row',
            template: { type: 'frame', width: 20, height: 10, children: [] },
          },
        ],
      },
      { itens: [{ a: 'x' }, { a: 'y' }] },
      100,
      20,
    ).root as FrameNode;
    const [rect, rows] = root.children as [SceneNode, FrameNode];
    expect(rect.transform[4]).toBe(90);
    expect(rows.transform[4]).toBe(50);
    expect(rows.children.map((c) => c.transform[4])).toEqual([0, 20]);
  });
});

// ---------------------------------------------------------------------------------------
// A15: stroke.offset
// ---------------------------------------------------------------------------------------

describe('A15: stroke.offset na cena e no recorte', () => {
  const ring = (stroke: Raw) => ({
    type: 'frame',
    children: [
      { type: 'rect', width: 100, height: 100, stroke: { color: '#f00', ...stroke } },
    ],
  });

  it('o offset literal ou por $token chega ao Stroke da cena', () => {
    expect(
      rootOf(ring({ width: 3, align: 'outside', offset: 2 })).children[0]?.stroke,
    ).toMatchObject({ offset: 2 });
    expect(
      rootOf(ring({ width: 3, align: 'outside', offset: t('focus-offset') })).children[0]
        ?.stroke,
    ).toMatchObject({ offset: 2 });
  });

  it('sem offset (ou com 0) o Stroke não ganha a chave', () => {
    expect(rootOf(ring({ width: 3 })).children[0]?.stroke).not.toHaveProperty('offset');
    expect(rootOf(ring({ width: 3, offset: 0 })).children[0]?.stroke).not.toHaveProperty(
      'offset',
    );
  });

  it('um filho que ocupa a forma com traço outside e offset 2 amplia o recorte em offset + largura', () => {
    // anel do M3: 3 em secondary, afastado 2 → 5 por fora da caixa
    const root = rootAt(100, 100, ring({ width: 3, align: 'outside', offset: 2 }));
    expect(root.clip).toBe(true);
    expect(root.clipBox).toEqual({ x: -5, y: -5, width: 110, height: 110 });
  });

  it('com align center conta offset + metade da largura; com inside, só o offset', () => {
    expect(
      rootAt(100, 100, ring({ width: 4, align: 'center', offset: 2 })).clipBox,
    ).toEqual({ x: -4, y: -4, width: 108, height: 108 });
    expect(rootAt(100, 100, ring({ width: 4, offset: 2 })).clipBox).toEqual({
      x: -2,
      y: -2,
      width: 104,
      height: 104,
    });
  });

  it('o offset no traço da própria raiz também amplia o recorte', () => {
    const root = rootAt(100, 100, {
      type: 'frame',
      stroke: { color: '#f00', width: 3, align: 'outside', offset: 2 },
      children: [],
    });
    expect(root.clipBox).toEqual({ x: -5, y: -5, width: 110, height: 110 });
  });

  it('com sides, o afastamento vale só nos lados pedidos', () => {
    const root = rootAt(
      100,
      100,
      ring({ width: 3, align: 'outside', offset: 2, sides: ['bottom', 'left'] }),
    );
    expect(root.clipBox).toEqual({ x: -5, y: 0, width: 105, height: 105 });
  });

  it('o conteúdo continua recortado na caixa: um filho maior que a caixa não alarga o recorte', () => {
    const root = rootAt(100, 100, {
      type: 'frame',
      children: [
        {
          type: 'rect',
          width: 300,
          height: 300,
          stroke: { color: '#f00', width: 3, align: 'outside', offset: 2 },
        },
      ],
    });
    // o retângulo passa da caixa, mas o recorte só cresce até a extensão do traço (5), não até 300
    expect(root.clipBox).toEqual({ x: -5, y: -5, width: 110, height: 110 });
  });

  it('sem offset o recorte é o de sempre', () => {
    expect(rootAt(100, 100, ring({ width: 3, align: 'outside' })).clipBox).toEqual({
      x: -3,
      y: -3,
      width: 106,
      height: 106,
    });
  });
});
