import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { serialize, specFiles } from '../../src/model';
import type { DirectoryHandleLike } from '../../src/storage/folder';
import { writeProjectZip } from '../../src/storage/zip';
import { clearReportedErrors } from '../../src/utils/report';
import { cadastroProject } from '../model/specFixtures';
import { emptyProject } from '../model/fixtures';
import { MemoryDirectory } from '../storage/memoryFs';

const pickDirectory = vi.fn<() => Promise<DirectoryHandleLike | null>>();

vi.mock('../../src/storage/folder', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/storage/folder')>()),
  pickDirectory: () => pickDirectory(),
}));

const v1 = readFileSync('tests/fixtures/mapping-v1.json', 'utf8');

type Controller = typeof import('../../src/app/controller');
type Local = typeof import('../../src/storage/local');

/** O controller guarda estado no módulo: cada teste carrega uma cópia nova e limpa o IndexedDB. */
async function load(): Promise<{ app: Controller; local: Local }> {
  vi.resetModules();
  const app = await import('../../src/app/controller');
  const local = await import('../../src/storage/local');
  await app.initApp();
  return { app, local };
}

async function openedOf(app: Controller) {
  const current = app.openProject.value;
  if (!current) throw new Error('nenhum projeto aberto');
  return current;
}

function folderWith(files: Record<string, string>): MemoryDirectory {
  const root = new MemoryDirectory('pasta');
  for (const [name, text] of Object.entries(files))
    root.files.set(name, new Blob([text]));
  return root;
}

async function backupsOf(root: MemoryDirectory): Promise<string[]> {
  return [...(root.dirs.get('backups')?.files.keys() ?? [])];
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

describe('detecção de recursos', () => {
  it('IndexedDB disponível habilita o modo local; jsdom não tem showDirectoryPicker', () => {
    expect(app.features.value).toEqual({
      folder: false,
      local: true,
      fileProtocol: false,
    });
  });
});

describe('projeto local', () => {
  it('cria, lista, abre e exclui', async () => {
    expect((await app.createLocalProject('  Meu projeto ')).ok).toBe(true);
    const current = await openedOf(app);
    expect(current.kind).toBe('local');
    expect(current.session.store.project.value?.project.name).toBe('Meu projeto');
    const id = current.localId ?? '';
    await app.closeProject();
    expect(app.openProject.value).toBeNull();
    expect(app.localProjects.value.map((p) => p.id)).toEqual([id]);

    expect((await app.openLocalProject(id)).ok).toBe(true);
    await app.closeProject();
    expect((await app.deleteLocalProject(id)).ok).toBe(true);
    expect(app.localProjects.value).toEqual([]);
  });

  it('nome vazio usa o nome padrão', async () => {
    await app.createLocalProject('   ');
    const name = (await openedOf(app)).session.store.project.value?.project.name;
    expect(name).toBeTruthy();
  });

  it('abrir um id que não existe devolve not-found', async () => {
    expect(await app.openLocalProject('nao-existe')).toEqual({
      ok: false,
      error: 'not-found',
    });
    expect(app.openProject.value).toBeNull();
  });

  it('projeto v1: grava o backup antes do primeiro salvamento', async () => {
    const library = await local.openLocalLibrary();
    await library?.create('v1', { mapping: v1, images: new Map(), specs: new Map() });
    expect(await library?.listBackups('v1')).toEqual([]);

    expect((await app.openLocalProject('v1')).ok).toBe(true);
    const { session } = await openedOf(app);
    // Abrir não grava nada: o original continua intacto até a primeira alteração.
    expect(await library?.listBackups('v1')).toEqual([]);
    expect(await library?.open('v1').loadMapping()).toBe(v1);

    session.actions.renameProject('Renomeado');
    await session.flush();

    const backups = (await library?.listBackups('v1')) ?? [];
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatch(/^mapping\.v1\.\d{8}-\d{6}\.json$/);
    expect(await library?.open('v1').loadMapping()).not.toBe(v1);
    expect(session.backupSaved.value).toBe(1);
    library?.close();
  });
});

describe('projeto em pasta', () => {
  it('cancelar o seletor não faz nada', async () => {
    pickDirectory.mockResolvedValue(null);
    expect(await app.openFolder()).toEqual({ ok: true, value: { kind: 'cancelled' } });
    expect(app.openProject.value).toBeNull();
  });

  it('pasta sem mapping.json pede configuração e lista as imagens existentes', async () => {
    const root = folderWith({ 'foto.jpg': 'x', 'nota.txt': 'y' });
    pickDirectory.mockResolvedValue(root);
    const result = await app.openFolder();
    expect(result.ok && result.value.kind).toBe('needs-setup');
    if (result.ok && result.value.kind === 'needs-setup') {
      expect(result.value.images.map((i) => i.name)).toEqual(['foto.jpg']);
    }
    expect(app.openProject.value).toBeNull();
  });

  it('projeto v1: grava o backup antes do primeiro salvamento', async () => {
    const root = folderWith({ 'mapping.json': v1 });
    pickDirectory.mockResolvedValue(root);
    expect(await app.openFolder()).toEqual({ ok: true, value: { kind: 'opened' } });
    const { session, kind } = await openedOf(app);
    expect(kind).toBe('folder');
    expect(await backupsOf(root)).toEqual([]);

    session.actions.renameProject('Renomeado');
    await session.flush();

    const [backup, ...rest] = await backupsOf(root);
    expect(rest).toEqual([]);
    expect(backup).toMatch(/^mapping\.v1\.\d{8}-\d{6}\.json$/);
    expect(
      await root.dirs
        .get('backups')
        ?.files.get(backup ?? '')
        ?.text(),
    ).toBe(v1);
    expect(await root.files.get('mapping.json')?.text()).toContain('Renomeado');
  });

  it('mapping.json inválido devolve o erro do modelo', async () => {
    pickDirectory.mockResolvedValue(folderWith({ 'mapping.json': '{ não é json' }));
    const result = await app.openFolder();
    expect(result.ok).toBe(false);
    expect(app.openProject.value).toBeNull();
  });

  it('erro do seletor vira storage-failed', async () => {
    pickDirectory.mockRejectedValue(new Error('boom'));
    expect(await app.openFolder()).toEqual({ ok: false, error: 'storage-failed' });
  });

  it('cria o projeto na pasta usando o nome da pasta quando o nome vem vazio', async () => {
    const root = new MemoryDirectory('minha-pasta');
    const result = await app.createFolderProject(root, ' ', []);
    expect(result).toEqual({ ok: true, value: { skipped: [] } });
    const text = await root.files.get('mapping.json')?.text();
    expect(text).toContain('minha-pasta');
    expect((await openedOf(app)).kind).toBe('folder');
  });
});

describe('importar zip', () => {
  const zipOf = async (entries: Record<string, string>) => {
    const zip = new JSZip();
    for (const [name, text] of Object.entries(entries)) zip.file(name, text);
    return new Blob([await zip.generateAsync({ type: 'arraybuffer' })]);
  };

  it('zip inválido devolve invalid-zip', async () => {
    const result = await app.importZip(new Blob(['isto não é um zip']));
    expect(result).toEqual({ ok: false, error: 'invalid-zip' });
    expect(app.openProject.value).toBeNull();
    expect(app.localProjects.value).toEqual([]);
  });

  it('zip sem mapping.json devolve missing-mapping', async () => {
    const result = await app.importZip(await zipOf({ 'images/a.jpg': 'x' }));
    expect(result).toEqual({ ok: false, error: 'missing-mapping' });
    expect(app.openProject.value).toBeNull();
  });

  it('mapping.json inválido dentro do zip não cria projeto local', async () => {
    const result = await app.importZip(await zipOf({ 'mapping.json': '{}' }));
    expect(result.ok).toBe(false);
    expect(app.localProjects.value).toEqual([]);
  });

  it('zip válido vira um projeto local aberto e já exportado', async () => {
    const blob = await writeProjectZip({
      mapping: serialize(emptyProject()),
      images: new Map(),
      specs: new Map(),
    });
    expect((await app.importZip(blob)).ok).toBe(true);
    const current = await openedOf(app);
    expect(current.kind).toBe('local');
    expect(current.unexported.value).toBe(false);
  });

  it('zip de projeto v1 abre migrando e faz backup ao salvar', async () => {
    expect((await app.importZip(await zipOf({ 'mapping.json': v1 }))).ok).toBe(true);
    const { session, localId } = await openedOf(app);
    session.actions.renameProject('Outro');
    await session.flush();
    const library = await local.openLocalLibrary();
    expect(await library?.listBackups(localId ?? '')).toHaveLength(1);
    library?.close();
  });
});

describe('exportar', () => {
  async function openCadastro() {
    const project = cadastroProject();
    const library = await local.openLocalLibrary();
    await library?.create(
      'cad',
      {
        mapping: serialize(project),
        images: new Map([['images/cadastro.png', new Blob(['png'])]]),
        specs: specFiles(project),
      },
      { unexported: false },
    );
    // Um backup existente no armazenamento não pode ir para o zip.
    await library?.open('cad').writeBackup('mapping.v1.20260101-000000.json', v1);
    library?.close();
    await app.openLocalProject('cad');
  }

  it('o zip tem mapping.json, images/ e specs/, e não tem backups/', async () => {
    await openCadastro();
    const result = await app.buildExport();
    if (!result.ok) throw new Error(result.error);
    expect(result.value.name).toMatch(/\.zip$/);
    const zip = await JSZip.loadAsync(await result.value.arrayBuffer());
    const names = Object.keys(zip.files);
    expect(names).toContain('mapping.json');
    expect(names).toContain('images/cadastro.png');
    expect(names.some((n) => n.startsWith('specs/'))).toBe(true);
    expect(names.some((n) => n.startsWith('backups'))).toBe(false);
  });

  it('sem projeto aberto devolve not-found', async () => {
    expect(await app.buildExport()).toEqual({ ok: false, error: 'not-found' });
  });

  it('markExported limpa o indicador de não exportado e persiste', async () => {
    await app.createLocalProject('P');
    const { session, unexported, localId } = await openedOf(app);
    session.actions.renameProject('Q');
    await session.flush();
    expect(unexported.value).toBe(true);
    await app.markExported();
    expect(unexported.value).toBe(false);
    const library = await local.openLocalLibrary();
    expect((await library?.get(localId ?? ''))?.unexported).toBe(false);
    library?.close();
  });

  it('markExported numa pasta (sem localId) não faz nada', async () => {
    await app.createFolderProject(new MemoryDirectory('p'), 'P', []);
    await expect(app.markExported()).resolves.toBeUndefined();
  });
});

describe('fechar', () => {
  it('grava o que estava pendente antes de liberar o projeto', async () => {
    const root = new MemoryDirectory('p');
    await app.createFolderProject(root, 'Original', []);
    const { session, display } = await openedOf(app);
    const order: string[] = [];
    const close = session.close.bind(session);
    vi.spyOn(session, 'close').mockImplementation(async () => {
      order.push('close');
      await close();
      order.push(
        `saved:${(await root.files.get('mapping.json')?.text())?.includes('Editado')}`,
      );
    });
    vi.spyOn(display, 'dispose').mockImplementation(() => order.push('dispose'));

    session.actions.renameProject('Editado');
    await app.closeProject();

    expect(app.openProject.value).toBeNull();
    expect(order).toEqual(['dispose', 'close', 'saved:true']);
    expect(await root.files.get('mapping.json')?.text()).toContain('Editado');
  });

  it('fechar sem projeto aberto não faz nada', async () => {
    await expect(app.closeProject()).resolves.toBeUndefined();
  });

  it('atualiza a lista de projetos locais ao fechar', async () => {
    await app.createLocalProject('Lista');
    const { session } = await openedOf(app);
    session.actions.renameProject('Lista 2');
    await app.closeProject();
    expect(app.localProjects.value.map((p) => p.name)).toEqual(['Lista 2']);
  });
});
