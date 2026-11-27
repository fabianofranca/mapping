// Stage #2489, CF1: two specializations declare the same computed `window` set with different
// thresholds (the CX fixture: below 600 / 840; `tests/fixtures/container-conflict/`: below 500). A
// component's `$container.window` and the `outside-container-class` item both read the set of the
// type's own specialization (decision 4 of #1901), not the merged one (first declaration wins).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  addContainer,
  applySpecialization,
  approximateMeasurer,
  createDrawingCache,
  effectiveContainerClasses,
  getAnnotationIssues,
  loadSpecComponents,
  type ComponentCatalog,
  type Project,
} from '../../src/model';
import { validateLibrary, type LibraryFile } from '../../src/model/library';
import { parseSpecText } from '../../src/model/spec';
import { walk } from '../../src/model/components/scene';
import { cxCatalog, cxProject } from './containerContextFixtures';

const DIR = 'tests/fixtures/container-conflict';
const SPEC = 'container-conflict.spec.json';
const SPEC_ID = 'container-conflict';
const SPEC_FILE = `specs/${SPEC_ID}/${SPEC}`;

const read = (path: string): string => readFileSync(join(DIR, path), 'utf8');

function pack(): LibraryFile[] {
  const components = readdirSync(join(DIR, 'components')).map((name) => ({
    path: `components/${name}`,
    text: read(`components/${name}`),
  }));
  return [{ path: SPEC, text: read(SPEC) }, ...components];
}

function conflictSpec() {
  const parsed = parseSpecText(read(SPEC));
  if (!parsed.ok) throw new Error(JSON.stringify(parsed));
  return parsed.spec;
}

function catalog(): ComponentCatalog {
  const loaded = loadSpecComponents(conflictSpec(), SPEC_FILE, 1, (path) =>
    path.startsWith(`specs/${SPEC_ID}/`)
      ? read(path.slice(`specs/${SPEC_ID}/`.length))
      : undefined,
  );
  if (loaded.problems.length > 0) throw new Error(loaded.problems.join('\n'));
  return new Map([...cxCatalog(), [SPEC_ID, loaded]]);
}

/** The CX fixture applied first, the conflict library second; one container of `width` px (density 1). */
function project(width: number): Project {
  let p = applySpecialization(cxProject(), conflictSpec(), {
    newId: (() => {
      let n = 0;
      return () => `LC${++n}`;
    })(),
    packageSpecName: SPEC,
  });
  p = addContainer(p, { id: 'W1', file: 'images/w.png', width, height: 800 });
  p = addComponentMarking(
    p,
    catalog(),
    {
      markingId: 'M1',
      annotationId: 'A1',
      containerId: 'W1',
      parentId: null,
      specId: SPEC_ID,
      typeId: 'conflict-card',
      rect: { x: 10, y: 10, width: 120, height: 48 },
    },
    approximateMeasurer,
  );
  return p;
}

function fillOf(p: Project): string | undefined {
  const drawing = createDrawingCache()(p, catalog(), approximateMeasurer, 0).get('M1');
  const node = [...walk(drawing!.root)].find((n) => n.name === 'background');
  const fill = node !== undefined && 'fills' in node ? node.fills[0] : undefined;
  return fill?.type === 'solid' ? fill.color.toUpperCase() : undefined;
}

const outside = (p: Project) =>
  getAnnotationIssues(p, 'A1').filter((i) => i.code === 'outside-container-class');

describe('container conflict library', () => {
  it('passes validate_library with no errors', () => {
    const report = validateLibrary({ files: pack() });
    expect(report.errors.map((i) => `${i.file} ${i.path}: ${i.message}`)).toEqual([]);
    expect(report.ok).toBe(true);
  });
});

describe('two specializations declaring the same computed set', () => {
  it('the merged view keeps the first declaration (CX: 560 px is compact)', () => {
    expect(effectiveContainerClasses(project(560), 'W1')).toEqual({ window: 'compact' });
  });

  it('560 px: the drawing reads the type’s own set (wide) and so does the pending item', () => {
    const p = project(560);
    expect(fillOf(p)).toBe('#1976D2');
    expect(outside(p)).toEqual([
      {
        code: 'outside-container-class',
        set: { id: 'window', name: 'Window' },
        class: { id: 'wide', name: 'Wide' },
        allowed: [{ id: 'narrow', name: 'Narrow' }],
      },
    ]);
  });

  it('412 px: narrow in the drawing and no item', () => {
    const p = project(412);
    expect(fillOf(p)).toBe('#D32F2F');
    expect(outside(p)).toEqual([]);
  });
});
