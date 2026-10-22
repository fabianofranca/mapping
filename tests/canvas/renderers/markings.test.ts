import Konva from 'konva/lib/Core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Frame } from '../../../src/canvas/frame';
import { MarkingRenderer } from '../../../src/canvas/renderers/markings';
import {
  createMarking,
  removeMarking,
  setContainerMarkingColor,
  setMarkingFloating,
  type LayerDot,
  type Placement,
  type Project,
} from '../../../src/model';
import { canvasProject, editorFor, frameOf, installFakeCanvas, TOKENS } from '../harness';

beforeAll(installFakeCanvas);
afterAll(() => vi.restoreAllMocks());

const PLACEMENTS: ReadonlyMap<string, Placement> = new Map([
  ['I1', { x: 0, y: 0, scale: 1 }],
  ['I2', { x: 1100, y: 0, scale: 1 }],
]);
/** Tela grande o bastante para M1 inteira (M3, em I2, continua fora). */
const SIZE = { width: 1000, height: 800 };

function setup() {
  const layer = new Konva.Layer();
  const renderer = new MarkingRenderer(layer);
  const editor = editorFor();
  const render = (overrides: Partial<Frame> = {}) =>
    renderer.render(frameOf(editor, { size: SIZE, ...overrides }), PLACEMENTS);
  return { layer, renderer, editor, render };
}

function node(renderer: MarkingRenderer, id: string) {
  const n = renderer.node(id);
  if (!n) throw new Error(`sem nó para ${id}`);
  return n;
}

function withReview(p: Project, id: string): Project {
  return {
    ...p,
    markings: p.markings.map((m) => (m.id === id ? { ...m, needsReview: true } : m)),
  };
}

describe('MarkingRenderer', () => {
  it('borda na posição da marcação; filhas por cima dos pais', () => {
    const { renderer, render } = setup();
    render();
    const m1 = node(renderer, 'M1');
    expect(m1.border.getAttrs()).toMatchObject({
      x: 100,
      y: 100,
      width: 600,
      height: 500,
      stroke: TOKENS.line,
      strokeWidth: 1,
    });
    // Halo em toda marcação: um traço 2 px mais largo (1 px de cada lado) por baixo da linha.
    expect(m1.halo.getAttrs()).toMatchObject({
      visible: true,
      stroke: TOKENS.halo,
      strokeWidth: 3,
    });
    expect(node(renderer, 'M2').group.zIndex()).toBeGreaterThan(m1.group.zIndex());
  });

  it('selecionada: linha em cv-select, mais grossa, com halo', () => {
    const { renderer, render } = setup();
    render({
      selection: { kind: 'marking', id: 'M1' },
      viewport: { x: 0, y: 0, scale: 2 },
    });
    const m1 = node(renderer, 'M1');
    // 2 px de tela com zoom 2; o halo soma 1 px de cada lado.
    expect(m1.border.getAttrs()).toMatchObject({ stroke: TOKENS.select, strokeWidth: 1 });
    expect(m1.halo.getAttrs()).toMatchObject({ stroke: TOKENS.halo, strokeWidth: 2 });
  });

  it('cor de borda escolhida para a imagem', () => {
    const { renderer, render } = setup();
    render({ project: setContainerMarkingColor(canvasProject(), 'I1', '#00ff00') });
    expect(node(renderer, 'M1').border.stroke()).toBe('#00FF00');
  });

  it('fora da tela ou oculta pelo modo de exibição: não aparece', () => {
    const { renderer, render } = setup();
    render({ visibility: new Map([['M2', 'hidden' as const]]) });
    expect(node(renderer, 'M1').group.visible()).toBe(true);
    expect(node(renderer, 'M2').group.visible()).toBe(false);
    expect(node(renderer, 'M3').group.visible()).toBe(false);
  });

  it('esmaecida e contorno de contexto (sem indicadores)', () => {
    const { renderer, render } = setup();
    render({
      visibility: new Map([
        ['M1', 'outline' as const],
        ['M2', 'dim' as const],
      ]),
    });
    expect(node(renderer, 'M1').group.opacity()).toBe(TOKENS.opacity.ancestor);
    expect(node(renderer, 'M1').indicators.visible()).toBe(false);
    expect(node(renderer, 'M1').text.group.visible()).toBe(false);
    expect(node(renderer, 'M2').group.opacity()).toBe(TOKENS.opacity.dimmed);
  });

  it('uma bolinha por camada; depois de quatro, "+N"', () => {
    const { renderer, render, editor } = setup();
    render();
    const m1 = node(renderer, 'M1');
    expect(m1.indicators.visible()).toBe(true);
    expect(m1.dots[0]?.fill()).toBe('#E53935');
    expect(m1.dots[1]?.visible()).toBe(false);

    const layer = editor.store.project.peek()?.layers[0];
    if (!layer) throw new Error('fixture');
    const dots: LayerDot[] = Array.from({ length: 6 }, (_, i) => ({
      layer: { ...layer, id: `L${i}` },
    }));
    render({ dots: new Map([['M1', dots]]) });
    expect(m1.dots.filter((d) => d.visible())).toHaveLength(4);
    expect(m1.dots[0]?.fill()).toBe('#E53935');
    expect(m1.dots[0]?.stroke()).toBe(TOKENS.halo);
    expect(m1.more.visible()).toBe(true);
    expect(m1.more.text()).toBe('+2');
    expect(m1.more.getAttrs()).toMatchObject({
      fill: TOKENS.line,
      stroke: TOKENS.halo,
      fontFamily: TOKENS.fontFamily,
    });
  });

  it('alerta de incompleta e selo de revisão', () => {
    const { renderer, render } = setup();
    render({
      project: withReview(canvasProject(), 'M1'),
      incomplete: new Set(['M1']),
    });
    const m1 = node(renderer, 'M1');
    expect(m1.alert.visible()).toBe(true);
    expect(m1.alert.getAttrs()).toMatchObject({
      fill: TOKENS.warning,
      stroke: TOKENS.halo,
    });
    expect(m1.badge.visible()).toBe(true);
    expect(m1.badge.fill()).toBe(TOKENS.warning);
    expect(m1.border.dash()).toEqual([6, 4]);
  });

  describe('marcação com o desenho à vista', () => {
    const drawn = new Set(['M1']);

    it('sem hover nem seleção: sem borda nem halo, mas com as bolinhas das camadas', () => {
      const { renderer, render } = setup();
      render({ drawn });
      const m1 = node(renderer, 'M1');
      expect(m1.border.visible()).toBe(false);
      expect(m1.halo.visible()).toBe(false);
      expect(m1.indicators.visible()).toBe(true);
      // As outras marcações não mudam.
      expect(node(renderer, 'M2').border.visible()).toBe(true);
      expect(node(renderer, 'M2').halo.visible()).toBe(true);
    });

    it('a pendência de anotação continua visível sem a borda', () => {
      const { renderer, render } = setup();
      render({ drawn, incomplete: new Set(['M1']) });
      const m1 = node(renderer, 'M1');
      expect(m1.border.visible()).toBe(false);
      expect(m1.alert.visible()).toBe(true);
    });

    it('sob o mouse ou selecionada: a borda e o halo aparecem', () => {
      const { renderer, render } = setup();
      render({ drawn });
      render({ drawn, hoverMarking: 'M1' });
      expect(node(renderer, 'M1').border.visible()).toBe(true);
      expect(node(renderer, 'M1').halo.visible()).toBe(true);
      render({ drawn, hoverMarking: null });
      expect(node(renderer, 'M1').border.visible()).toBe(false);
      render({ drawn, selection: { kind: 'marking', id: 'M1' } });
      expect(node(renderer, 'M1').border.visible()).toBe(true);
      expect(node(renderer, 'M1').border.getAttrs()).toMatchObject({
        stroke: TOKENS.select,
        strokeWidth: 2,
      });
    });

    it('zoom semântico: sem cartão nem nome; as outras marcações mantêm o rótulo', () => {
      const { renderer, render } = setup();
      render();
      expect(node(renderer, 'M1').text.group.visible()).toBe(true);
      render({ drawn });
      expect(node(renderer, 'M1').text.group.visible()).toBe(false);
      // M3 (sem nome, em I2) e as demais seguem o caminho de sempre.
      render({ drawn: new Set(['M2']) });
      expect(node(renderer, 'M1').text.group.visible()).toBe(true);
      expect(node(renderer, 'M1').text.header.text()).toBe('Porta');
    });
  });

  it('pan sem mudar a marcação não refaz a borda; zoom refaz', () => {
    const { renderer, render } = setup();
    render();
    const spy = vi.spyOn(node(renderer, 'M1').border, 'setAttrs');
    render({ viewport: { x: -20, y: -10, scale: 1 } });
    expect(spy).not.toHaveBeenCalled();
    render({ viewport: { x: -20, y: -10, scale: 2 } });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('zoom semântico: só o nome no cabeçalho, sem cartão de anotações', () => {
    const { renderer, render } = setup();
    render();
    const text = node(renderer, 'M1').text;
    expect(text.group.visible()).toBe(true);
    expect(text.header.text()).toBe('Porta');
    expect(text.header.getAttrs()).toMatchObject({
      fill: TOKENS.line,
      stroke: TOKENS.halo,
      fontFamily: TOKENS.fontFamily,
      fontSize: TOKENS.type.name.size,
    });
    // A única coisa de texto do grupo é o nome: as anotações ficam no painel direito.
    expect(text.group.getChildren()).toEqual([text.header]);
  });

  it('zoom semântico: marcação grande sem filhas mostra só o nome', () => {
    const { renderer, render } = setup();
    render({ viewport: { x: -1100, y: -1100, scale: 6 } });
    const text = node(renderer, 'M2').text;
    expect(text.group.visible()).toBe(true);
    expect(text.header.text()).toBe('Maçaneta');
    expect(text.group.getChildren()).toEqual([text.header]);
  });

  // Etapa 6 (6.4), achado 6: filha no mesmo canto do pai ("Formulário …" sobre "Nome").
  it('zoom semântico: o nome da filha no canto do pai desce para baixo do cabeçalho dele', () => {
    const { renderer, render, editor } = setup();
    const p = editor.store.committed.value;
    if (!p) throw new Error('sem projeto');
    const project: Project = {
      ...p,
      markings: p.markings.map((m) =>
        m.id === 'M2' ? { ...m, rect: { x: 100, y: 100, width: 200, height: 120 } } : m,
      ),
    };
    render({ project });
    const parent = node(renderer, 'M1').text.header;
    const child = node(renderer, 'M2').text.header;
    expect(parent.visible()).toBe(true);
    expect(child.visible()).toBe(true);
    expect(child.y()).toBeGreaterThanOrEqual(parent.y() + parent.height());
  });

  it('zoom semântico: marcação pequena na tela não mostra o nome', () => {
    const { renderer, render } = setup();
    render({ viewport: { x: 0, y: 0, scale: 0.1 } });
    expect(node(renderer, 'M1').text.group.visible()).toBe(false);
  });

  it('remove o nó de uma marcação apagada', () => {
    const { layer, renderer, render } = setup();
    render();
    render({ project: removeMarking(canvasProject(), 'M2') });
    expect(renderer.node('M2')).toBeUndefined();
    expect(layer.getChildren()).toHaveLength(2);
  });
});

// Marcações do canvas e flutuantes (etapa Marcações espaciais, ME1).
describe('MarkingRenderer: marcações do canvas', () => {
  /** Uma marcação do canvas C1 em volta das duas imagens e a flutuante N1 sobre a Porta. */
  function spatial(): Project {
    const p = createMarking(canvasProject(), {
      id: 'C1',
      containerId: null,
      rect: { x: -100, y: -100, width: 1800, height: 1000 },
    });
    return createMarking(p, {
      id: 'N1',
      containerId: null,
      rect: { x: 400, y: 400, width: 200, height: 100 },
      floating: true,
    });
  }

  function twoParents() {
    const layer = new Konva.Layer();
    const floatingParent = new Konva.Group();
    layer.add(floatingParent);
    const renderer = new MarkingRenderer(layer, floatingParent);
    const editor = editorFor(spatial());
    const render = (overrides: Partial<Frame> = {}) =>
      renderer.render(
        frameOf(editor, { size: { width: 2000, height: 1200 }, ...overrides }),
        PLACEMENTS,
      );
    return { layer, floatingParent, renderer, render };
  }

  it('a marcação do canvas é desenhada no espaço identidade, com borda tracejada e o token dela', () => {
    const { renderer, render } = twoParents();
    render({ viewport: { x: 0, y: 0, scale: 2 } });
    const c1 = node(renderer, 'C1');
    expect(c1.border.getAttrs()).toMatchObject({
      x: -100,
      y: -100,
      width: 1800,
      height: 1000,
      stroke: TOKENS.canvasMarking,
      dash: [5, 3],
    });
    expect(c1.halo.dash()).toEqual([5, 3]);
    // A de container não é tracejada nem usa o token do canvas.
    expect(node(renderer, 'M1').border.dash()).toEqual([]);
    expect(node(renderer, 'M1').border.stroke()).toBe(TOKENS.line);
  });

  it('selecionada, a marcação do canvas usa a cor de seleção e continua tracejada', () => {
    const { renderer, render } = twoParents();
    render({ selection: { kind: 'marking', id: 'C1' } });
    expect(node(renderer, 'C1').border.getAttrs()).toMatchObject({
      stroke: TOKENS.select,
      dash: [10, 6],
    });
  });

  it('a flutuante fica no grupo de cima e as demais na camada; trocar de lado move o nó', () => {
    const { layer, floatingParent, renderer, render } = twoParents();
    render();
    expect(node(renderer, 'N1').group.getParent()).toBe(floatingParent);
    expect(node(renderer, 'C1').group.getParent()).toBe(layer);
    expect(node(renderer, 'M1').group.getParent()).toBe(layer);
    // Cada pilha tem a sua ordem (o pai antes das filhas).
    expect(node(renderer, 'M2').group.zIndex()).toBeGreaterThan(
      node(renderer, 'M1').group.zIndex(),
    );
    expect(node(renderer, 'N1').group.zIndex()).toBe(0);

    // A Porta passa a flutuante: o nó muda de grupo.
    const project = setMarkingFloating(spatial(), 'M1', true);
    render({ project });
    expect(node(renderer, 'M1').group.getParent()).toBe(floatingParent);
    render({ project: spatial() });
    expect(node(renderer, 'M1').group.getParent()).toBe(layer);
  });

  it('sem grupo próprio das flutuantes, tudo fica na mesma camada (compatível)', () => {
    const layer = new Konva.Layer();
    const renderer = new MarkingRenderer(layer);
    const editor = editorFor(spatial());
    renderer.render(frameOf(editor, { size: { width: 2000, height: 1200 } }), PLACEMENTS);
    expect(node(renderer, 'N1').group.getParent()).toBe(layer);
  });

  it('o nome da marcação do canvas aparece no zoom semântico como o das outras', () => {
    const named = createMarking(canvasProject(), {
      id: 'C2',
      containerId: null,
      rect: { x: 2000, y: 100, width: 600, height: 400 },
      name: 'Grupo',
    });
    const layer = new Konva.Layer();
    const renderer = new MarkingRenderer(layer);
    const editor = editorFor(named);
    renderer.render(
      frameOf(editor, {
        size: { width: 3000, height: 1000 },
        viewport: { x: 0, y: 0, scale: 1 },
      }),
      PLACEMENTS,
    );
    expect(node(renderer, 'C2').text.header.text()).toBe('Grupo');
  });
});
