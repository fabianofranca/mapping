import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applySpecialization, createProject, serialize } from '../../src/model';
import type { DirectoryHandleLike } from '../../src/storage/folder';
import {
  FORMAT_LIB_DIR,
  FORMAT_LIB_SPEC_FILE,
  notesSpecOf,
} from '../support/notesFormat';
import { MemoryDirectory } from '../storage/memoryFs';

// Decision 10 of stage #2035 (AF5): a format's plugin runs only on an explicit action (applying or
// updating a package, opening a library from the home screen, opening the Catalog's "File formats"
// page, Export or Import in a format), never when a project opens: opening a project that has a
// package with formats must not call the sandbox's runner.

const pickDirectory = vi.fn<() => Promise<DirectoryHandleLike | null>>();
vi.mock('../../src/storage/folder', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/storage/folder')>();
  return { ...actual, pickDirectory: () => pickDirectory() };
});

const runFormat = vi.fn();
vi.mock('../../src/app/formatRunner', () => ({
  runFormat: (...args: unknown[]) => runFormat(...args),
}));

type Controller = typeof import('../../src/app/controller');
let app: Controller;

beforeEach(async () => {
  pickDirectory.mockReset();
  runFormat.mockReset();
  vi.resetModules();
  app = await import('../../src/app/controller');
  await app.initApp();
});
afterEach(async () => {
  await app.closeProject().catch(() => undefined);
});

/** A project folder whose `specs/format-library/` holds the notes format: the specialization is applied. */
async function projectWithFormats(): Promise<MemoryDirectory> {
  const spec = notesSpecOf();
  const base = createProject({
    name: 'Formats',
    now: '2026-01-01T00:00:00.000Z',
    firstLayer: { id: 'layer-1', name: 'Layer 1', color: '#D32F2F' },
  });
  const project = applySpecialization(base, spec, {
    packageSpecName: FORMAT_LIB_SPEC_FILE,
  });
  const root = new MemoryDirectory('folder');
  root.files.set('mapping.json', new Blob([serialize(project)]));
  const specs = await root.getDirectoryHandle('specs', { create: true });
  const library = (await specs.getDirectoryHandle(spec.id, {
    create: true,
  })) as MemoryDirectory;
  const read = (path: string) => readFileSync(`${FORMAT_LIB_DIR}/${path}`);
  library.files.set(FORMAT_LIB_SPEC_FILE, new Blob([read(FORMAT_LIB_SPEC_FILE)]));
  const plugins = (await library.getDirectoryHandle('plugins', {
    create: true,
  })) as MemoryDirectory;
  plugins.files.set('notes.js', new Blob([read('plugins/notes.js')]));
  const examples = (await library.getDirectoryHandle('examples', {
    create: true,
  })) as MemoryDirectory;
  examples.files.set('notes.txt', new Blob([read('examples/notes.txt')]));
  return root;
}

describe('opening a project with a package that has file formats', () => {
  it('does not run any plugin', async () => {
    pickDirectory.mockResolvedValue(await projectWithFormats());
    const opened = await app.openFolder();
    expect(opened.ok && opened.value.kind).toBe('opened');
    const current = app.openProject.value;
    expect(current?.session.store.committed.value?.specializations).toHaveLength(1);
    // let anything started on open settle
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(runFormat).not.toHaveBeenCalled();
  });
});
