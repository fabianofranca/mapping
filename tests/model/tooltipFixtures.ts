import {
  addContainer,
  applySpecialization,
  loadSpecComponents,
  parseSpec,
  type ComponentCatalog,
  type Project,
  type Spec,
} from '../../src/model';
import { emptyProject } from './fixtures';

// Test library for the anchor (R3, #1096): a tooltip (100 × 40 body, 16 × 8 arrow under the center
// of the anchor, chosen by `$switch` on `$anchor.side`) and a button without `anchor` at the root. The `anchor`s
// at the tooltip root are `top`, `center` and `offset.main` 4 (units).

export const TIP_SPEC_FILE = 'specs/tip/tip.spec.json';
export const TIP_SPEC_ID = 'tip';

export const TOOLTIP_COMPONENT = {
  format: 'mapping-component',
  formatVersion: 4,
  id: 'tooltip',
  name: 'Tooltip',
  size: { width: 100, height: 48 },
  anchor: { side: 'top', align: 'center', offset: { main: 4, cross: 0 } },
  template: {
    type: 'frame',
    layout: { type: 'none' },
    children: [
      {
        type: 'rect',
        name: 'seta',
        width: 16,
        height: 8,
        anchors: {
          left: { $sub: [{ $field: '$anchor.x' }, 8] },
          top: { $switch: '$anchor.side', cases: { top: 40, bottom: 0 }, default: 0 },
        },
        visible: { $has: '$anchor.side' },
        fill: '#000000',
      },
      { type: 'rect', name: 'body', width: 100, height: 40, fill: '#ffffff' },
    ],
  },
};

const BUTTON_COMPONENT = {
  format: 'mapping-component',
  formatVersion: 4,
  id: 'botao',
  name: 'Button',
  size: { width: 80, height: 32 },
  template: {
    type: 'frame',
    layout: { type: 'none' },
    children: [{ type: 'rect', name: 'body', width: 80, height: 32, fill: '#eeeeee' }],
  },
};

export const TIP_COMPONENTS: Record<string, unknown> = {
  tooltip: TOOLTIP_COMPONENT,
  botao: BUTTON_COMPONENT,
};

export const TIP_SPEC_JSON = {
  format: 'mapping-spec',
  formatVersion: 4,
  id: TIP_SPEC_ID,
  name: 'Tooltip',
  version: 1,
  platforms: [{ id: 'web', name: 'Web' }],
  layers: [
    {
      id: 'componentes',
      name: 'Componentes',
      color: '#6750A4',
      annotationTypes: Object.keys(TIP_COMPONENTS).map((id) => ({
        id,
        name: id,
        component: `components/${id}.json`,
        code: { web: { symbol: id } },
        fields: [{ key: 'label', type: 'string', default: 'Ok' }],
      })),
    },
  ],
};

export function tipSpec(): Spec {
  const parsed = parseSpec(TIP_SPEC_JSON);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.spec;
}

export function tipCatalog(): ComponentCatalog {
  const texts = new Map(
    Object.entries(TIP_COMPONENTS).map(([id, c]) => [
      `specs/tip/components/${id}.json`,
      JSON.stringify(c),
    ]),
  );
  const loaded = loadSpecComponents(tipSpec(), TIP_SPEC_FILE, 1, (path) =>
    texts.get(path),
  );
  if (loaded.problems.length > 0) throw new Error(loaded.problems.join('\n'));
  return new Map([[TIP_SPEC_ID, loaded]]);
}

/** Project with the `tip` specialization and the image `I1` (1000 × 800). */
export function tipProject(): Project {
  let p = emptyProject();
  p = applySpecialization(p, tipSpec(), {
    newId: (() => {
      let n = 0;
      return () => `TS${++n}`;
    })(),
    packageSpecName: 'tip.spec.json',
  });
  return addContainer(p, { id: 'I1', file: 'images/tela.png', width: 1000, height: 800 });
}
