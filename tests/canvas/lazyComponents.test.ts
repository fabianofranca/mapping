// Desenhos de componente sob demanda (CD2 da etapa canvas-desempenho, decisão 3): o desenho de uma
// marcação só é montado (`renderScene`) no primeiro quadro em que ela está na tela e é desenhada, e
// fica até ela sair do projeto ou o objeto do desenho mudar.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setShowComponentsOnPhotos } from '../../src/store/settings';
import type { ComponentLayerRenderer } from '../../src/canvas/components/componentLayer';
import { openWholeProject, type WholeProjectScenario } from './wholeProjectScenario';

let scenario: WholeProjectScenario | null = null;
// Os containers do cenário têm foto: o desenho do componente só aparece com a opção ligada.
beforeEach(() => setShowComponentsOnPhotos(true));
afterEach(() => {
  scenario?.destroy();
  scenario = null;
  setShowComponentsOnPhotos(false);
});

const mounted = (s: WholeProjectScenario) =>
  (s.controller as unknown as { componentLayer: ComponentLayerRenderer }).componentLayer
    .mountedCount;

/** Leva a vista ao desenho `index` (ordem do projeto). */
function goTo(s: WholeProjectScenario, index: number): void {
  const drawing = [...s.derived.drawingsOf(s.project).values()][index];
  const marking = s.project.markings.find((m) => m.id === drawing?.markingId);
  const placement = s.project.containers.find(
    (c) => c.id === marking?.containerId,
  )?.placement;
  if (!marking || !placement) throw new Error('fixture');
  s.controller.zoomTo(1);
  s.controller.centerOnPoint({
    x: placement.x + (marking.rect.x + marking.rect.width / 2) * placement.scale,
    y: placement.y + (marking.rect.y + marking.rect.height / 2) * placement.scale,
  });
  s.flush();
}

describe('desenhos de componente sob demanda (2.000 marcações, com componentes)', () => {
  it('aproximado num container, só os desenhos à vista são montados', () => {
    const s = (scenario = openWholeProject(2000, 'close', { components: true }));
    const total = s.derived.drawingsOf(s.project).size;
    expect(total).toBeGreaterThan(400);
    goTo(s, 0);
    expect(mounted(s)).toBeGreaterThan(0);
    expect(mounted(s)).toBeLessThan(total / 4);
    // O atributo do host continua contando todos os que aparecem (os roteiros leem dele).
    expect(Number(s.container.dataset.components)).toBe(total);
  }, 120_000);

  it('rolar até outro container monta os desenhos dele e voltar não destrói os primeiros', () => {
    const s = (scenario = openWholeProject(2000, 'close', { components: true }));
    const total = s.derived.drawingsOf(s.project).size;
    goTo(s, 0);
    const first = mounted(s);
    expect(first).toBeGreaterThan(0);
    goTo(s, total - 1);
    expect(mounted(s)).toBeGreaterThan(first);
    const second = mounted(s);
    goTo(s, 0);
    expect(mounted(s)).toBe(second);
    expect(mounted(s)).toBeLessThanOrEqual(total);
  }, 120_000);
});
