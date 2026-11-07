import Konva from 'konva/lib/Core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { arrivalMarks, ARRIVAL_BADGE_HEIGHT } from '../../../src/canvas/arrivals';
import { ArrivalRenderer } from '../../../src/canvas/renderers/arrivals';
import { t } from '../../../src/i18n';
import type { Arrival, Project } from '../../../src/model';
import { canvasProject, editorFor, frameOf, installFakeCanvas, TOKENS } from '../harness';

beforeAll(installFakeCanvas);
afterAll(() => vi.restoreAllMocks());

// O selo "Veio de <nome>" e a faixa "Área de chegada" (PE3, decisão 8): tamanho em px de tela
// (escala inversa do zoom), cores só dos tokens do tema.

const withArrival = (p: Project, root: string, fromName: string): Project => ({
  ...p,
  arrivals: [...p.arrivals, { root, from: 'V', fromName } satisfies Arrival],
});

function setup(project: Project = withArrival(canvasProject(), 'I2', 'Frente')) {
  const editor = editorFor(project);
  const layer = new Konva.Group();
  const renderer = new ArrivalRenderer(layer);
  const frame = (zoom = 1, marks = arrivalMarks(project)) =>
    frameOf(editor, {
      project,
      arrivals: marks,
      viewport: { x: 0, y: 0, scale: zoom },
    });
  return { renderer, frame, layer, project };
}

describe('ArrivalRenderer', () => {
  it('sem marcas não desenha nada', () => {
    const { renderer, frame } = setup(canvasProject());
    renderer.render(frame());
    expect(renderer.badgeCount).toBe(0);
    expect(renderer.bandVisible).toBe(false);
  });

  it('um selo por raiz com marca, com o texto traduzido e as cores dos tokens', () => {
    const { renderer, frame } = setup();
    renderer.render(frame());
    expect(renderer.badgeCount).toBe(1);
    const badge = renderer.badge('I2');
    expect(badge?.label.text()).toBe(
      t('perspective.canvas.cameFrom', { name: 'Frente' }),
    );
    expect(badge?.box.fill()).toBe(TOKENS.badge);
    expect(badge?.label.fill()).toBe(TOKENS.line);
  });

  it('o selo tem tamanho fixo na tela: a escala do nó é o inverso do zoom', () => {
    const { renderer, frame } = setup();
    renderer.render(frame(2));
    const badge = renderer.badge('I2');
    expect(badge?.group.scaleX()).toBeCloseTo(0.5);
    expect(badge?.box.height()).toBe(ARRIVAL_BADGE_HEIGHT);
    renderer.render(frame(0.25));
    expect(badge?.group.scaleX()).toBeCloseTo(4);
  });

  it('a faixa é tracejada, tem o título e o subtítulo, e some com a marca', () => {
    const { renderer, frame } = setup();
    renderer.render(frame());
    expect(renderer.bandVisible).toBe(true);
    expect(renderer.band.box.dash().length).toBeGreaterThan(0);
    expect(renderer.band.title.text()).toBe(t('perspective.canvas.arrivalArea'));
    expect(renderer.band.hint.text()).toBe(t('perspective.canvas.arrivalAreaHint'));
    expect(renderer.band.box.stroke()).toBe(TOKENS.selectSecondary);
    renderer.render(frame(1, null));
    expect(renderer.bandVisible).toBe(false);
    expect(renderer.badgeCount).toBe(0);
  });

  it('sem faixa quando a marca está no meio do conteúdo (só o selo)', () => {
    const project = withArrival(canvasProject(), 'I1', 'Frente');
    const { renderer, frame } = setup(project);
    renderer.render(frame());
    expect(renderer.badgeCount).toBe(1);
    expect(renderer.bandVisible).toBe(false);
  });
});
