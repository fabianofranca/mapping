// Example touch-targets library (`examples/libraries/touch-targets/`, stage #2913, OV3): the package
// validates without errors, its only warnings are the intended overflows, the list item's `hug`
// height is the padded body's and a 48 child in the 40 high slot raises no `component-overflow`.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { measureComponent } from '../../src/model/components/instantiate';
import { parseComponent } from '../../src/model/components/parseComponent';
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
import { validateLibrary } from '../../src/model/library';
import { emptyProject } from '../model/fixtures';

const ROOT = join(__dirname, '../../examples/libraries/touch-targets');
const SPEC_FILE = 'touch-targets.spec.json';

function listDisk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? listDisk(join(dir, e.name))
      : [relative(ROOT, join(dir, e.name)).split('\\').join('/')],
  );
}

const files = listDisk(ROOT)
  .sort()
  .map((path) => ({ path, text: readFileSync(join(ROOT, path), 'utf8') }));

const text = (path: string): string => files.find((f) => f.path === path)?.text ?? '';

describe('example touch-targets library', () => {
  it('has the specialization, three components and three documents', () => {
    expect(files.map((f) => f.path)).toEqual(
      [
        SPEC_FILE,
        'components/list-item.json',
        'components/top-bar.json',
        'components/touch-row.json',
        'docs/list-item.md',
        'docs/top-bar.md',
        'docs/touch-row.md',
      ].sort(),
    );
  });

  it('validates without errors; the only warnings are the intended overflows', () => {
    const report = validateLibrary({ files, specPath: SPEC_FILE });
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.warnings.map((w) => [w.file, w.message])).toEqual([
      [
        'components/top-bar.json',
        'type "top-bar", the preview, initial size 360×44: overflow intended: bar (approximate)',
      ],
      [
        SPEC_FILE,
        'type "top-bar", the example "Default", initial size 360×44: overflow intended: bar (approximate)',
      ],
      [
        'components/list-item.json',
        'type "list-item", the preview, initial size 360×72: overflow intended: trailing (approximate)',
      ],
      [
        SPEC_FILE,
        'type "list-item", the example "Default", initial size 360×72: overflow intended: trailing (approximate)',
      ],
    ]);
  });
});

function component(path: string, edit?: (c: Record<string, unknown>) => void) {
  const json = JSON.parse(text(path)) as Record<string, unknown>;
  edit?.(json);
  const parsed = parseComponent(json);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed));
  return parsed.component;
}

const hugHeight = (c: ReturnType<typeof component>): number =>
  measureComponent(c, {}, { width: 360, height: null }, { measure: approximateMeasurer })
    .height;

describe('the list item', () => {
  it('hugs the padded body: the state layer does not grow it', () => {
    // 16 + title 20 + supporting 20 + 16.
    expect(hugHeight(component('components/list-item.json'))).toBe(72);
    const without = component('components/list-item.json', (c) => {
      const template = c.template as { children: { name: string }[] };
      template.children = template.children.filter((n) => n.name !== 'state layer');
    });
    expect(hugHeight(without)).toBe(72);
  });
});

const SPEC_ID = 'touch-targets';

function catalog(touchRow: (c: Record<string, unknown>) => void = () => undefined) {
  const parsed = parseSpec(JSON.parse(text(SPEC_FILE)));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  const texts = new Map(
    ['top-bar', 'list-item', 'touch-row'].map((id) => {
      const json = JSON.parse(text(`components/${id}.json`)) as Record<string, unknown>;
      if (id === 'touch-row') touchRow(json);
      return [`specs/${SPEC_ID}/components/${id}.json`, JSON.stringify(json)];
    }),
  );
  const loaded = loadSpecComponents(
    parsed.spec,
    `specs/${SPEC_ID}/${SPEC_FILE}`,
    1,
    (path) => texts.get(path),
  );
  if (loaded.problems.length > 0) throw new Error(loaded.problems.join('\n'));
  let n = 0;
  const project = applySpecialization(emptyProject(), parsed.spec, {
    newId: () => `LS${++n}`,
    packageSpecName: SPEC_FILE,
  });
  return {
    cat: new Map([[SPEC_ID, loaded]]) as ComponentCatalog,
    project: addContainer(project, {
      id: 'I1',
      file: 'images/s.png',
      width: 1000,
      height: 800,
    }),
  };
}

function add(
  p: Project,
  cat: ComponentCatalog,
  id: string,
  typeId: string,
  extra: Partial<NewComponentArgs>,
) {
  return addComponentMarking(
    p,
    cat,
    {
      markingId: id,
      annotationId: `A_${id}`,
      containerId: 'I1',
      parentId: null,
      specId: SPEC_ID,
      typeId,
      ...extra,
    },
    approximateMeasurer,
  );
}

function rowWithTallChild(touchRow?: (c: Record<string, unknown>) => void) {
  const { cat, project } = catalog(touchRow);
  let p = add(project, cat, 'R', 'touch-row', {
    rect: { x: 0, y: 0, width: 320, height: 56 },
  });
  p = add(p, cat, 'K', 'touch-row', {
    parentId: 'R',
    slot: 'actions',
    rect: { x: 8, y: 2, width: 48, height: 48 },
  });
  return createDrawingCache()(p, cat, approximateMeasurer, 0).get('R');
}

describe('the touch row', () => {
  it('a 48 child in the 40 high slot raises no component-overflow', () => {
    const drawing = rowWithTallChild();
    expect(drawing?.overflow).toBe(false);
    expect(drawing?.shortfalls).toEqual({});
  });

  it('without childOverflow the same child does', () => {
    const drawing = rowWithTallChild((c) => {
      const template = c.template as { children: Record<string, unknown>[] };
      for (const n of template.children) delete n.childOverflow;
    });
    expect(drawing?.overflow).toBe(true);
  });
});
