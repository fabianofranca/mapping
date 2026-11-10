// Partes do nó sob demanda (CD2 da etapa canvas-desempenho, decisão 5): o nó de uma marcação nasce só
// com o grupo e a borda; o halo, a linha dupla, o selo, o alerta e o nome nascem no primeiro quadro
// em que ficam visíveis e, uma vez criados, ficam.
import Konva from 'konva/lib/Core';
import { afterEach, describe, expect, it } from 'vitest';
import type { MarkingNode, MarkingRenderer } from '../../src/canvas/renderers/markings';
import { openWholeProject, type WholeProjectScenario } from './wholeProjectScenario';

const rendererOf = (s: WholeProjectScenario) =>
  (s.controller as unknown as { markings: MarkingRenderer }).markings;
const nodeOf = (s: WholeProjectScenario, id: string) => rendererOf(s).node(id);

/** Nós do Konva criados para o nó da marcação (penduradas ou não). */
function createdKonvaNodes(node: MarkingNode): number {
  const parts: unknown[] = [
    node.group,
    node.border,
    node.halo,
    node.inner,
    node.badge,
    node.alertClip,
    node.alert,
    node.text?.group,
    node.text?.header,
  ];
  return parts.filter((part) => part instanceof Konva.Node).length;
}

let scenario: WholeProjectScenario | null = null;
afterEach(() => {
  scenario?.destroy();
  scenario = null;
});

describe('partes do nó sob demanda (2.000 marcações)', () => {
  it('em Enquadrar tudo, cada marcação desenhada tem 2 nós criados (grupo e borda)', () => {
    const s = (scenario = openWholeProject(2000, 'fit'));
    const withNode = s.project.markings.filter((m) => nodeOf(s, m.id) !== undefined);
    expect(withNode.length).toBeGreaterThan(1000);
    const created = withNode.reduce((sum, m) => {
      const node = nodeOf(s, m.id);
      return sum + (node ? createdKonvaNodes(node) : 0);
    }, 0);
    expect(created).toBe(2 * withNode.length);
  }, 120_000);

  it('aproximar uma marcação cria o resto das partes dela e afastar não as destrói', () => {
    const s = (scenario = openWholeProject(2000, 'fit'));
    const target = s.project.markings[0];
    if (!target) throw new Error('fixture');
    const far = nodeOf(s, target.id);
    expect(far?.halo).toBeUndefined();
    s.controller.zoomTo(2);
    s.controller.centerOnPoint({ x: 0, y: 0 });
    s.flush();
    const near = nodeOf(s, target.id);
    expect(near).toBe(far);
    const halo = near?.halo;
    expect(halo).toBeDefined();
    expect(halo?.visible()).toBe(true);
    s.controller.fitAll();
    s.flush();
    expect(nodeOf(s, target.id)?.halo).toBe(halo);
    expect(halo?.visible()).toBe(false);
  }, 120_000);

  it('selecionar uma marcação pequena cria as partes dela', () => {
    const s = (scenario = openWholeProject(2000, 'fit'));
    const target = s.project.markings[0];
    if (!target) throw new Error('fixture');
    expect(nodeOf(s, target.id)?.halo).toBeUndefined();
    s.ui.selection.value = { kind: 'marking', id: target.id };
    s.flush();
    const node = nodeOf(s, target.id);
    expect(node?.halo?.visible()).toBe(true);
    // As demais continuam com as 2 de sempre.
    const other = s.project.markings[1];
    const otherNode = other ? nodeOf(s, other.id) : undefined;
    expect(otherNode ? createdKonvaNodes(otherNode) : 2).toBe(2);
  }, 120_000);
});
