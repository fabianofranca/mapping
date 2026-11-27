// FN2: the project lookup of `$tokenNamed` — the declared tokens of the applied specializations, in the
// space's effective drawing selection (own library first, then the others in order, then the built-ins).
import { describe, expect, it } from 'vitest';
import {
  addBackgroundContainer,
  addComponentMarking,
  approximateMeasurer,
  componentForDrawing,
  createDrawingCache,
  drawOptions,
  readsTokenNamed,
  loadSpecComponents,
  setContainerDrawingMode,
  type ComponentCatalog,
  type Project,
  type ProjectSpecialization,
} from '../../src/model';
import type { ComponentFile } from '../../src/model/components/componentFormat';
import { createTokenTables, type SpecTokens } from '../../src/model/components/tokens';
import { projectNamedLookup } from '../../src/model/projectTokens';
import {
  COMPONENTS,
  SPEC_FILE,
  SPEC_ID,
  componentProject,
  testSpec,
} from './componentFixtures';
import { emptyProject } from './fixtures';

function specOf(id: string, tokens: SpecTokens): ProjectSpecialization {
  return {
    id,
    spec: { layers: [], types: [], tokens },
  } as unknown as ProjectSpecialization;
}

const OWN: SpecTokens = {
  modes: ['light', 'dark'],
  values: {
    shared: '#111111',
    dup: 4,
    'own-only': { light: '#aaaaaa', dark: '#bbbbbb' },
  },
};
const OTHER: SpecTokens = {
  modes: ['light', 'dark'],
  values: {
    shared: '#222222',
    dup: '#333333',
    surface: { light: '#ffffff', dark: '#101010' },
    'mono-x': '"Fira Code", monospace',
  },
};

function component(tokens: SpecTokens): ComponentFile {
  const tokenTables = createTokenTables(tokens, {});
  return {
    format: 'mapping-component',
    formatVersion: 4,
    id: 'c',
    name: 'C',
    size: { width: 10, height: 10 },
    template: { type: 'frame' },
    resolvedTokens: tokenTables.get(undefined),
    tokenTables,
  } as unknown as ComponentFile;
}

function project(...specs: ProjectSpecialization[]): Project {
  let p: Project = { ...emptyProject(), specializations: specs };
  p = addBackgroundContainer(p, {
    id: 'D',
    width: 100,
    height: 80,
    background: '#FFFFFF',
  });
  return setContainerDrawingMode(p, 'D', { mode: 'dark' });
}

describe('projectNamedLookup', () => {
  const p = project(specOf('own', OWN), specOf('other', OTHER));
  const own = component(OWN);

  it('the own library first, then the other applied libraries in order', () => {
    const lookup = projectNamedLookup(p, own, null);
    expect(lookup('shared', 'color')).toBe('#111111');
    expect(lookup('surface', 'color')).toBe('#ffffff');
  });

  it('a name of the wrong kind is skipped', () => {
    expect(projectNamedLookup(p, own, null)('dup', 'color')).toBe('#333333');
    expect(projectNamedLookup(p, own, null)('mono-x', 'color')).toBeUndefined();
    expect(projectNamedLookup(p, own, null)('mono-x', 'family')).toBe(
      '"Fira Code", monospace',
    );
  });

  it('then the built-ins font-sans and font-mono', () => {
    const lookup = projectNamedLookup(p, own, null);
    expect(lookup('font-mono', 'family')).toBe('"Mapping Mono", monospace');
    expect(lookup('font-sans', 'color')).toBeUndefined();
    expect(lookup('nope', 'color')).toBeUndefined();
  });

  it("reads each library in the space's selection: dark in a pinned container, light on the canvas", () => {
    expect(projectNamedLookup(p, own, 'D')('surface', 'color')).toBe('#101010');
    expect(projectNamedLookup(p, own, 'D')('own-only', 'color')).toBe('#bbbbbb');
    expect(projectNamedLookup(p, own, null)('surface', 'color')).toBe('#ffffff');
    expect(projectNamedLookup(p, own, null)('own-only', 'color')).toBe('#aaaaaa');
  });

  it('a library redefining font-sans wins over the built-in', () => {
    const q = project(
      specOf('own', OWN),
      specOf('other', { values: { 'font-sans': '"Inter", sans-serif' } }),
    );
    expect(projectNamedLookup(q, own, null)('font-sans', 'family')).toBe(
      '"Inter", sans-serif',
    );
  });
});

describe('componentForDrawing carries the lookup into the engine options', () => {
  it('drawOptions passes tokenNamed', () => {
    const p = project(specOf('own', OWN), specOf('other', OTHER));
    const drawn = componentForDrawing(p, component(OWN), 'D');
    const options = drawOptions(drawn);
    expect(options.tokenNamed?.('surface', 'color')).toBe('#101010');
  });
});

describe('the drawing of a marking reads the other libraries in its space mode', () => {
  const NAMED_COMPONENT = {
    format: 'mapping-component',
    formatVersion: 4,
    id: 'text',
    name: 'text',
    size: { width: 100, height: 40 },
    template: {
      type: 'frame',
      layout: { type: 'none' },
      fill: { $tokenNamed: 'surface', default: '#ff00ff' },
      children: [],
    },
  };

  function catalog(): ComponentCatalog {
    const spec = {
      ...testSpec(),
      formatVersion: 15,
      tokens: { modes: ['light', 'dark'], values: { own: '#123456' } },
    };
    const texts = new Map(
      Object.entries({ ...COMPONENTS, text: NAMED_COMPONENT }).map(([id, c]) => [
        `specs/test/components/${id}.json`,
        JSON.stringify(c),
      ]),
    );
    return new Map([
      [
        SPEC_ID,
        loadSpecComponents(spec as never, SPEC_FILE, 1, (path) => texts.get(path)),
      ],
    ]);
  }

  function drawn(p: Project): unknown {
    const withMarking = addComponentMarking(
      p,
      catalog(),
      {
        markingId: 'T1',
        annotationId: 'A_T1',
        containerId: 'I1',
        parentId: null,
        specId: SPEC_ID,
        typeId: 'text',
        rect: { x: 10, y: 10, width: 100, height: 40 },
      },
      approximateMeasurer,
    );
    const cache = createDrawingCache()(withMarking, catalog(), approximateMeasurer, 0);
    return cache.get('T1')?.root.fills[0];
  }

  const base = (): Project => ({
    ...componentProject(),
    specializations: [...componentProject().specializations, specOf('other', OTHER)],
  });

  it('light by default and dark in a container pinned to dark, from a library other than its own', () => {
    expect(JSON.stringify(drawn(base()))).toContain('#ffffff');
    expect(
      JSON.stringify(drawn(setContainerDrawingMode(base(), 'I1', { mode: 'dark' }))),
    ).toContain('#101010');
  });

  it('a name nobody declares draws the default', () => {
    const none: Project = componentProject();
    expect(JSON.stringify(drawn(none))).toContain('#ff00ff');
  });
});

describe('which components the drawing cache keys on the libraries tokens', () => {
  const withTemplate = (template: Record<string, unknown>): ComponentFile =>
    ({ ...component(OWN), template }) as unknown as ComponentFile;

  it('a component that reads $tokenNamed, itself or through a nested component, does', () => {
    expect(readsTokenNamed(component(OWN))).toBe(false);
    expect(
      readsTokenNamed(withTemplate({ type: 'frame', fill: { $tokenNamed: 'brand' } })),
    ).toBe(true);
    // The nested file is not in the outer one's text: a `component` node counts.
    expect(
      readsTokenNamed(
        withTemplate({
          type: 'frame',
          children: [{ type: 'component', component: 'chip', values: {} }],
        }),
      ),
    ).toBe(true);
  });
});
