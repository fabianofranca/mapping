// Stage #1900, NV2 (package B): token tables per selection (built lazily, shared), the string
// compatibility rule over axes, the drawing proof per entry of each axis and the drawing modes of axes.
import { describe, expect, it } from 'vitest';
import {
  componentForDrawing,
  drawingModesOf,
  loadSpecComponents,
  setProjectDrawingMode,
} from '../../src/model';
import {
  createTokenTables,
  resolveTokens,
  selectionKey,
  type SpecTokens,
} from '../../src/model/components/tokens';
import { loadLibrary, withHostTokens } from '../../src/model/components/library';
import { validateLibrary } from '../../src/model/library';
import { SPEC_FILE, packageTexts, testSpec } from './componentFixtures';
import { sampleProject } from './fixtures';

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const AXES_TOKENS: SpecTokens = {
  axes: { theme: ['light', 'dark'], density: ['compact', 'roomy'] },
  values: {
    surface: { $axis: 'theme', light: '#ffffff', dark: '#000000' },
    pad: { $axis: 'density', compact: 4, roomy: 12 },
  },
};

describe('resolveTokens: a string selection sets that entry on every axis that declares it', () => {
  it('a string names an entry of a non-mode axis', () => {
    expect(resolveTokens(AXES_TOKENS, {}, 'dark').surface).toBe('#000000');
    expect(resolveTokens(AXES_TOKENS, {}, 'roomy').pad).toBe(12);
  });

  it('the axes that lack the entry keep their default', () => {
    const t = resolveTokens(AXES_TOKENS, {}, 'dark');
    expect(t.pad).toBe(4);
  });

  it('an entry shared by two axes is set on both', () => {
    const tokens: SpecTokens = {
      axes: { a: ['x', 'on'], b: ['y', 'on'] },
      values: {
        p: { $axis: 'a', x: 1, on: 2 },
        q: { $axis: 'b', y: 3, on: 4 },
      },
    };
    const t = resolveTokens(tokens, {}, 'on');
    expect([t.p, t.q]).toEqual([2, 4]);
  });
});

describe('createTokenTables: per selection, lazily, shared', () => {
  it('returns the same table object for the same selection', () => {
    const tables = createTokenTables(AXES_TOKENS, {});
    const first = tables.get({ theme: 'dark' });
    expect(first.surface).toBe('#000000');
    expect(tables.get({ theme: 'dark' })).toBe(first);
  });

  it('equal selections share it: another key order, a default entry spelled out, a string', () => {
    const tables = createTokenTables(AXES_TOKENS, {});
    const a = tables.get({ theme: 'dark', density: 'compact' });
    expect(tables.get({ density: 'compact', theme: 'dark' })).toBe(a);
    expect(tables.get({ theme: 'dark' })).toBe(a);
    expect(tables.get('dark')).toBe(a);
    expect(tables.get({ theme: 'dark', other: 'x' })).toBe(a);
  });

  it('an undeclared entry or no selection is the all-default table', () => {
    const tables = createTokenTables(AXES_TOKENS, {});
    const base = tables.get(undefined);
    expect(tables.get({ theme: 'sepia' })).toBe(base);
    expect(tables.get({})).toBe(base);
    expect(tables.get('nope')).toBe(base);
    expect(tables.get({ theme: 'dark' })).not.toBe(base);
  });

  it('builds nothing until asked (no product precomputed)', () => {
    let built = 0;
    const tokens = {
      axes: { theme: ['light', 'dark'] },
      get values() {
        built += 1;
        return { surface: 1 };
      },
    } as unknown as SpecTokens;
    const tables = createTokenTables(tokens, {});
    expect(built).toBe(0);
    tables.get('dark');
    const afterFirst = built;
    expect(afterFirst).toBeGreaterThan(0);
    tables.get('dark');
    expect(built).toBe(afterFirst);
  });

  it('matches resolveTokens and handles missing tokens', () => {
    const tables = createTokenTables(AXES_TOKENS, { sans: 'Inter' });
    expect(tables.get({ theme: 'dark', density: 'roomy' })).toEqual(
      resolveTokens(AXES_TOKENS, { sans: 'Inter' }, { theme: 'dark', density: 'roomy' }),
    );
    expect(createTokenTables(undefined, {}).get('dark')).toEqual(
      resolveTokens(undefined, {}),
    );
  });

  it('selectionKey is the sorted effective entries', () => {
    expect(selectionKey(AXES_TOKENS, { theme: 'dark' })).toBe(
      'density=compact\ntheme=dark',
    );
    expect(selectionKey(AXES_TOKENS, 'dark')).toBe(
      selectionKey(AXES_TOKENS, { density: 'compact', theme: 'dark' }),
    );
    expect(selectionKey(undefined, 'dark')).toBe('');
  });
});

describe('a tokens.axes library draws with its tokens', () => {
  const texts = packageTexts();
  const read = (path: string) => texts.get(path) ?? undefined;
  const spec = {
    ...testSpec(),
    tokens: {
      axes: { theme: ['light', 'dark'] },
      values: { primary: { $axis: 'theme', light: '#111111', dark: '#222222' } },
    },
  };
  const component = [...loadSpecComponents(spec, SPEC_FILE, 1, read).byType.values()][0]!;

  it('the component shares one table cache', () => {
    expect(component.tokenTables).toBeDefined();
    expect('resolvedTokensByMode' in component).toBe(false);
    expect(component.resolvedTokens?.primary).toBe('#111111');
  });

  it('componentForDrawing picks the table of the stored string', () => {
    const p = sampleProject();
    const light = componentForDrawing(p, component, null);
    expect(light.tokens?.primary).toBe('#111111');
    const dark = componentForDrawing(setProjectDrawingMode(p, 'dark'), component, null);
    expect(dark.tokens?.primary).toBe('#222222');
    expect(
      componentForDrawing(setProjectDrawingMode(p, 'dark'), component, null).tokens,
    ).toBe(dark.tokens);
  });

  it('withHostTokens takes a string or a map', () => {
    const lib = loadLibrary([
      {
        path: 'l.spec.json',
        text: JSON.stringify({
          format: 'mapping-spec',
          formatVersion: 23,
          id: 'l',
          name: 'L',
          version: 1,
          tokens: spec.tokens,
          layers: [
            {
              id: 'a',
              name: 'A',
              color: '#112233',
              annotationTypes: [{ id: 't', name: 'T', component: 'c.json', fields: [] }],
            },
          ],
        }),
      },
      {
        path: 'c.json',
        text: JSON.stringify({
          format: 'mapping-component',
          formatVersion: 4,
          id: 'c',
          name: 'C',
          size: { width: 10, height: 10 },
          template: { type: 'frame' },
        }),
      },
    ]);
    const dark = withHostTokens(lib, {}, { theme: 'dark' });
    const viaString = withHostTokens(lib, {}, 'dark');
    const type = (l: typeof lib) => l.types.find((t) => t.component !== undefined);
    expect(type(dark)?.component?.resolvedTokens?.primary).toBe('#222222');
    expect(type(viaString)?.component?.resolvedTokens?.primary).toBe('#222222');
  });
});

describe('drawingModesOf with axes', () => {
  it('lists the entries of every axis, deduped, in order', () => {
    expect(
      drawingModesOf([
        { axes: { theme: ['light', 'dark'], density: ['compact', 'light'] } },
        { modes: ['dark', 'sepia'] },
        undefined,
      ]),
    ).toEqual(['light', 'dark', 'compact', 'sepia']);
  });

  it('still lists modes', () => {
    expect(drawingModesOf([{ modes: ['a', 'b'] }])).toEqual(['a', 'b']);
  });
});

describe('the drawing proof runs one pass per entry of each axis', () => {
  const SPEC_PATH = 'm.spec.json';
  const component = (): Raw => ({
    format: 'mapping-component',
    formatVersion: 4,
    id: 'm',
    name: 'M',
    size: { width: 100, height: 50 },
    template: {
      type: 'frame',
      layout: { type: 'row', align: 'center' },
      children: [
        {
          type: 'text',
          name: 'label',
          text: 'Hello world',
          font: {
            family: 'Roboto',
            size: { $token: 'size' },
            weight: 400,
            lineHeight: 20,
          },
          color: '#000000',
        },
      ],
    },
  });
  const warnings = (tokens: unknown): string[] =>
    validateLibrary({
      specPath: SPEC_PATH,
      level: 3,
      files: [
        {
          path: SPEC_PATH,
          text: JSON.stringify({
            format: 'mapping-spec',
            formatVersion: 23,
            id: 'm',
            name: 'M',
            version: 1,
            tokens,
            layers: [
              {
                id: 'l',
                name: 'L',
                color: '#112233',
                annotationTypes: [
                  { id: 't', name: 'T', component: 'components/m.json', fields: [] },
                ],
              },
            ],
          }),
        },
        { path: 'components/m.json', text: JSON.stringify(component()) },
      ],
    }).warnings.map((w) => w.message);

  it('a 2x2 library proves 4 passes and cites theme=dark', () => {
    const out = warnings({
      axes: { theme: ['light', 'dark'], density: ['compact', 'roomy'] },
      values: {
        size: { $axis: 'theme', light: 10, dark: 20 },
      },
    });
    expect(out.some((m) => m.includes('theme=dark'))).toBe(true);
    expect(out.some((m) => m.includes('theme=light'))).toBe(false);
    // The warning appears once (theme=dark), the density passes use the default theme (fits).
    expect(out).toHaveLength(1);
  });

  it('every entry is a pass: a density entry that overflows is cited', () => {
    const out = warnings({
      axes: { theme: ['light', 'dark'], density: ['compact', 'roomy'] },
      values: { size: { $axis: 'density', compact: 10, roomy: 20 } },
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('density=roomy');
  });

  it('a modes library keeps "mode light/dark"', () => {
    const out = warnings({
      modes: ['light', 'dark'],
      values: { size: { light: 10, dark: 20 } },
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('mode dark');
  });
});
