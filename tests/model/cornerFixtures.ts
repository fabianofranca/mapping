import {
  loadSpecComponents,
  parseSpec,
  type ComponentCatalog,
  type Spec,
} from '../../src/model';

// Test library for the corner alignment (#2093, CC3): a Badge that hugs its text (`3`, `12`, `99+`)
// with `anchor: { side: top, align: corner-end }` on its component root.

export const CORNER_SPEC_FILE = 'specs/corner/corner.spec.json';
export const CORNER_SPEC_ID = 'corner';

export const BADGE_COMPONENT = {
  format: 'mapping-component',
  formatVersion: 4,
  id: 'badge',
  name: 'Badge',
  size: { width: 16, height: 16 },
  minSize: { width: 16, height: 16 },
  sizing: { width: 'hug' },
  anchor: { side: 'top', align: 'corner-end' },
  template: {
    type: 'frame',
    layout: { type: 'row', align: 'center', justify: 'center', padding: 4 },
    fill: '#B3261E',
    cornerRadius: 8,
    children: [
      {
        type: 'text',
        name: 'count',
        text: { $field: 'count', default: '' },
        width: 'hug',
        height: 'hug',
        font: { size: 11, lineHeight: 16 },
      },
    ],
  },
};

export const CORNER_COMPONENTS: Record<string, unknown> = { badge: BADGE_COMPONENT };

export const CORNER_SPEC_JSON = {
  format: 'mapping-spec',
  formatVersion: 4,
  id: CORNER_SPEC_ID,
  name: 'Corner',
  version: 1,
  platforms: [{ id: 'web', name: 'Web' }],
  layers: [
    {
      id: 'components',
      name: 'Components',
      color: '#6750A4',
      annotationTypes: [
        {
          id: 'badge',
          name: 'Badge',
          component: 'components/badge.json',
          code: { web: { symbol: 'Badge' } },
          fields: [{ key: 'count', type: 'string', default: '3' }],
        },
      ],
    },
  ],
};

export function cornerSpec(): Spec {
  const parsed = parseSpec(CORNER_SPEC_JSON);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.spec;
}

export function cornerCatalog(): ComponentCatalog {
  const texts = new Map(
    Object.entries(CORNER_COMPONENTS).map(([id, c]) => [
      `specs/corner/components/${id}.json`,
      JSON.stringify(c),
    ]),
  );
  const loaded = loadSpecComponents(cornerSpec(), CORNER_SPEC_FILE, 1, (path) =>
    texts.get(path),
  );
  if (loaded.problems.length > 0) throw new Error(loaded.problems.join('\n'));
  return new Map([[CORNER_SPEC_ID, loaded]]);
}
