import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NOTES_LIBRARY } from '../../libraries/notas';
import {
  applyBundledLibrary,
  bundledLibraryDiskFiles,
  deserialize,
  serialize,
  type Project,
} from '../../src/model';
import type { DirectoryHandleLike } from '../../src/storage/folder';
import { clearReportedErrors } from '../../src/utils/report';
import { sampleProject } from '../model/fixtures';
import { MemoryDirectory } from '../storage/memoryFs';

// ME3: a biblioteca de notas embutida é aplicada por padrão. Projeto novo (local e em pasta) já
// nasce com ela; projeto de schema anterior ao 13 a ganha ao abrir (em memória, sem desfazer, e
// a primeira gravação escreve `specs/notas/`); projeto já na v13 fica como está.

const pickDirectory = vi.fn<() => Promise<DirectoryHandleLike | null>>();

vi.mock('../../src/storage/folder', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/storage/folder')>();
  return { ...actual, pickDirectory: () => pickDirectory() };
});

type Controller = typeof import('../../src/app/controller');
type Local = typeof import('../../src/storage/local');

/** O controller guarda estado no módulo: cada teste carrega uma cópia nova. */
async function load(): Promise<{ app: Controller; local: Local }> {
  vi.resetModules();
  const app = await import('../../src/app/controller');
  const local = await import('../../src/storage/local');
  await app.initApp();
  return { app, local };
}

let app: Controller;
let local: Local;

beforeEach(async () => {
  clearReportedErrors();
  pickDirectory.mockReset();
  ({ app, local } = await load());
  const library = await local.openLocalLibrary();
  for (const p of (await library?.list()) ?? []) await library?.remove(p.id);
  library?.close();
  await app.refreshLocalProjects();
});

afterEach(async () => {
  await app.closeProject().catch(() => undefined);
  clearReportedErrors();
});

const SPEC_DIR = 'specs/notas';
const SPEC_FILE = `${SPEC_DIR}/notas.spec.json`;
const PACKAGE_PATHS = [
  SPEC_FILE,
  `${SPEC_DIR}/components/nota.json`,
  `${SPEC_DIR}/docs/nota.md`,
];

async function openedSession(): Promise<NonNullable<typeof app.openProject.value>> {
  const current = app.openProject.value;
  if (!current) throw new Error('nenhum projeto aberto');
  return current;
}

function projectOf(opened: NonNullable<typeof app.openProject.value>): Project {
  const p = opened.session.store.project.value;
  if (!p) throw new Error('projeto fechado');
  return p;
}

const notesLayers = (p: Project) => p.layers.filter((l) => l.spec?.specId === 'notas');

/** O mapping.json de um projeto do schema 12: o de hoje com a versão antiga (a migração é a real). */
function v12Text(p: Project): string {
  const data = JSON.parse(serialize(p)) as Record<string, unknown>;
  return `${JSON.stringify({ ...data, schemaVersion: 12 }, null, 2)}\n`;
}

/** Uma pasta de projeto em memória: mapping.json e, opcionalmente, os arquivos de `specs/`. */
function folderOf(mapping: string, extra: ReadonlyMap<string, string> = new Map()) {
  const root = new MemoryDirectory('pasta');
  root.put('mapping.json', mapping);
  for (const [path, text] of extra) root.put(path, text);
  return root;
}

/** Projeto com as notas aplicadas pela pessoa e os arquivos como estariam no disco. */
function withNotes() {
  const project = applyBundledLibrary(sampleProject(), NOTES_LIBRARY).project;
  return { project, files: bundledLibraryDiskFiles(project, NOTES_LIBRARY) };
}

describe('projeto novo', () => {
  it('local: nasce com a especialização notas, a camada Notas e specs/notas/ no armazenamento', async () => {
    expect((await app.createLocalProject('Novo')).ok).toBe(true);
    const opened = await openedSession();
    const project = projectOf(opened);
    expect(project.specializations).toEqual([
      expect.objectContaining({ id: 'notas', file: SPEC_FILE }),
    ]);
    // A primeira camada leva o nome da língua da interface; a das notas vem da biblioteca.
    expect(project.layers).toHaveLength(2);
    expect(project.layers.at(-1)?.name).toBe('Notas');
    expect(notesLayers(project)).toHaveLength(1);
    expect(project.layers.at(-1)?.spec).toEqual({ specId: 'notas', layerId: 'notas' });
    expect(opened.session.store.canUndo.value).toBe(false);

    for (const path of PACKAGE_PATHS) {
      const blob = await opened.session.storage.readSpecFile(path);
      expect(blob, path).not.toBeNull();
    }
    expect(await (await opened.session.storage.readSpecFile(SPEC_FILE))?.text()).toBe(
      bundledLibraryDiskFiles(project, NOTES_LIBRARY).get(SPEC_FILE),
    );
    expect(
      await (
        await opened.session.storage.readSpecFile(`${SPEC_DIR}/docs/nota.md`)
      )?.text(),
    ).toBe(NOTES_LIBRARY.files.get('docs/nota.md'));

    // Reabrir do armazenamento mantém tudo e o catálogo de componentes lê o pacote.
    const id = opened.localId ?? '';
    await app.closeProject();
    expect((await app.openLocalProject(id)).ok).toBe(true);
    const reopened = await openedSession();
    expect(projectOf(reopened).specializations).toHaveLength(1);
    await reopened.session.components.whenIdle();
    expect(
      reopened.session.components.catalog.value.get('notas')?.byType.has('nota'),
    ).toBe(true);
  });

  it('em pasta: grava specs/notas/ antes do mapping.json, que cita a especialização', async () => {
    const root = new MemoryDirectory('minha-pasta');
    expect((await app.createFolderProject(root, 'P', [])).ok).toBe(true);

    for (const path of PACKAGE_PATHS) {
      expect(await root.read(path), path).not.toBeNull();
    }
    const notasDir = root.dirs.get('specs')?.dirs.get('notas');
    const mappingTick = root.modified.get('mapping.json') ?? 0;
    expect(mappingTick).toBeGreaterThan(0);
    for (const [name, tick] of notasDir?.modified ?? []) {
      expect(tick, name).toBeLessThan(mappingTick);
    }
    for (const [name, tick] of notasDir?.dirs.get('components')?.modified ?? []) {
      expect(tick, name).toBeLessThan(mappingTick);
    }
    const saved = deserialize((await root.read('mapping.json')) ?? '');
    if (!saved.ok) throw new Error('mapping inválido');
    expect(saved.project.specializations).toEqual([
      expect.objectContaining({ id: 'notas', file: SPEC_FILE }),
    ]);
    expect(saved.project.layers).toHaveLength(2);
    expect(saved.project.layers.at(-1)?.name).toBe('Notas');

    const opened = await openedSession();
    expect(opened.kind).toBe('folder');
    expect(notesLayers(projectOf(opened))).toHaveLength(1);
    expect(opened.session.store.canUndo.value).toBe(false);
  });
});

describe('abrir projeto existente', () => {
  it('v12 sem notas: abre com a biblioteca em memória, sem desfazer; a primeira gravação escreve specs/notas/, o backup e um mapping v13', async () => {
    const original = v12Text(sampleProject());
    const root = folderOf(original);
    pickDirectory.mockResolvedValue(root);
    expect(await app.openFolder()).toEqual({ ok: true, value: { kind: 'opened' } });

    const opened = await openedSession();
    const project = projectOf(opened);
    expect(project.specializations).toEqual([
      expect.objectContaining({ id: 'notas', file: SPEC_FILE }),
    ]);
    expect(notesLayers(project)).toHaveLength(1);
    // Em memória: nada de desfazer e nada no disco ainda.
    expect(opened.session.store.canUndo.value).toBe(false);
    expect(await root.read('mapping.json')).toBe(original);
    expect(root.dirs.has('specs')).toBe(false);
    expect(root.dirs.has('backups')).toBe(false);
    // O catálogo já enxerga o tipo da nota.
    await opened.session.components.whenIdle();
    expect(opened.session.components.catalog.value.get('notas')?.byType.has('nota')).toBe(
      true,
    );

    // A primeira alteração grava tudo junto.
    opened.session.actions.renameProject('Renomeado');
    expect((await opened.session.flush()).ok).toBe(true);
    for (const path of PACKAGE_PATHS) {
      expect(await root.read(path), path).not.toBeNull();
    }
    const saved = deserialize((await root.read('mapping.json')) ?? '');
    if (!saved.ok) throw new Error('mapping inválido');
    expect(saved.project.schemaVersion).toBe(13);
    expect(saved.project.project.name).toBe('Renomeado');
    expect(saved.project.specializations).toEqual([
      expect.objectContaining({ id: 'notas', file: SPEC_FILE }),
    ]);
    expect(notesLayers(saved.project)).toHaveLength(1);
    const backups = [...(root.dirs.get('backups')?.files.keys() ?? [])];
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatch(/^mapping\.v12\.\d{8}-\d{6}\.json$/);
    expect(
      await root.dirs
        .get('backups')
        ?.files.get(backups[0] ?? '')
        ?.text(),
    ).toBe(original);
    // Só a renomeação entra no histórico.
    expect(opened.session.store.canUndo.value).toBe(true);
    opened.session.store.undo();
    expect(opened.session.store.canUndo.value).toBe(false);
  });

  it('v12 local: o armazenamento recebe specs/notas/ na primeira gravação', async () => {
    const library = await local.openLocalLibrary();
    await library?.create('v12', {
      mapping: v12Text(sampleProject()),
      images: new Map(),
      specs: new Map(),
      proposals: new Map(),
      proposalImages: new Map(),
    });
    expect((await app.openLocalProject('v12')).ok).toBe(true);
    const opened = await openedSession();
    expect(projectOf(opened).specializations).toHaveLength(1);
    expect(opened.session.store.canUndo.value).toBe(false);
    expect(await opened.session.storage.readSpecFile(SPEC_FILE)).toBeNull();

    opened.session.actions.renameProject('Renomeado');
    await opened.session.flush();
    for (const path of PACKAGE_PATHS) {
      expect(await opened.session.storage.readSpecFile(path), path).not.toBeNull();
    }
    expect(await library?.listBackups('v12')).toHaveLength(1);
    library?.close();
  });

  it('já na v13 sem a especialização notas: não a adiciona', async () => {
    const root = folderOf(serialize(sampleProject()));
    pickDirectory.mockResolvedValue(root);
    expect((await app.openFolder()).ok).toBe(true);
    const opened = await openedSession();
    const project = projectOf(opened);
    expect(project.specializations).toEqual([]);
    expect(notesLayers(project)).toEqual([]);
    expect(opened.session.store.canUndo.value).toBe(false);
    opened.session.actions.renameProject('Renomeado');
    await opened.session.flush();
    expect(root.dirs.has('specs')).toBe(false);
  });

  it('v12 que já tem a especialização notas (aplicada pela pessoa): não duplica', async () => {
    const { project, files } = withNotes();
    const root = folderOf(v12Text(project), files);
    pickDirectory.mockResolvedValue(root);
    expect((await app.openFolder()).ok).toBe(true);
    const opened = await openedSession();
    const opened12 = projectOf(opened);
    expect(opened12.specializations).toHaveLength(1);
    expect(notesLayers(opened12)).toHaveLength(1);
    expect(opened12.layers).toHaveLength(project.layers.length);
    // Nem tentou aplicar de novo (o erro de "já aplicada" iria para o Diagnóstico).
    const report = await import('../../src/utils/report');
    expect(report.reportedErrors.value.map((e) => e.context)).not.toContain('open.notes');
    expect(opened.session.store.canUndo.value).toBe(false);

    // A cópia da pessoa continua a que está no disco, sem regravar o pacote por cima.
    const before = root.dirs
      .get('specs')
      ?.dirs.get('notas')
      ?.modified.get('notas.spec.json');
    opened.session.actions.renameProject('Renomeado');
    await opened.session.flush();
    expect(
      root.dirs.get('specs')?.dirs.get('notas')?.modified.get('notas.spec.json'),
    ).toBe(before);
    const saved = deserialize((await root.read('mapping.json')) ?? '');
    if (!saved.ok) throw new Error('mapping inválido');
    expect(saved.project.specializations).toHaveLength(1);
    expect(notesLayers(saved.project)).toHaveLength(1);
  });
});
