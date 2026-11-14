import JSZip from 'jszip';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  addComponentMarking,
  addContainer,
  addTableRow,
  applySpecialization,
  approximateMeasurer,
  createProject,
  loadSpecComponents,
  parseSpec,
  serialize,
  setFieldValue,
  setTableCell,
  specFiles,
  type ComponentCatalog,
  type Project,
  type Spec,
} from '../../src/model';
import { solidPng } from './png';

// Text-field Suggestions stage: the "Kotlin Suggestions" project (Kotlin library applied and
// two data classes) for script R14 of `docs/TESTING.md`. The zip comes from here
// (`scripts/suggestionsKotlin.mjs`) and the test `tests/examples/suggestionsKotlin.test.ts`
// checks that `examples/suggestions-kotlin.zip` is up to date.

export const PACKAGE_DIR = 'libraries/kotlin';
export const NOW = '2026-10-28T12:00:00.000Z';
/** Fixed date on the zip entries: the same content always generates the same bytes. */
const ENTRY_DATE = new Date('2026-10-28T00:00:00Z');
export const IMAGE_FILE = 'images/screens.png';
export const NAMES = { user: 'User', address: 'Address' } as const;
export const ANNOTATION_IDS = { user: 'A_USER', address: 'A_ADDRESS' } as const;

/** All text files of the Kotlin package (relative path → text), sorted. */
export function packageTexts(): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else
        out.set(
          relative(PACKAGE_DIR, full).split('\\').join('/'),
          readFileSync(full, 'utf8'),
        );
    }
  };
  walk(PACKAGE_DIR);
  return out;
}

export function loadKotlinSpec(): Spec {
  const parsed = parseSpec(
    JSON.parse(readFileSync(join(PACKAGE_DIR, 'kotlin.spec.json'), 'utf8')),
  );
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.spec;
}

const PROPERTIES: Record<
  string,
  readonly { name: string; type: string | null; mutability?: string }[]
> = {
  user: [
    { name: 'id', type: 'Long' },
    { name: 'name', type: 'String' },
    { name: 'email', type: 'String?' },
    { name: 'address', type: 'Address' },
    // Empty type: script R14 fills it in.
    { name: 'active', type: null },
  ],
  address: [
    { name: 'street', type: 'String' },
    { name: 'city', type: 'String' },
  ],
};

/** The project: image, applied Kotlin library and the data classes `User` and `Address`. */
export function project(): Project {
  const spec = loadKotlinSpec();
  const texts = packageTexts();
  let n = 0;
  let p = createProject({
    id: '00000000-0000-4000-8000-000000000e2e',
    name: 'Kotlin Suggestions',
    now: NOW,
    firstLayer: { id: 'L1', name: 'Notes', color: '#1e88e5' },
  });
  p = applySpecialization(p, spec, {
    newId: () => `LS${++n}`,
    packageSpecName: 'kotlin.spec.json',
  });
  p = addContainer(p, { id: 'C1', file: IMAGE_FILE, width: 800, height: 600 });
  const catalog: ComponentCatalog = new Map([
    [
      spec.id,
      loadSpecComponents(
        spec,
        `specs/${spec.id}/kotlin.spec.json`,
        spec.version,
        (path) => texts.get(path.replace(`specs/${spec.id}/`, '')),
      ),
    ],
  ]);
  for (const [key, name, markingId, x, y] of [
    ['user', NAMES.user, 'M_USER', 220, 300],
    ['address', NAMES.address, 'M_ADDRESS', 580, 300],
  ] as const) {
    const annotationId = ANNOTATION_IDS[key];
    p = addComponentMarking(
      p,
      catalog,
      {
        markingId,
        annotationId,
        containerId: 'C1',
        parentId: null,
        specId: 'kotlin',
        typeId: 'data-class',
        center: { x, y },
      },
      approximateMeasurer,
    );
    p = setFieldValue(p, annotationId, 'name', name);
    PROPERTIES[key]?.forEach((row, i) => {
      const rowId = `${key}-p${i + 1}`;
      p = addTableRow(p, annotationId, 'properties', rowId);
      p = setTableCell(p, annotationId, 'properties', rowId, 'name', row.name);
      if (row.type !== null) {
        p = setTableCell(p, annotationId, 'properties', rowId, 'type', row.type);
      }
    });
  }
  return p;
}

/** The zip files: `mapping.json`, `specs/` with the Kotlin package and the image. */
export function files(): Map<string, string | Buffer> {
  const out = new Map<string, string | Buffer>();
  const p = project();
  out.set('mapping.json', serialize(p));
  for (const [path, text] of specFiles(p)) out.set(path, text);
  for (const [path, text] of packageTexts()) {
    const target = `specs/kotlin/${path}`;
    if (!out.has(target)) out.set(target, text);
  }
  out.set(IMAGE_FILE, solidPng(800, 600, [245, 245, 250]));
  return out;
}

/** The bytes of `examples/suggestions-kotlin.zip` (deterministic). */
export async function suggestionsZip(): Promise<Buffer> {
  const all = files();
  const zip = new JSZip();
  for (const path of [...all.keys()].sort()) {
    zip.file(path, all.get(path) ?? '', {
      createFolders: false,
      date: ENTRY_DATE,
    });
  }
  return zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' });
}
