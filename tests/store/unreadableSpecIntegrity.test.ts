// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addTableRow,
  addTypedAnnotation,
  applySpecialization,
  serialize,
  serializeSpec,
  setFieldValue,
  setTableCell,
  type Project,
  type Spec,
} from '../../src/model';
import { AUTOSAVE_DELAY_MS } from '../../src/storage/autosave';
import { createFolderStorage } from '../../src/storage/folder';
import { loadProject } from '../../src/storage/loadProject';
import { openLocalLibrary } from '../../src/storage/local';
import { openSession, type ProjectSession } from '../../src/store/session';
import { readProjectZip, writeProjectZip } from '../../src/storage/zip';
import { clearReportedErrors } from '../../src/utils/report';
import { NOW, sampleProject } from '../model/fixtures';
import { idGen, layerOf, loadExample } from '../model/specFixtures';
import { MemoryDirectory } from '../storage/memoryFs';

// Material 3 Library stage, MD1, decision 4 (integrity): a project with a copy in
// `specs/` that the app does not read (here, `formatVersion` 99 with unknown keys, like `variants`
// in `code`) opens with the annotations of that specialization as "nonexistent type". Editing ANOTHER
// thing and saving through the session must preserve the values of those annotations, the reference in
// `specializations` and the copy file, byte by byte.

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  clearReportedErrors();
});

interface RawAnnotation {
  readonly id: string;
  readonly type: { readonly specId: string } | null;
}
interface RawMapping {
  readonly revision: number;
  readonly specializations: readonly { id: string; version: number; file: string }[];
  readonly layers: readonly { id: string; spec: { specId: string } | null }[];
  readonly markings: readonly { id: string }[];
  readonly annotations: readonly RawAnnotation[];
}

const parse = (text: string | null): RawMapping => JSON.parse(text ?? '') as RawMapping;

/** Annotations (raw, as they are in `mapping.json`) of the specialization `specId`. */
const rawOf = (m: RawMapping, specId: string) =>
  m.annotations.filter((a) => a.type?.specId === specId);

type Layout = 'flat' | 'package';

interface Fixture {
  readonly root: MemoryDirectory;
  /** The `mapping.json` as it is on disk before the session opens. */
  readonly mappingText: string;
  readonly project: Project;
  /** Path of the copy that the app does not read. */
  readonly futureFile: string;
  /** Exact text of that copy. */
  readonly futureText: string;
  /** The other files of the unreadable specialization package (empty in the `flat` layout). */
  readonly futureExtras: ReadonlyMap<string, string>;
  /** Text of the copy of the valid specialization (`modelo-dados`). */
  readonly validText: string;
  readonly validFile: string;
}

/**
 * Project with the SDUI-like `modelo-dados` (valid) and the `future` (unreadable), both with typed
 * annotations and values, plus the free annotations of `sampleProject`. The `future` is written with
 * `formatVersion` 99 and `variants` in `code`, which the app does not know.
 */
function fixture(layout: Layout): Fixture {
  const valid = loadExample('modelo-de-dados');
  // The same specialization with another id: two types `classe`/`endpoint` in distinct specIds.
  const future: Spec = { ...valid, id: 'future', name: 'Future', version: 3 };

  let p = sampleProject();
  p = applySpecialization(p, valid, { newId: idGen('LV') });
  p = applySpecialization(p, future, {
    newId: idGen('LF'),
    ...(layout === 'package' ? { packageSpecName: 'future.spec.json' } : {}),
  });

  const add = (
    id: string,
    markingId: string,
    specId: string,
    layer: string,
    typeId: string,
  ) => {
    p = addTypedAnnotation(p, {
      id,
      markingId,
      layerId: layerOf(p, specId, layer),
      type: { specId, typeId },
      parentAnnotationId: null,
    });
  };
  // Annotation of a valid type, which the person will edit.
  add('AV1', 'M2', 'modelo-dados', 'classes', 'classe');
  p = setFieldValue(p, 'AV1', 'nome', 'Valid');
  // Annotations of the unreadable specialization, which must not change.
  add('AF1', 'M1', 'future', 'classes', 'classe');
  p = setFieldValue(p, 'AF1', 'nome', 'Future');
  p = setFieldValue(p, 'AF1', 'descricao', 'Values that the app cannot interpret');
  p = setFieldValue(p, 'AF1', 'versao', 7);
  p = addTableRow(p, 'AF1', 'atributos', 'R1');
  p = setTableCell(p, 'AF1', 'atributos', 'R1', 'nome', 'id');
  p = setTableCell(p, 'AF1', 'atributos', 'R1', 'tipo', 'Long');
  add('AF2', 'M3', 'future', 'endpoints', 'endpoint');
  p = setFieldValue(p, 'AF2', 'metodo', 'POST');
  p = setFieldValue(p, 'AF2', 'path', '/future/{id}');
  p = setFieldValue(p, 'AF2', 'timeoutMs', 250);

  const project: Project = { ...p, revision: 5 };
  const mappingText = serialize(project);
  const refOf = (id: string) => {
    const s = project.specializations.find((x) => x.id === id);
    if (!s) throw new Error(`specialization ${id} without reference`);
    return s.file;
  };
  const validFile = refOf('modelo-dados');
  const futureFile = refOf('future');

  // The unreadable copy: formatVersion that the app does not support and unknown keys, in an order and
  // with a spacing that `serializeSpec` would not reproduce (to prove the "byte by byte").
  const futureJson = {
    ...future,
    formatVersion: 99,
    futureOnlyKey: { reserved: true },
    layers: future.layers.map((l) => ({
      ...l,
      annotationTypes: l.annotationTypes.map((t) => ({
        ...t,
        code: { symbol: 'Future', variants: { compose: { symbol: 'FutureCompose' } } },
      })),
    })),
  };
  const futureText = `${JSON.stringify(futureJson, null, 4)}\n\n`;
  const validText = serializeSpec(valid);

  const root = new MemoryDirectory('mapping');
  root.put('mapping.json', mappingText);
  root.put(validFile, validText);
  root.put(futureFile, futureText);
  const futureExtras = new Map<string, string>();
  if (layout === 'package') {
    const dir = futureFile.slice(0, futureFile.lastIndexOf('/'));
    futureExtras.set(
      `${dir}/components/classe.json`,
      '{"formatVersion":99,"nodes":[]}\n',
    );
    futureExtras.set(`${dir}/docs/classe.md`, '# Class\n\nDocument text.\n');
    for (const [path, text] of futureExtras) root.put(path, text);
  }
  return {
    root,
    mappingText,
    project,
    futureFile,
    futureText,
    futureExtras,
    validText,
    validFile,
  };
}

/** Opens like the app: `loadProject` and `openSession` with the text read. */
async function openLikeApp(root: MemoryDirectory) {
  const storage = createFolderStorage(root);
  const loaded = await loadProject(storage);
  if (!loaded.ok) throw new Error(`loadProject: ${loaded.error}`);
  const session = openSession({
    storage,
    project: loaded.project,
    readOnly: loaded.readOnly,
    loadedText: loaded.text,
    libraryIssues: loaded.libraryIssues,
    prepareImage: () => Promise.reject(new Error('no images here')),
    now: () => NOW,
  });
  return { loaded, session };
}

async function save(session: ProjectSession) {
  await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
  expect(session.saveStatus.value).toBe('saved');
}

/** Nothing that the write should touch: copies, package and annotations of the unreadable specialization. */
async function expectFutureIntact(f: Fixture) {
  expect(await f.root.read(f.futureFile)).toBe(f.futureText);
  expect(await f.root.read(f.validFile)).toBe(f.validText);
  for (const [path, text] of f.futureExtras) expect(await f.root.read(path)).toBe(text);

  const before = parse(f.mappingText);
  const after = parse(await f.root.read('mapping.json'));
  // Values, type, marking and layer of the annotations of the unreadable specialization.
  expect(rawOf(after, 'future')).toHaveLength(2);
  expect(rawOf(after, 'future')).toEqual(rawOf(before, 'future'));
  // The reference in `specializations` and the layers of the specialization.
  expect(after.specializations).toEqual(before.specializations);
  expect(after.layers.filter((l) => l.spec?.specId === 'future')).toEqual(
    before.layers.filter((l) => l.spec?.specId === 'future'),
  );
}

describe.each<Layout>(['flat', 'package'])(
  'copy of a specialization that the app does not read (%s)',
  (layout) => {
    let session: ProjectSession | null = null;
    afterEach(async () => {
      await session?.close();
      session = null;
    });

    it('opens without repair or migration, with the unreadable specialization having no spec', async () => {
      const f = fixture(layout);
      const { loaded, session: s } = await openLikeApp(f.root);
      session = s;

      // No inconsistency (repair) or migration; nothing was written just by opening.
      expect(loaded).toMatchObject({ ok: true, readOnly: false, migratedFrom: null });
      expect(loaded.ok && loaded.text).toBe(f.mappingText);
      expect(f.root.dirs.has('backups')).toBe(false);
      // The unreadable copy does not become a `Spec`; the valid one does.
      const specs = loaded.ok ? loaded.project.specializations : [];
      expect(specs.find((x) => x.id === 'future')?.spec).toBeNull();
      expect(specs.find((x) => x.id === 'modelo-dados')?.spec).not.toBeNull();
      // The annotations of the unreadable specialization stay in the project, with the values.
      const kept = loaded.ok
        ? loaded.project.annotations.filter((a) => a.type?.specId === 'future')
        : [];
      expect(kept.map((a) => a.id)).toEqual(['AF1', 'AF2']);
      expect(kept).toEqual(f.project.annotations.filter((a) => a.id.startsWith('AF')));
      expect(await f.root.read('mapping.json')).toBe(f.mappingText);
    });

    it('editing other markings and annotations and saving preserves values, reference and copy', async () => {
      const f = fixture(layout);
      const { session: s } = await openLikeApp(f.root);
      session = s;

      // Edits OTHER things: marking without future annotation, free annotation, valid annotation.
      s.actions.renameMarking('M4', 'Renamed');
      s.actions.moveMarking('M4', 10, 10);
      s.actions.updateEntry('A1', 'E1', { key: 'type', value: 'crossed out' });
      s.actions.renameAnnotation('A4', 'Another note');
      s.actions.setFieldValue('AV1', 'nome', 'Valid edited');
      await save(s);

      const after = parse(await f.root.read('mapping.json'));
      expect(after.revision).toBe(6);
      // The edit took effect (proves that the session actually wrote).
      expect(JSON.stringify(after)).toContain('Valid edited');
      expect(JSON.stringify(after)).toContain('Renamed');
      await expectFutureIntact(f);

      // Second write: still intact.
      s.actions.renameMarking('M4', 'Renamed again');
      await save(s);
      expect(parse(await f.root.read('mapping.json')).revision).toBe(7);
      await expectFutureIntact(f);

      // Closing the session (writes the pending) does not touch it either.
      await s.close();
      session = null;
      await expectFutureIntact(f);

      // Reopening: the values are still there, still with no spec to interpret them.
      const again = await loadProject(createFolderStorage(f.root));
      expect(again.ok).toBe(true);
      if (!again.ok) return;
      expect(
        again.project.specializations.find((x) => x.id === 'future')?.spec,
      ).toBeNull();
      expect(
        again.project.annotations.filter((a) => a.type?.specId === 'future'),
      ).toEqual(f.project.annotations.filter((a) => a.id.startsWith('AF')));
      expect(again.project.annotations.find((a) => a.id === 'AV1')?.values).toMatchObject(
        {
          nome: 'Valid edited',
        },
      );
    });

    it('moving the marking that carries annotations of the unreadable specialization does not change the values', async () => {
      const f = fixture(layout);
      const { session: s } = await openLikeApp(f.root);
      session = s;
      s.actions.renameMarking('M1', 'Door renamed');
      s.actions.moveMarking('M3', 5, 5);
      await save(s);
      await expectFutureIntact(f);
    });

    it('the exported zip carries the unreadable copy and its package as they were', async () => {
      const f = fixture(layout);
      const { session: s } = await openLikeApp(f.root);
      session = s;
      s.actions.renameMarking('M4', 'Renamed');
      await save(s);

      // JSZip uses timers: the rest runs with the real clock.
      vi.useRealTimers();
      const collected = await s.collectFiles();
      const zip = await writeProjectZip(collected);
      const read = await readProjectZip(zip);
      expect(read.ok).toBe(true);
      if (!read.ok) return;

      // The zip `mapping.json` still cites the specialization: the copy must come along.
      expect(rawOf(parse(read.files.mapping), 'future')).toEqual(
        rawOf(parse(f.mappingText), 'future'),
      );
      expect(parse(read.files.mapping).specializations.map((x) => x.id)).toContain(
        'future',
      );
      expect.soft(read.files.specs.get(f.futureFile)).toBe(f.futureText);
      for (const [path, text] of f.futureExtras) {
        expect.soft(await read.files.specAssets?.get(path)?.text()).toBe(text);
      }
    });

    it('zip → this device → zip: the unreadable copy and its package round trip as they were', async () => {
      const f = fixture(layout);
      const { session: s } = await openLikeApp(f.root);
      session = s;
      s.actions.renameMarking('M4', 'Renamed');
      await save(s);

      // JSZip and the test IndexedDB use timers: the rest runs with the real clock.
      vi.useRealTimers();
      const first = await readProjectZip(await writeProjectZip(await s.collectFiles()));
      expect(first.ok).toBe(true);
      if (!first.ok) return;

      // Imports the zip into IndexedDB, like `importZip`, and opens like the app.
      const library = await openLocalLibrary();
      if (!library) throw new Error('IndexedDB unavailable');
      const id = 'round-trip';
      let local: ProjectSession | null = null;
      try {
        await library.create(id, first.files, { unexported: false });
        const storage = library.open(id);
        const loaded = await loadProject(storage);
        if (!loaded.ok) throw new Error(`loadProject: ${loaded.error}`);
        expect(
          loaded.project.specializations.find((x) => x.id === 'future')?.spec,
        ).toBeNull();
        local = openSession({
          storage,
          project: loaded.project,
          readOnly: loaded.readOnly,
          loadedText: loaded.text,
          libraryIssues: loaded.libraryIssues,
          prepareImage: () => Promise.reject(new Error('no images here')),
          now: () => NOW,
        });
        const again = await readProjectZip(
          await writeProjectZip(await local.collectFiles()),
        );
        expect(again.ok).toBe(true);
        if (!again.ok) return;

        expect(rawOf(parse(again.files.mapping), 'future')).toEqual(
          rawOf(parse(f.mappingText), 'future'),
        );
        expect.soft(again.files.specs.get(f.futureFile)).toBe(f.futureText);
        expect.soft(again.files.specs.get(f.validFile)).toBe(f.validText);
        for (const [path, text] of f.futureExtras) {
          expect.soft(await again.files.specAssets?.get(path)?.text()).toBe(text);
        }
        // The same set of `specs/` files as the first export.
        expect([...again.files.specs.keys()].sort()).toEqual(
          [...first.files.specs.keys()].sort(),
        );
        expect([...(again.files.specAssets?.keys() ?? [])].sort()).toEqual(
          [...(first.files.specAssets?.keys() ?? [])].sort(),
        );
      } finally {
        await local?.close();
        await library.remove(id);
        library.close();
      }
    });

    it('a cited copy that does not exist in the storage stays out of the zip', async () => {
      const f = fixture(layout);
      const { session: s } = await openLikeApp(f.root);
      session = s;
      // It vanishes from the disk between opening and export (external change).
      const parts = f.futureFile.split('/');
      const name = parts.pop() ?? '';
      let dir = f.root;
      for (const part of parts) dir = await dir.getDirectoryHandle(part);
      await dir.removeEntry(name);
      vi.useRealTimers();
      const collected = await s.collectFiles();
      expect(collected.specs.has(f.futureFile)).toBe(false);
      expect(collected.specs.get(f.validFile)).toBe(f.validText);
    });
  },
);
