import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deserialize,
  parseProposalText,
  serialize,
  serializeProposal,
  specFiles,
} from '../../src/model';
import type { DirectoryHandleLike } from '../../src/storage/folder';
import { writeProjectZip } from '../../src/storage/zip';
import { clearReportedErrors } from '../../src/utils/report';
import { cadastroProject } from '../model/specFixtures';
import { emptyProject, sampleProject } from '../model/fixtures';
import { readInvalidFixture } from '../model/invalidFixtures';
import {
  keepDirectoriesInClone,
  MemoryDirectory,
  PermissionDirectory,
} from '../storage/memoryFs';
import { richScenario } from '../store/proposalHarness';

const pickDirectory = vi.fn<() => Promise<DirectoryHandleLike | null>>();
/** `isOriginPrivate` controlável; sem implementação (`undefined`), vale a original. */
const originPrivate =
  vi.fn<(handle: DirectoryHandleLike) => Promise<boolean> | undefined>();

vi.mock('../../src/storage/folder', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/storage/folder')>();
  return {
    ...actual,
    pickDirectory: () => pickDirectory(),
    isOriginPrivate: (handle: DirectoryHandleLike) =>
      originPrivate(handle) ?? actual.isOriginPrivate(handle),
  };
});

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
  originPrivate.mockReset();
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

  // Etapa 8 (8.4): a cópia do projeto local é o id dele (chave do retomar da revisão, 8.2).
  it('copyId do projeto local é o id: criar, abrir e importar zip', async () => {
    await app.createLocalProject('Cópia');
    const created = await openedOf(app);
    expect(created.session.storage.copyId).toBe(created.localId);
    const id = created.localId ?? '';
    await app.closeProject();
    await app.openLocalProject(id);
    expect((await openedOf(app)).session.storage.copyId).toBe(id);
    await app.closeProject();
    const zip = await writeProjectZip({
      mapping: serialize(emptyProject()),
      images: new Map(),
      specs: new Map(),
      proposals: new Map(),
      proposalImages: new Map(),
    });
    expect((await app.importZip(zip)).ok).toBe(true);
    const imported = await openedOf(app);
    expect(imported.localId).not.toBe(id);
    expect(imported.session.storage.copyId).toBe(imported.localId);
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
    await library?.create('v1', {
      mapping: v1,
      images: new Map(),
      specs: new Map(),
      proposals: new Map(),
      proposalImages: new Map(),
    });
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

  it('ao criar o projeto na pasta, grava um .gitignore com backups/', async () => {
    const root = new MemoryDirectory('minha-pasta');
    await app.createFolderProject(root, 'P', []);
    expect(await root.files.get('.gitignore')?.text()).toBe('backups/\n');
  });

  it('o .gitignore que já existe na pasta é preservado, só ganha a linha', async () => {
    const root = new MemoryDirectory('minha-pasta');
    root.files.set('.gitignore', new Blob(['dist/\n']));
    await app.createFolderProject(root, 'P', []);
    expect(await root.files.get('.gitignore')?.text()).toBe('dist/\nbackups/\n');
  });

  it('falha ao gravar o .gitignore não impede a criação do projeto', async () => {
    const root = new MemoryDirectory('minha-pasta');
    // A pasta aceita o mapping.json, mas não o .gitignore.
    const getFileHandle = root.getFileHandle.bind(root);
    vi.spyOn(root, 'getFileHandle').mockImplementation(async (name, options) => {
      if (name === '.gitignore' && options?.create) throw new Error('sem permissão');
      return getFileHandle(name, options);
    });
    const result = await app.createFolderProject(root, 'P', []);
    expect(result.ok).toBe(true);
    expect(await root.files.get('mapping.json')?.text()).toContain('"P"');
    expect((await openedOf(app)).kind).toBe('folder');
  });

  it('abrir uma pasta que já tem projeto não cria .gitignore', async () => {
    const root = new MemoryDirectory('minha-pasta');
    await app.createFolderProject(root, 'P', []);
    root.files.delete('.gitignore');
    await app.closeProject();
    pickDirectory.mockResolvedValue(root);
    expect((await app.openFolder()).ok).toBe(true);
    expect(root.files.has('.gitignore')).toBe(false);
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
      proposals: new Map(),
      proposalImages: new Map(),
    });
    expect((await app.importZip(blob)).ok).toBe(true);
    const current = await openedOf(app);
    expect(current.kind).toBe('local');
    expect(current.unexported.value).toBe(false);
  });

  it('importar conta como uso: o projeto vai para o topo dos recentes com a data de agora (G2)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-10-10T10:00:00.000Z'));
      await app.createLocalProject('Local');
      await app.closeProject();
      // O zip traz a data da última alteração, anterior ao projeto local.
      const p = emptyProject();
      const old = {
        ...p,
        project: { ...p.project, updatedAt: '2026-10-09T09:00:00.000Z' },
      };
      const blob = await writeProjectZip({
        mapping: serialize(old),
        images: new Map(),
        specs: new Map(),
        proposals: new Map(),
        proposalImages: new Map(),
      });
      vi.setSystemTime(new Date('2026-10-12T10:00:00.000Z'));
      expect((await app.importZip(blob)).ok).toBe(true);
      const importedId = (await openedOf(app)).localId;
      await app.closeProject();
      const [first] = app.recentProjects.value;
      expect(first?.id).toBe(importedId);
      expect(first?.usedAt).toBe('2026-10-12T10:00:00.000Z');
      // A última alteração continua sendo a de dentro do zip.
      const meta = app.localProjects.value.find((m) => m.id === importedId);
      expect(meta?.updatedAt).toBe('2026-10-09T09:00:00.000Z');
      expect(meta?.openedAt).toBe('2026-10-12T10:00:00.000Z');
    } finally {
      vi.useRealTimers();
    }
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
        proposals: new Map(),
        proposalImages: new Map(),
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
    expect(result.value.missingImages).toEqual([]);
    expect(result.value.saved).toBe(true);
    expect(result.value.file.name).toMatch(/\.zip$/);
    const zip = await JSZip.loadAsync(await result.value.file.arrayBuffer());
    const names = Object.keys(zip.files);
    expect(names).toContain('mapping.json');
    expect(names).toContain('images/cadastro.png');
    expect(names.some((n) => n.startsWith('specs/'))).toBe(true);
    expect(names.some((n) => n.startsWith('backups'))).toBe(false);
  });

  // Etapa 8 (8.7), resíduo 1 (S8): `collectFiles().saved` chega ao diálogo Exportar.
  it('com a gravação em erro, o zip sai com saved: false', async () => {
    const root = new MemoryDirectory('p');
    await app.createFolderProject(root, 'P', []);
    const { session } = await openedOf(app);
    root.failWrites = new Error('NoModificationAllowedError');
    session.actions.renameProject('Q');
    await session.flush();
    expect(session.saveStatus.value).toBe('error');
    const result = await app.buildExport();
    if (!result.ok) throw new Error(result.error);
    expect(result.value.saved).toBe(false);
    root.failWrites = null;
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

describe('sair da página (fase 5.5)', () => {
  /**
   * A gravação imediata é provada pelo `flush()` chamado no próprio evento (o debounce não
   * chama `flush` antes do timer); depois, só confere que ela chegou ao disco.
   */
  const soon = { timeout: 1000, interval: 10 };

  function setVisibility(state: DocumentVisibilityState) {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => state,
    });
  }

  afterEach(() => setVisibility('visible'));

  it('pagehide grava na hora, sem esperar o debounce', async () => {
    const root = new MemoryDirectory('p');
    await app.createFolderProject(root, 'Original', []);
    const { session } = await openedOf(app);
    const flush = vi.spyOn(session, 'flush');
    session.actions.renameProject('Saindo');
    window.dispatchEvent(new Event('pagehide'));
    expect(flush).toHaveBeenCalledTimes(1);
    await vi.waitFor(async () => {
      expect(await root.files.get('mapping.json')?.text()).toContain('Saindo');
    }, soon);
  });

  it('visibilitychange para hidden grava na hora', async () => {
    await app.createLocalProject('Local');
    const { session, localId } = await openedOf(app);
    const flush = vi.spyOn(session, 'flush');
    session.actions.renameProject('Escondido');
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(flush).toHaveBeenCalledTimes(1);
    await vi.waitFor(async () => {
      await app.refreshLocalProjects();
      expect(app.localProjects.value.find((p) => p.id === localId)?.name).toBe(
        'Escondido',
      );
    }, soon);
  });

  it('beforeunload com pendência pede confirmação; sem pendência, não', async () => {
    const root = new MemoryDirectory('p');
    await app.createFolderProject(root, 'Original', []);
    const { session } = await openedOf(app);
    await session.flush();
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    session.actions.renameProject('Pendente');
    const pending = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(pending);
    expect(pending.defaultPrevented).toBe(true);
  });

  it('beforeunload com pendência agenda a gravação e pede confirmação', async () => {
    const root = new MemoryDirectory('p');
    await app.createFolderProject(root, 'Original', []);
    const { session } = await openedOf(app);
    const flush = vi.spyOn(session, 'flush');
    session.actions.renameProject('Fechando');
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(flush).toHaveBeenCalledTimes(1);
    await vi.waitFor(async () => {
      expect(await root.files.get('mapping.json')?.text()).toContain('Fechando');
    }, soon);
  });
});

describe('propostas de alteração (etapa 4)', () => {
  const proposalZip = async () => {
    const { proposal } = richScenario();
    const zip = new JSZip();
    zip.file('mapping.json', serialize(sampleProject()));
    zip.file('proposals/P1/proposal.json', serializeProposal(proposal));
    zip.file('proposals/P1/images/nova.webp', 'WEBP');
    return {
      proposal,
      blob: new Blob([await zip.generateAsync({ type: 'arraybuffer' })]),
    };
  };

  it('decidir numa proposta marca "não exportadas" no indicador sem reabrir o projeto (S4, fase 8.1)', async () => {
    const { proposal, blob } = await proposalZip();
    expect((await app.importZip(blob)).ok).toBe(true);
    const current = await openedOf(app);
    expect(current.unexported.value).toBe(false);
    const decided = await current.session.proposalActions.decide(
      'P1',
      { level: 'change', id: proposal.changes[1]?.id ?? '' },
      'accepted',
    );
    expect(decided.ok).toBe(true);
    expect(current.unexported.value).toBe(true);
  });

  it('zip importado mostra as propostas; decidir, exportar e reimportar preserva a revisão', async () => {
    const { proposal, blob } = await proposalZip();
    expect((await app.importZip(blob)).ok).toBe(true);
    const first = await openedOf(app);
    expect(first.session.proposals.list.value.map((p) => p.id)).toEqual(['P1']);

    const accepted = proposal.changes[1]?.id ?? '';
    const decided = await first.session.proposalActions.decide(
      'P1',
      { level: 'change', id: accepted },
      'accepted',
    );
    expect(decided.ok).toBe(true);
    await app.closeProject();
    // Decidir é trabalho a exportar, como editar o projeto.
    const library = await local.openLocalLibrary();
    expect((await library?.get(first.localId ?? ''))?.unexported).toBe(true);
    library?.close();

    // Reabre o projeto local: a decisão veio do IndexedDB.
    await app.openLocalProject(first.localId ?? '');
    const second = await openedOf(app);
    expect(second.session.proposals.get('P1')?.decisions[accepted]?.state).toBe(
      'accepted',
    );

    const exported = await app.buildExport();
    if (!exported.ok) throw new Error(exported.error);
    const zip = await JSZip.loadAsync(await exported.value.file.arrayBuffer());
    expect(await zip.file('proposals/P1/images/nova.webp')?.async('string')).toBe('WEBP');
    const text = (await zip.file('proposals/P1/proposal.json')?.async('string')) ?? '';
    expect(parseProposalText(text)).toMatchObject({
      ok: true,
      proposal: { revision: 1, decisions: { [accepted]: { state: 'accepted' } } },
    });

    const reviewed = second.session.proposals.get('P1');
    await app.closeProject();
    expect((await app.importZip(exported.value.file)).ok).toBe(true);
    const third = await openedOf(app);
    expect(third.session.proposals.get('P1')).toEqual(reviewed);
  });

  it('projeto em pasta abre com as propostas da pasta e aplica uma delas', async () => {
    const { proposal } = richScenario();
    const root = folderWith({ 'mapping.json': serialize(sampleProject()) });
    root.put('proposals/P1/proposal.json', serializeProposal(proposal));
    root.put('proposals/P1/images/nova.webp', 'WEBP');
    pickDirectory.mockResolvedValue(root);
    expect(await app.openFolder()).toEqual({ ok: true, value: { kind: 'opened' } });
    const { session } = await openedOf(app);
    expect(session.proposals.list.value.map((p) => p.title)).toEqual(['Teste']);

    await session.proposalActions.decide(
      'P1',
      { level: 'proposal', id: null },
      'accepted',
    );
    expect(await session.proposalActions.applyAccepted('P1')).toMatchObject({
      ok: true,
      applied: 5,
    });
    expect(await root.read('images/nova.webp')).toBe('WEBP');
    expect(session.store.project.value?.images.some((i) => i.id === 'I3')).toBe(true);
  });
});

describe('projeto com dados inconsistentes', () => {
  const repairable = readInvalidFixture('missing-parent');
  const unrepairable = readInvalidFixture('duplicate-id');

  it('pasta: recusa com a lista e oferece reparar; o backup sai na primeira gravação', async () => {
    const root = folderWith({ 'mapping.json': repairable });
    pickDirectory.mockResolvedValue(root);
    const result = await app.openFolder();
    if (result.ok) throw new Error('deveria pedir o reparo');
    expect(result.error).toBe('invariant-violation');
    expect(app.openProject.value).toBeNull();
    const inconsistent = result.inconsistent;
    if (!inconsistent?.repair) throw new Error('deveria oferecer o reparo');
    expect(inconsistent.issues).toContainEqual({
      code: 'missing-parent',
      entity: 'marking',
      id: 'MN',
      name: 'Nome',
      otherId: 'M9',
    });
    expect(inconsistent.unrepaired).toEqual([]);
    expect(inconsistent.repaired).toEqual([
      {
        action: 'made-root',
        code: 'missing-parent',
        entity: 'marking',
        id: 'MN',
        name: 'Nome',
      },
    ]);

    expect(await inconsistent.repair()).toEqual({ ok: true, value: undefined });
    const { session, repaired } = await openedOf(app);
    expect(repaired).toEqual(inconsistent.repaired);
    expect(
      session.store.project.value?.markings.find((m) => m.id === 'MN')?.parentId,
    ).toBeNull();
    // Ler nunca grava: nada muda na pasta até a primeira gravação.
    expect(await backupsOf(root)).toEqual([]);
    expect(await root.files.get('mapping.json')?.text()).toBe(repairable);
    // O resumo do reparo vai para o Diagnóstico.
    // (o controller foi carregado de novo em `load()`: o registro é o da cópia dele)
    const report = await import('../../src/utils/report');
    expect(report.reportedErrors.value.map((e) => e.context)).toContain('open.repair');

    session.actions.renameProject('Reparado');
    await session.flush();

    const [backup, ...rest] = await backupsOf(root);
    expect(rest).toEqual([]);
    expect(backup).toMatch(/^mapping\.v8\.\d{8}-\d{6}\.json$/);
    expect(
      await root.dirs
        .get('backups')
        ?.files.get(backup ?? '')
        ?.text(),
    ).toBe(repairable);
    const saved = (await root.files.get('mapping.json')?.text()) ?? '';
    expect(deserialize(saved).ok).toBe(true);
  });

  it('pasta: com problema sem reparo, só a lista', async () => {
    pickDirectory.mockResolvedValue(folderWith({ 'mapping.json': unrepairable }));
    const result = await app.openFolder();
    if (result.ok) throw new Error('deveria recusar');
    expect(result.inconsistent?.repair).toBeNull();
    expect(result.inconsistent?.unrepaired.map((i) => `${i.code}:${i.id}`)).toEqual([
      'duplicate-id:MT',
    ]);
    expect(app.openProject.value).toBeNull();
  });

  it('projeto local: reparar e abrir grava o backup no IndexedDB', async () => {
    const library = await local.openLocalLibrary();
    await library?.create('inc', {
      mapping: repairable,
      images: new Map(),
      specs: new Map(),
      proposals: new Map(),
      proposalImages: new Map(),
    });
    const result = await app.openLocalProject('inc');
    if (result.ok || !result.inconsistent?.repair)
      throw new Error('deveria pedir o reparo');
    expect((await result.inconsistent.repair()).ok).toBe(true);
    const { session } = await openedOf(app);
    session.actions.renameProject('Reparado');
    await session.flush();
    expect(await library?.listBackups('inc')).toHaveLength(1);
    library?.close();
  });

  // Etapa 8 (8.4), R4: o reparado passa pelo mesmo vínculo que a abertura normal.
  it('projeto local: reparar e abrir conta como uso (openedAt) e tem copyId', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-10-01T10:00:00.000Z'));
      const library = await local.openLocalLibrary();
      await library?.create('inc', {
        mapping: repairable,
        images: new Map(),
        specs: new Map(),
        proposals: new Map(),
        proposalImages: new Map(),
      });
      vi.setSystemTime(new Date('2026-10-05T10:00:00.000Z'));
      const result = await app.openLocalProject('inc');
      if (result.ok || !result.inconsistent?.repair)
        throw new Error('deveria pedir o reparo');
      expect((await result.inconsistent.repair()).ok).toBe(true);
      expect((await openedOf(app)).session.storage.copyId).toBe('inc');
      expect((await library?.get('inc'))?.openedAt).toBe('2026-10-05T10:00:00.000Z');
      library?.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('zip: só vira projeto local depois de aceitar o reparo', async () => {
    const zip = new JSZip();
    zip.file('mapping.json', repairable);
    const blob = new Blob([await zip.generateAsync({ type: 'arraybuffer' })]);
    const result = await app.importZip(blob);
    if (result.ok || !result.inconsistent?.repair)
      throw new Error('deveria pedir o reparo');
    const before = await local.openLocalLibrary();
    expect(await before?.list()).toEqual([]);
    before?.close();
    expect((await result.inconsistent.repair()).ok).toBe(true);
    expect((await openedOf(app)).kind).toBe('local');
    const library = await local.openLocalLibrary();
    expect(await library?.list()).toHaveLength(1);
    library?.close();
  });

  it('o projeto do roteiro 13.9 íntegro abre direto', async () => {
    pickDirectory.mockResolvedValue(
      folderWith({ 'mapping.json': serialize(cadastroProject()) }),
    );
    expect(await app.openFolder()).toEqual({ ok: true, value: { kind: 'opened' } });
    expect((await openedOf(app)).repaired).toEqual([]);
  });
});

describe('recentes de pasta (fase 6.6)', () => {
  /** Pasta com um projeto: `mapping.json` com o nome dado. */
  const projectFolder = (folder = 'pasta', name = 'Projeto da pasta') => {
    const root = new PermissionDirectory(folder);
    const project = emptyProject();
    root.put(
      'mapping.json',
      serialize({ ...project, project: { ...project.project, name } }),
    );
    return root;
  };
  const folders = () => app.recentProjects.value.filter((p) => p.kind === 'folder');
  const idOf = (folderName: string) =>
    folders().find((p) => p.kind === 'folder' && p.folderName === folderName)?.id ?? '';
  const openViaPicker = async (root: MemoryDirectory) => {
    pickDirectory.mockResolvedValue(root);
    expect(await app.openFolder()).toEqual({ ok: true, value: { kind: 'opened' } });
    await app.closeProject();
  };

  beforeEach(async () => {
    // O handle de verdade é serializável; a pasta em memória fica por referência.
    vi.stubGlobal('structuredClone', keepDirectoriesInClone());
    // O modo pasta depende de `showDirectoryPicker` (o seletor em si é o `pickDirectory`).
    vi.stubGlobal('showDirectoryPicker', vi.fn());
    const library = await local.openFolderLibrary();
    for (const f of (await library?.list()) ?? []) await library?.remove(f.id);
    library?.close();
    ({ app, local } = await load());
  });

  afterEach(async () => {
    await app.closeProject().catch(() => undefined);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('abrir uma pasta e fechar o projeto: a lista da tela inicial traz a pasta', async () => {
    await openViaPicker(projectFolder());
    expect(folders()).toEqual([
      expect.objectContaining({
        kind: 'folder',
        name: 'Projeto da pasta',
        folderName: 'pasta',
      }),
    ]);
    // Fica no IndexedDB: a próxima visita também a traz.
    ({ app, local } = await load());
    expect(folders().map((p) => p.name)).toEqual(['Projeto da pasta']);
  });

  it('criar o projeto numa pasta também a guarda; abrir de novo não duplica', async () => {
    const root = new PermissionDirectory('nova');
    expect((await app.createFolderProject(root, 'Novo', [])).ok).toBe(true);
    await app.closeProject();
    expect(folders().map((p) => p.name)).toEqual(['Novo']);
    await openViaPicker(root);
    expect(folders()).toHaveLength(1);
    // Outra pasta com o mesmo nome é outra entrada (`isSameEntry`, não o nome).
    await openViaPicker(projectFolder('nova', 'Outro'));
    expect(folders()).toHaveLength(2);
  });

  it('o nome da lista acompanha o projeto renomeado', async () => {
    const root = projectFolder();
    pickDirectory.mockResolvedValue(root);
    await app.openFolder();
    const { session } = await openedOf(app);
    session.actions.renameProject('Renomeado');
    await app.closeProject();
    expect(folders().map((p) => p.name)).toEqual(['Renomeado']);
  });

  it('lista única com pastas e projetos deste dispositivo, por último uso', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T10:00:00.000Z'));
    await app.createLocalProject('Local');
    const localId = (await openedOf(app)).localId ?? '';
    await app.closeProject();
    vi.setSystemTime(new Date('2026-10-02T10:00:00.000Z'));
    await openViaPicker(projectFolder());
    expect(app.recentProjects.value.map((p) => [p.kind, p.name])).toEqual([
      ['folder', 'Projeto da pasta'],
      ['local', 'Local'],
    ]);
    // Abrir (sem alterar) o projeto local conta como uso.
    vi.setSystemTime(new Date('2026-10-03T10:00:00.000Z'));
    expect((await app.openLocalProject(localId)).ok).toBe(true);
    await app.closeProject();
    expect(app.recentProjects.value.map((p) => p.kind)).toEqual(['local', 'folder']);
    expect(app.recentProjects.value[0]?.usedAt).toBe('2026-10-03T10:00:00.000Z');
  });

  // Etapa 8 (8.4), R1: fechar enquanto a pasta é guardada não deixa o id da entrada para o
  // projeto seguinte (que, ao fechar, daria o nome dele à linha da pasta).
  it('fechar durante o guardar da pasta não vaza a entrada para o próximo projeto', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    originPrivate.mockImplementationOnce(async () => {
      await gate;
      return false;
    });
    pickDirectory.mockResolvedValue(projectFolder());
    const opening = app.openFolder();
    await vi.waitFor(() => expect(originPrivate).toHaveBeenCalled());
    // O editor só aparece com a pasta já guardada: não há projeto para fechar no meio.
    expect(app.openProject.value).toBeNull();
    await app.closeProject();
    release();
    expect(await opening).toEqual({ ok: true, value: { kind: 'opened' } });
    await app.closeProject();
    await app.createLocalProject('Local');
    await app.closeProject();
    expect(folders().map((p) => p.name)).toEqual(['Projeto da pasta']);
  });

  // Etapa 8 (8.4), R2: como no projeto local, o nome acompanha a cada gravação.
  it('renomear o projeto em pasta reflete nos recentes sem Fechar', async () => {
    pickDirectory.mockResolvedValue(projectFolder());
    await app.openFolder();
    const { session } = await openedOf(app);
    session.actions.renameProject('Renomeado');
    expect((await session.flush()).ok).toBe(true);
    // O toque na entrada é posterior à gravação (fora da fila da sessão).
    const library = await local.openFolderLibrary();
    await vi.waitFor(async () =>
      expect((await library?.list())?.map((f) => f.name)).toEqual(['Renomeado']),
    );
    library?.close();
  });

  // Etapa 8 (8.7), decisão do dono: gerar o zip não é exportar. Com a gravação em erro, a
  // pessoa gera o zip e cancela o "Salvar como" (sem `markExported`); quando a gravação volta
  // com exatamente aquele conteúdo, é mudança a exportar: `unexported` sobe e a entrada dos
  // recentes anda (`touchFolder`), como em qualquer gravação.
  it('zip gerado e download cancelado: a gravação seguinte conta como mudança', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T10:00:00.000Z'));
    const root = projectFolder();
    pickDirectory.mockResolvedValue(root);
    await app.openFolder();
    const { session, unexported } = await openedOf(app);
    root.failWrites = new Error('NoModificationAllowedError');
    session.actions.renameProject('Cancelado');
    await session.flush();
    expect(session.saveStatus.value).toBe('error');
    expect(unexported.value).toBe(false);

    const built = await app.buildExport();
    expect(built.ok && built.value.saved).toBe(false);
    // Sem markExported: a pessoa cancelou o "Salvar como".
    vi.setSystemTime(new Date('2026-10-02T10:00:00.000Z'));
    root.failWrites = null;
    expect(await session.flush()).toEqual({ ok: true });
    expect(unexported.value).toBe(true);
    const library = await local.openFolderLibrary();
    await vi.waitFor(async () =>
      expect((await library?.list())?.map((f) => [f.name, f.usedAt])).toEqual([
        ['Cancelado', '2026-10-02T10:00:00.000Z'],
      ]),
    );
    library?.close();
  });

  it('zip baixado (markExported): a gravação do mesmo conteúdo não é mudança', async () => {
    const root = projectFolder();
    pickDirectory.mockResolvedValue(root);
    await app.openFolder();
    const { session, unexported } = await openedOf(app);
    root.failWrites = new Error('NoModificationAllowedError');
    session.actions.renameProject('Baixado');
    await session.flush();
    expect((await app.buildExport()).ok).toBe(true);
    await app.markExported();
    root.failWrites = null;
    expect(await session.flush()).toEqual({ ok: true });
    expect(unexported.value).toBe(false);
  });

  // Etapa 8 (8.4), R5: uma falha da permissão (ativação expirada, volume desmontado) dá o
  // aviso com Localizar/Remover, não só "Não foi possível acessar os arquivos".
  it('SecurityError no requestPermission: aviso de permissão, com o erro no Diagnóstico', async () => {
    const root = projectFolder();
    await openViaPicker(root);
    root.permission = 'prompt';
    vi.spyOn(root, 'requestPermission').mockRejectedValue(
      new DOMException('ativação expirada', 'SecurityError'),
    );
    expect(await app.openRecentFolder(idOf('pasta'))).toEqual({
      ok: true,
      value: { kind: 'unavailable', reason: 'denied' },
    });
    expect(app.openProject.value).toBeNull();
    const report = await import('../../src/utils/report');
    expect(report.reportedErrors.value.map((e) => e.context)).toContain(
      'folders.permission',
    );
  });

  // Etapa 8 (8.4), R6: o banco dos handles também pede armazenamento persistente.
  it('guardar a pasta pede armazenamento persistente', async () => {
    const persist = vi.fn(async () => true);
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { persist },
    });
    try {
      await openViaPicker(projectFolder());
      expect(folders()).toHaveLength(1);
      expect(persist).toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(navigator, 'storage');
    }
  });

  // Etapa 8 (8.4): a cópia da pasta é o id da entrada dos recentes (chave do retomar, 8.2).
  it('copyId da pasta é o id da entrada: pelo seletor, pelo recente e depois do Localizar', async () => {
    const root = projectFolder();
    pickDirectory.mockResolvedValue(root);
    await app.openFolder();
    const first = (await openedOf(app)).session.storage.copyId;
    await app.closeProject();
    const id = idOf('pasta');
    expect(first).toBe(id);
    await app.openRecentFolder(id);
    expect((await openedOf(app)).session.storage.copyId).toBe(id);
    await app.closeProject();
    root.gone = true;
    pickDirectory.mockResolvedValue(projectFolder('pasta-movida'));
    expect(await app.relocateFolder(id)).toEqual({ ok: true, value: { kind: 'opened' } });
    expect((await openedOf(app)).session.storage.copyId).toBe(id);
  });

  it('copyId da pasta reparada é o id da entrada', async () => {
    const root = new PermissionDirectory('reparo');
    root.put('mapping.json', readInvalidFixture('missing-parent'));
    pickDirectory.mockResolvedValue(root);
    const result = await app.openFolder();
    if (result.ok || !result.inconsistent?.repair)
      throw new Error('deveria pedir o reparo');
    expect((await result.inconsistent.repair()).ok).toBe(true);
    const copyId = (await openedOf(app)).session.storage.copyId;
    await app.closeProject();
    expect(copyId).toBe(idOf('reparo'));
  });

  it('copyId da pasta sem recentes: um id por aba, o mesmo ao reabrir a mesma pasta', async () => {
    const plain = (name: string) => {
      const dir = new MemoryDirectory(name);
      dir.put('mapping.json', serialize(emptyProject()));
      return dir;
    };
    const copyOf = async (dir: MemoryDirectory) => {
      pickDirectory.mockResolvedValue(dir);
      await app.openFolder();
      const copyId = (await openedOf(app)).session.storage.copyId;
      await app.closeProject();
      return copyId;
    };
    const first = await copyOf(plain('simples'));
    expect(first).toEqual(expect.any(String));
    expect(first).not.toBe('');
    expect(await copyOf(plain('simples'))).toBe(first);
    expect(await copyOf(plain('outra'))).not.toBe(first);
    expect(folders()).toEqual([]);
  });

  // Etapa 8 (8.4), R7: duas linhas iguais na lista ficam distinguíveis pelo nome da pasta.
  it('nomes repetidos na lista mostram o nome da pasta', async () => {
    await openViaPicker(projectFolder('a', 'Loja'));
    await openViaPicker(projectFolder('b', 'Loja'));
    await openViaPicker(projectFolder('c', 'c'));
    const show = Object.fromEntries(
      folders().map((p) =>
        p.kind === 'folder' ? [p.folderName, p.showFolderName] : ['', false],
      ),
    );
    expect(show).toEqual({ a: true, b: true, c: false });
  });

  it('permissão já concedida: um clique abre e atualiza a data, sem mudar o mapping.json', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T10:00:00.000Z'));
    const root = projectFolder();
    const before = await root.read('mapping.json');
    await openViaPicker(root);
    vi.setSystemTime(new Date('2026-10-05T10:00:00.000Z'));
    expect(await app.openRecentFolder(idOf('pasta'))).toEqual({
      ok: true,
      value: { kind: 'opened' },
    });
    expect((await openedOf(app)).kind).toBe('folder');
    expect(root.requests).toBe(0);
    await app.closeProject();
    expect(folders()[0]?.usedAt).toBe('2026-10-05T10:00:00.000Z');
    expect(await root.read('mapping.json')).toBe(before);
  });

  it('permissão a pedir: pede dentro do clique e abre', async () => {
    const root = projectFolder();
    await openViaPicker(root);
    root.permission = 'prompt';
    const query = vi.spyOn(root, 'queryPermission');
    const opening = app.openRecentFolder(idOf('pasta'));
    // A consulta começa no próprio clique, antes de qualquer outra espera.
    expect(query).toHaveBeenCalledWith({ mode: 'readwrite' });
    expect(await opening).toEqual({ ok: true, value: { kind: 'opened' } });
    expect(root.requests).toBe(1);
  });

  it('permissão negada: aviso, nada aberto', async () => {
    const root = projectFolder();
    await openViaPicker(root);
    root.permission = 'prompt';
    root.answer = 'denied';
    expect(await app.openRecentFolder(idOf('pasta'))).toEqual({
      ok: true,
      value: { kind: 'unavailable', reason: 'denied' },
    });
    expect(app.openProject.value).toBeNull();
    expect(folders()).toHaveLength(1);
  });

  it('pasta movida ou apagada (NotFoundError): aviso, nada aberto', async () => {
    const root = projectFolder();
    await openViaPicker(root);
    root.gone = true;
    expect(await app.openRecentFolder(idOf('pasta'))).toEqual({
      ok: true,
      value: { kind: 'unavailable', reason: 'missing' },
    });
    expect(app.openProject.value).toBeNull();
  });

  it('Localizar pasta: substitui o handle, conferindo o mapping.json', async () => {
    const root = projectFolder();
    await openViaPicker(root);
    const id = idOf('pasta');
    root.gone = true;

    // Pasta sem mapping.json: não é o projeto; a entrada fica como estava.
    pickDirectory.mockResolvedValue(new PermissionDirectory('vazia'));
    expect(await app.relocateFolder(id)).toEqual({
      ok: true,
      value: { kind: 'no-project' },
    });
    expect(app.openProject.value).toBeNull();
    expect(folders().map((p) => p.folderName)).toEqual(['pasta']);

    pickDirectory.mockResolvedValue(null);
    expect(await app.relocateFolder(id)).toEqual({
      ok: true,
      value: { kind: 'cancelled' },
    });

    const moved = projectFolder('pasta-movida');
    pickDirectory.mockResolvedValue(moved);
    expect(await app.relocateFolder(id)).toEqual({ ok: true, value: { kind: 'opened' } });
    await app.closeProject();
    expect(folders().map((p) => [p.id, p.folderName])).toEqual([[id, 'pasta-movida']]);
    expect(await app.openRecentFolder(id)).toEqual({
      ok: true,
      value: { kind: 'opened' },
    });
  });

  it('Localizar uma pasta que já está na lista junta as duas entradas', async () => {
    const a = projectFolder('a', 'A');
    const b = projectFolder('b', 'B');
    await openViaPicker(a);
    await openViaPicker(b);
    a.gone = true;
    pickDirectory.mockResolvedValue(b);
    expect((await app.relocateFolder(idOf('a'))).ok).toBe(true);
    await app.closeProject();
    expect(folders().map((p) => p.folderName)).toEqual(['b']);
  });

  it('Remover da lista não apaga nada do disco', async () => {
    const root = projectFolder();
    await openViaPicker(root);
    const before = await root.read('mapping.json');
    expect((await app.forgetFolder(idOf('pasta'))).ok).toBe(true);
    expect(folders()).toEqual([]);
    expect(await root.read('mapping.json')).toBe(before);
    ({ app, local } = await load());
    expect(folders()).toEqual([]);
  });

  // Etapa 8 (8.4), R8: numa visita nova, a leitura do handle no IndexedDB (`handleOf`) vem
  // ANTES do `queryPermission`. O `requestPermission` só abre o pedido dentro da ativação do
  // gesto (alguns segundos): essa leitura precisa continuar curta e ser a única espera antes
  // da consulta. Não ponha outra espera (rede, outra leitura, `remember`) nesse caminho.
  it('numa visita nova, o handle vem do IndexedDB e a permissão é pedida', async () => {
    const root = projectFolder();
    await openViaPicker(root);
    ({ app, local } = await load());
    root.permission = 'prompt';
    expect(await app.openRecentFolder(idOf('pasta'))).toEqual({
      ok: true,
      value: { kind: 'opened' },
    });
    expect(root.requests).toBe(1);
  });

  it('pasta do armazenamento privado da origem (OPFS) não entra na lista', async () => {
    const root = projectFolder('opfs');
    // A raiz do OPFS reconhece a pasta como sua (`resolve` devolve o caminho).
    const opfs = {
      isSameEntry: async () => false,
      resolve: async (h: unknown) => (h === root ? ['opfs'] : null),
    };
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { getDirectory: async () => opfs },
    });
    try {
      await openViaPicker(root);
      expect(folders()).toEqual([]);
      await openViaPicker(projectFolder('fora'));
      expect(folders().map((p) => p.folderName)).toEqual(['fora']);
    } finally {
      Reflect.deleteProperty(navigator, 'storage');
    }
  });

  it('navegador sem queryPermission/isSameEntry: a lista fica só com os locais', async () => {
    const plain = new MemoryDirectory('simples');
    plain.put('mapping.json', serialize(emptyProject()));
    await openViaPicker(plain);
    expect(folders()).toEqual([]);
  });

  it('sem o modo pasta, as pastas guardadas não aparecem', async () => {
    await openViaPicker(projectFolder());
    vi.stubGlobal('showDirectoryPicker', undefined);
    ({ app, local } = await load());
    expect(app.features.value?.folder).toBe(false);
    expect(folders()).toEqual([]);
  });

  // Devolução do portão da 8.4 (achado 1): o Abrir grava no rastro o caminho que tomou, para o
  // Diagnóstico (`folders.reopen`). O rastro aqui é um objeto simples com `step`.
  describe('rastro do Abrir', () => {
    const recorder = () => {
      const steps: string[] = [];
      return { steps, step: (label: string) => void steps.push(label) };
    };

    it('o caso do relato: pedido concedido e a pasta renomeada', async () => {
      const root = projectFolder();
      await openViaPicker(root);
      ({ app, local } = await load());
      root.permission = 'prompt';
      root.gone = true;
      const trace = recorder();
      expect(await app.openRecentFolder(idOf('pasta'), trace)).toEqual({
        ok: true,
        value: { kind: 'unavailable', reason: 'missing' },
      });
      expect(trace.steps).toEqual([
        'handle=idb',
        'query=prompt',
        'request=granted',
        'branch=no-mapping',
      ]);
    });

    it('permissão já valendo e projeto aberto', async () => {
      await openViaPicker(projectFolder());
      const trace = recorder();
      await app.openRecentFolder(idOf('pasta'), trace);
      expect(trace.steps).toEqual(['handle=memory', 'query=granted', 'branch=opened']);
    });

    it('permissão negada', async () => {
      const root = projectFolder();
      await openViaPicker(root);
      root.permission = 'prompt';
      root.answer = 'denied';
      const trace = recorder();
      await app.openRecentFolder(idOf('pasta'), trace);
      expect(trace.steps).toEqual([
        'handle=memory',
        'query=prompt',
        'request=denied',
        'branch=denied',
      ]);
    });

    it('exceção no pedido: SecurityError e NotFoundError', async () => {
      const root = projectFolder();
      await openViaPicker(root);
      root.permission = 'prompt';
      const request = vi
        .spyOn(root, 'requestPermission')
        .mockRejectedValue(new DOMException('ativação expirada', 'SecurityError'));
      const trace = recorder();
      await app.openRecentFolder(idOf('pasta'), trace);
      expect(trace.steps.at(-1)).toBe('branch=permission-error:SecurityError');
      request.mockRejectedValue(new DOMException('sumiu', 'NotFoundError'));
      const again = recorder();
      await app.openRecentFolder(idOf('pasta'), again);
      expect(again.steps.at(-1)).toBe('branch=permission-missing');
    });

    it('sem handle utilizável numa visita nova', async () => {
      const root = projectFolder();
      await openViaPicker(root);
      ({ app, local } = await load());
      Object.defineProperty(root, 'requestPermission', { value: undefined });
      const trace = recorder();
      expect(await app.openRecentFolder(idOf('pasta'), trace)).toEqual({
        ok: true,
        value: { kind: 'unavailable', reason: 'missing' },
      });
      expect(trace.steps).toEqual(['handle=idb', 'branch=no-handle']);
    });

    it('entrada que saiu da lista', async () => {
      const trace = recorder();
      expect((await app.openRecentFolder('nao-existe', trace)).ok).toBe(false);
      expect(trace.steps).toEqual(['branch=no-entry']);
    });

    it('o projeto não abre: o código do erro', async () => {
      const root = projectFolder();
      await openViaPicker(root);
      root.put('mapping.json', '{');
      const trace = recorder();
      const result = await app.openRecentFolder(idOf('pasta'), trace);
      expect(result.ok).toBe(false);
      expect(trace.steps.at(-1)).toBe(
        `branch=open-failed:${result.ok ? '' : result.error}`,
      );
    });

    it('exceção fora da permissão: o nome dela', async () => {
      const root = projectFolder();
      await openViaPicker(root);
      vi.spyOn(root, 'getFileHandle').mockRejectedValue(
        new DOMException('travado', 'InvalidStateError'),
      );
      const trace = recorder();
      expect(await app.openRecentFolder(idOf('pasta'), trace)).toEqual({
        ok: false,
        error: 'storage-failed',
      });
      expect(trace.steps.at(-1)).toBe('branch=exception:InvalidStateError');
    });
  });
});
