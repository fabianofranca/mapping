import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_CATALOG,
  addTypedAnnotation,
  componentMinSize,
  componentPaths,
  createMarking,
  loadSpecComponents,
  markingComponent,
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
  it('resolve o component de cada tipo contra o arquivo da especialização, sem repetição', () => {
    const paths = componentPaths(testSpec(), SPEC_FILE);
    expect(paths).toHaveLength(Object.keys(COMPONENTS).length);
    expect(paths[0]).toBe('specs/test/components/text.json');
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('o exemplo do Material 3: specs/material3/material3.spec.json + components/m3-chip.json', () => {
    const spec = loadMaterial3();
    const paths = componentPaths(spec, 'specs/material3/material3.spec.json');
    expect(paths).toContain('specs/material3/components/m3-chip.json');
    expect(paths).toHaveLength(15);
  });

  it('tipo sem component não entra', () => {
    const spec = testSpec();
    expect(componentPaths(spec, SPEC_FILE).some((p) => p.includes('plain'))).toBe(false);
  });
});

function loadMaterial3(): Spec {
  const text = readFileSync(
    join(process.cwd(), 'examples/libraries/material3/material3.spec.json'),
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

  it('carrega todos os componentes válidos', () => {
    const loaded = loadSpecComponents(testSpec(), SPEC_FILE, 1, read({}));
    expect(loaded.specId).toBe(SPEC_ID);
    expect(loaded.version).toBe(1);
    expect(loaded.problems).toEqual([]);
    expect([...loaded.byType.keys()]).toEqual(Object.keys(COMPONENTS));
  });

  it('arquivo ausente, JSON inválido e componente inválido viram "tipo: motivo"', () => {
    const loaded = loadSpecComponents(
      testSpec(),
      SPEC_FILE,
      1,
      read({
        'specs/test/components/text.json': undefined,
        'specs/test/components/wide.json': '{ não é json',
        'specs/test/components/row.json': JSON.stringify({ format: 'outro' }),
      }),
    );
    expect(loaded.byType.has('text')).toBe(false);
    expect(loaded.byType.has('wide')).toBe(false);
    expect(loaded.byType.has('row')).toBe(false);
    expect(loaded.byType.has('box')).toBe(true);
    expect(loaded.problems).toHaveLength(3);
    expect(loaded.problems[0]).toBe(
      'text: arquivo ausente (specs/test/components/text.json)',
    );
    expect(loaded.problems[1]).toMatch(/^wide: JSON inválido/);
    expect(loaded.problems[2]).toMatch(/^row: .+/);
  });

  it('especialização v1 a v3 não carrega componente', () => {
    const spec = { ...testSpec(), formatVersion: 3 as const };
    const loaded = loadSpecComponents(spec, SPEC_FILE, 1, read({}));
    expect(loaded.byType.size).toBe(0);
    expect(loaded.problems).toEqual([]);
  });

  it('o Material 3 inteiro carrega do disco, sem problemas', () => {
    const root = join(process.cwd(), 'examples/libraries/material3');
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

describe('markingComponent e componentMinSize', () => {
  function withMarking() {
    let p = componentProject();
    p = createMarking(p, {
      id: 'M1',
      imageId: 'I1',
      rect: { x: 10, y: 10, width: 200, height: 100 },
    });
    return p;
  }

  it('marcação sem anotação, ou com anotação comum, não tem componente', () => {
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

  it('a primeira anotação tipada com componente desenha (na ordem de annotations)', () => {
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
    expect(found?.type.name).toBe('Tipo row');
    expect(found?.component.id).toBe('row');
    expect(componentMinSize(p, testCatalog(), 'M1')).toEqual({ width: 50, height: 30 });
  });

  it('componente sem minSize devolve null', () => {
    let p = withMarking();
    p = addTypedAnnotation(p, {
      id: 'A1',
      markingId: 'M1',
      layerId: 'LS1',
      type: { specId: SPEC_ID, typeId: 'box' },
    });
    expect(markingComponent(p, testCatalog(), 'M1')?.typeId).toBe('box');
    expect(componentMinSize(p, testCatalog(), 'M1')).toBeNull();
  });

  it('pula a anotação cujo tipo não tem componente e usa a seguinte', () => {
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

  it('anotação herdada de um pai não desenha a filha', () => {
    let p = withMarking();
    p = createMarking(p, {
      id: 'M2',
      imageId: 'I1',
      rect: { x: 20, y: 20, width: 100, height: 40 },
    });
    p = addTypedAnnotation(p, {
      id: 'A1',
      markingId: 'M1',
      layerId: 'LS1',
      type: { specId: SPEC_ID, typeId: 'text' },
    });
    p = {
      ...p,
      annotations: p.annotations.map((a) => ({ ...a, inherit: true })),
    };
    expect(markingComponent(p, testCatalog(), 'M2')).toBeNull();
  });

  it('versão do catálogo diferente da aplicada, ou catálogo vazio: marcação comum', () => {
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

  it('muda quando a anotação muda de valores (continua a mesma anotação)', () => {
    let p = withMarking();
    p = addTypedAnnotation(p, {
      id: 'A1',
      markingId: 'M1',
      layerId: 'LS1',
      type: { specId: SPEC_ID, typeId: 'text' },
    });
    p = setFieldValue(p, 'A1', 'label', 'Novo');
    expect(markingComponent(p, testCatalog(), 'M1')?.annotation.values?.label).toBe(
      'Novo',
    );
  });
});
