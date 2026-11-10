// Nível de detalhe das setas (etapa canvas-desempenho, CD3, decisão 7): de longe a seta curta é só o
// traço, a que liga marcações invisíveis some, a fora da área visível não é pintada; a selecionada e as
// ligadas ao que está selecionado ou sob o mouse ficam inteiras.
import { afterEach, describe, expect, it } from 'vitest';
import type { ArrowPainter, ArrowRenderer } from '../../src/canvas/renderers/arrows';
import type { InteractionState } from '../../src/canvas/frame';
import type { Project } from '../../src/model';
import {
  wholeProject,
  openWholeProject,
  type WholeProjectScenario,
} from './wholeProjectScenario';

interface Internals {
  arrows: ArrowRenderer;
  state: InteractionState;
}
const internals = (s: WholeProjectScenario) => s.controller as unknown as Internals;

/** As chamadas de pintura de uma passada do corpo das setas paradas. */
function record(s: WholeProjectScenario): string[] {
  const calls: string[] = [];
  const painter: ArrowPainter = {
    beginPath: () => calls.push('beginPath'),
    moveTo: () => calls.push('moveTo'),
    lineTo: () => calls.push('lineTo'),
    closePath: () => calls.push('closePath'),
    stroke: () => calls.push('stroke'),
    fill: () => calls.push('fill'),
    setAttr: () => undefined,
  };
  internals(s).arrows.paint(painter);
  return calls;
}
const count = (calls: string[], op: string) => calls.filter((c) => c === op).length;

/** O cenário de 2.000 com as 1.000 setas nomeadas, para os rótulos poderem existir. */
function namedProject(): Project {
  const base = wholeProject(2000);
  return {
    ...base,
    arrows: base.arrows.map((a, i) => ({ ...a, name: `Seta ${i}` })),
  };
}

let scenario: WholeProjectScenario | null = null;
afterEach(() => {
  scenario?.destroy();
  scenario = null;
});

describe('setas de longe (2.000 marcações em Enquadrar tudo)', () => {
  it('as setas curtas entram só na passagem do traço e não têm rótulo', () => {
    const s = (scenario = openWholeProject(2000, 'fit', { project: namedProject() }));
    const renderer = internals(s).arrows;
    const total = s.project.arrows.length;
    const full = renderer.drawn.filter((shape) => !renderer.thin.includes(shape));
    const thin = renderer.thin;
    expect(thin.length).toBeGreaterThan(0);
    expect(full.length).toBeGreaterThan(0);
    expect(full.length + thin.length).toBe(total);
    expect(s.container.dataset.arrows).toBe(String(total));
    // Cada seta inteira pinta o corpo no halo e no traço e a ponta nos dois; a curta, só o corpo no traço.
    const calls = record(s);
    expect(count(calls, 'closePath')).toBe(2 * full.length);
    expect(count(calls, 'moveTo')).toBe(4 * full.length + thin.length);
    // Rótulo: só as inteiras.
    for (const shape of thin) expect(renderer.label(shape.arrow.id)).toBeUndefined();
    const firstFull = full[0];
    expect(firstFull && renderer.label(firstFull.arrow.id)).toBeDefined();
  }, 120_000);

  it('selecionar uma marcação devolve a seta curta dela inteira, e soltar a deixa só no traço', () => {
    const s = (scenario = openWholeProject(2000, 'fit', { project: namedProject() }));
    const renderer = internals(s).arrows;
    const shape = renderer.thin[0];
    if (!shape) throw new Error('fixture: nenhuma seta curta');
    const id = shape.arrow.id;
    const thinCount = renderer.thin.length;
    s.ui.selection.value = { kind: 'marking', id: shape.arrow.from };
    s.flush();
    expect(renderer.thin.some((t) => t.arrow.id === id)).toBe(false);
    expect(renderer.label(id)).toBeDefined();
    expect(s.container.dataset.arrows).toBe(String(s.project.arrows.length));
    s.ui.selection.value = null;
    s.flush();
    expect(renderer.thin).toHaveLength(thinCount);
    expect(renderer.label(id)).toBeUndefined();
  }, 120_000);

  it('a seta selecionada, a ligada à marcação sob o mouse e a da seleção múltipla ficam inteiras', () => {
    const s = (scenario = openWholeProject(2000, 'fit', { project: namedProject() }));
    const renderer = internals(s).arrows;
    const [a, b, c] = renderer.thin;
    if (!a || !b || !c) throw new Error('fixture');
    const isThin = (id: string) => renderer.thin.some((t) => t.arrow.id === id);
    s.ui.selection.value = { kind: 'arrow', id: a.arrow.id };
    s.flush();
    expect(isThin(a.arrow.id)).toBe(false);
    s.ui.selection.value = null;
    internals(s).state.hoverMarking.value = b.arrow.to;
    s.flush();
    expect(isThin(b.arrow.id)).toBe(false);
    internals(s).state.hoverMarking.value = null;
    s.flush();
    expect(isThin(b.arrow.id)).toBe(true);
    // Seleção múltipla: duas marcações; as setas ligadas a qualquer uma ficam inteiras.
    s.ui.selection.value = { kind: 'marking', id: b.arrow.from };
    s.ui.selectionGroup.value = {
      primary: s.ui.selection.value,
      others: [{ kind: 'marking', id: c.arrow.from }],
    };
    s.flush();
    expect(isThin(b.arrow.id)).toBe(false);
    expect(isThin(c.arrow.id)).toBe(false);
  }, 120_000);

  it('a seta fora da área visível não é pintada nem tem rótulo', () => {
    const s = (scenario = openWholeProject(2000, 'fit', { project: namedProject() }));
    const renderer = internals(s).arrows;
    const total = s.project.arrows.length;
    expect(renderer.size).toBe(total);
    s.controller.zoomTo(1);
    s.controller.centerOnPoint({ x: 0, y: 0 });
    s.flush();
    const near = renderer.size;
    expect(near).toBeGreaterThan(0);
    expect(near).toBeLessThan(total);
    expect(s.container.dataset.arrows).toBe(String(near));
    const painted = new Set([...renderer.drawn].map((shape) => shape.arrow.id));
    for (const arrow of s.project.arrows) {
      if (!painted.has(arrow.id)) expect(renderer.label(arrow.id)).toBeUndefined();
    }
    s.controller.centerOnPoint({ x: 1_000_000, y: 1_000_000 });
    s.flush();
    expect(s.container.dataset.arrows).toBe('0');
    expect(renderer.size).toBe(0);
  }, 120_000);

  it('o rótulo de uma seta que sai da área visível e volta é o mesmo nó (pan não recria rótulos)', () => {
    const s = (scenario = openWholeProject(2000, 'fit', { project: namedProject() }));
    const renderer = internals(s).arrows;
    s.controller.zoomTo(1);
    s.controller.centerOnPoint({ x: 0, y: 0 });
    s.flush();
    const shape = renderer.drawn.find((candidate) => renderer.label(candidate.arrow.id));
    if (!shape) throw new Error('fixture: nenhum rótulo à vista');
    const id = shape.arrow.id;
    const node = renderer.label(id);
    s.controller.centerOnPoint({ x: 1_000_000, y: 1_000_000 });
    s.flush();
    expect(renderer.label(id)).toBeUndefined();
    s.controller.centerOnPoint({ x: 0, y: 0 });
    s.flush();
    expect(renderer.label(id)).toBe(node);
  }, 120_000);
});
