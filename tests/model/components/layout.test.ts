// Laboratório Componentes: arrumação por tamanhos (`layoutScreen`).
import { describe, expect, it } from 'vitest';
import type {
  ComponentFile,
  TemplateNode,
} from '../../../src/model/components/componentFormat';
import { approximateMeasurer } from '../../../src/model/components/instantiate';
import {
  type LayoutNode,
  type LayoutRoot,
  type ScreenAnchor,
  layoutScreen,
} from '../../../src/model/components/layout';
import { type Library, loadLibrary } from '../../../src/model/components/library';
import { M3_CARD, M3_COLUMN, M3_BUTTON } from '../../../lab/components/samplesMaterial3';

// --- biblioteca montada em memória ----------------------------------------------------------

type Sizing = NonNullable<ComponentFile['sizing']>;

function component(
  id: string,
  template: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): ComponentFile {
  return {
    format: 'mapping-component',
    formatVersion: 1,
    id,
    name: id,
    size: { width: 100, height: 40 },
    template: { type: 'frame', layout: { type: 'none' }, ...template },
    ...extra,
  } as ComponentFile;
}

/** Folha sem filhos: só o tamanho (px de `size` ou o `sizing`). */
function block(
  id: string,
  size: { width: number; height: number },
  sizing?: Sizing,
  minSize?: { width: number; height: number },
) {
  return component(
    id,
    {},
    { size, ...(sizing ? { sizing } : {}), ...(minSize ? { minSize } : {}) },
  );
}

/** Texto `hug` × `hug`: fonte 10 (0,55 · 10 = 5,5 px por caractere), altura de linha dada. */
function label(id: string, lineHeight: number) {
  return component(
    id,
    {
      children: [
        {
          type: 'text',
          text: { $field: 'text' },
          font: { size: 10, lineHeight },
          anchors: { left: 0, top: 0 },
        },
      ],
    },
    { sizing: { width: 'hug', height: 'hug' } },
  );
}

interface ContainerOptions {
  readonly align?: string;
  readonly justify?: string;
  readonly sizing?: Sizing;
  readonly size?: { width: number; height: number };
}

/** Container: quadro `none` com um slot que ocupa tudo, com o layout dado. */
function container(
  id: string,
  type: 'row' | 'column' | 'none',
  o: ContainerOptions = {},
) {
  const layout: Record<string, unknown> =
    type === 'none'
      ? { type: 'none' }
      : {
          type,
          gap: { $field: 'gap', default: 0 },
          padding: { $field: 'padding', default: 0 },
          ...(o.align ? { align: o.align } : {}),
          ...(o.justify ? { justify: o.justify } : {}),
        };
  return component(
    id,
    {
      children: [
        {
          type: 'slot',
          anchors: { left: 0, right: 0, top: 0, bottom: 0 },
          layout,
        },
      ],
    },
    {
      ...(o.size ? { size: o.size } : {}),
      sizing: o.sizing ?? { width: 'fill', height: 'hug' },
    },
  );
}

const HUG_HUG: Sizing = { width: 'hug', height: 'hug' };

const COMPONENTS: ComponentFile[] = [
  block('fixed', { width: 100, height: 40 }),
  block('tall', { width: 300, height: 500 }),
  block('filler', { width: 10, height: 10 }, { width: 'fill', height: 'fill' }),
  block(
    'filler-min',
    { width: 50, height: 30 },
    { width: 'fill', height: 'fill' },
    { width: 50, height: 30 },
  ),
  block('hug-min', { width: 80, height: 30 }, HUG_HUG, { width: 80, height: 30 }),
  label('label', 12),
  label('label-frac', 12.5),
  container('col', 'column'),
  container('col-fill', 'column', { sizing: { width: 'fill', height: 'fill' } }),
  container('col-px', 'column', { sizing: { width: 'fill', height: 100 } }),
  container('col-px-center', 'column', {
    align: 'center',
    justify: 'center',
    sizing: { width: 'fill', height: 100 },
  }),
  container('col-stretch', 'column', { align: 'stretch' }),
  container('col-hug', 'column', { sizing: HUG_HUG }),
  container('row', 'row', { sizing: { width: 'fill', height: 60 } }),
  container('row-center', 'row', {
    align: 'center',
    justify: 'center',
    sizing: { width: 'fill', height: 60 },
  }),
  container('row-end', 'row', { justify: 'end', sizing: { width: 'fill', height: 60 } }),
  container('row-between', 'row', {
    justify: 'space-between',
    sizing: { width: 'fill', height: 60 },
  }),
  container('row-hug', 'row'),
  container('row-hug-all', 'row', { sizing: HUG_HUG }),
  container('box', 'none'),
  container('box-fixed', 'none', { sizing: { width: 100, height: 100 } }),
  component('plain', {}, { size: { width: 80, height: 30 } }),
];

const SPEC = {
  format: 'mapping-spec',
  formatVersion: 4,
  id: 'layout-test',
  name: 'Layout',
  layers: [
    {
      id: 'ui',
      name: 'UI',
      color: '#1E88E5',
      annotationTypes: COMPONENTS.map((c) => ({
        id: c.id,
        name: c.id,
        component: `components/${c.id}.json`,
        fields:
          c.id === 'filler'
            ? [{ key: 'tone', label: 'Tom', type: 'string', default: 'claro' }]
            : [],
      })),
    },
  ],
};

function build(components: readonly ComponentFile[], spec: object = SPEC): Library {
  return loadLibrary([
    { path: 'spec.json', text: JSON.stringify(spec) },
    ...components.map((c) => ({
      path: `components/${c.id}.json`,
      text: JSON.stringify(c),
    })),
  ]);
}

const library = build(COMPONENTS);

it('a biblioteca de teste carrega sem problemas', () => {
  expect(library.problems).toEqual([]);
});

// --- construtores -----------------------------------------------------------------------------

function node(
  id: string,
  typeId: string,
  values: LayoutNode['values'] = {},
  children: readonly LayoutNode[] = [],
): LayoutNode {
  return { id, typeId, values, children };
}

function root(n: LayoutNode, extra: Partial<Omit<LayoutRoot, 'node'>> = {}): LayoutRoot {
  return { node: n, ...extra };
}

function run(roots: readonly LayoutRoot[], width = 300, height = 600, lib = library) {
  return layoutScreen(
    { id: 's', name: 'Tela', width, height, background: '#FFF', roots },
    lib,
    approximateMeasurer,
  );
}

function boxOf(result: ReturnType<typeof run>, id: string) {
  const instance = result.screen.instances.find((i) => i.id === id);
  if (!instance) throw new Error(`sem instância ${id}`);
  return instance.box;
}

const ids = (result: ReturnType<typeof run>) => result.screen.instances.map((i) => i.id);

// "AAAAAAAAAA" = 10 caracteres de 5,5 px = 55 px de largura, 12 px de altura.
const TEN = 'AAAAAAAAAA';

// --- column --------------------------------------------------------------------------------------

describe('layoutScreen: column', () => {
  it('px, hug e fill: o fill fica com o que sobra depois dos fixos e dos gaps', () => {
    const result = run([
      root(
        node('c', 'col-fill', { gap: 10 }, [
          node('a', 'fixed'),
          node('b', 'label', { text: TEN }),
          node('f', 'filler'),
        ]),
      ),
    ]);
    expect(boxOf(result, 'c')).toEqual({ x: 0, y: 0, width: 300, height: 600 });
    expect(boxOf(result, 'a')).toEqual({ x: 0, y: 0, width: 100, height: 40 });
    expect(boxOf(result, 'b')).toEqual({ x: 0, y: 50, width: 55, height: 12 });
    // 600 − 40 − 12 − 2 gaps de 10
    expect(boxOf(result, 'f')).toEqual({ x: 0, y: 72, width: 300, height: 528 });
    expect(result.warnings).toEqual([]);
  });

  it('dois fill dividem o resto por igual', () => {
    const result = run([
      root(
        node('c', 'col-fill', {}, [
          node('a', 'fixed'),
          node('f1', 'filler'),
          node('f2', 'filler'),
        ]),
      ),
    ]);
    expect(boxOf(result, 'f1').height).toBe(280);
    expect(boxOf(result, 'f2')).toMatchObject({ y: 320, height: 280 });
  });

  it('a altura hug do container é a soma dos filhos, gaps e padding', () => {
    const result = run([
      root(
        node('c', 'col', { gap: 4, padding: 8 }, [
          node('a', 'fixed'),
          node('b', 'label', { text: TEN }),
        ]),
      ),
    ]);
    // padding 8 + 40 + gap 4 + 12 + padding 8
    expect(boxOf(result, 'c')).toEqual({ x: 0, y: 0, width: 300, height: 72 });
    expect(boxOf(result, 'a')).toMatchObject({ x: 8, y: 8 });
    expect(boxOf(result, 'b')).toMatchObject({ x: 8, y: 52 });
  });

  it('fill no eixo principal dentro de pai hug cai em hug, com aviso', () => {
    const result = run([
      root(
        node('c', 'col', {}, [
          node('b', 'label', { text: TEN }),
          node('f', 'filler-min'),
        ]),
      ),
    ]);
    // filler-min em hug: o vazio vira o minSize (30)
    expect(boxOf(result, 'f')).toMatchObject({ y: 12, height: 30 });
    expect(boxOf(result, 'c').height).toBe(42);
    expect(result.warnings).toEqual(['f: fill dentro de hug: usando hug']);
  });

  it('o fill no eixo cruzado ocupa a largura do conteúdo; hug com stretch também', () => {
    const result = run(
      [
        root(
          node('c', 'col-stretch', { padding: 10 }, [
            node('a', 'label', { text: TEN }),
            node('f', 'filler-min'),
          ]),
        ),
      ],
      300,
      600,
    );
    expect(boxOf(result, 'a').width).toBe(280);
    expect(boxOf(result, 'f').width).toBe(280);
  });

  it('justify e align: center no container de altura fixa', () => {
    const result = run([
      root(node('c', 'col-px-center', {}, [node('b', 'label', { text: TEN })])),
    ]);
    expect(boxOf(result, 'c').height).toBe(100);
    expect(boxOf(result, 'b')).toEqual({ x: 122.5, y: 44, width: 55, height: 12 });
  });

  it('hug de largura limitado pela largura disponível', () => {
    const result = run(
      [root(node('c', 'col', {}, [node('b', 'label', { text: TEN })]))],
      40,
      600,
    );
    expect(boxOf(result, 'b').width).toBe(40);
  });
});

// --- row -------------------------------------------------------------------------------------------

describe('layoutScreen: row', () => {
  it('px, hug e fill: o fill divide o resto da largura; o fill cruzado é a altura da linha', () => {
    const result = run([
      root(
        node('r', 'row', { gap: 10 }, [
          node('a', 'fixed'),
          node('f', 'filler'),
          node('b', 'label', { text: TEN }),
        ]),
      ),
    ]);
    expect(boxOf(result, 'r')).toEqual({ x: 0, y: 0, width: 300, height: 60 });
    expect(boxOf(result, 'a')).toEqual({ x: 0, y: 0, width: 100, height: 40 });
    // 300 − 100 − 55 − 2 gaps de 10
    expect(boxOf(result, 'f')).toEqual({ x: 110, y: 0, width: 125, height: 60 });
    expect(boxOf(result, 'b')).toEqual({ x: 245, y: 0, width: 55, height: 12 });
  });

  it('eixo cruzado fill em row hug: a altura da linha é a maior entre os demais', () => {
    const result = run([
      root(
        node('r', 'row-hug', { gap: 5 }, [
          node('b', 'label', { text: TEN }),
          node('f', 'filler'),
          node('a', 'fixed'),
        ]),
      ),
    ]);
    // altura da linha = max(12, 40) = 40; o fill herda 40
    expect(boxOf(result, 'r')).toEqual({ x: 0, y: 0, width: 300, height: 40 });
    expect(boxOf(result, 'f').height).toBe(40);
  });

  it('row hug só com fill: cada filho em hug', () => {
    const result = run([root(node('r', 'row-hug', {}, [node('f', 'filler-min')]))]);
    expect(boxOf(result, 'r').height).toBe(30);
    expect(boxOf(result, 'f').height).toBe(30);
  });

  it('justify end, center e space-between', () => {
    const kids = () => [node('a', 'fixed'), node('b', 'fixed')];
    const end = run([root(node('r', 'row-end', {}, kids()))], 400);
    expect(boxOf(end, 'a').x).toBe(200);
    expect(boxOf(end, 'b').x).toBe(300);
    const center = run([root(node('r', 'row-center', {}, kids()))], 400);
    expect(boxOf(center, 'a')).toMatchObject({ x: 100, y: 10 });
    const between = run(
      [root(node('r', 'row-between', {}, [...kids(), node('c', 'fixed')]))],
      400,
    );
    expect([boxOf(between, 'a').x, boxOf(between, 'b').x, boxOf(between, 'c').x]).toEqual(
      [0, 150, 300],
    );
  });

  it('align center no eixo cruzado', () => {
    const result = run([
      root(node('r', 'row-center', {}, [node('b', 'label', { text: TEN })])),
    ]);
    expect(boxOf(result, 'b').y).toBe(24);
  });

  it('row hug nos dois eixos: filhos fill ficam no próprio hug e a largura é a soma', () => {
    const result = run([
      root(
        node('r', 'row-hug-all', { gap: 5 }, [
          node('a', 'fixed'),
          node('f', 'filler-min'),
        ]),
      ),
    ]);
    // filler-min em hug: 50 (minSize) × 30
    expect(boxOf(result, 'r')).toEqual({ x: 0, y: 0, width: 155, height: 40 });
    expect(boxOf(result, 'f')).toMatchObject({ x: 105, width: 50 });
  });
});

// --- Box -------------------------------------------------------------------------------------------

describe('layoutScreen: Box (none)', () => {
  it('cada filho no canto do conteúdo; a altura hug é a do maior', () => {
    const result = run([
      root(
        node('x', 'box', {}, [
          node('a', 'fixed'),
          node('b', 'label', { text: TEN }),
          node('f', 'filler-min'),
        ]),
      ),
    ]);
    expect(boxOf(result, 'x')).toEqual({ x: 0, y: 0, width: 300, height: 40 });
    expect(boxOf(result, 'a')).toEqual({ x: 0, y: 0, width: 100, height: 40 });
    expect(boxOf(result, 'b')).toEqual({ x: 0, y: 0, width: 55, height: 12 });
    // fill de largura = conteúdo; a altura, com o pai hug, cai em hug (o minSize)
    expect(boxOf(result, 'f')).toEqual({ x: 0, y: 0, width: 300, height: 30 });
  });

  it('fill ocupa o conteúdo quando o Box tem altura fixa', () => {
    const result = run([root(node('x', 'box-fixed', {}, [node('f', 'filler')]))]);
    expect(boxOf(result, 'f')).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });
});

// --- raízes ancoradas, scrim e tela -------------------------------------------------------------

describe('layoutScreen: raízes ancoradas', () => {
  const anchored = (anchor: ScreenAnchor, margin?: number) =>
    run(
      [
        root(node('flow', 'fixed')),
        root(node('a', 'fixed'), { anchor, ...(margin !== undefined ? { margin } : {}) }),
      ],
      400,
      800,
    );

  it('as raízes ancoradas não entram no fluxo', () => {
    const result = anchored('bottom', 16);
    expect(boxOf(result, 'flow')).toEqual({ x: 0, y: 0, width: 100, height: 40 });
  });

  it.each<[ScreenAnchor, number, number, number]>([
    ['top-start', 16, 16, 16],
    ['top', 16, 150, 16],
    ['top-end', 8, 292, 8],
    ['start', 16, 16, 380],
    ['center', 0, 150, 380],
    ['end', 10, 290, 380],
    ['bottom-start', 4, 4, 756],
    ['bottom', 16, 150, 744],
    ['bottom-end', 4, 296, 756],
  ])('âncora %s com margin %d', (anchor, margin, x, y) => {
    const result = anchored(anchor, margin);
    expect(boxOf(result, 'a')).toEqual({ x, y, width: 100, height: 40 });
  });

  it('margin padrão é 0', () => {
    expect(boxOf(anchored('top-start'), 'a')).toMatchObject({ x: 0, y: 0 });
  });

  it('fill ocupa a tela menos a margem nos dois lados; hug usa o conteúdo', () => {
    const result = run(
      [
        root(node('f', 'filler'), { anchor: 'bottom', margin: 10 }),
        root(node('h', 'label', { text: TEN }), { anchor: 'bottom-end', margin: 4 }),
      ],
      400,
      800,
    );
    expect(boxOf(result, 'f')).toEqual({ x: 10, y: 10, width: 380, height: 780 });
    expect(boxOf(result, 'h')).toEqual({ x: 341, y: 784, width: 55, height: 12 });
  });

  it('raiz ancorada container arruma os filhos dentro dela', () => {
    const result = run(
      [
        root(
          node('sheet', 'col', { gap: 8, padding: 16 }, [
            node('b', 'label', { text: TEN }),
          ]),
          {
            anchor: 'bottom',
          },
        ),
      ],
      400,
      800,
    );
    // padding 16 + 12 + 16
    expect(boxOf(result, 'sheet')).toEqual({ x: 0, y: 756, width: 400, height: 44 });
    expect(boxOf(result, 'b')).toEqual({ x: 16, y: 772, width: 55, height: 12 });
  });
});

describe('layoutScreen: scrim', () => {
  it('a película entra antes da raiz, com id #scrim e a tela inteira', () => {
    const result = run(
      [
        root(node('base', 'fixed')),
        root(node('modal', 'fixed'), { anchor: 'bottom', scrimTypeId: 'filler' }),
      ],
      400,
      800,
    );
    expect(ids(result)).toEqual(['base', 'modal#scrim', 'modal']);
    expect(result.screen.instances[1]).toMatchObject({
      typeId: 'filler',
      box: { x: 0, y: 0, width: 400, height: 800 },
      values: { tone: 'claro' },
    });
    expect(result.screen.instances[1]?.parentId).toBeUndefined();
  });

  it('tipo de película desconhecido: aviso e a raiz continua', () => {
    const result = run([root(node('modal', 'fixed'), { scrimTypeId: 'nao-existe' })]);
    expect(ids(result)).toEqual(['modal']);
    expect(result.warnings).toEqual(['modal#scrim: tipo sem componente: nao-existe']);
  });
});

describe('layoutScreen: limites e avisos', () => {
  it('minSize limita os tamanhos finais (fill dividido e hug)', () => {
    const result = run([
      root(
        node('c', 'col-px', {}, [
          node('f1', 'filler-min'),
          node('f2', 'filler-min'),
          node('f3', 'filler-min'),
          node('h', 'hug-min'),
        ]),
      ),
    ]);
    // 100 de altura para 3 fill de mínimo 30: cada um 30 (a soma passa de 100, sem recorte)
    expect(boxOf(result, 'f1')).toMatchObject({ height: 30, width: 300 });
    expect(boxOf(result, 'f3').y).toBe(60);
    // hug de um componente vazio vira o minSize
    expect(boxOf(result, 'h')).toMatchObject({ width: 80, height: 30 });
  });

  it('os hug medidos sobem para o inteiro seguinte; o resto fica exato', () => {
    const result = run([
      root(
        node('c', 'col', {}, [
          node('t', 'label-frac', { text: 'AAA' }),
          node('f', 'filler-min'),
        ]),
      ),
    ]);
    // 3 · 5,5 = 16,5 → 17; 12,5 → 13
    expect(boxOf(result, 't')).toEqual({ x: 0, y: 0, width: 17, height: 13 });
  });

  it('tipo sem componente: aviso e a subárvore fica de fora', () => {
    const result = run([
      root(
        node('c', 'col', {}, [
          node('ok', 'fixed'),
          node('x', 'nao-existe', {}, [node('xx', 'fixed')]),
        ]),
      ),
      root(node('y', 'outro-que-nao-existe')),
    ]);
    expect(ids(result)).toEqual(['c', 'ok']);
    expect(result.warnings).toEqual([
      'x: tipo sem componente: nao-existe',
      'y: tipo sem componente: outro-que-nao-existe',
    ]);
  });

  it('filhos num componente sem slot: aviso e os filhos ficam de fora', () => {
    const result = run([root(node('p', 'plain', {}, [node('k', 'fixed')]))]);
    expect(ids(result)).toEqual(['p']);
    expect(boxOf(result, 'p')).toEqual({ x: 0, y: 0, width: 80, height: 30 });
    expect(result.warnings).toEqual(['p: filhos ignorados (componente sem slot)']);
  });

  it('conteúdo maior que a altura da tela avisa, sem recortar', () => {
    const result = run([root(node('a', 'tall')), root(node('b', 'tall'))], 300, 600);
    expect(result.warnings).toEqual(['tela: conteúdo maior que a altura da tela']);
    expect(boxOf(result, 'b')).toMatchObject({ y: 500, height: 500 });
    expect(run([root(node('a', 'tall'))], 300, 600).warnings).toEqual([]);
  });

  it('os avisos não se repetem', () => {
    const result = run([
      root(node('c', 'col', {}, [node('f', 'filler-min')])),
      root(node('c2', 'col', {}, [node('f', 'filler-min')])),
    ]);
    expect(result.warnings).toEqual(['f: fill dentro de hug: usando hug']);
  });
});

describe('layoutScreen: saída', () => {
  it('copia os dados da tela e põe cada raiz seguida da subárvore em pré-ordem, com parentId', () => {
    const values = { gap: 3 };
    const result = run([
      root(
        node('r', 'col', values, [
          node('row', 'row-hug', {}, [node('a', 'fixed'), node('b', 'fixed')]),
          node('c', 'fixed'),
        ]),
      ),
      root(node('z', 'fixed'), { anchor: 'center' }),
    ]);
    expect(result.screen).toMatchObject({
      id: 's',
      name: 'Tela',
      width: 300,
      height: 600,
      background: '#FFF',
    });
    expect(ids(result)).toEqual(['r', 'row', 'a', 'b', 'c', 'z']);
    const parent = (id: string) =>
      result.screen.instances.find((i) => i.id === id)?.parentId;
    expect([
      parent('r'),
      parent('row'),
      parent('a'),
      parent('b'),
      parent('c'),
      parent('z'),
    ]).toEqual([undefined, 'r', 'row', 'row', 'r', undefined]);
    expect(result.screen.instances[0]?.values).toBe(values);
    expect(result.screen.instances[0]?.typeId).toBe('col');
  });

  it('a primeira raiz fica por baixo: a ordem de roots é a de desenho', () => {
    const result = run([
      root(node('top', 'fixed'), { anchor: 'center' }),
      root(node('flow', 'fixed')),
    ]);
    expect(ids(result)).toEqual(['top', 'flow']);
  });
});

// --- caso de prova: Material 3 ---------------------------------------------------------------------

describe('layoutScreen: cartão do Material 3 dentro de uma coluna', () => {
  const card: ComponentFile = {
    ...M3_CARD,
    sizing: { width: 'fill', height: 'hug' },
    template: {
      ...M3_CARD.template,
      children: (M3_CARD.template.children ?? []).map((child): TemplateNode =>
        child.type === 'slot'
          ? { ...child, layout: { type: 'row', gap: 8, justify: 'end' } }
          : child,
      ),
    },
  };
  const column: ComponentFile = {
    ...M3_COLUMN,
    sizing: { width: 'fill', height: 'hug' },
  };
  const button: ComponentFile = { ...M3_BUTTON, sizing: { width: 'hug', height: 40 } };

  const m3 = build([card, column, button], {
    format: 'mapping-spec',
    formatVersion: 4,
    id: 'm3-test',
    name: 'M3',
    layers: [
      {
        id: 'componentes',
        name: 'Componentes',
        color: '#6750A4',
        annotationTypes: [card, column, button].map((c) => ({
          id: c.id,
          name: c.name,
          component: `components/${c.id}.json`,
          fields: [],
        })),
      },
    ],
  });

  const SHORT = 'Texto curto.';
  const LONG =
    'Um texto de apoio bem mais longo, que precisa quebrar em várias linhas dentro do cartão para ' +
    'empurrar a altura dele e a da coluna para baixo, e junto com elas o cartão que vem depois.';

  function screenWith(body: string) {
    return run(
      [
        root(
          node('col', 'm3-column', { spacing: 8, padding: 0 }, [
            node('card', 'm3-card', { headline: 'Título', subhead: 'Sub', body }, [
              node('ok', 'm3-button', { label: 'OK' }),
            ]),
            node('next', 'm3-card', { headline: 'Próximo', body: SHORT }),
          ]),
        ),
      ],
      360,
      900,
      m3,
    );
  }

  it('a altura do cartão e da coluna crescem com o body, e o irmão desce na mesma medida', () => {
    const short = screenWith(SHORT);
    const long = screenWith(LONG);
    expect(short.warnings).toEqual([]);
    expect(long.warnings).toEqual([]);

    const shortCard = boxOf(short, 'card');
    const longCard = boxOf(long, 'card');
    const delta = longCard.height - shortCard.height;
    // várias linhas a mais (altura de linha do bodyMedium)
    expect(delta).toBeGreaterThan(40);

    expect(boxOf(long, 'col').height - boxOf(short, 'col').height).toBeCloseTo(delta);
    expect(boxOf(long, 'next').y - boxOf(short, 'next').y).toBeCloseTo(delta);
    // a largura não muda e o cartão seguinte mantém a própria altura
    expect(longCard.width).toBe(360);
    expect(boxOf(long, 'next').height).toBe(boxOf(short, 'next').height);

    // a coluna é a soma dos dois cartões e do espaçamento
    for (const result of [short, long]) {
      expect(boxOf(result, 'col').height).toBeCloseTo(
        boxOf(result, 'card').height + 8 + boxOf(result, 'next').height,
      );
      expect(boxOf(result, 'next').y).toBeCloseTo(boxOf(result, 'card').height + 8);
    }
  });

  it('o botão do slot de ações fica no canto inferior direito do cartão (justify end)', () => {
    for (const body of [SHORT, LONG]) {
      const result = screenWith(body);
      const cardBox = boxOf(result, 'card');
      const ok = boxOf(result, 'ok');
      expect(ok.height).toBe(40);
      // padding 16 do cartão: o botão termina 16 px antes da borda inferior e da direita
      expect(ok.y + ok.height).toBeCloseTo(cardBox.y + cardBox.height - 16);
      expect(ok.x + ok.width).toBeCloseTo(cardBox.x + cardBox.width - 16);
    }
  });
});
