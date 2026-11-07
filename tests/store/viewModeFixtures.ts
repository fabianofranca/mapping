import {
  addBackgroundContainer,
  addComponentMarking,
  addContainer,
  applySpecialization,
  approximateMeasurer,
  createMarking,
  loadSpecComponents,
  parseSpec,
  projectLayerFor,
  type ComponentCatalog,
  type Project,
} from '../../src/model';
import { COMPONENTS } from '../model/componentFixtures';
import { emptyProject } from '../model/fixtures';

// Projeto do modo visualização: duas camadas com tipos que desenham (`ca`, `cb`) e uma sem
// componente (`cc`). A tela é um container sem arquivo (B1) com um texto de cada camada
// (TA e TB) e uma marcação comum (P); a foto I1 tem outro texto (TF).

export const VIEW_SPEC_ID = 'duas';
const FILE = 'specs/duas/duas.spec.json';

const SPEC = {
  format: 'mapping-spec',
  formatVersion: 4,
  id: VIEW_SPEC_ID,
  name: 'Duas',
  version: 1,
  layers: [
    {
      id: 'ca',
      name: 'Camada A',
      color: '#6750A4',
      annotationTypes: [
        {
          id: 'ta',
          name: 'Tipo A',
          component: 'components/ta.json',
          fields: [{ key: 'label', type: 'string', default: 'A' }],
        },
      ],
    },
    {
      id: 'cb',
      name: 'Camada B',
      color: '#1E88E5',
      annotationTypes: [
        {
          id: 'tb',
          name: 'Tipo B',
          component: 'components/tb.json',
          fields: [{ key: 'label', type: 'string', default: 'B' }],
        },
      ],
    },
    {
      id: 'cc',
      name: 'Só dados',
      color: '#43A047',
      annotationTypes: [
        { id: 'plain', name: 'Simples', fields: [{ key: 'note', type: 'string' }] },
      ],
    },
  ],
};

export function viewCatalog(): ComponentCatalog {
  const texts = new Map<string, string>();
  for (const id of ['ta', 'tb']) {
    texts.set(
      `specs/duas/components/${id}.json`,
      JSON.stringify({ ...COMPONENTS.text, id, name: id }),
    );
  }
  const parsed = parseSpec(SPEC);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  const loaded = loadSpecComponents(parsed.spec, FILE, 1, (path) => texts.get(path));
  if (loaded.problems.length > 0) throw new Error(loaded.problems.join('\n'));
  return new Map([[VIEW_SPEC_ID, loaded]]);
}

export function viewProject(): Project {
  const parsed = parseSpec(SPEC);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  let n = 0;
  let p = applySpecialization(emptyProject(), parsed.spec, {
    newId: () => `VL${++n}`,
    packageSpecName: 'duas.spec.json',
  });
  p = addContainer(p, { id: 'I1', file: 'images/tela.png', width: 1000, height: 800 });
  p = addBackgroundContainer(p, {
    id: 'B1',
    name: 'Tela',
    width: 400,
    height: 600,
    background: '#FFFFFF',
    center: { x: 1500, y: 300 },
  });
  const catalog = viewCatalog();
  const add = (id: string, typeId: string, containerId: string, y: number): void => {
    p = addComponentMarking(
      p,
      catalog,
      {
        markingId: id,
        annotationId: `A_${id}`,
        containerId,
        parentId: null,
        specId: VIEW_SPEC_ID,
        typeId,
        rect: { x: 20, y, width: 100, height: 40 },
      },
      approximateMeasurer,
    );
  };
  add('TA', 'ta', 'B1', 20);
  add('TB', 'tb', 'B1', 100);
  add('TF', 'ta', 'I1', 100);
  p = createMarking(p, {
    id: 'P',
    containerId: 'B1',
    rect: { x: 20, y: 200, width: 300, height: 200 },
  });
  return p;
}

/** Ids das camadas do projeto que desenham (A e B) e da que não desenha (C). A marcação comum é P. */
export function viewLayerIds(p: Project): { a: string; b: string; c: string } {
  const id = (specLayer: string): string =>
    projectLayerFor(p, VIEW_SPEC_ID, specLayer)?.id ?? `?${specLayer}`;
  return { a: id('ca'), b: id('cb'), c: id('cc') };
}
