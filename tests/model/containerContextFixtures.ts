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

// CX4 (#2039): a small library with container classes and components that read `$container.*`.
// `pad` reads the `window` class (a computed set) and the container's width; `plain` reads nothing;
// `holder` draws `pad` through a `component` node; `chosen` reads the `platform` (chosen) set.

export const CX_SPEC_FILE = 'specs/cx/cx.spec.json';
export const CX_SPEC_ID = 'cx';

type Json = Record<string, unknown>;

const WINDOW_SET = {
  id: 'window',
  name: 'Window',
  by: 'width',
  classes: [
    { id: 'compact', name: 'Compact', below: 600 },
    { id: 'medium', name: 'Medium', below: 840 },
    { id: 'expanded', name: 'Expanded' },
  ],
};

const PLATFORM_SET = {
  id: 'platform',
  name: 'Platform',
  classes: [
    { id: 'android', name: 'Android' },
    { id: 'ios', name: 'iOS' },
    { id: 'web', name: 'Web' },
  ],
};

const bar = (width: unknown): Json => ({
  type: 'rect',
  name: 'bar',
  width,
  height: 10,
  fill: '#000000',
});

const component = (id: string, children: Json[], extra: Json = {}): Json => ({
  format: 'mapping-component',
  formatVersion: 4,
  id,
  name: id,
  size: { width: 100, height: 40 },
  template: { type: 'frame', layout: { type: 'none' }, children },
  ...extra,
});

/** The padding a `window` class gives (compact 16, medium 20, expanded 24; no class 8). */
export const PADDING_BY_WINDOW = {
  $switch: '$container.window',
  cases: { compact: 16, medium: 20, expanded: 24 },
  default: 8,
};

export const CX_COMPONENTS: Record<string, Json> = {
  pad: component('pad', [bar(PADDING_BY_WINDOW)]),
  plain: component('plain', [bar(12)]),
  holder: component('holder', [{ type: 'component', id: 'pad' }]),
  chosen: component('chosen', [
    bar({ $switch: '$container.platform', cases: { android: 11, web: 33 }, default: 5 }),
  ]),
};

export const CX_SPEC_JSON = {
  format: 'mapping-spec',
  formatVersion: 21,
  id: CX_SPEC_ID,
  name: 'Container context',
  version: 1,
  containerClasses: [WINDOW_SET, PLATFORM_SET],
  layers: [
    {
      id: 'components',
      name: 'Components',
      color: '#6750A4',
      annotationTypes: Object.keys(CX_COMPONENTS).map((id) => ({
        id,
        name: `Type ${id}`,
        component: `components/${id}.json`,
        fields: [],
      })),
    },
  ],
};

export function cxSpec(): Spec {
  const parsed = parseSpec(CX_SPEC_JSON);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.spec;
}

export function cxCatalog(
  components: Record<string, Json> = CX_COMPONENTS,
): ComponentCatalog {
  const texts = new Map(
    Object.entries(components).map(([id, c]) => [
      `specs/cx/components/${id}.json`,
      JSON.stringify(c),
    ]),
  );
  const loaded = loadSpecComponents(cxSpec(), CX_SPEC_FILE, 1, (path) => texts.get(path));
  if (loaded.problems.length > 0) throw new Error(loaded.problems.join('\n'));
  return new Map([[CX_SPEC_ID, loaded]]);
}

/**
 * The project with the specialization applied and two containers: `I1` (1080 px wide, density 3 → 360
 * units, `compact`) and `I2` (2520 px wide, density 3 → 840 units, `expanded`); both 1600 px tall.
 */
export function cxProject(): Project {
  let p = applySpecialization(emptyProject(), cxSpec(), {
    newId: (() => {
      let n = 0;
      return () => `LS${++n}`;
    })(),
    packageSpecName: 'cx.spec.json',
  });
  p = addContainer(p, { id: 'I1', file: 'images/a.png', width: 1080, height: 1600 });
  p = addContainer(p, { id: 'I2', file: 'images/b.png', width: 2520, height: 1600 });
  return {
    ...p,
    containers: p.containers.map((c) => ({ ...c, density: 3 })),
  };
}
