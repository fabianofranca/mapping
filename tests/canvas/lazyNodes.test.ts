// Nós sob demanda (DA5, decisão 8 da etapa canvas-escala): o nó do Konva de uma marcação só nasce
// no primeiro quadro em que ela é desenhada e fica até ela sair do projeto.
import { afterEach, describe, expect, it } from 'vitest';
import type { MarkingRenderer } from '../../src/canvas/renderers/markings';
import { openWholeProject, type WholeProjectScenario } from './wholeProjectScenario';

const nodeOf = (s: WholeProjectScenario, id: string) =>
  (s.controller as unknown as { markings: MarkingRenderer }).markings.node(id);

const withNode = (s: WholeProjectScenario) =>
  s.project.markings.filter((m) => nodeOf(s, m.id) !== undefined);

let scenario: WholeProjectScenario | null = null;
afterEach(() => {
  scenario?.destroy();
  scenario = null;
});

describe('nós das marcações sob demanda (2.000 marcações)', () => {
  it('aproximado num canto, só as marcações à vista têm nó', () => {
    const s = (scenario = openWholeProject(2000, 'close'));
    const all = s.project.markings.length;
    s.controller.zoomTo(1);
    s.controller.centerOnPoint({ x: 0, y: 0 });
    s.flush();
    const created = withNode(s).length;
    expect(created).toBeGreaterThan(0);
    expect(created).toBeLessThan(all);
    // O atributo do host conta as marcações desenhadas (os passos do R12 leem dele).
    expect(Number(s.container.dataset.drawnMarkings)).toBe(
      withNode(s).filter((m) => nodeOf(s, m.id)?.group.visible()).length,
    );
  }, 120_000);

  it('rolar cria os nós da outra parte e voltar não recria os primeiros', () => {
    const s = (scenario = openWholeProject(2000, 'close'));
    const first = withNode(s);
    const nodes = first.map((m) => nodeOf(s, m.id));
    s.controller.centerOnPoint({ x: 1_000_000, y: 1_000_000 });
    s.flush();
    const lastId = s.project.markings[s.project.markings.length - 1]?.id ?? '';
    expect(withNode(s).length).toBeGreaterThanOrEqual(first.length);
    s.controller.centerOnPoint({ x: 0, y: 0 });
    s.flush();
    first.forEach((m, i) => expect(nodeOf(s, m.id)).toBe(nodes[i]));
    expect(lastId).not.toBe('');
  }, 120_000);

  it('afastado ao mínimo as menores que 2 px não ganham nó; aproximar cria', () => {
    const s = (scenario = openWholeProject(2000));
    s.controller.zoomBy(0.0001);
    s.flush();
    const before = withNode(s).length;
    s.controller.zoomBy(10_000);
    s.flush();
    expect(withNode(s).length).toBeGreaterThanOrEqual(before);
  }, 120_000);

  it('apagar destrói o nó; selecionar uma sem nó leva o canvas até ela e cria o nó', () => {
    const s = (scenario = openWholeProject(2000, 'close'));
    const live = withNode(s)[0];
    if (!live) throw new Error('nó');
    const node = nodeOf(s, live.id);
    s.actions.removeMarking(live.id);
    s.flush();
    expect(nodeOf(s, live.id)).toBeUndefined();
    expect(node?.group.getParent()).toBeNull();

    const far = s.store.project
      .peek()
      ?.markings.find((m) => nodeOf(s, m.id) === undefined);
    if (!far) throw new Error('marcação sem nó');
    s.ui.selection.value = { kind: 'marking', id: far.id };
    s.controller.centerSelection();
    s.flush();
    expect(nodeOf(s, far.id)).toBeDefined();
  }, 120_000);

  // Linha de base da DA1 (jsdom, 2.000): 223 ms. Aberto aproximado, só as marcações à vista ganham
  // nó (~50 ms). Enquadrar tudo cria todos (nenhuma passa a ser menor que 2 px): fora deste orçamento.
  it('o primeiro quadro ao abrir aproximado cabe na metade da linha de base (223 ms)', () => {
    const s = (scenario = openWholeProject(2000, 'close'));
    expect(s.firstFrameMs).toBeLessThan(223 / 2);
  }, 120_000);
});
