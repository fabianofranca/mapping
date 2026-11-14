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

// Small library of components that fit their content (MC3, decisions 14 to 16 of #898):
// a button with a long label (`hug` height), the same with a cap on the root, one with `hug` width and height,
// one with a height by expression, one with no fittable axis, and a row with `align: stretch` and another with a
// `none` slot. Written in the test itself, like the one in `componentFixtures.ts`.

export const FIT_SPEC_FILE = 'specs/fit/fit.spec.json';
export const FIT_SPEC_ID = 'fit';

type Json = Record<string, unknown>;

/** A label that, in the 120-wide button (104 of text), goes past one line in the `approximateMeasurer`. */
export const LONG_LABEL = 'My simple readable label and breaks in better places';

function labelText(): Json {
  return {
    type: 'text',
    name: 'label',
    text: { $field: 'label', default: '' },
    width: 'fill',
    height: 'hug',
    font: { size: 14, lineHeight: 20 },
  };
}

function button(id: string, size: Json, sizing: Json | undefined, root: Json = {}): Json {
  return {
    format: 'mapping-component',
    formatVersion: 4,
    id,
    name: id,
    size,
    minSize: { width: 48, height: 40 },
    ...(sizing === undefined ? {} : { sizing }),
    template: {
      type: 'frame',
      layout: { type: 'column', padding: 8 },
      fill: '#EEEEEE',
      children: [labelText()],
      ...root,
    },
  };
}

/** `none` slot with `align` (vertical) and `justify` (horizontal): each child alone in the slot box. */
function overlaid(id: string, align: string, justify: string): Json {
  const base = row(id, 'start', 'none');
  const template = base.template as { children: Json[] };
  const slot = template.children[0] as Json;
  return {
    ...base,
    template: {
      ...template,
      children: [{ ...slot, layout: { type: 'none', align, justify } }],
    },
  };
}

function row(id: string, align: string, layoutType = 'row', sizing?: Json): Json {
  return {
    format: 'mapping-component',
    formatVersion: 4,
    id,
    name: id,
    size: { width: 400, height: 100 },
    ...(sizing === undefined ? {} : { sizing }),
    template: {
      type: 'frame',
      layout: { type: 'none' },
      fill: '#DDDDDD',
      children: [
        {
          type: 'slot',
          anchors: { left: 0, right: 0, top: 0, bottom: 0 },
          layout:
            layoutType === 'none'
              ? { type: 'none' }
              : { type: layoutType, gap: 8, padding: 0, align, justify: 'start' },
        },
      ],
    },
  };
}

export const FIT_COMPONENTS: Record<string, Json> = {
  // The height follows the label; the width stays (no `sizing` on it).
  'fit-button': button('fit-button', { width: 120, height: 40 }, { height: 'hug' }),
  // The same with the root cap at 60 height.
  'fit-capped': button(
    'fit-capped',
    { width: 120, height: 40 },
    { height: 'hug' },
    { maxHeight: 60 },
  ),
  // Both axes follow the content.
  'fit-hug': button(
    'fit-hug',
    { width: 120, height: 40 },
    { width: 'hug', height: 'hug' },
  ),
  // L4: the width with no wrapping (`max-content`) and by the widest word (`min-content`).
  'fit-max': button(
    'fit-max',
    { width: 120, height: 40 },
    { width: 'max-content', height: 'hug' },
  ),
  'fit-min': button(
    'fit-min',
    { width: 120, height: 40 },
    { width: 'min-content', height: 'hug' },
  ),
  // The height comes from a field: 80 with `tall`, 30 without it (and never below the minimum).
  'fit-px': button(
    'fit-px',
    { width: 120, height: 40 },
    {
      height: { $if: { $field: 'tall' }, then: 80, else: 30 },
    },
  ),
  // `fill` on one axis and nothing on the other: no axis follows the content.
  'fit-fill': button('fit-fill', { width: 120, height: 40 }, { width: 'fill' }),
  // Without `sizing`: nothing to fit.
  'fit-plain': button('fit-plain', { width: 120, height: 40 }, undefined),
  // A row that stretches the children in height, and a row that does not.
  'fit-row-stretch': row('fit-row-stretch', 'stretch'),
  'fit-row-start': row('fit-row-start', 'start'),
  // Slot with no layout and `hug` height: with children it is neither arranged nor fitted.
  'fit-row-none': row('fit-row-none', 'start', 'none', { height: 'hug' }),
  // Aligned `none` slot (v4): `justify` stretches the width, `align` the height.
  'fit-none-justify': overlaid('fit-none-justify', 'start', 'stretch'),
  'fit-none-align': overlaid('fit-none-align', 'stretch', 'start'),
};

const FIELDS = [
  { key: 'label', type: 'string', default: 'Ok' },
  { key: 'tall', type: 'string' },
];

export const FIT_SPEC_JSON = {
  format: 'mapping-spec',
  formatVersion: 4,
  id: FIT_SPEC_ID,
  name: 'Fit',
  version: 1,
  layers: [
    {
      id: 'components',
      name: 'Components',
      color: '#6750A4',
      annotationTypes: Object.keys(FIT_COMPONENTS).map((id) => ({
        id,
        name: id,
        component: `components/${id}.json`,
        fields: FIELDS,
      })),
    },
  ],
};

export function fitSpec(): Spec {
  const parsed = parseSpec(FIT_SPEC_JSON);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.spec;
}

export function fitCatalog(): ComponentCatalog {
  const texts = new Map(
    Object.entries(FIT_COMPONENTS).map(([id, c]) => [
      `specs/fit/components/${id}.json`,
      JSON.stringify(c),
    ]),
  );
  const loaded = loadSpecComponents(fitSpec(), FIT_SPEC_FILE, 1, (path) =>
    texts.get(path),
  );
  if (loaded.problems.length > 0) throw new Error(loaded.problems.join('\n'));
  return new Map([[FIT_SPEC_ID, loaded]]);
}

/** A project with the `fit` specialization and the image `I1` (1000 × 800). */
export function fitProject(): Project {
  let p = emptyProject();
  p = applySpecialization(p, fitSpec(), {
    newId: (() => {
      let n = 0;
      return () => `FS${++n}`;
    })(),
    packageSpecName: 'fit.spec.json',
  });
  return addContainer(p, {
    id: 'I1',
    file: 'images/screen.png',
    width: 1000,
    height: 800,
  });
}
