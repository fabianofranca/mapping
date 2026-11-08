// Fidelidade do layout (etapa Componentes fiéis, fase CF2): medição em duas passagens (B1),
// `repeat.distribute` (B2), expressão nas chaves de layout (B3) e limites min/max (B4).
import { describe, expect, it } from 'vitest';
import type {
  ComponentFile,
  FieldValues,
} from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
  measureComponent,
  type TextMeasurer,
} from '../../../src/model/components/instantiate';
import { layoutScreen } from '../../../src/model/components/layout';
import { loadLibrary } from '../../../src/model/components/library';
import type { FrameNode, SceneNode } from '../../../src/model/components/scene';

type Raw = Record<string, unknown>;

const LINE = 16.8; // fonte 14, altura de linha 1,2

function file(template: Raw, formatVersion = 4, extra: Raw = {}): ComponentFile {
  return {
    format: 'mapping-component',
    formatVersion,
    id: 'fid',
    name: 'Fidelidade',
    size: { width: 200, height: 300 },
    template,
    ...extra,
  } as unknown as ComponentFile;
}

function root(
  template: Raw,
  values: FieldValues = {},
  box = { x: 0, y: 0, width: 200, height: 300 },
  measure: TextMeasurer = approximateMeasurer,
  formatVersion = 4,
) {
  return instantiate(file(template, formatVersion), values, box, { measure });
}

function kid(node: SceneNode, index: number): SceneNode {
  if (node.type !== 'frame') throw new Error('não é um quadro');
  const found = node.children[index];
  if (!found) throw new Error(`sem filho ${index}`);
  return found;
}

const xOf = (n: SceneNode) => n.transform[4];
const yOf = (n: SceneNode) => n.transform[5];

const frame = (over: Raw, children: Raw[] = []): Raw => ({
  type: 'frame',
  children,
  ...over,
});
const rect = (over: Raw = {}): Raw => ({ type: 'rect', ...over });
const label = (over: Raw = {}): Raw => ({
  type: 'text',
  text: 'Quando o prazo vence',
  font: { size: 14, lineHeight: 1.2 },
  ...over,
});

/** Medidor espião: devolve as chamadas (texto e maxWidth) e delega ao aproximado. */
function spy() {
  const calls: { text: string; maxWidth: number | undefined }[] = [];
  const measure: TextMeasurer = (text, font, maxWidth) => {
    calls.push({ text, maxWidth });
    return approximateMeasurer(text, font, maxWidth);
  };
  return { calls, measure };
}

// --- B1: medição em duas passagens ---------------------------------------------------------

const HUG_COLUMN = (): Raw =>
  frame({ layout: { type: 'column' } }, [
    frame({ name: 'cartão', layout: { type: 'column' }, width: 'hug', height: 'hug' }, [
      label({ name: 'texto', width: 'fill' }),
    ]),
  ]);

describe.each([4, 1])('B1: quadro hug com texto fill (formatVersion %i)', (version) => {
  it('mede o texto dentro do limite do pai: não quebra palavra por palavra', () => {
    const { calls, measure } = spy();
    const { root: scene } = root(HUG_COLUMN(), {}, undefined, measure, version);
    const card = kid(scene, 0);
    const text = kid(card, 0);
    expect(calls.some((c) => c.maxWidth === 200)).toBe(true);
    expect(card.width).toBeGreaterThan(0);
    expect(card.width).toBeLessThanOrEqual(200);
    expect(text.width).toBe(card.width);
    expect(text.height).toBeLessThanOrEqual(2 * LINE + 0.01);
    expect(card.height).toBe(text.height);
  });
});

describe('B1: regressões e aviso', () => {
  it('fill no eixo principal de um quadro hug continua valendo 0, com o aviso', () => {
    const { root: scene, warnings } = root(
      frame({ layout: { type: 'column' } }, [
        frame({ layout: { type: 'row' }, width: 'hug', height: 'hug' }, [
          label({ width: 'fill' }),
        ]),
      ]),
    );
    expect(kid(scene, 0).width).toBe(0);
    expect(warnings).toContain('fill dentro de hug vira 0');
  });

  it('texto hug continua medido sem quebra', () => {
    const { root: scene } = root(
      frame({ layout: { type: 'column' } }, [
        frame({ layout: { type: 'column' }, width: 'hug', height: 'hug' }, [label()]),
      ]),
      {},
      { x: 0, y: 0, width: 100, height: 300 },
    );
    const card = kid(scene, 0);
    expect(card.width).toBeCloseTo(154, 3);
    expect(kid(card, 0).height).toBeCloseTo(LINE, 5);
  });

  it('texto medido com largura 0 avisa com o nome do nó', () => {
    const { warnings } = root(
      frame({ layout: { type: 'column' } }, [
        frame({ layout: { type: 'row' }, width: 'hug', height: 'hug' }, [
          label({ name: 'rótulo', width: 'fill' }),
        ]),
      ]),
    );
    expect(warnings).toContain('texto medido com largura 0: rótulo');
  });
});

// --- B2: repeat.distribute ------------------------------------------------------------------

describe('B2: repeat.distribute', () => {
  const rows: FieldValues = { linhas: [{ a: '1' }, { a: '2' }, { a: '3' }] };
  const repeat = (extra: Raw, template: Raw = {}): Raw => ({
    type: 'repeat',
    field: 'linhas',
    gap: 6,
    template: frame({ layout: { type: 'row' }, ...template }, [
      label({ text: { $field: 'a' } }),
    ]),
    ...extra,
  });
  const tree = (extra: Raw, template: Raw = {}) =>
    frame({ layout: { type: 'column' } }, [repeat(extra, template)]);

  it('distribute fill: as linhas dividem o eixo menos os gaps (96 cada)', () => {
    const { root: scene, warnings } = root(tree({ distribute: 'fill' }), rows);
    const list = kid(scene, 0) as FrameNode;
    expect(list.height).toBe(300);
    expect(list.children.map((c) => c.height)).toEqual([96, 96, 96]);
    expect(list.children.map(yOf)).toEqual([0, 102, 204]);
    expect(warnings).toEqual([]);
  });

  it('distribute fill com height fill explícito no template vale a fração', () => {
    const { root: scene } = root(tree({ distribute: 'fill' }, { height: 'fill' }), rows);
    expect((kid(scene, 0) as FrameNode).children.map((c) => c.height)).toEqual([
      96, 96, 96,
    ]);
  });

  it('distribute fill com px explícito no template mantém o px', () => {
    const { root: scene } = root(tree({ distribute: 'fill' }, { height: 30 }), rows);
    expect((kid(scene, 0) as FrameNode).children.map((c) => c.height)).toEqual([
      30, 30, 30,
    ]);
  });

  it('sem distribute, height fill no template vale 0 com o aviso de hoje', () => {
    const { root: scene, warnings } = root(tree({}, { height: 'fill' }), rows);
    expect((kid(scene, 0) as FrameNode).children.map((c) => c.height)).toEqual([0, 0, 0]);
    expect(warnings).toContain('fill dentro de hug vira 0');
  });
});

// --- B3: expressão nas chaves de layout -----------------------------------------------------

describe('B3: expressão em layout e tamanho', () => {
  const two = (layout: Raw) =>
    frame({ layout }, [rect({ width: 40, height: 20 }), rect({ width: 40, height: 20 })]);

  it('layout.type por expressão arruma em linha; fora do conjunto cai em none com aviso', () => {
    const tree = two({ type: { $field: 'dir' }, gap: 10 });
    const ok = root(tree, { dir: 'row' });
    expect(ok.root.children.map(xOf)).toEqual([0, 50]);
    expect(ok.warnings).toEqual([]);
    const bad = root(tree, { dir: 'diagonal' });
    expect(bad.root.children.map(xOf)).toEqual([0, 0]);
    expect(bad.warnings).toContain('valor inválido em layout.type: diagonal');
  });

  it('width por $switch: fill, hug, % e px', () => {
    const tree = frame({ layout: { type: 'row' } }, [
      rect({
        height: 20,
        width: { $switch: 'w', cases: { a: 'fill', b: 'hug', c: '50%', d: 120 } },
      }),
    ]);
    const widthOf = (w: string) => kid(root(tree, { w }).root, 0).width;
    expect(widthOf('a')).toBe(200);
    expect(widthOf('b')).toBe(0);
    expect(widthOf('c')).toBe(100);
    expect(widthOf('d')).toBe(120);
  });

  it('width numérico em texto puro vale o número; inválido cai no padrão com aviso', () => {
    const tree = frame({ layout: { type: 'row' } }, [
      rect({ height: 20, width: { $field: 'w' } }),
    ]);
    expect(kid(root(tree, { w: '120' }).root, 0).width).toBe(120);
    const bad = root(tree, { w: 'zzz' });
    expect(kid(bad.root, 0).width).toBe(200);
    expect(bad.warnings).toContain('valor inválido em width: zzz');
    const negative = root(tree, { w: -5 });
    expect(negative.warnings).toContain('valor inválido em width: -5');
  });

  it('height inválido avisa com height', () => {
    const tree = frame({ layout: { type: 'column' } }, [
      rect({ width: 20, height: { $field: 'h' } }),
    ]);
    expect(root(tree, { h: 'x' }).warnings).toContain('valor inválido em height: x');
  });

  it('justify e align por expressão', () => {
    const tree = frame(
      { layout: { type: 'row', justify: { $field: 'j' }, align: { $field: 'a' } } },
      [rect({ width: 50, height: 20 })],
    );
    const at = (values: FieldValues) => {
      const kidNode = kid(root(tree, values).root, 0);
      return [xOf(kidNode), yOf(kidNode)];
    };
    expect(at({ j: 'end', a: 'end' })).toEqual([150, 280]);
    expect(at({ j: 'center', a: 'center' })).toEqual([75, 140]);
    const bad = root(tree, { j: 'bogus', a: 'nada' });
    expect(xOf(kid(bad.root, 0))).toBe(0);
    expect(bad.warnings).toContain('valor inválido em layout.justify: bogus');
    expect(bad.warnings).toContain('valor inválido em layout.align: nada');
  });
});

// --- B4: min/max ----------------------------------------------------------------------------

describe('B4: minWidth, maxWidth, minHeight e maxHeight', () => {
  it('minWidth sobe um nó hug de 40 px para 80', () => {
    const tree = frame({ layout: { type: 'row' } }, [
      frame({ width: 'hug', height: 20, minWidth: 80 }, [
        rect({ width: 40, height: 20, anchors: { left: 0, top: 0 } }),
      ]),
    ]);
    expect(kid(root(tree).root, 0).width).toBe(80);
  });

  it('maxWidth num fill devolve a sobra ao outro fill', () => {
    const tree = frame({ layout: { type: 'row' } }, [
      rect({ width: 'fill', height: 20, maxWidth: 100 }),
      rect({ width: 'fill', height: 20 }),
    ]);
    const { root: scene } = root(tree, {}, { x: 0, y: 0, width: 320, height: 100 });
    expect(scene.children.map((c) => c.width)).toEqual([100, 220]);
    expect(xOf(kid(scene, 1))).toBe(100);
  });

  it('minWidth num fill congela o nó e os outros dividem o resto', () => {
    const tree = frame({ layout: { type: 'row' } }, [
      rect({ width: 'fill', height: 20, minWidth: 150 }),
      rect({ width: 'fill', height: 20 }),
      rect({ width: 'fill', height: 20 }),
    ]);
    const { root: scene } = root(tree, {}, { x: 0, y: 0, width: 300, height: 100 });
    expect(scene.children.map((c) => c.width)).toEqual([150, 75, 75]);
  });

  it('limites por expressão; inválido ou negativo = ausente; min maior que max vale o min', () => {
    const tree = frame({ layout: { type: 'row' } }, [
      rect({ width: 200, height: 20, maxWidth: { $field: 'max' } }),
      rect({ width: 200, height: 20, maxWidth: -10 }),
      rect({ width: 200, height: 20, minWidth: 120, maxWidth: 60 }),
    ]);
    const { root: scene } = root(
      tree,
      { max: 90 },
      { x: 0, y: 0, width: 800, height: 40 },
    );
    expect(scene.children.map((c) => c.width)).toEqual([90, 200, 120]);
  });

  it('minHeight e maxHeight valem no eixo vertical', () => {
    const tree = frame({ layout: { type: 'column' } }, [
      rect({ width: 20, height: 10, minHeight: 40 }),
      rect({ width: 20, height: 100, maxHeight: 30 }),
    ]);
    const { root: scene } = root(tree);
    expect(scene.children.map((c) => c.height)).toEqual([40, 30]);
  });

  it('texto hug cortado por maxWidth mede a altura quebrando na largura cortada', () => {
    const tree = frame({ layout: { type: 'column' } }, [label({ maxWidth: 50 })]);
    const text = kid(root(tree).root, 0);
    expect(text.width).toBe(50);
    expect(text.height).toBeGreaterThan(3 * LINE);
  });

  it('raiz hug: measureComponent aplica o max e mede a altura na largura limitada', () => {
    const tree = frame({ layout: { type: 'column' }, maxWidth: 100 }, [
      label({ width: 'hug' }),
      rect({ width: 150, height: 10 }),
    ]);
    const measured = measureComponent(
      file(tree),
      {},
      { width: null, height: null },
      { measure: approximateMeasurer },
    );
    expect(measured.width).toBeLessThanOrEqual(100);
    expect(measured.width).toBe(100);
  });

  it('raiz hug: o texto fill da raiz mede dentro do maxWidth e a altura acompanha', () => {
    const tree = frame({ layout: { type: 'column' }, maxWidth: 100 }, [
      label({ width: 'fill' }),
    ]);
    const measured = measureComponent(
      file(tree),
      {},
      { width: null, height: null },
      { measure: approximateMeasurer },
    );
    expect(measured.width).toBeGreaterThan(0);
    expect(measured.width).toBeLessThanOrEqual(100);
    expect(measured.height).toBeGreaterThan(1.5 * LINE);
  });

  it('raiz hug: minWidth sobe o resultado', () => {
    const tree = frame({ layout: { type: 'row' }, minWidth: 90 }, [
      rect({ width: 30, height: 10 }),
    ]);
    const measured = measureComponent(
      file(tree),
      {},
      { width: null, height: null },
      { measure: approximateMeasurer },
    );
    expect(measured.width).toBe(90);
  });

  it('com caixa dada, a raiz ocupa a caixa e os limites dela não se aplicam', () => {
    const tree = frame({ layout: { type: 'row' }, maxWidth: 100 });
    const { root: scene } = root(tree, {}, { x: 0, y: 0, width: 200, height: 50 });
    expect(scene.width).toBe(200);
  });
});

// --- B4 em layoutScreen: o minSize da instância vem depois do max --------------------------

describe('B4: minSize da instância depois do max da raiz', () => {
  function build(extra: Raw) {
    const component = file(
      frame({ layout: { type: 'row' }, maxWidth: 100 }, [
        rect({ width: 150, height: 20 }),
      ]),
      4,
      { id: 'capped', name: 'capped', sizing: { width: 'hug', height: 'hug' }, ...extra },
    );
    const spec = {
      format: 'mapping-spec',
      formatVersion: 4,
      id: 'fid',
      name: 'Fid',
      layers: [
        {
          id: 'ui',
          name: 'UI',
          color: '#1E88E5',
          annotationTypes: [
            {
              id: 'capped',
              name: 'capped',
              component: 'components/capped.json',
              fields: [],
            },
          ],
        },
      ],
    };
    const library = loadLibrary([
      { path: 'spec.json', text: JSON.stringify(spec) },
      { path: 'components/capped.json', text: JSON.stringify(component) },
    ]);
    expect(library.problems).toEqual([]);
    return layoutScreen(
      {
        id: 's',
        name: 'Tela',
        width: 400,
        height: 400,
        background: '#FFF',
        roots: [{ node: { id: 'n', typeId: 'capped', values: {}, children: [] } }],
      },
      library,
      approximateMeasurer,
    ).screen.instances[0]?.box;
  }

  it('o max da raiz limita o hug da instância', () => {
    expect(build({})?.width).toBe(100);
  });

  it('o minSize da instância sobe acima do max', () => {
    expect(build({ minSize: { width: 150, height: 10 } })?.width).toBe(150);
  });
});
