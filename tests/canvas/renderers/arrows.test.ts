import Konva from 'konva/lib/Core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { arrowStrokes, visibleArrowShapes } from '../../../src/canvas/arrowGeometry';
import { ArrowRenderer, type ArrowPainter } from '../../../src/canvas/renderers/arrows';
import { setArrowName, setArrowStyle, type Project } from '../../../src/model';
import { arrowProject, withArrow } from '../../model/arrowFixtures';
import { editorFor, frameOf, installFakeCanvas, TOKENS } from '../harness';

beforeAll(installFakeCanvas);
afterAll(() => vi.restoreAllMocks());

const NONE = new Map();

/** Grava as chamadas de pintura: `[operação, ...argumentos]`. */
function recorder() {
  const calls: unknown[][] = [];
  const painter: ArrowPainter = {
    beginPath: () => calls.push(['beginPath']),
    moveTo: (x, y) => calls.push(['moveTo', x, y]),
    lineTo: (x, y) => calls.push(['lineTo', x, y]),
    closePath: () => calls.push(['closePath']),
    stroke: () => calls.push(['stroke']),
    fill: () => calls.push(['fill']),
    setAttr: (attr, value) => calls.push(['set', attr, value]),
  };
  return { calls, painter };
}

/** Os valores gravados de um atributo do contexto (`lineWidth`, `strokeStyle`, …), em ordem. */
const attr = (calls: unknown[][], name: string) =>
  calls.filter((c) => c[0] === 'set' && c[1] === name).map((c) => c[2]);

function setup(project: Project = arrowProject()) {
  const layer = new Konva.Layer();
  const renderer = new ArrowRenderer(layer);
  const editor = editorFor(project);
  const render = (overrides: Parameters<typeof frameOf>[1] = {}) =>
    renderer.render(frameOf(editor, overrides));
  const paint = () => {
    const r = recorder();
    renderer.paint(r.painter);
    return r.calls;
  };
  return { layer, renderer, editor, render, paint };
}

describe('ArrowRenderer', () => {
  it('todas as setas são um só nó, entre a camada e os rótulos', () => {
    const { layer, renderer, render } = setup(
      withArrow(arrowProject(), 'r2', 'a3', 'b2'),
    );
    render();
    expect(renderer.size).toBe(2);
    expect(layer.getChildren()).toHaveLength(2); // o nó das setas e o grupo dos rótulos
    expect(layer.getChildren()[0]).toBe(renderer.node);
    expect(renderer.node.listening()).toBe(false);
  });

  it('pinta o halo, o traço e a ponta com as cores do tema', () => {
    const { render, paint } = setup();
    render();
    const calls = paint();
    // Halo (traço e ponta), depois o traço e a ponta na cor da seta.
    expect(attr(calls, 'strokeStyle')).toEqual([
      TOKENS.halo,
      TOKENS.halo,
      TOKENS.arrow.stroke,
    ]);
    expect(attr(calls, 'fillStyle')).toEqual([TOKENS.halo, TOKENS.arrow.stroke]);
    expect(attr(calls, 'lineCap')).toEqual(['round']);
    const widths = attr(calls, 'lineWidth') as number[];
    expect(widths[2]).toBe(TOKENS.arrow.width);
    expect(widths[0]).toBeGreaterThan(widths[2] as number);
    // A ponta é um triângulo fechado cuja ponta está na âncora de chegada (600, 700).
    const closes = calls.filter((c) => c[0] === 'closePath');
    expect(closes).toHaveLength(2);
    expect(calls).toContainEqual(['moveTo', 600, 700]);
    // O traço termina antes da ponta: nenhum lineTo do traço passa de x = 600.
    const firstStroke = calls.findIndex((c) => c[0] === 'stroke');
    const body = calls.slice(0, firstStroke).filter((c) => c[0] === 'lineTo');
    expect(Math.max(...body.map((c) => c[1] as number))).toBeLessThan(600);
  });

  it('espessura, halo e ponta têm tamanho de tela: dividem pelo zoom', () => {
    const { render, paint } = setup();
    render({ viewport: { x: 0, y: 0, scale: 2 } });
    const calls = paint();
    expect((attr(calls, 'lineWidth') as number[])[2]).toBe(TOKENS.arrow.width / 2);
    // A ponta (10 px de tela) tem 5 unidades do canvas de comprimento.
    const strokes = arrowStrokes(visibleArrowShapes(arrowProject(), NONE), 2, 10);
    const head = strokes.heads[0] as number[];
    const baseX = ((head[2] as number) + (head[4] as number)) / 2;
    expect(Math.abs(baseX - (head[0] as number))).toBeCloseTo(5, 0);
    render({ viewport: { x: 0, y: 0, scale: 0.5 } });
    expect((attr(paint(), 'lineWidth') as number[])[2]).toBe(TOKENS.arrow.width / 0.5);
  });

  it('sem setas (ou sem tema), não pinta nada', () => {
    const { render, paint } = setup();
    expect(paint()).toEqual([]);
    render({ arrows: [] });
    expect(paint()).toEqual([]);
  });

  it('o desenho é calculado uma vez por zoom: repintar (pan) reaproveita', () => {
    const { render, paint, renderer } = setup();
    render();
    const first = paint();
    const spy = vi.spyOn(
      renderer as unknown as { strokesFor(h: number): unknown },
      'strokesFor',
    );
    render({ viewport: { x: -300, y: 40, scale: 1 } }); // pan
    expect(paint()).toEqual(first);
    expect(spy).toHaveBeenCalledTimes(1);
    render({ viewport: { x: 0, y: 0, scale: 1.5 } });
    expect(paint()).not.toEqual(first);
  });

  it('só as setas do quadro; muda o conjunto, muda o desenho', () => {
    const project = withArrow(arrowProject(), 'r2', 'a3', 'b2');
    const { renderer, render, paint } = setup(project);
    render();
    const both = paint().filter((c) => c[0] === 'closePath').length;
    expect(both).toBe(4);
    // Ponta oculta pelo modo de exibição: a seta não é desenhada.
    render({ arrows: visibleArrowShapes(project, new Map([['b2', 'hidden']])) });
    expect(renderer.size).toBe(1);
    expect(paint().filter((c) => c[0] === 'closePath')).toHaveLength(2);
    // Sem setas à vista ("Mostrar setas" desligado, Ver limpo): nada.
    render({ arrows: [] });
    expect(renderer.size).toBe(0);
  });

  it('curva: muitas amostras no traço; reta e canto: os pontos da rota', () => {
    const curve = setup();
    curve.render();
    const curvePoints = curve.paint().filter((c) => c[0] === 'lineTo').length;
    expect(curvePoints).toBeGreaterThan(20);
    const straight = setup(setArrowStyle(arrowProject(), 'r1', 'straight'));
    straight.render();
    // Dois pontos na rota: o traço (um lineTo) e dois lineTo da ponta, em cada passagem.
    const lines = straight.paint().filter((c) => c[0] === 'lineTo').length;
    expect(lines).toBeLessThan(curvePoints);
    const elbow = setup(setArrowStyle(arrowProject(), 'r1', 'elbow'));
    elbow.render();
    expect(elbow.paint().filter((c) => c[0] === 'lineTo').length).toBe(lines);
  });
});

describe('ArrowRenderer: rótulo', () => {
  it('no meio do traço quando há name, centrado, em tamanho de tela', () => {
    const named = setArrowName(arrowProject(), 'r1', 'Abre');
    const { renderer, render } = setup(named);
    render();
    const label = renderer.label('r1');
    if (!label) throw new Error('sem rótulo');
    expect(label.text.text()).toBe('Abre');
    expect(label.text.fill()).toBe(TOKENS.arrow.label);
    expect(label.box.fill()).toBe(TOKENS.arrow.labelBg);
    const width = label.box.width();
    expect(label.group.x() + width / 2).toBeCloseTo(500, 0);
    expect(label.group.y() + label.box.height() / 2).toBeCloseTo(475, 0);
    render({ viewport: { x: 0, y: 0, scale: 2 } });
    expect(label.group.scaleX()).toBe(0.5);
    // Centrado no mesmo ponto com o zoom: a metade da largura de tela vale metade no canvas.
    expect(label.group.x() + width / 2 / 2).toBeCloseTo(500, 0);
  });

  it('sem name não há rótulo; o rótulo some com a seta ou com o nome', () => {
    const named = setArrowName(withArrow(arrowProject(), 'r2', 'a3', 'b2'), 'r2', 'Vai');
    const { renderer, render, editor } = setup(named);
    render();
    expect(renderer.label('r1')).toBeUndefined();
    expect(renderer.label('r2')).toBeDefined();
    editor.actions.setArrowName('r2', null);
    render();
    expect(renderer.label('r2')).toBeUndefined();
    editor.actions.setArrowName('r2', 'Outra');
    render();
    expect(renderer.label('r2')?.text.text()).toBe('Outra');
    render({ arrows: [] });
    expect(renderer.label('r2')).toBeUndefined();
  });

  it('o mesmo quadro não refaz o rótulo', () => {
    const { renderer, render } = setup(setArrowName(arrowProject(), 'r1', 'Abre'));
    render();
    const group = renderer.label('r1')?.group;
    const x = group?.x();
    render();
    expect(renderer.label('r1')?.group).toBe(group);
    expect(group?.x()).toBe(x);
  });
});
