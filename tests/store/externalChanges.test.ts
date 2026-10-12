// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deserialize, readRevision, serialize, type Project } from '../../src/model';
import { AUTOSAVE_DELAY_MS } from '../../src/storage/autosave';
import { createFolderStorage } from '../../src/storage/folder';
import { openSession, type ProjectSession } from '../../src/store/session';
import { clearReportedErrors } from '../../src/utils/report';
import { NOW, emptyProject, sampleProject } from '../model/fixtures';
import { MemoryDirectory } from '../storage/memoryFs';

// Etapa 3a.2: a revisão do `mapping.json`, as alterações externas (o MCP, um editor de texto)
// e o que a sessão faz com elas: recusar a gravação, recarregar ou deixar o usuário decidir.

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  clearReportedErrors();
});

/** Pasta com o projeto já gravado (revisão `revision`), como a app a encontra ao abrir. */
function projectOnDisk(project: Project, revision = 0) {
  const root = new MemoryDirectory('mapeamento');
  const text = serialize({ ...project, revision });
  root.put('mapping.json', text);
  return { root, text, project: { ...project, revision } };
}

function open(
  root: MemoryDirectory,
  project: Project,
  text: string,
  onImagesChanged?: (paths: readonly string[]) => void,
) {
  return openSession({
    storage: createFolderStorage(root),
    project,
    loadedText: text,
    onImagesChanged,
    prepareImage: () => Promise.reject(new Error('sem imagens aqui')),
    now: () => NOW,
  });
}

async function diskProject(root: MemoryDirectory): Promise<Project> {
  const parsed = deserialize((await root.read('mapping.json')) ?? '');
  if (!parsed.ok) throw new Error('mapping.json inválido');
  return parsed.project;
}

/** Outro processo (o MCP) grava o arquivo: muda o nome e sobe a revisão. */
function externalWrite(
  root: MemoryDirectory,
  project: Project,
  revision: number,
  name: string,
) {
  const next = { ...project, revision, project: { ...project.project, name } };
  root.put('mapping.json', serialize(next));
  return next;
}

describe('revisão do mapping.json', () => {
  let session: ProjectSession | null = null;
  afterEach(async () => {
    await session?.close();
    session = null;
  });

  it('cada gravação sobe a revisão em 1', async () => {
    const { root, text, project } = projectOnDisk(sampleProject(), 4);
    session = open(root, project, text);
    session.actions.renameProject('Um');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect((await diskProject(root)).revision).toBe(5);
    session.actions.renameProject('Dois');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect((await diskProject(root)).revision).toBe(6);
    expect(session.saveStatus.value).toBe('saved');
  });

  it('um arquivo v5 (sem revisão) é lido como 0 e a primeira gravação grava 1', async () => {
    const root = new MemoryDirectory('p');
    const project = emptyProject();
    const v5 = JSON.parse(serialize(project)) as Record<string, unknown>;
    delete v5.revision;
    const text = JSON.stringify(v5);
    root.put('mapping.json', text);
    expect(readRevision(text)).toBe(0);
    session = open(root, project, text);
    session.actions.renameProject('Novo');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect((await diskProject(root)).revision).toBe(1);
  });

  it('recusa gravar se outro processo mudou o arquivo e abre o conflito', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    const external = externalWrite(root, project, 1, 'Feito pelo MCP');

    session.actions.renameProject('Meu nome');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);

    expect(session.saveStatus.value).toBe('error');
    expect(session.conflict.value).toEqual({ reloadFailed: false });
    // O arquivo do outro processo continua intacto.
    expect(await root.read('mapping.json')).toBe(serialize(external));
  });

  it('percebe também a edição à mão, que não mexe na revisão', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    root.put('mapping.json', text.replace('"Teste"', '"Editado à mão"'));
    session.actions.renameProject('Meu nome');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(session.conflict.value).not.toBeNull();
  });

  it('"Manter as minhas" grava por cima, com a revisão seguinte à do arquivo', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    externalWrite(root, project, 7, 'Feito pelo MCP');
    session.actions.renameProject('Meu nome');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(session.conflict.value).not.toBeNull();

    await session.resolveConflict('keep');

    expect(session.conflict.value).toBeNull();
    expect(session.saveStatus.value).toBe('saved');
    const saved = await diskProject(root);
    expect(saved.project.name).toBe('Meu nome');
    expect(saved.revision).toBe(8);
  });

  it('"Recarregar" descarta as alterações locais e abre o arquivo como está', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    const external = externalWrite(root, project, 1, 'Feito pelo MCP');
    session.actions.renameProject('Meu nome');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);

    await session.resolveConflict('reload');
    await vi.advanceTimersByTimeAsync(2000);

    expect(session.conflict.value).toBeNull();
    expect(session.store.project.value?.project.name).toBe('Feito pelo MCP');
    expect(session.store.canUndo.value).toBe(false);
    expect(session.saveStatus.value).toBe('saved');
    expect(session.reloads.value).toBe(1);
    // Nada foi gravado por cima.
    expect(await root.read('mapping.json')).toBe(serialize(external));
  });

  it('"Recarregar" com o arquivo ilegível mantém o conflito aberto, avisando', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    externalWrite(root, project, 1, 'Feito pelo MCP');
    session.actions.renameProject('Meu nome');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);

    root.put('mapping.json', '{ isso não é json');
    await session.resolveConflict('reload');
    expect(session.conflict.value).toEqual({ reloadFailed: true });

    // Ainda dá para decidir manter as minhas.
    await session.resolveConflict('keep');
    expect(session.conflict.value).toBeNull();
    expect((await diskProject(root)).project.name).toBe('Meu nome');
  });

  it('um arquivo apagado por fora é gravado de novo, sem conflito', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    root.files.delete('mapping.json');
    session.actions.renameProject('Meu nome');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(session.conflict.value).toBeNull();
    expect((await diskProject(root)).project.name).toBe('Meu nome');
  });

  it('o zip exportado leva a revisão do disco', async () => {
    const { root, text, project } = projectOnDisk(sampleProject(), 3);
    session = open(root, project, text);
    session.actions.renameProject('Um');
    const files = await session.collectFiles();
    expect(readRevision(files.mapping)).toBe(4);
  });
});

describe('mudanças externas', () => {
  let session: ProjectSession | null = null;
  afterEach(async () => {
    await session?.close();
    session = null;
  });

  it('recarrega sozinha quando o arquivo muda e não há pendências', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    externalWrite(root, project, 1, 'Feito pelo MCP');

    expect(await session.sync()).toBe('reloaded');

    expect(session.store.project.value?.project.name).toBe('Feito pelo MCP');
    expect(session.reloads.value).toBe(1);
    // Recarregar não grava nada, nem agenda gravação.
    await vi.advanceTimersByTimeAsync(2000);
    expect((await diskProject(root)).revision).toBe(1);
    expect(session.saveStatus.value).toBe('saved');
    // E uma gravação seguinte parte da revisão nova.
    session.actions.renameProject('Depois');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect((await diskProject(root)).revision).toBe(2);
  });

  it('não recarrega de novo quando nada mudou (nem a própria gravação conta)', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    expect(await session.sync()).toBe('unchanged');
    session.actions.renameProject('Meu nome');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(await session.sync()).toBe('unchanged');
    expect(session.reloads.value).toBe(0);
  });

  it('só a data do arquivo mudou (touch): o conteúdo é o mesmo, não recarrega', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    root.touch('mapping.json');
    expect(await session.sync()).toBe('unchanged');
    expect(session.reloads.value).toBe(0);
  });

  it('com alterações locais pendentes, não recarrega: a gravação decide', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    externalWrite(root, project, 1, 'Feito pelo MCP');
    session.actions.renameProject('Meu nome');

    expect(await session.sync()).toBe('busy');
    expect(session.store.project.value?.project.name).toBe('Meu nome');

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(session.conflict.value).not.toBeNull();
  });

  it('um gesto em andamento também segura a recarga', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    externalWrite(root, project, 1, 'Feito pelo MCP');
    session.store.beginGesture();
    expect(await session.sync()).toBe('busy');
    session.store.cancelGesture();
    expect(await session.sync()).toBe('reloaded');
  });

  it('arquivo escrito pela metade (ilegível) é ignorado até ficar válido', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    root.put('mapping.json', '{ "schemaVersion": 6, ');
    expect(await session.sync()).toBe('unchanged');
    expect(session.reloads.value).toBe(0);

    externalWrite(root, project, 1, 'Pronto');
    expect(await session.sync()).toBe('reloaded');
    expect(session.store.project.value?.project.name).toBe('Pronto');
  });

  it('com o conflito aberto, não recarrega por baixo do diálogo', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    externalWrite(root, project, 1, 'Feito pelo MCP');
    session.actions.renameProject('Meu nome');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(session.conflict.value).not.toBeNull();
    expect(await session.sync()).toBe('unchanged');
    expect(session.reloads.value).toBe(0);
  });

  it('o recarregamento zera o histórico e passa a gravar as cópias de specs/ certas', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    session.actions.renameProject('Local');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(session.store.canUndo.value).toBe(true);
    const current = await diskProject(root);
    externalWrite(root, current, current.revision + 1, 'Externo');
    expect(await session.sync()).toBe('reloaded');
    expect(session.store.canUndo.value).toBe(false);
  });

  it('um projeto fora de pasta (sem statMapping) não é observável', async () => {
    const root = new MemoryDirectory('p');
    const storage = createFolderStorage(root);
    const { statMapping, statImage, ...local } = storage;
    void statMapping;
    void statImage;
    session = openSession({
      storage: { ...local, kind: 'local' },
      project: emptyProject(),
      prepareImage: () => Promise.reject(new Error('x')),
    });
    expect(session.watchable).toBe(false);
    expect(await session.sync()).toBe('unchanged');
  });
});

describe('imagens trocadas por fora', () => {
  let session: ProjectSession | null = null;
  afterEach(async () => {
    await session?.close();
    session = null;
  });

  function withImages() {
    const disk = projectOnDisk(sampleProject());
    disk.root.put('images/lateral.jpg', 'v1-lateral');
    disk.root.put('images/frente.jpg', 'v1-frente');
    return disk;
  }

  it('avisa só o arquivo trocado ao conferir as imagens (foco de volta na janela)', async () => {
    const { root, text, project } = withImages();
    const changed: string[][] = [];
    session = open(root, project, text, (paths) => changed.push([...paths]));

    expect(await session.sync({ images: true })).toBe('unchanged');
    expect(changed).toEqual([]);

    root.put('images/frente.jpg', 'v2-frente-maior');
    await session.sync({ images: true });
    expect(changed).toEqual([['images/frente.jpg']]);

    // O carimbo novo vira o conhecido: a conferência seguinte não repete o aviso.
    await session.sync({ images: true });
    expect(changed).toHaveLength(1);
  });

  it('a conferência a cada 3 s (sem images) não olha os arquivos de imagem', async () => {
    const { root, text, project } = withImages();
    const changed: string[][] = [];
    session = open(root, project, text, (paths) => changed.push([...paths]));
    root.put('images/frente.jpg', 'v2-frente-maior');
    await session.sync();
    expect(changed).toEqual([]);
  });

  it('depois de recarregar o projeto, avisa as imagens novas e as trocadas', async () => {
    const { root, text, project } = withImages();
    const changed: string[][] = [];
    session = open(root, project, text, (paths) => changed.push([...paths]));
    await session.sync({ images: true });

    root.put('images/lateral.jpg', 'v2-lateral-trocada');
    externalWrite(root, project, 1, 'Trocou a lateral');
    expect(await session.sync()).toBe('reloaded');
    expect(changed.flat()).toContain('images/lateral.jpg');
    expect(changed.flat()).not.toContain('images/frente.jpg');
  });

  it('uma imagem que estava ausente e aparece por fora é recarregada', async () => {
    const disk = projectOnDisk(sampleProject());
    disk.root.put('images/frente.jpg', 'v1-frente'); // a lateral ainda não existe
    const changed: string[][] = [];
    session = open(disk.root, disk.project, disk.text, (paths) =>
      changed.push([...paths]),
    );
    await session.sync({ images: true });
    expect(changed).toEqual([]);

    disk.root.put('images/lateral.jpg', 'chegou');
    await session.sync({ images: true });
    expect(changed).toEqual([['images/lateral.jpg']]);
  });
});

// Etapa 6 (6.2), achado 8 do relato de 2026-10-11 (R6.10): com a gravação em erro (o arquivo
// travado), a conferência periódica devolvia `busy` sem olhar o disco, e a alteração feita por
// fora só aparecia ao clicar em "Tentar de novo".
describe('alteração externa com a gravação em erro (fase 6.2)', () => {
  let session: ProjectSession | null = null;
  afterEach(async () => {
    await session?.close();
    session = null;
  });

  /** Gravação travada (somente leitura) com uma edição local pendente: "Erro ao salvar". */
  async function failedSave(root: MemoryDirectory, s: ProjectSession) {
    root.failWrites = new Error('NoModificationAllowedError');
    s.actions.renameProject('Título app');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(s.saveStatus.value).toBe('error');
    expect(s.conflict.value).toBeNull();
  }

  it('o arquivo mudou por fora: a conferência abre o conflito, sem recarregar', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    await failedSave(root, session);
    const external = externalWrite(root, project, 1, 'Rodapé externo');

    expect(await session.sync()).toBe('conflict');

    expect(session.conflict.value).toEqual({ reloadFailed: false });
    // Há pendência: nada é recarregado nem gravado por cima.
    expect(session.store.project.value?.project.name).toBe('Título app');
    expect(session.reloads.value).toBe(0);
    expect(session.saveStatus.value).toBe('error');
    expect(await root.read('mapping.json')).toBe(serialize(external));
  });

  it('percebe também a edição à mão (mesma revisão)', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    await failedSave(root, session);
    root.put('mapping.json', text.replace('"Teste"', '"Editado à mão"'));
    expect(await session.sync()).toBe('conflict');
    expect(session.conflict.value).not.toBeNull();
  });

  it('o arquivo não mudou: nada acontece e o erro continua', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    await failedSave(root, session);
    expect(await session.sync()).toBe('unchanged');
    root.touch('mapping.json');
    expect(await session.sync()).toBe('unchanged');
    expect(session.conflict.value).toBeNull();
    expect(session.saveStatus.value).toBe('error');
    expect(session.store.project.value?.project.name).toBe('Título app');
  });

  it('um gesto em andamento segura a conferência', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    await failedSave(root, session);
    externalWrite(root, project, 1, 'Rodapé externo');
    session.store.beginGesture();
    expect(await session.sync()).toBe('busy');
    expect(session.conflict.value).toBeNull();
    session.store.cancelGesture();
    expect(await session.sync()).toBe('conflict');
  });

  it('"Recarregar" a partir desse estado descarta a pendência e lê o arquivo', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    await failedSave(root, session);
    const external = externalWrite(root, project, 1, 'Rodapé externo');
    expect(await session.sync()).toBe('conflict');

    await session.resolveConflict('reload');

    expect(session.conflict.value).toBeNull();
    expect(session.saveStatus.value).toBe('saved');
    expect(session.store.project.value?.project.name).toBe('Rodapé externo');
    expect(session.reloads.value).toBe(1);
    expect(await root.read('mapping.json')).toBe(serialize(external));
  });

  it('"Manter as minhas" a partir desse estado grava por cima, com a revisão nova', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    await failedSave(root, session);
    externalWrite(root, project, 7, 'Rodapé externo');
    expect(await session.sync()).toBe('conflict');

    // R6.11: devolve a permissão e escolhe manter as minhas.
    root.failWrites = null;
    await session.resolveConflict('keep');

    expect(session.conflict.value).toBeNull();
    expect(session.saveStatus.value).toBe('saved');
    const saved = await diskProject(root);
    expect(saved.project.name).toBe('Título app');
    expect(saved.revision).toBe(8);
  });

  it('"Manter as minhas" com o arquivo ainda travado volta ao erro, sem conflito', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    session = open(root, project, text);
    await failedSave(root, session);
    const external = externalWrite(root, project, 1, 'Rodapé externo');
    expect(await session.sync()).toBe('conflict');

    await session.resolveConflict('keep');

    expect(session.conflict.value).toBeNull();
    expect(session.saveStatus.value).toBe('error');
    expect(await root.read('mapping.json')).toBe(serialize(external));
    // O arquivo de fora virou o conhecido: a conferência seguinte não reabre o conflito.
    expect(await session.sync()).toBe('unchanged');
    expect(session.conflict.value).toBeNull();
  });
});

describe('conferência e gravação não se cruzam (fase 6.2)', () => {
  let session: ProjectSession | null = null;
  afterEach(async () => {
    await session?.close();
    session = null;
  });

  function deferred() {
    let resolve!: () => void;
    let reject!: (e: Error) => void;
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  /**
   * Sessão sobre a pasta com ganchos no armazenamento: `holdSave` segura a próxima gravação
   * do `mapping.json` (antes ou depois de escrever) e `holdRead` segura a próxima leitura dele,
   * devolvendo o texto lido antes da espera.
   */
  function hooked(root: MemoryDirectory, project: Project, text: string) {
    const storage = createFolderStorage(root);
    const saves: { gate: Promise<void>; afterWrite: boolean }[] = [];
    let readGate: Promise<void> | null = null;
    let savesStarted = 0;
    let readsHeld = 0;
    const s = openSession({
      storage: {
        ...storage,
        saveMapping: async (data) => {
          savesStarted++;
          const hold = saves.shift();
          if (hold && !hold.afterWrite) await hold.gate;
          await storage.saveMapping(data);
          if (hold?.afterWrite) await hold.gate;
        },
        loadMapping: async () => {
          const read = await storage.loadMapping();
          const gate = readGate;
          readGate = null;
          if (gate) {
            readsHeld++;
            await gate;
          }
          return read;
        },
      },
      project,
      loadedText: text,
      prepareImage: () => Promise.reject(new Error('sem imagens aqui')),
      now: () => NOW,
    });
    return {
      session: s,
      holdSave(afterWrite: boolean) {
        const d = deferred();
        saves.push({ gate: d.promise, afterWrite });
        return d;
      },
      holdRead() {
        const d = deferred();
        readGate = d.promise;
        return d;
      },
      savesStarted: () => savesStarted,
      readsHeld: () => readsHeld,
    };
  }

  it('"Tentar de novo" durante a conferência: a leitura antiga não vira conflito', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    const h = hooked(root, project, text);
    session = h.session;
    root.failWrites = new Error('NoModificationAllowedError');
    session.actions.renameProject('Título app');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(session.saveStatus.value).toBe('error');

    // A conferência lê o arquivo de antes e fica parada; enquanto isso, a permissão volta,
    // "Tentar de novo" grava, o arquivo volta a travar e a edição seguinte falha de novo.
    const read = h.holdRead();
    const syncing = session.sync();
    await vi.waitFor(() => expect(h.readsHeld()).toBe(1));
    root.failWrites = null;
    expect(await session.flush()).toEqual({ ok: true });
    expect(session.saveStatus.value).toBe('saved');
    root.failWrites = new Error('NoModificationAllowedError');
    session.actions.renameProject('Outro título');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(session.saveStatus.value).toBe('error');
    read.resolve();

    // O texto lido antes da gravação não é o que a sessão gravou, mas não é de fora.
    expect(await syncing).toBe('busy');
    expect(session.conflict.value).toBeNull();
    expect((await diskProject(root)).project.name).toBe('Título app');
    expect(await session.sync()).toBe('unchanged');
  });

  it('com o status em erro e uma gravação em curso, a conferência espera', async () => {
    const { root, text, project } = projectOnDisk(sampleProject());
    const h = hooked(root, project, text);
    session = h.session;
    // A primeira gravação fica parada e depois falha; a segunda, enfileirada atrás dela,
    // começa já com o status em erro e para logo depois de escrever o arquivo.
    const first = h.holdSave(false);
    session.actions.renameProject('Um');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    await vi.waitFor(() => expect(h.savesStarted()).toBe(1));
    session.actions.renameProject('Dois');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    const second = h.holdSave(true);
    first.reject(new Error('NoModificationAllowedError'));
    await vi.waitFor(() => expect(h.savesStarted()).toBe(2));
    await vi.waitFor(async () =>
      expect((await diskProject(root)).project.name).toBe('Dois'),
    );
    expect(session.saveStatus.value).toBe('error');

    // O arquivo já tem a gravação nova, mas a sessão ainda não a registrou.
    expect(await session.sync()).toBe('busy');
    expect(session.conflict.value).toBeNull();

    second.resolve();
    await vi.waitFor(() => expect(session?.saveStatus.value).toBe('saved'));
    expect(await session.sync()).toBe('unchanged');
    expect(session.conflict.value).toBeNull();
  });
});
