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
  containerId = 'img-1',
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
