import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_CATALOG,
  addAnnotation,
  addLayer,
  addTypedAnnotation,
  componentMinSize,
  componentPaths,
  createMarking,
  loadSpecComponents,
  markingComponent,
  markingTypeName,
  modelMessage,
  parseSpecText,
  setFieldValue,
  type ComponentCatalog,
  type Spec,
} from '../../src/model';
import {
  COMPONENTS,
  SPEC_FILE,
  SPEC_ID,
  componentProject,
  testCatalog,
  testSpec,
} from './componentFixtures';

describe('componentPaths', () => {
  it('resolves the component of each type against the specialization file, without repetition', () => {
    const paths = componentPaths(testSpec(), SPEC_FILE);
    expect(paths).toHaveLength(Object.keys(COMPONENTS).length);
    expect(paths[0]).toBe('specs/test/components/text.json');
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('the Material 3 example: specs/material3/material3.spec.json + components/m3-chip.json', () => {
    const spec = loadMaterial3();
    const paths = componentPaths(spec, 'specs/material3/material3.spec.json');
    expect(paths).toContain('specs/material3/components/m3-chip.json');
    expect(paths).toHaveLength(15);
  });

  it('a type without a component is left out', () => {
    const spec = testSpec();
    expect(componentPaths(spec, SPEC_FILE).some((p) => p.includes('plain'))).toBe(false);
  });
});

function loadMaterial3(): Spec {
  const text = readFileSync(
    join(process.cwd(), 'tests/fixtures/material3/material3.spec.json'),
    'utf8',
  );
  const parsed = parseSpecText(text);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.spec;
}

describe('loadSpecComponents', () => {
  const read = (overrides: Record<string, string | undefined>) => (path: string) => {
    if (path in overrides) return overrides[path];
    const id = /components\/(.+)\.json$/.exec(path)?.[1];
    return id && COMPONENTS[id] ? JSON.stringify(COMPONENTS[id]) : undefined;
  };

  it('loads all the valid components', () => {
    const loaded = loadSpecComponents(testSpec(), SPEC_FILE, 1, read({}));
    expect(loaded.specId).toBe(SPEC_ID);
    expect(loaded.version).toBe(1);
    expect(loaded.problems).toEqual([]);
    expect([...loaded.byType.keys()]).toEqual(Object.keys(COMPONENTS));
  });

  it('a missing file, invalid JSON and an invalid component become "type: reason"', () => {
    const loaded = loadSpecComponents(
      testSpec(),
      SPEC_FILE,
      1,
      read({
        'specs/test/components/text.json': undefined,
        'specs/test/components/wide.json': '{ not json',
        'specs/test/components/row.json': JSON.stringify({ format: 'other' }),
      }),
    );
    expect(loaded.byType.has('text')).toBe(false);
    expect(loaded.byType.has('wide')).toBe(false);
    expect(loaded.byType.has('row')).toBe(false);
    expect(loaded.byType.has('box')).toBe(true);
    expect(loaded.problems).toHaveLength(3);
    expect(loaded.problems[0]).toBe(
      'text: missing file (specs/test/components/text.json)',
    );
    expect(loaded.problems[1]).toMatch(/^wide: invalid JSON/);
    expect(loaded.problems[2]).toMatch(/^row: .+/);
    // The same problems with code and parameters (#945): same size and order.
    expect(loaded.problemMessages.map((m) => m.text)).toEqual(loaded.problems);
    expect(loaded.problemMessages[0]).toEqual(
      modelMessage(
        'components.fileMissing',
        { typeId: 'text', path: 'specs/test/components/text.json' },
        'text: missing file (specs/test/components/text.json)',
      ),
    );
    expect(loaded.problemMessages[1]).toMatchObject({
      code: 'components.invalid',
      params: { typeId: 'wide' },
    });
  });

  it('problemMessages has the size and order of problems (icons and paths aside)', () => {
    const spec = { ...testSpec(), icons: 'icons.json' };
    const loaded = loadSpecComponents(
      spec,
      SPEC_FILE,
      1,
      read({ 'specs/test/components/text.json': undefined }),
    );
    expect(loaded.problems.length).toBeGreaterThan(1);
    expect(loaded.problemMessages.map((m) => m.text)).toEqual(loaded.problems);
    expect(loaded.problemMessages.some((m) => m.code === 'icons.fileMissing')).toBe(true);
  });

  it('specialization v1 to v3 does not load a component', () => {
    const spec = { ...testSpec(), formatVersion: 3 as const };
    const loaded = loadSpecComponents(spec, SPEC_FILE, 1, read({}));
    expect(loaded.byType.size).toBe(0);
    expect(loaded.problems).toEqual([]);
  });

  it('the whole Material 3 loads from disk, without problems', () => {
    const root = join(process.cwd(), 'tests/fixtures/material3');
    const loaded = loadSpecComponents(
      loadMaterial3(),
      'specs/material3/material3.spec.json',
      1,
      (path) => {
        try {
          return readFileSync(join(root, path.replace('specs/material3/', '')), 'utf8');
        } catch {
          return undefined;
        }
      },
    );
    expect(loaded.problems).toEqual([]);
    expect(loaded.byType.size).toBe(15);
  });
});

describe('markingComponent and componentMinSize', () => {
  function withMarking() {
    let p = componentProject();
    p = createMarking(p, {
      id: 'M1',
      containerId: 'I1',
      rect: { x: 10, y: 10, width: 200, height: 100 },
    });
    return p;
  }

  it('a marking without an annotation, or with a plain annotation, has no component', () => {
    const p = withMarking();
    expect(markingComponent(p, testCatalog(), 'M1')).toBeNull();
    expect(componentMinSize(p, testCatalog(), 'M1')).toBeNull();
    const plain = addTypedAnnotation(p, {
      id: 'A0',
      markingId: 'M1',
      layerId: 'LS2',
      type: { specId: SPEC_ID, typeId: 'plain' },
    });
    expect(markingComponent(plain, testCatalog(), 'M1')).toBeNull();
  });

  it('the first typed annotation with a component draws (in annotations order)', () => {
    let p = withMarking();
    const typed = (id: string, typeId: string) => {
      p = addTypedAnnotation(p, {
        id,
        markingId: 'M1',
        layerId: 'LS1',
        type: { specId: SPEC_ID, typeId },
      });
    };
    typed('A1', 'row');
    typed('A2', 'text');
    const found = markingComponent(p, testCatalog(), 'M1');
    expect(found?.annotation.id).toBe('A1');
    expect(found?.typeId).toBe('row');
    expect(found?.type.name).toBe('Type row');
    expect(found?.component.id).toBe('row');
    expect(componentMinSize(p, testCatalog(), 'M1')).toEqual({ width: 50, height: 30 });
  });

  it('a component without minSize returns 1×1 (the minimum for anything that has a component)', () => {
    let p = withMarking();
    p = addTypedAnnotation(p, {
      id: 'A1',
      markingId: 'M1',
      layerId: 'LS1',
      type: { specId: SPEC_ID, typeId: 'box' },
    });
    expect(markingComponent(p, testCatalog(), 'M1')?.typeId).toBe('box');
    expect(componentMinSize(p, testCatalog(), 'M1')).toEqual({ width: 1, height: 1 });
  });

  it('skips the annotation whose type has no component and uses the next one', () => {
    let p = withMarking();
    p = addTypedAnnotation(p, {
      id: 'A1',
      markingId: 'M1',
      layerId: 'LS2',
      type: { specId: SPEC_ID, typeId: 'plain' },
    });
    p = addTypedAnnotation(p, {
      id: 'A2',
      markingId: 'M1',
      layerId: 'LS1',
      type: { specId: SPEC_ID, typeId: 'text' },
    });
    expect(markingComponent(p, testCatalog(), 'M1')?.annotation.id).toBe('A2');
  });

  it('catalog version different from the applied one, or empty catalog: plain marking', () => {
    let p = withMarking();
    p = addTypedAnnotation(p, {
      id: 'A1',
      markingId: 'M1',
      layerId: 'LS1',
      type: { specId: SPEC_ID, typeId: 'text' },
    });
    const old = testCatalog();
    const stale: ComponentCatalog = new Map([
      [SPEC_ID, { ...old.get(SPEC_ID)!, version: 0 }],
    ]);
    expect(markingComponent(p, stale, 'M1')).toBeNull();
    expect(markingComponent(p, EMPTY_CATALOG, 'M1')).toBeNull();
    expect(markingComponent(p, testCatalog(), 'M1')).not.toBeNull();
  });

  it('changes when the annotation changes values (it is still the same annotation)', () => {
    let p = withMarking();
    p = addTypedAnnotation(p, {
      id: 'A1',
      markingId: 'M1',
      layerId: 'LS1',
      type: { specId: SPEC_ID, typeId: 'text' },
    });
    p = setFieldValue(p, 'A1', 'label', 'New');
    expect(markingComponent(p, testCatalog(), 'M1')?.annotation.values?.label).toBe(
      'New',
    );
  });
});

describe('markingTypeName', () => {
  function withMarking() {
    return createMarking(componentProject(), {
      id: 'M1',
      containerId: 'I1',
      rect: { x: 10, y: 10, width: 200, height: 100 },
    });
  }
  const typed = (
    p: ReturnType<typeof withMarking>,
    id: string,
    typeId: string,
    layerId = 'LS1',
  ) =>
    addTypedAnnotation(p, {
      id,
      markingId: 'M1',
      layerId,
      type: { specId: SPEC_ID, typeId },
    });

  it('a marking without an annotation, or with a plain annotation, has no type name', () => {
    const p = withMarking();
    expect(markingTypeName(p, 'M1')).toBeNull();
    expect(markingTypeName(p, 'nonexistent')).toBeNull();
    const free = addLayer(p, { id: 'LF', name: 'Free', color: '#336699' });
    const common = addAnnotation(free, { id: 'A0', markingId: 'M1', layerId: 'LF' });
    expect(markingTypeName(common, 'M1')).toBeNull();
  });

  it('a type with a component gives the name, without needing the catalog', () => {
    const p = typed(withMarking(), 'A1', 'text');
    expect(markingTypeName(p, 'M1')).toBe('Type text');
  });

  it('the first annotation with a component wins, in annotations order', () => {
    let p = withMarking();
    p = typed(p, 'A1', 'row');
    p = typed(p, 'A2', 'text');
    expect(markingTypeName(p, 'M1')).toBe('Type row');
  });

  it('a type without a component gives no name; skips to the next one', () => {
    let p = withMarking();
    p = typed(p, 'A1', 'plain', 'LS2');
    expect(markingTypeName(p, 'M1')).toBeNull();
    p = typed(p, 'A2', 'text');
    expect(markingTypeName(p, 'M1')).toBe('Type text');
  });
});
