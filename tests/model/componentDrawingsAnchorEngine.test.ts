// R3 (#1096, decisão 11): o cache de desenhos entrega a âncora ao motor, e o tooltip de teste
// desenha a seta pelo `$anchor.*`. Sem âncora, nada muda.
import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  approximateMeasurer,
  createDrawingCache,
  createMarking,
  markingAnchorDefaults,
  setMarkingAnchor,
  typeAnchorDefaults,
  type MarkingAnchor,
  type Project,
} from '../../src/model';
import { walk } from '../../src/model/components/scene';
import { marking } from './fixtures';
import { TIP_SPEC_ID, tipCatalog, tipProject } from './tooltipFixtures';

const catalog = tipCatalog();
const T = { x: 400, y: 300, width: 200, height: 100 };

function scene(anchor?: MarkingAnchor): Project {
  let p = createMarking(tipProject(), { id: 'T', containerId: 'I1', rect: T });
  p = addComponentMarking(
    p,
    catalog,
    {
      markingId: 'B',
      annotationId: 'A_B',
      containerId: 'I1',
      parentId: null,
      specId: TIP_SPEC_ID,
      typeId: 'tooltip',
      rect: { x: 450, y: 180, width: 100, height: 48 },
    },
    approximateMeasurer,
  );
  return anchor === undefined ? p : setMarkingAnchor(p, 'B', anchor);
}

/** A seta visível do desenho de B: o canto de cima à esquerda, relativo à caixa do tooltip (em unidades). */
function arrowOf(p: Project): [number, number] | undefined {
  const drawing = createDrawingCache()(p, catalog, approximateMeasurer, 0).get('B');
  const node = [...walk(drawing!.root)].find((n) => n.name === 'seta' && n.visible);
  return node === undefined ? undefined : [node.transform[4], node.transform[5]];
}

describe('a âncora chega ao motor', () => {
  it('sem âncora a seta não aparece (os pseudo-campos ficam vazios)', () => {
    expect(arrowOf(scene())).toBeUndefined();
  });

  it('side top: a seta fica embaixo do tooltip, sob o centro da âncora', () => {
    // O centro da âncora é x = 500; o tooltip começa em 450: a seta (16) começa em 50 - 8 = 42.
    expect(arrowOf(scene({ to: 'T', side: 'top' }))).toEqual([42, 40]);
  });

  it('side bottom: a seta sobe para o topo do tooltip', () => {
    expect(arrowOf(scene({ to: 'T', side: 'bottom' }))).toEqual([42, 0]);
  });

  it('sem side declarado vale o padrão do componente (top)', () => {
    expect(arrowOf(scene({ to: 'T' }))).toEqual([42, 40]);
  });

  it('muda de lado ao mudar o anchor.side do projeto', () => {
    const p = scene({ to: 'T', side: 'top' });
    expect(arrowOf(p)?.[1]).toBe(40);
    expect(arrowOf(setMarkingAnchor(p, 'B', { to: 'T', side: 'bottom' }))?.[1]).toBe(0);
  });

  it('a seta acompanha o centro da âncora quando ela anda (o cache reinstancia)', () => {
    const p = scene({ to: 'T', side: 'top' });
    const moved = {
      ...p,
      markings: p.markings.map((m) =>
        m.id === 'T' ? { ...m, rect: { ...T, x: T.x + 20 } } : m,
      ),
    };
    expect(arrowOf(moved)?.[0]).toBe(62);
  });
});

describe('padrões do componente para o encosto', () => {
  it('markingAnchorDefaults: o anchor da raiz do componente da marcação (offset em unidades)', () => {
    const p = scene({ to: 'T' });
    const lookup = markingAnchorDefaults(p, catalog);
    expect(lookup(marking(p, 'B'))).toEqual({
      side: 'top',
      align: 'center',
      offset: { main: 4, cross: 0 },
    });
  });

  it('marcação sem componente ou componente sem anchor: sem padrões', () => {
    const p = scene({ to: 'T' });
    expect(markingAnchorDefaults(p, catalog)(marking(p, 'T'))).toBeUndefined();
  });

  it('typeAnchorDefaults: pelo tipo (specId/typeId), para a instância nova', () => {
    expect(typeAnchorDefaults(catalog, TIP_SPEC_ID, 'tooltip')).toEqual({
      side: 'top',
      align: 'center',
      offset: { main: 4, cross: 0 },
    });
    expect(typeAnchorDefaults(catalog, TIP_SPEC_ID, 'botao')).toBeUndefined();
    expect(typeAnchorDefaults(catalog, 'nada', 'x')).toBeUndefined();
  });
});
