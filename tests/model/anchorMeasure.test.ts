// Revisão da R3 (#1096): as medições (`fitMarking`, tamanho da instância nova ancorada) recebem a
// âncora como o desenho: um componente `hug` cujo tamanho depende de `$anchor.side` mede no mesmo
// ramo em que desenha.
import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  addContainer,
  applySpecialization,
  approximateMeasurer,
  componentAnchoredPlacement,
  createDrawingCache,
  createMarking,
  fitMarking,
  loadSpecComponents,
  parseSpec,
  setMarkingAnchor,
  type ComponentCatalog,
  type NewComponentArgs,
  type Project,
} from '../../src/model';
import { walk } from '../../src/model/components/scene';
import { emptyProject, marking } from './fixtures';

const SPEC_ID = 'hugtip';

/** Corpo cuja altura (e o `hug` do componente) depende do lado: 90 em `bottom`, 30 nos outros. */
function hugTip(id: string, anchor: Record<string, unknown> | undefined) {
  return {
    format: 'mapping-component',
    formatVersion: 4,
    id,
    name: id,
    size: { width: 100, height: 40 },
    minSize: { width: 10, height: 10 },
    sizing: { height: 'hug' },
    ...(anchor === undefined ? {} : { anchor }),
    template: {
      type: 'frame',
      layout: { type: 'column', padding: 0 },
      children: [
        {
          type: 'rect',
          name: 'corpo',
          width: 100,
          height: { $switch: '$anchor.side', cases: { bottom: 90 }, default: 30 },
          fill: '#ffffff',
        },
      ],
    },
  };
}

const COMPONENTS: Record<string, unknown> = {
  hug: hugTip('hug', undefined),
  'hug-bottom': hugTip('hug-bottom', { side: 'bottom' }),
};

const SPEC_JSON = {
  format: 'mapping-spec',
  formatVersion: 4,
  id: SPEC_ID,
  name: 'Hug',
  version: 1,
  layers: [
    {
      id: 'componentes',
      name: 'Componentes',
      color: '#6750A4',
      annotationTypes: Object.keys(COMPONENTS).map((id) => ({
        id,
        name: id,
        component: `components/${id}.json`,
        fields: [],
      })),
    },
  ],
};

function spec() {
  const parsed = parseSpec(SPEC_JSON);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.spec;
}

const catalog: ComponentCatalog = (() => {
  const texts = new Map(
    Object.entries(COMPONENTS).map(([id, c]) => [
      `specs/hugtip/components/${id}.json`,
      JSON.stringify(c),
    ]),
  );
  const loaded = loadSpecComponents(spec(), 'specs/hugtip/hugtip.spec.json', 1, (path) =>
    texts.get(path),
  );
  if (loaded.problems.length > 0) throw new Error(loaded.problems.join('\n'));
  return new Map([[SPEC_ID, loaded]]);
})();

function project(): Project {
  let p = applySpecialization(emptyProject(), spec(), {
    newId: (() => {
      let n = 0;
      return () => `HS${++n}`;
    })(),
    packageSpecName: 'hugtip.spec.json',
  });
  p = addContainer(p, { id: 'I1', file: 'images/tela.png', width: 1000, height: 800 });
  return createMarking(p, {
    id: 'T',
    containerId: 'I1',
    rect: { x: 400, y: 300, width: 200, height: 100 },
  });
}

const args = (
  typeId: string,
  extra: Partial<NewComponentArgs> = {},
): NewComponentArgs => ({
  markingId: 'B',
  annotationId: 'A_B',
  containerId: 'I1',
  parentId: null,
  specId: SPEC_ID,
  typeId,
  ...extra,
});

/** B no lugar, com o tamanho de `size` e a âncora dada. */
function withB(typeId: string, anchor: { to: string; side?: 'top' | 'bottom' }) {
  const p = addComponentMarking(
    project(),
    catalog,
    args(typeId, { rect: { x: 450, y: 100, width: 100, height: 40 } }),
    approximateMeasurer,
  );
  return setMarkingAnchor(p, 'B', anchor);
}

/** A altura do corpo no desenho da marcação B (em pixels; densidade 1). */
function drawnBodyHeight(p: Project): number {
  const drawing = createDrawingCache()(p, catalog, approximateMeasurer, 0).get('B')!;
  const node = [...walk(drawing.root)].find((n) => n.name === 'corpo')!;
  return node.height;
}

describe('fitMarking mede com a âncora da marcação', () => {
  it('o lado declarado na marcação escolhe o ramo do $switch (o mesmo do desenho)', () => {
    const bottom = fitMarking(
      withB('hug', { to: 'T', side: 'bottom' }),
      catalog,
      'B',
      approximateMeasurer,
    );
    expect(marking(bottom, 'B').rect.height).toBe(90);
    expect(drawnBodyHeight(bottom)).toBe(90);
    const top = fitMarking(
      withB('hug', { to: 'T', side: 'top' }),
      catalog,
      'B',
      approximateMeasurer,
    );
    expect(marking(top, 'B').rect.height).toBe(30);
  });

  it('sem lado declarado vale o padrão do componente', () => {
    const p = fitMarking(
      withB('hug-bottom', { to: 'T' }),
      catalog,
      'B',
      approximateMeasurer,
    );
    expect(marking(p, 'B').rect.height).toBe(90);
    expect(drawnBodyHeight(p)).toBe(90);
  });

  it('sem âncora o ramo é o padrão (como o desenho)', () => {
    const p = addComponentMarking(
      project(),
      catalog,
      args('hug', { rect: { x: 450, y: 100, width: 100, height: 40 } }),
      approximateMeasurer,
    );
    expect(
      marking(fitMarking(p, catalog, 'B', approximateMeasurer), 'B').rect.height,
    ).toBe(30);
  });
});

describe('a instância nova ancorada nasce no tamanho que o desenho usa', () => {
  it('componentAnchoredPlacement mede com o lado da âncora', () => {
    const place = (typeId: string, side?: 'top' | 'bottom') =>
      componentAnchoredPlacement(
        project(),
        catalog,
        { ...args(typeId), anchor: { to: 'T', ...(side ? { side } : {}) } },
        approximateMeasurer,
      ).rect;
    expect(place('hug', 'bottom').height).toBe(90);
    expect(place('hug', 'top').height).toBe(30);
    // Sem lado na âncora vale o padrão do componente (`anchorDefaults` ou `top`).
    expect(place('hug').height).toBe(30);
  });

  it('addComponentMarking sem rect cria no tamanho medido e o desenho confere', () => {
    const p = addComponentMarking(
      project(),
      catalog,
      args('hug', { anchor: { to: 'T', side: 'bottom' } }),
      approximateMeasurer,
    );
    expect(marking(p, 'B').rect.height).toBe(90);
    expect(drawnBodyHeight(p)).toBe(90);
  });
});
