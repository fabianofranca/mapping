import Konva from 'konva/lib/Core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { OverlayRenderer } from '../../../src/canvas/renderers/overlay';
import { OVERLAY_KEYS, type Frame } from '../../../src/canvas/frame';
import {
  createMarking,
  setMarkingAnchor,
  type Placement,
  type Project,
} from '../../../src/model';
import { canvasProject, editorFor, frameOf, installFakeCanvas, TOKENS } from '../harness';

// Ligação da âncora (R4, decisão 13): a marcação ancorada, selecionada ou sob o mouse, mostra uma
// linha tracejada fina até a âncora; some fora deles. Pan e zoom não a recalculam além da
// transformação (os pontos ficam, só a espessura e o tracejado seguem o zoom).

beforeAll(installFakeCanvas);
afterAll(() => vi.restoreAllMocks());

const PLACEMENTS: ReadonlyMap<string, Placement> = new Map([
  ['I1', { x: 0, y: 0, scale: 1 }],
  ['I2', { x: 1100, y: 0, scale: 1 }],
]);

/** `canvasProject` com M4 (100×100 em 800,100) ancorada em M1 (600×500 em 100,100), ambas em I1. */
function anchoredProject(): Project {
  const p = createMarking(canvasProject(), {
    id: 'M4',
    containerId: 'I1',
    rect: { x: 800, y: 100, width: 100, height: 100 },
  });
  return setMarkingAnchor(p, 'M4', { to: 'M1' });
}

function setup(project: Project = anchoredProject()) {
  const overlay = new OverlayRenderer(new Konva.Layer(), document.createElement('div'));
  const editor = editorFor(project);
  const render = (overrides: Partial<Frame> = {}, placements = PLACEMENTS) =>
    overlay.render(frameOf(editor, overrides), placements);
  const shown = () => overlay.anchorLinkNodes().filter((n) => n.line.visible());
  return { overlay, render, shown };
}

const M4_CENTER = [850, 150];
const M1_CENTER = [400, 350];

describe('ligação da âncora no canvas', () => {
  it('sem seleção nem mouse, nenhuma linha', () => {
    const { render, shown } = setup();
    render();
    expect(shown()).toHaveLength(0);
  });

  it('a ancorada selecionada mostra a linha tracejada do centro dela ao da âncora', () => {
    const { render, shown } = setup();
    render({ selection: { kind: 'marking', id: 'M4' } });
    const [link] = shown();
    expect(shown()).toHaveLength(1);
    expect(link?.line.points()).toEqual([...M4_CENTER, ...M1_CENTER]);
    // Traço fino tracejado na cor do controle, com o halo por baixo.
    expect(link?.line.getAttrs()).toMatchObject({
      stroke: TOKENS.borderControl,
      strokeWidth: 2,
      dash: [6, 4],
    });
    expect(link?.halo.getAttrs()).toMatchObject({
      visible: true,
      stroke: TOKENS.halo,
      strokeWidth: 4,
      dash: [6, 4],
    });
  });

  it('a ancorada sob o mouse mostra a linha, e ao sair some', () => {
    const { render, shown } = setup();
    render({ hoverMarking: 'M4' });
    expect(shown()).toHaveLength(1);
    expect(shown()[0]?.line.points()).toEqual([...M4_CENTER, ...M1_CENTER]);
    render({ hoverMarking: null });
    expect(shown()).toHaveLength(0);
  });

  it('a âncora selecionada ou sob o mouse (não a ancorada) não mostra a linha', () => {
    const { render, shown } = setup();
    render({ selection: { kind: 'marking', id: 'M1' }, hoverMarking: 'M1' });
    expect(shown()).toHaveLength(0);
  });

  it('marcação sem âncora e container selecionado não mostram linha', () => {
    const { render, shown } = setup();
    render({ selection: { kind: 'marking', id: 'M2' }, hoverMarking: 'M3' });
    expect(shown()).toHaveLength(0);
    render({ selection: { kind: 'image', id: 'I1' } });
    expect(shown()).toHaveLength(0);
  });

  it('a selecionada e a do mouse, ambas ancoradas, mostram as duas ligações', () => {
    let p = createMarking(anchoredProject(), {
      id: 'M5',
      containerId: 'I1',
      rect: { x: 800, y: 300, width: 100, height: 100 },
    });
    p = setMarkingAnchor(p, 'M5', { to: 'M4' });
    const { render, shown } = setup(p);
    render({ selection: { kind: 'marking', id: 'M4' }, hoverMarking: 'M5' });
    expect(shown().map((n) => n.line.points())).toEqual([
      [...M4_CENTER, ...M1_CENTER],
      [850, 350, ...M4_CENTER],
    ]);
    // O mesmo item selecionado e sob o mouse tem uma ligação só.
    render({ selection: { kind: 'marking', id: 'M4' }, hoverMarking: 'M4' });
    expect(shown()).toHaveLength(1);
  });

  it('segue as posições do quadro (a prévia do arrasto) e a colocação do container', () => {
    const { render, shown } = setup();
    render(
      { selection: { kind: 'marking', id: 'M4' } },
      new Map([...PLACEMENTS, ['I1', { x: 50, y: 20, scale: 2 }]]),
    );
    expect(shown()[0]?.line.points()).toEqual([
      50 + 850 * 2,
      20 + 150 * 2,
      50 + 400 * 2,
      20 + 350 * 2,
    ]);
  });

  it('pan não muda a ligação; o zoom só muda a espessura e o tracejado, não os pontos', () => {
    const { render, shown } = setup();
    const selection = { kind: 'marking', id: 'M4' } as const;
    render({ selection, viewport: { x: 0, y: 0, scale: 1 } });
    const points = shown()[0]?.line.points();
    render({ selection, viewport: { x: -300, y: -120, scale: 1 } });
    expect(shown()[0]?.line.points()).toEqual(points);
    render({ selection, viewport: { x: -300, y: -120, scale: 4 } });
    const zoomed = shown()[0];
    expect(zoomed?.line.points()).toEqual(points);
    expect(zoomed?.line.strokeWidth()).toBe(2 / 4);
    expect(zoomed?.line.dash()).toEqual([6 / 4, 4 / 4]);
  });

  it('o hover entra nas chaves que refazem as sobreposições', () => {
    expect(OVERLAY_KEYS).toContain('hoverMarking');
  });
});
