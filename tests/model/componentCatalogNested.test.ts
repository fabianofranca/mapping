// CC2: the loaders attach `resolvedComponents` (decision 8 of #2093): `loadSpecComponents`,
// `withHostTokens` and `buildCatalog`; an inner file that changes gives a new outer component
// (identity) and a new drawing through `createDrawingCache`; the types in a cycle get no entry.
import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  addContainer,
  applySpecialization,
  approximateMeasurer,
  createDrawingCache,
  loadSpecComponents,
  parseSpec,
  type ComponentCatalog,
  type NewComponentArgs,
  type Project,
} from '../../src/model';
import { buildCatalog } from '../../src/model/catalog';
import { loadLibrary, withHostTokens } from '../../src/model/components/library';
import { walk } from '../../src/model/components/scene';
import { emptyProject } from './fixtures';

type Json = Record<string, unknown>;

const SPEC_ID = 'nest';
const SPEC_FILE = 'specs/nest/nest.spec.json';

const component = (id: string, template: Json): Json => ({
  format: 'mapping-component',
  formatVersion: 4,
  id,
  name: id,
  size: { width: 80, height: 40 },
  template,
});

/** The inner `chip`: a filled frame whose color is a parameter of the test. */
const chip = (color: string): Json =>
  component('chip', {
    type: 'frame',
    name: 'chip-body',
    fill: color,
    children: [],
  });

const holder = (): Json =>
  component('holder', {
    type: 'frame',
    layout: { type: 'none' },
    children: [{ type: 'component', id: 'chip', width: 80, height: 40 }],
  });

const nodeOf = (id: string): Json =>
  component(id === 'ping' ? 'ping' : 'pong', {
    type: 'frame',
    layout: { type: 'none' },
    children: [
      { type: 'component', id: id === 'ping' ? 'pong' : 'ping', width: 80, height: 40 },
    ],
  });

const comp = (id: string): Json => {
  switch (id) {
    case 'holder':
      return holder();
    case 'ping':
    case 'pong':
      return nodeOf(id);
    default:
      return chip('#112233');
  }
};

const SPEC_JSON = {
  format: 'mapping-spec',
  formatVersion: 4,
  id: SPEC_ID,
  name: 'Nest',
  version: 1,
  layers: [
    {
      id: 'components',
      name: 'Components',
      color: '#6750A4',
      annotationTypes: [
        {
          id: 'holder',
          name: 'holder',
          component: 'components/holder.json',
          fields: [],
        },
        {
          id: 'chip',
          name: 'chip',
          component: 'components/chip.json',
          fields: [
            { key: 'label', type: 'string', default: 'dflt' },
            { key: 'must', type: 'string', required: true },
          ],
        },
        { id: 'ping', name: 'ping', component: 'components/ping.json', fields: [] },
        { id: 'pong', name: 'pong', component: 'components/pong.json', fields: [] },
      ],
    },
  ],
};

function spec() {
  const parsed = parseSpec(SPEC_JSON);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.spec;
}

const texts = (chipColor = '#112233'): Map<string, string> =>
  new Map(
    ['holder', 'chip', 'ping', 'pong'].map((id) => [
      `specs/nest/components/${id}.json`,
      JSON.stringify(id === 'chip' ? chip(chipColor) : comp(id)),
    ]),
  );

function load(chipColor?: string): ComponentCatalog {
  const files = texts(chipColor);
  const loaded = loadSpecComponents(spec(), SPEC_FILE, 1, (path) => files.get(path));
  if (loaded.problems.length > 0) throw new Error(loaded.problems.join('\n'));
  return new Map([[SPEC_ID, loaded]]);
}

const byType = (catalog: ComponentCatalog) => catalog.get(SPEC_ID)!.byType;

describe('loadSpecComponents attaches resolvedComponents', () => {
  it('the outer component carries the inner one, with its type fields', () => {
    const outer = byType(load()).get('holder')!;
    const entry = outer.resolvedComponents?.chip;
    expect(entry?.component.id).toBe('chip');
    expect(entry?.fields).toEqual([
      { key: 'label', type: 'string', required: false, default: 'dflt' },
      { key: 'must', type: 'string', required: true },
    ]);
    // the inner component carries the tokens like any component of the specialization
    expect(entry?.component.resolvedTokens).toBeDefined();
  });

  it('a component without nodes keeps no resolvedComponents', () => {
    expect(byType(load()).get('chip')!.resolvedComponents).toBeUndefined();
  });

  it('the types in a cycle get no entry (and the others still resolve)', () => {
    const types = byType(load());
    expect(types.get('ping')!.resolvedComponents).toBeUndefined();
    expect(types.get('pong')!.resolvedComponents).toBeUndefined();
    expect(types.get('holder')!.resolvedComponents?.chip).toBeDefined();
  });
});

describe('an inner file that changes', () => {
  it('gives a new outer component and a new drawing through createDrawingCache', () => {
    const before = load('#112233');
    const after = load('#abcdef');
    const outerBefore = byType(before).get('holder')!;
    const outerAfter = byType(after).get('holder')!;
    expect(outerAfter).not.toBe(outerBefore);

    let p: Project = applySpecialization(emptyProject(), spec(), {
      newId: (() => {
        let n = 0;
        return () => `NS${++n}`;
      })(),
      packageSpecName: 'nest.spec.json',
    });
    p = addContainer(p, {
      id: 'I1',
      file: 'images/screen.png',
      width: 1000,
      height: 800,
    });
    const args: NewComponentArgs = {
      markingId: 'H',
      annotationId: 'A_H',
      containerId: 'I1',
      parentId: null,
      specId: SPEC_ID,
      typeId: 'holder',
      rect: { x: 100, y: 100, width: 80, height: 40 },
    };
    p = addComponentMarking(p, before, args, approximateMeasurer);

    const cache = createDrawingCache();
    const bodyColor = (catalog: ComponentCatalog): string | undefined => {
      const drawing = cache(p, catalog, approximateMeasurer, 0).get('H')!;
      const body = [...walk(drawing.root)].find((n) => n.name === 'chip')!;
      const fill = body.fills[0];
      return fill?.type === 'solid' ? fill.color : undefined;
    };
    expect(bodyColor(before)).toBe('#112233');
    expect(bodyColor(after)).toBe('#abcdef');
  });
});

describe('withHostTokens and buildCatalog attach it too', () => {
  const files = [
    { path: SPEC_FILE, text: JSON.stringify(SPEC_JSON) },
    ...[...texts()].map(([path, text]) => ({
      path: path.replace('specs/nest/', ''),
      text,
    })),
  ];
  const specPath = 'nest.spec.json';
  const packageFiles = [
    { path: specPath, text: JSON.stringify(SPEC_JSON) },
    ...files.slice(1),
  ];

  it('withHostTokens: the inner component carries the same tokens as the outer', () => {
    const lib = loadLibrary(packageFiles);
    const themed = withHostTokens(lib, { sans: 'Roboto' });
    const outer = themed.types.find((t) => t.id === 'holder')!.component!;
    const entry = outer.resolvedComponents?.chip;
    expect(entry?.component.id).toBe('chip');
    expect(entry?.component.resolvedTokens).toBe(outer.resolvedTokens);
    expect(entry?.fields.map((f) => f.key)).toEqual(['label', 'must']);
    // cycle types get no entry
    expect(
      themed.types.find((t) => t.id === 'ping')!.component!.resolvedComponents,
    ).toBeUndefined();
  });

  it('buildCatalog: every entry component carries its inner components', () => {
    const catalog = buildCatalog(packageFiles);
    const entry = catalog.layers[0]!.entries.find((e) => e.type.id === 'holder')!;
    expect(entry.component?.resolvedComponents?.chip?.component.id).toBe('chip');
    const ping = catalog.layers[0]!.entries.find((e) => e.type.id === 'ping')!;
    expect(ping.component?.resolvedComponents).toBeUndefined();
  });
});
