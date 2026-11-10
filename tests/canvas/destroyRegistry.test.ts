// `CanvasController.destroy` não deixa formas no registro de cores de acerto do Konva (`shapes`). As
// partes do nó que o `syncParts` desencaixa do grupo (escondidas) não são destruídas junto com ele;
// sem isso, abrir e fechar projetos grandes várias vezes na mesma aba enchia o registro e o
// construtor de `Shape` passava a procurar cor livre por muito tempo.
import { shapes } from 'konva/lib/Shape';
import { describe, expect, it } from 'vitest';
import type { MarkingRenderer } from '../../src/canvas/renderers/markings';
import { openWholeProject } from './wholeProjectScenario';

const registered = () => Object.keys(shapes).length;

describe('registro de cores de acerto do Konva', () => {
  it('abrir, aproximar, afastar e destruir devolve o registro ao que era', () => {
    const before = registered();
    const s = openWholeProject(500, 'fit');
    // Aproximar cria as partes do nó; afastar as esconde e o `syncParts` as desencaixa do grupo.
    s.controller.zoomTo(2);
    s.controller.centerOnPoint({ x: 0, y: 0 });
    s.flush();
    s.controller.fitAll();
    s.flush();
    expect(registered()).toBeGreaterThan(before);
    s.destroy();
    expect(registered()).toBe(before);
  }, 120_000);

  it('apagar uma marcação com partes desencaixadas também as destrói', () => {
    const s = openWholeProject(500, 'fit');
    // Uma folha: apagar uma marcação com filhas apaga as filhas também.
    const target = s.project.markings.find(
      (m) => !s.project.markings.some((c) => c.parentId === m.id),
    );
    if (!target) throw new Error('fixture');
    s.ui.selection.value = { kind: 'marking', id: target.id };
    s.flush();
    s.ui.selection.value = null;
    s.flush();
    const node = (s.controller as unknown as { markings: MarkingRenderer }).markings.node(
      target.id,
    );
    const ownShapes = [
      node?.border,
      node?.halo,
      node?.inner,
      node?.badge,
      node?.alert,
      node?.text?.header,
    ].filter((shape) => shape !== undefined).length;
    // A borda e o halo, que a seleção criou e o `syncParts` desencaixou ao desselecionar.
    expect(ownShapes).toBe(2);
    const withParts = registered();
    s.actions.removeMarking(target.id);
    s.flush();
    expect(registered()).toBe(withParts - ownShapes);
    s.destroy();
  }, 120_000);
});
