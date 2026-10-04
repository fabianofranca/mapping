import Konva from 'konva/lib/Core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Frame } from '../../../src/canvas/frame';
import { MarkingRenderer } from '../../../src/canvas/renderers/markings';
import {
  removeMarking,
  setImageMarkingColor,
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
    render({ project: setImageMarkingColor(canvasProject(), 'I1', '#00ff00') });
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

  it('uma bolinha por camada; depois de quatro, "+N"; vazada se só herdada', () => {
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
      inheritedOnly: i === 0,
    }));
    render({ dots: new Map([['M1', dots]]) });
    expect(m1.dots.filter((d) => d.visible())).toHaveLength(4);
    expect(m1.dots[0]?.fill()).toBe(TOKENS.halo);
    expect(m1.dots[0]?.stroke()).toBe('#E53935');
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

  it('pan sem mudar a marcação não refaz a borda; zoom refaz', () => {
    const { renderer, render } = setup();
    render();
    const spy = vi.spyOn(node(renderer, 'M1').border, 'setAttrs');
    render({ viewport: { x: -20, y: -10, scale: 1 } });
    expect(spy).not.toHaveBeenCalled();
    render({ viewport: { x: -20, y: -10, scale: 2 } });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('zoom semântico: nome no cabeçalho e cartão com as anotações', () => {
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
    // Cartão: `color-card` (já semiopaco, sem `opacity`) com o raio do token.
    expect(text.card.getAttrs()).toMatchObject({
      visible: true,
      fill: TOKENS.card,
      cornerRadius: TOKENS.radius.md,
    });
    expect(text.card.opacity()).toBe(1);
    const lines = text.lines.filter((l) => l.visible()).map((l) => l.text());
    expect(lines).toEqual(
      expect.arrayContaining([
        'Lataria',
        'Amassado',
        'tipo: amassado',
        'gravidade: média',
      ]),
    );
    // Barra da camada na cor dela.
    expect(text.shapes.some((s) => s.visible() && s.fill() === '#E53935')).toBe(true);
    // Nome da camada em `t-cv-caption`, título e pares em `t-cv-card`, na fonte da app.
    const sized = (text: string) => cardLine(text)?.fontSize();
    expect(sized('Lataria')).toBe(TOKENS.type.caption.size);
    expect(sized('tipo: amassado')).toBe(TOKENS.type.card.size);
    expect(cardLine('tipo: amassado')?.fontFamily()).toBe(TOKENS.fontFamily);

    function cardLine(text: string) {
      return node(renderer, 'M1').text.lines.find(
        (l) => l.visible() && l.text() === text,
      );
    }
  });

  it('zoom semântico: área pequena só mostra o nome com "…"; desligado, nada', () => {
    const { renderer, render } = setup();
    render({ viewport: { x: 0, y: 0, scale: 0.31 } });
    const text = node(renderer, 'M1').text;
    expect(text.header.text()).toBe('Porta …');
    expect(text.card.visible()).toBe(false);

    render({ semantic: false });
    expect(text.group.visible()).toBe(false);
  });

  it('remove o nó de uma marcação apagada', () => {
    const { layer, renderer, render } = setup();
    render();
    render({ project: removeMarking(canvasProject(), 'M2') });
    expect(renderer.node('M2')).toBeUndefined();
    expect(layer.getChildren()).toHaveLength(2);
  });
});
