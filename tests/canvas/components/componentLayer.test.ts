// A camada de componentes: diff por identidade dos desenhos, ordem, visibilidade e posição da imagem.
import Konva from 'konva';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { installFakeCanvas } from '../harness';
import {
  type LayerDrawing,
  ComponentLayerRenderer,
} from '../../../src/canvas/components/componentLayer';
import type { Placement } from '../../../src/model';
import {
  type FrameNode,
  type SceneNode,
  baseNode,
  translate,
} from '../../../src/model/components/scene';

beforeAll(() => installFakeCanvas());

function drawing(
  markingId: string,
  containerId: string | null = 'img-1',
  x = 0,
  color = '#ffffff',
): LayerDrawing {
  const root: FrameNode = {
    ...baseNode({
      id: markingId,
      name: markingId,
      width: 100,
      height: 40,
      transform: translate(x, 10),
    }),
    type: 'frame',
    clip: false,
    cornerRadius: 4,
    fills: [{ type: 'solid', color }],
    children: [],
  };
  return { markingId, containerId: containerId, root };
}

function toMap(...list: LayerDrawing[]): Map<string, LayerDrawing> {
  return new Map(list.map((d) => [d.markingId, d]));
}

const all = () => true;
const PLACEMENTS: ReadonlyMap<string, Placement> = new Map([
  ['img-1', { x: 50, y: 20, scale: 0.5 }],
  ['img-2', { x: 400, y: 0, scale: 2 }],
]);

function setup() {
  const parent = new Konva.Group();
  const layer = new ComponentLayerRenderer(parent);
  /** Nós dos desenhos de uma imagem, na ordem de desenho. */
  const nodes = (containerId: string): Konva.Node[] => {
    const group = parent
      .getChildren()
      .find((n: Konva.Node) => n.getAttr('containerId') === containerId) as
      Konva.Group | undefined;
    return group ? [...group.getChildren()] : [];
  };
  return { parent, layer, nodes };
}

describe('ComponentLayerRenderer', () => {
  it('não desenha contorno tracejado para o slot de um container', () => {
    const { layer, nodes } = setup();
    const base = drawing('row');
    const slot: SceneNode = {
      ...baseNode({
        id: 'slot',
        name: 'slot',
        width: 80,
        height: 20,
        transform: translate(0, 0),
      }),
      type: 'unknown',
      sourceType: 'slot',
    };
    const root: FrameNode = { ...(base.root as FrameNode), fills: [], children: [slot] };
    layer.render(toMap({ ...base, root }), all, PLACEMENTS);
    const rects = (nodes('img-1')[0] as Konva.Group).find('Rect') as Konva.Rect[];
    expect(rects.some((r) => (r.dash() ?? []).length > 0)).toBe(false);
  });

  it('cria um grupo por imagem posicionado pelo placement, sem eventos', () => {
    const { parent, layer, nodes } = setup();
    const changed = layer.render(
      toMap(drawing('a'), drawing('b', 'img-2'), drawing('c')),
      all,
      PLACEMENTS,
    );
    expect(changed).toBe(true);
    expect(parent.getChildren()).toHaveLength(2);
    const [first, second] = parent.getChildren() as Konva.Group[];
    expect(first?.position()).toEqual({ x: 50, y: 20 });
    expect(first?.scaleX()).toBe(0.5);
    expect(second?.scaleY()).toBe(2);
    expect(first?.listening()).toBe(false);
    expect(nodes('img-1').map((n) => n.getAttr('markingId'))).toEqual(['a', 'c']);
    expect(nodes('img-2').map((n) => n.getAttr('markingId'))).toEqual(['b']);
    // Cada nó é a cena da marcação, nas coordenadas da imagem.
    expect(nodes('img-1')[0]?.listening()).toBe(false);
    expect(nodes('img-1')[0]?.position()).toEqual({ x: 0, y: 10 });
  });

  it('o mesmo Map devolve false e não mexe nos nós', () => {
    const { layer, nodes } = setup();
    const drawings = toMap(drawing('a'), drawing('b'));
    layer.render(drawings, all, PLACEMENTS);
    const before = nodes('img-1');
    expect(layer.render(drawings, all, PLACEMENTS)).toBe(false);
    nodes('img-1').forEach((n, i) => expect(n).toBe(before[i]));
  });

  it('refaz só o desenho cujo objeto mudou (identidade)', () => {
    const { layer, nodes } = setup();
    const a = drawing('a');
    const b = drawing('b');
    const c = drawing('c');
    layer.render(toMap(a, b, c), all, PLACEMENTS);
    const [na, nb, nc] = nodes('img-1');
    const b2 = drawing('b', 'img-1', 7, '#ff0000');
    expect(layer.render(toMap(a, b2, c), all, PLACEMENTS)).toBe(true);
    const after = nodes('img-1');
    expect(after).toHaveLength(3);
    expect(after[0]).toBe(na);
    expect(after[2]).toBe(nc);
    expect(after[1]).not.toBe(nb);
    // O novo nó ficou na mesma posição da ordem de desenho.
    expect(after[1]?.getAttr('markingId')).toBe('b');
    expect(after[1]?.x()).toBe(7);
    expect(nb?.getParent()).toBeNull();
  });

  it('refazer um desenho cria os nós só dele', () => {
    const add = vi.spyOn(Konva.Group.prototype, 'add');
    const { layer } = setup();
    const a = drawing('a');
    const b = drawing('b');
    layer.render(toMap(a, b), all, PLACEMENTS);
    add.mockClear();
    layer.render(toMap(a, drawing('b', 'img-1', 1)), all, PLACEMENTS);
    // Um `add` do preenchimento dentro da cena de b + um da cena dentro do grupo da imagem.
    expect(add).toHaveBeenCalledTimes(2);
    add.mockRestore();
  });

  it('destrói o desenho que sumiu e o grupo da imagem que ficou vazia', () => {
    const { parent, layer, nodes } = setup();
    layer.render(toMap(drawing('a'), drawing('b', 'img-2')), all, PLACEMENTS);
    const [nb] = nodes('img-2');
    expect(layer.render(toMap(drawing('a')), all, PLACEMENTS)).toBe(true);
    expect(parent.getChildren()).toHaveLength(1);
    expect(nb?.getParent()).toBeNull();
    expect(nodes('img-2')).toEqual([]);
  });

  it('a ordem do Map é a ordem de desenho; reordenar refaz a ordem sem refazer os nós', () => {
    const { layer, nodes } = setup();
    const a = drawing('a');
    const b = drawing('b');
    const c = drawing('c');
    layer.render(toMap(a, b, c), all, PLACEMENTS);
    const [na, nb, nc] = nodes('img-1');
    expect(layer.render(toMap(c, a, b), all, PLACEMENTS)).toBe(true);
    const after = nodes('img-1');
    expect(after[0]).toBe(nc);
    expect(after[1]).toBe(na);
    expect(after[2]).toBe(nb);
    expect(layer.render(toMap(c, a, b), all, PLACEMENTS)).toBe(false);
  });

  it('visible esconde (destrói) e volta a desenhar', () => {
    const { layer, nodes } = setup();
    const drawings = toMap(drawing('a'), drawing('b'));
    layer.render(drawings, all, PLACEMENTS);
    expect(layer.render(drawings, (d) => d.markingId !== 'a', PLACEMENTS)).toBe(true);
    expect(nodes('img-1').map((n) => n.getAttr('markingId'))).toEqual(['b']);
    expect(layer.render(drawings, all, PLACEMENTS)).toBe(true);
    expect(nodes('img-1').map((n) => n.getAttr('markingId'))).toEqual(['a', 'b']);
  });

  it('mudar o placement move o grupo sem refazer os desenhos; imagem sem placement não desenha', () => {
    const { parent, layer, nodes } = setup();
    const drawings = toMap(drawing('a'), drawing('b', 'img-2'));
    layer.render(drawings, all, PLACEMENTS);
    const [na] = nodes('img-1');
    const moved = new Map(PLACEMENTS).set('img-1', { x: 5, y: 6, scale: 1 });
    expect(layer.render(drawings, all, moved)).toBe(true);
    const group = na?.getParent();
    expect(group?.position()).toEqual({ x: 5, y: 6 });
    expect(group?.scaleX()).toBe(1);
    expect(nodes('img-1')[0]).toBe(na);

    const withoutSecond = new Map(moved);
    withoutSecond.delete('img-2');
    expect(layer.render(drawings, all, withoutSecond)).toBe(true);
    expect(parent.getChildren()).toHaveLength(1);
  });

  it('uma marcação que muda de imagem é refeita no grupo novo', () => {
    const { layer, nodes } = setup();
    layer.render(toMap(drawing('a')), all, PLACEMENTS);
    layer.render(toMap(drawing('a', 'img-2')), all, PLACEMENTS);
    expect(nodes('img-1')).toEqual([]);
    expect(nodes('img-2').map((n) => n.getAttr('markingId'))).toEqual(['a']);
  });

  it('destroy remove os grupos da camada e deixa o pai', () => {
    const { parent, layer } = setup();
    layer.render(toMap(drawing('a')), all, PLACEMENTS);
    layer.destroy();
    expect(parent.getChildren()).toHaveLength(0);
    expect(layer.render(new Map(), all, PLACEMENTS)).toBe(false);
  });

  it('passa a paleta do tema ao reservado', () => {
    const parent = new Konva.Group();
    const layer = new ComponentLayerRenderer(parent, {
      placeholder: { unknownLine: '#00aa00' },
    });
    const root: FrameNode = {
      ...baseNode({ id: 'm', name: 'm', width: 50, height: 50 }),
      type: 'frame',
      clip: false,
      cornerRadius: 0,
      fills: [],
      children: [
        {
          ...baseNode({ id: 'u', name: 'u', width: 10, height: 10 }),
          type: 'unknown',
          sourceType: 'BLOB',
        },
      ],
    };
    layer.render(toMap({ markingId: 'm', containerId: 'img-1', root }), all, PLACEMENTS);
    const rects = parent.find('Rect') as Konva.Rect[];
    expect(rects.some((r) => r.stroke() === '#00aa00')).toBe(true);
  });
});

// Marcação do canvas (v13): `containerId` nulo, o grupo dela usa a posição identidade.
describe('ComponentLayerRenderer: espaço do canvas', () => {
  it('desenha no grupo do canvas com a posição identidade, sem precisar de `placements`', () => {
    const { parent, layer } = setup();
    const canvasGroup = () =>
      parent.getChildren().find((n: Konva.Node) => n.getAttr('containerId') === '') as
        Konva.Group | undefined;
    const note = drawing('note', null, 30);
    expect(layer.render(toMap(note), all, new Map())).toBe(true);
    const group = canvasGroup();
    expect(group).toBeDefined();
    expect(group?.getChildren()).toHaveLength(1);
    expect(group?.x()).toBe(0);
    expect(group?.y()).toBe(0);
    expect(group?.scaleX()).toBe(1);
    // Os containers continuam com o placement deles, e o diff por identidade vale nos dois.
    const inImage = drawing('m1');
    layer.render(toMap(note, inImage), all, PLACEMENTS);
    expect(layer.size).toBe(2);
    expect(layer.render(toMap(note, inImage), all, PLACEMENTS)).toBe(false);
    expect(canvasGroup()?.getChildren()).toHaveLength(1);
  });

  it('o grupo do canvas some quando não há mais desenho dele', () => {
    const { parent, layer } = setup();
    layer.render(toMap(drawing('note', null), drawing('m1')), all, PLACEMENTS);
    expect(parent.getChildren()).toHaveLength(2);
    layer.render(toMap(drawing('m1')), all, PLACEMENTS);
    expect(parent.getChildren()).toHaveLength(1);
    expect(layer.size).toBe(1);
  });

  it('a mesma marcação que passa do container ao canvas é redesenhada no grupo novo', () => {
    const { parent, layer } = setup();
    layer.render(toMap(drawing('m1')), all, PLACEMENTS);
    layer.render(toMap(drawing('m1', null)), all, PLACEMENTS);
    expect(layer.size).toBe(1);
    const groups = parent.getChildren() as Konva.Group[];
    const owner = groups.find((g) => g.getChildren().length > 0);
    expect(owner?.getAttr('containerId')).toBe('');
  });

  it('o filtro de visibilidade separa as flutuantes das demais (duas camadas)', () => {
    const lower = new Konva.Group();
    const upper = new Konva.Group();
    const below = new ComponentLayerRenderer(lower);
    const above = new ComponentLayerRenderer(upper);
    const floating = new Set(['note']);
    const drawings = toMap(drawing('m1'), drawing('note', null));
    below.render(drawings, (d) => !floating.has(d.markingId), PLACEMENTS);
    above.render(drawings, (d) => floating.has(d.markingId), PLACEMENTS);
    expect(below.size).toBe(1);
    expect(above.size).toBe(1);
    // A flutuante deixa de ser: o desenho muda de camada.
    floating.clear();
    below.render(drawings, (d) => !floating.has(d.markingId), PLACEMENTS);
    above.render(drawings, (d) => floating.has(d.markingId), PLACEMENTS);
    expect(below.size).toBe(2);
    expect(above.size).toBe(0);
  });

  describe('imagens remotas', () => {
    const A = 'https://cdn.exemplo.com/a.png';
    const B = 'https://cdn.exemplo.com/b.png';
    /** Desenho de uma marcação com uma imagem remota (o nó `image` do componente). */
    function withImage(markingId: string, url?: string): LayerDrawing {
      const base = drawing(markingId);
      const image: SceneNode = {
        ...baseNode({ id: `${markingId}-img`, name: 'img', width: 40, height: 40 }),
        type: 'rect',
        cornerRadius: 0,
        fills: [
          url === undefined
            ? { type: 'solid', color: '#111111' }
            : { type: 'image', url },
        ],
      };
      return {
        ...base,
        root: { ...(base.root as FrameNode), fills: [], children: [image] },
      };
    }
    const ready = { state: 'loaded', image: { width: 10, height: 10 } } as never;

    function imageSetup() {
      const states = new Map<string, unknown>();
      const resolve = vi.fn((url: string) => states.get(url) ?? 'loading');
      const parent = new Konva.Group();
      const layer = new ComponentLayerRenderer(parent, { remoteImage: resolve as never });
      const nodeOf = (id: string) =>
        parent.find((n: Konva.Node) => n.getAttr('markingId') === id)[0] as Konva.Group;
      return { states, resolve, layer, nodeOf, parent };
    }

    it('pede a imagem à função ao desenhar e mostra o reservado enquanto carrega', () => {
      const { resolve, layer, nodeOf } = imageSetup();
      layer.render(toMap(withImage('a', A)), all, PLACEMENTS);
      expect(resolve).toHaveBeenCalledWith(A);
      expect(nodeOf('a').find('Image')).toHaveLength(0);
    });

    it('refreshImages refaz só as marcações da URL, na mesma posição da ordem', () => {
      const { states, resolve, layer, nodeOf, parent } = imageSetup();
      layer.render(
        toMap(withImage('a', A), withImage('b', B), withImage('c', A), withImage('d')),
        all,
        PLACEMENTS,
      );
      const before = ['a', 'b', 'c', 'd'].map(nodeOf);
      resolve.mockClear();
      states.set(A, ready);
      expect(layer.refreshImages(new Set([A]))).toBe(true);
      expect(resolve).toHaveBeenCalledTimes(2);
      // b (outra URL) e d (sem imagem) ficam; a e c são nós novos, já com a imagem.
      expect(nodeOf('b')).toBe(before[1]);
      expect(nodeOf('d')).toBe(before[3]);
      expect(nodeOf('a')).not.toBe(before[0]);
      expect(nodeOf('c')).not.toBe(before[2]);
      expect(nodeOf('a').find('Image')).toHaveLength(1);
      const group = parent.getChildren()[0] as Konva.Group;
      expect(
        group.getChildren().map((n: Konva.Node) => n.getAttr('markingId') as string),
      ).toEqual(['a', 'b', 'c', 'd']);
    });

    it('com null refaz todas as que usam imagem (o consentimento mudou)', () => {
      const { resolve, layer } = imageSetup();
      layer.render(
        toMap(withImage('a', A), withImage('b', B), withImage('d')),
        all,
        PLACEMENTS,
      );
      resolve.mockClear();
      expect(layer.refreshImages(null)).toBe(true);
      expect(resolve.mock.calls.map(([u]) => u).sort()).toEqual([A, B]);
    });

    it('URL que nenhuma marcação usa não refaz nada', () => {
      const { resolve, layer } = imageSetup();
      layer.render(toMap(withImage('a', A), withImage('d')), all, PLACEMENTS);
      resolve.mockClear();
      expect(layer.refreshImages(new Set(['https://outra.exemplo.com/x.png']))).toBe(
        false,
      );
      expect(resolve).not.toHaveBeenCalled();
    });

    it('sem a função de imagem, a camada desenha o reservado e refreshImages refaz sem lançar', () => {
      const parent = new Konva.Group();
      const layer = new ComponentLayerRenderer(parent);
      layer.render(toMap(withImage('a', A)), all, PLACEMENTS);
      expect(layer.refreshImages(null)).toBe(true);
      expect(parent.find('Image')).toHaveLength(0);
    });
  });
});
