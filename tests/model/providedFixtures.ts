// Small library of the inherited color (MF3): `panel` provides `ink`, `grand` provides a fixed `ink`, `shell`
// provides nothing, `label` reads `ink` with a gray default, `bare` reads without a default and `dot` does not read.
import {
  addComponentMarking,
  addContainer,
  applySpecialization,
  approximateMeasurer,
  loadSpecComponents,
  parseSpec,
  type ComponentCatalog,
  type NewComponentArgs,
  type Project,
} from '../../src/model';
import { emptyProject } from './fixtures';

const SPEC_FILE = 'specs/prov/prov.spec.json';
export const SPEC_ID = 'prov';

const slotNode = (provide?: Record<string, unknown>) => ({
  type: 'slot',
  anchors: { left: 0, right: 0, top: 0, bottom: 0 },
  layout: { type: 'row', gap: 4, padding: 0 },
  ...(provide === undefined ? {} : { provide }),
});

function component(id: string, children: unknown[], size = { width: 300, height: 100 }) {
  return {
    format: 'mapping-component',
    formatVersion: 4,
    id,
    name: id,
    size,
    template: { type: 'frame', layout: { type: 'none' }, children },
  };
}

const COMPONENTS: Record<string, unknown> = {
  // Oferece `ink` (o campo `ink`, ou azul) e `size`.
  panel: component('panel', [
    slotNode({ ink: { $field: 'ink', default: '#0000ff' }, size: 20 }),
  ]),
  // Oferece `ink` fixo (para o pai e o avô oferecerem).
  grand: component('grand', [slotNode({ ink: '#00ff00' })]),
  // Não oferece nada: atravessado.
  shell: component('shell', [slotNode()]),
  // Lê `ink` com default cinza.
  label: component(
    'label',
    [
      {
        type: 'text',
        name: 'lbl',
        text: { $field: 'label', default: 'x' },
        color: { $provided: 'ink', default: '#999999' },
      },
    ],
    { width: 100, height: 40 },
  ),
  // Lê `ink` sem default.
  bare: component(
    'bare',
    [{ type: 'text', name: 'lbl', text: 'x', color: { $provided: 'ink' } }],
    { width: 100, height: 40 },
  ),
  // Não lê nada.
  dot: component('dot', [{ type: 'rect', name: 'dot', fill: '#123456' }], {
    width: 20,
    height: 20,
  }),
};

const FIELDS: Record<string, unknown[]> = {
  panel: [{ key: 'ink', type: 'string' }],
  label: [{ key: 'label', type: 'string' }],
};

const SPEC_JSON = {
  format: 'mapping-spec',
  formatVersion: 4,
  id: SPEC_ID,
  name: 'Prov',
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
        fields: FIELDS[id] ?? [{ key: 'note', type: 'string' }],
      })),
    },
  ],
};

export function catalog(): ComponentCatalog {
  const parsed = parseSpec(SPEC_JSON);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  const texts = new Map(
    Object.entries(COMPONENTS).map(([id, c]) => [
      `specs/prov/components/${id}.json`,
      JSON.stringify(c),
    ]),
  );
  const loaded = loadSpecComponents(parsed.spec, SPEC_FILE, 1, (path) => texts.get(path));
  if (loaded.problems.length > 0) throw new Error(loaded.problems.join('\n'));
  return new Map([[SPEC_ID, loaded]]);
}

export const cat = catalog();

export function baseProject(): Project {
  const parsed = parseSpec(SPEC_JSON);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  let n = 0;
  const p = applySpecialization(emptyProject(), parsed.spec, {
    newId: () => `LS${++n}`,
    packageSpecName: 'prov.spec.json',
  });
  return addContainer(p, { id: 'I1', file: 'images/tela.png', width: 1000, height: 800 });
}

export function add(
  p: Project,
  id: string,
  typeId: string,
  extra: Partial<NewComponentArgs> = {},
): Project {
  return addComponentMarking(
    p,
    cat,
    {
      markingId: id,
      annotationId: `A_${id}`,
      containerId: 'I1',
      parentId: null,
      specId: SPEC_ID,
      typeId,
      ...extra,
    },
    approximateMeasurer,
  );
}
