// @vitest-environment node
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCHEMA_VERSION, deserialize, serialize } from '../../src/model';
import { createFolderStorage } from '../../src/storage/folder';
import type { PreparedImage } from '../../src/storage/imageImport';
import { HISTORY_LIMIT } from '../../src/store/history';
import { openSession, type ProjectSession } from '../../src/store/session';
import { clearReportedErrors, reportedErrors } from '../../src/utils/report';
import { NOW, emptyProject, sampleProject } from '../model/fixtures';
import { loadExample } from '../model/specFixtures';
import { MemoryDirectory } from '../storage/memoryFs';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** "Decodificador" fake: o conteúdo do arquivo é "LxA"; "ruim" falha. */
async function prepareImage(file: File): Promise<PreparedImage> {
  const text = await file.text();
  const match = /^(\d+)x(\d+)$/.exec(text);
  if (!match) throw new Error('decode');
  return {
    name: file.name,
    data: file,
    width: Number(match[1]),
    height: Number(match[2]),
  };
}

function ids() {
  let n = 0;
  return () => `id-${++n}`;
}

function start(root: MemoryDirectory, project = emptyProject(), readOnly = false) {
  return openSession({
    storage: createFolderStorage(root),
    project,
    readOnly,
    prepareImage,
    now: () => NOW,
    newId: ids(),
  });
}

async function savedProject(root: MemoryDirectory) {
  const text = await root.read('mapping.json');
  const parsed = deserialize(text ?? '');
  if (!parsed.ok) throw new Error(`mapping inválido: ${text}`);
  return parsed.project;
}

const file = (name: string, content: string) => new File([content], name);

describe('sessão de projeto', () => {
  let session: ProjectSession | null = null;
  afterEach(async () => {
    await session?.close();
    session = null;
  });

  it('grava e remove a cópia em specs/ ao aplicar, remover e desfazer', async () => {
    const root = new MemoryDirectory('p');
    session = start(root);
    const sdui = loadExample('sdui');
    expect(session.actions.applySpecialization(sdui).ok).toBe(true);
    await vi.advanceTimersByTimeAsync(800);
    const copy = await root.read('specs/sdui.json');
    expect(JSON.parse(copy ?? '')).toEqual(sdui);
    expect((await savedProject(root)).specializations).toEqual([
      { id: 'sdui', version: 1, file: 'specs/sdui.json', spec: null },
    ]);

    expect(session.actions.removeSpecialization('sdui', 'convert').ok).toBe(true);
    await vi.advanceTimersByTimeAsync(800);
    expect(await root.read('specs/sdui.json')).toBeNull();
    expect((await savedProject(root)).specializations).toEqual([]);

    session.store.undo();
    await vi.advanceTimersByTimeAsync(800);
    expect(await root.read('specs/sdui.json')).toBe(copy);

    const files = await session.collectFiles();
    expect([...files.specs.keys()]).toEqual(['specs/sdui.json']);
    expect(files.specs.get('specs/sdui.json')).toBe(copy);
  });

  it('adiciona imagens: grava o arquivo, cria a entrada e salva o mapping após o debounce', async () => {
    const root = new MemoryDirectory('p');
    session = start(root);
    const result = await session.addImages([
      file('a.jpg', '400x300'),
      file('a.jpg', '100x100'),
    ]);

    expect(result).toEqual({ added: ['images/a.jpg', 'images/a-2.jpg'], failed: [] });
    expect(await root.read('images/a.jpg')).toBe('400x300');
    expect(await root.read('images/a-2.jpg')).toBe('100x100');
    expect(session.saveStatus.value).toBe('saving');
    expect(await root.read('mapping.json')).toBeNull();

    await vi.advanceTimersByTimeAsync(800);
    expect(session.saveStatus.value).toBe('saved');
    const saved = await savedProject(root);
    expect(saved.images.map((i) => [i.file, i.width, i.height])).toEqual([
      ['images/a.jpg', 400, 300],
      ['images/a-2.jpg', 100, 100],
    ]);
    // Cada imagem é uma entrada de desfazer.
    session.store.undo();
    expect(session.store.project.value?.images).toHaveLength(1);
  });

  it('informa as imagens que não puderam ser importadas', async () => {
    const root = new MemoryDirectory('p');
    session = start(root);
    const result = await session.addImages([
      file('ruim.jpg', 'ruim'),
      file('b.png', '8x8'),
    ]);
    expect(result).toEqual({ added: ['images/b.png'], failed: ['ruim.jpg'] });
    expect(await root.read('images/ruim.jpg')).toBeNull();
  });

  it('remove a imagem excluída só depois de salvar e a restaura no desfazer', async () => {
    const root = new MemoryDirectory('p');
    session = start(root);
    await session.addImages([file('a.jpg', '400x300')]);
    await session.flush();
    const imageId = session.store.project.value?.images[0]?.id ?? '';

    session.actions.removeImage(imageId);
    expect(await root.read('images/a.jpg')).toBe('400x300');
    await session.flush();
    expect(await root.read('images/a.jpg')).toBeNull();
    expect((await savedProject(root)).images).toEqual([]);
    // Enquanto isso, a sessão ainda consegue ler a imagem (para exibir no desfazer).
    expect(await (await session.readImage('images/a.jpg'))?.text()).toBe('400x300');

    session.store.undo();
    await session.flush();
    expect(await root.read('images/a.jpg')).toBe('400x300');
    expect((await savedProject(root)).images.map((i) => i.file)).toEqual([
      'images/a.jpg',
    ]);
  });

  describe('trocar imagem', () => {
    async function withImage(content = '400x300') {
      const root = new MemoryDirectory('p');
      const s = start(root);
      session = s;
      await s.addImages([file('a.jpg', content)]);
      const created = s.actions.createMarking(
        s.store.project.value?.images[0]?.id ?? '',
        { x: 100, y: 100, width: 200, height: 100 },
      );
      if (!created.ok) throw new Error(created.error);
      await s.flush();
      const imageId = s.store.project.value?.images[0]?.id ?? '';
      return { root, s, imageId };
    }
    const current = (s: ProjectSession) => {
      const p = s.store.project.value;
      if (!p) throw new Error('sem projeto');
      return p;
    };

    it('mesma proporção: reescala sem perguntar e troca o arquivo', async () => {
      const { root, s, imageId } = await withImage();
      const confirm = vi.fn(async () => true);
      expect(await s.replaceImage(imageId, file('b.jpg', '800x600'), confirm)).toBe(
        'replaced',
      );
      expect(confirm).not.toHaveBeenCalled();
      const p = current(s);
      expect(p.images[0]).toMatchObject({
        file: 'images/b.jpg',
        width: 800,
        height: 600,
      });
      expect(p.markings[0]).toMatchObject({
        rect: { x: 200, y: 200, width: 400, height: 200 },
        needsReview: false,
        locked: false,
      });
      await s.flush();
      expect(await root.read('images/b.jpg')).toBe('800x600');
      expect(await root.read('images/a.jpg')).toBeNull();

      // Desfazer volta ao arquivo antigo, que é restaurado no disco.
      s.store.undo();
      await s.flush();
      expect(current(s).images[0]?.file).toBe('images/a.jpg');
      expect(await root.read('images/a.jpg')).toBe('400x300');
    });

    it('proporção diferente: pergunta e marca as marcações para revisão', async () => {
      const { s, imageId } = await withImage();
      const confirm = vi.fn(async () => true);
      expect(await s.replaceImage(imageId, file('b.jpg', '400x400'), confirm)).toBe(
        'replaced',
      );
      expect(confirm).toHaveBeenCalledWith({
        from: { width: 400, height: 300 },
        to: { width: 400, height: 400 },
      });
      expect(current(s).markings[0]?.needsReview).toBe(true);
    });

    it('proporção diferente recusada: não grava nem altera nada', async () => {
      const { root, s, imageId } = await withImage();
      const before = current(s);
      const result = await s.replaceImage(
        imageId,
        file('b.jpg', '400x400'),
        async () => false,
      );
      expect(result).toBe('cancelled');
      expect(current(s)).toBe(before);
      expect(await root.read('images/b.jpg')).toBeNull();
    });

    it('imagem trancada: trocar por outro tamanho é recusado sem perguntar nem gravar; do mesmo tamanho, não', async () => {
      const { root, s, imageId } = await withImage();
      s.actions.setImageLocked(imageId, true);
      const before = current(s);
      const confirm = vi.fn(async () => true);
      expect(await s.replaceImage(imageId, file('b.jpg', '400x400'), confirm)).toBe(
        'locked',
      );
      expect(confirm).not.toHaveBeenCalled();
      expect(current(s)).toBe(before);
      expect(await root.read('images/b.jpg')).toBeNull();
      expect(await s.replaceImage(imageId, file('c.jpg', '400x300'), confirm)).toBe(
        'replaced',
      );
      expect(current(s).images[0]).toMatchObject({ file: 'images/c.jpg', locked: true });
    });

    it('marcação trancada: trocar por outro tamanho é recusado', async () => {
      const { s, imageId } = await withImage();
      s.actions.setMarkingLocked(current(s).markings[0]?.id ?? '', true);
      expect(
        await s.replaceImage(imageId, file('b.jpg', '800x600'), async () => true),
      ).toBe('locked');
    });

    it('arquivo ilegível falha sem alterar o projeto', async () => {
      const { s, imageId } = await withImage();
      const before = current(s);
      expect(await s.replaceImage(imageId, file('b.jpg', 'ruim'), async () => true)).toBe(
        'failed',
      );
      expect(current(s)).toBe(before);
    });

    it('reaponta uma imagem ausente', async () => {
      const { root, s, imageId } = await withImage();
      await root.getDirectoryHandle('images').then((d) => d.removeEntry('a.jpg'));
      expect(await s.readImage('images/a.jpg')).toBeNull();
      expect(
        await s.replaceImage(imageId, file('a.jpg', '400x300'), async () => true),
      ).toBe('replaced');
      expect(current(s).images[0]?.file).toBe('images/a-2.jpg');
      expect(current(s).markings[0]?.rect).toEqual({
        x: 100,
        y: 100,
        width: 200,
        height: 100,
      });
    });
  });

  describe('memória: conteúdo das imagens removidas', () => {
    async function removedImage() {
      const root = new MemoryDirectory('p');
      const s = start(root);
      session = s;
      await s.addImages([file('a.jpg', '400x300')]);
      await s.flush();
      const imageId = s.store.project.value?.images[0]?.id ?? '';
      s.actions.removeImage(imageId);
      await s.flush();
      return { root, s };
    }
    const bump = (s: ProjectSession, n: number) => {
      for (let i = 0; i < n; i++) s.actions.renameProject(`nome ${i}`);
    };

    it('mantém o conteúdo enquanto o desfazer ainda restauraria a imagem', async () => {
      const { root, s } = await removedImage();
      bump(s, 5);
      await s.flush();
      expect(await root.read('images/a.jpg')).toBeNull();
      expect(await (await s.readImage('images/a.jpg'))?.text()).toBe('400x300');
      for (let i = 0; i < 6; i++) s.store.undo();
      await s.flush();
      expect(await root.read('images/a.jpg')).toBe('400x300');
    });

    it('solta o conteúdo quando nenhum snapshot do histórico referencia o arquivo', async () => {
      const { s } = await removedImage();
      expect(await s.readImage('images/a.jpg')).not.toBeNull();
      // Passa do limite do histórico: o snapshot com a imagem sai de `past`.
      bump(s, HISTORY_LIMIT + 1);
      await s.flush();
      expect(await s.readImage('images/a.jpg')).toBeNull();
    });

    it('solta o conteúdo quando uma nova alteração descarta o "refazer"', async () => {
      const root = new MemoryDirectory('p');
      const s = start(root);
      session = s;
      await s.addImages([file('a.jpg', '400x300')]);
      await s.flush();
      // Desfaz a adição: a imagem sai do projeto, mas o "refazer" ainda a restauraria.
      s.store.undo();
      await s.flush();
      expect(await root.read('images/a.jpg')).toBeNull();
      expect(await s.readImage('images/a.jpg')).not.toBeNull();
      s.store.redo();
      await s.flush();
      expect(await root.read('images/a.jpg')).toBe('400x300');

      s.store.undo();
      await s.flush();
      bump(s, 1);
      await s.flush();
      expect(await s.readImage('images/a.jpg')).toBeNull();
    });

    it('não chega a guardar o conteúdo de um arquivo que o histórico nunca restauraria', async () => {
      const root = new MemoryDirectory('p');
      const s = start(root);
      session = s;
      await s.addImages([file('a.jpg', '400x300')]);
      s.actions.removeImage(s.store.project.value?.images[0]?.id ?? '');
      bump(s, HISTORY_LIMIT + 1);
      await s.flush();
      expect(await root.read('images/a.jpg')).toBeNull();
      expect(await s.readImage('images/a.jpg')).toBeNull();
    });
  });

  it('registra no Diagnóstico a falha de gravação e a de importação', async () => {
    clearReportedErrors();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const root = new MemoryDirectory('p');
    session = start(root);
    await session.addImages([file('ruim.jpg', 'ruim')]);
    session.actions.renameProject('Outro nome');
    root.failWrites = new Error('sem permissão');
    await vi.advanceTimersByTimeAsync(800);
    expect(reportedErrors.value.map((e) => [e.context, e.message])).toEqual([
      ['session.addImage', 'decode'],
      ['save', 'sem permissão'],
    ]);
    root.failWrites = null;
    vi.restoreAllMocks();
  });

  it('com erro de gravação mostra o status e tenta de novo', async () => {
    const root = new MemoryDirectory('p');
    session = start(root);
    session.actions.renameProject('Outro nome');
    root.failWrites = new Error('sem permissão');
    await vi.advanceTimersByTimeAsync(800);
    expect(session.saveStatus.value).toBe('error');

    root.failWrites = null;
    await session.flush();
    expect(session.saveStatus.value).toBe('saved');
    expect((await savedProject(root)).project.name).toBe('Outro nome');
  });

  it('não grava nada ao abrir, nem em modo somente leitura', async () => {
    const root = new MemoryDirectory('p');
    session = start(root, sampleProject(), true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await session.addImages([file('a.jpg', '10x10')])).toEqual({
      added: [],
      failed: ['a.jpg'],
    });
    await session.flush();
    expect(root.files.size).toBe(0);
    expect(root.dirs.size).toBe(0);
  });

  it('collectFiles grava o pendente e junta mapping e imagens existentes', async () => {
    const root = new MemoryDirectory('p');
    session = start(root);
    await session.addImages([file('a.jpg', '400x300')]);
    const files = await session.collectFiles();
    expect(files.mapping).toBe(await root.read('mapping.json'));
    expect(files.mapping).toBe(serialize(await savedProject(root)));
    expect([...files.images.keys()]).toEqual(['images/a.jpg']);
  });

  it('fechar grava o que estiver pendente', async () => {
    const root = new MemoryDirectory('p');
    const s = start(root);
    s.actions.renameProject('Fechado');
    await s.close();
    expect((await savedProject(root)).project.name).toBe('Fechado');
    expect(s.store.project.value).toBeNull();
  });

  describe('backup antes de gravar um projeto migrado', () => {
    const v1Text = readFileSync(
      new URL('../fixtures/mapping-v1.json', import.meta.url),
      'utf8',
    );
    // NOW = 2026-09-30T12:00:00Z; o nome usa o horário local.
    const backupPath = () => {
      const d = new Date(NOW);
      const pad = (n: number) => String(n).padStart(2, '0');
      const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
      return `backups/mapping.v1.${stamp}.json`;
    };

    /** Abre o v1 de teste numa pasta, como o controller faz. */
    function openV1(root: MemoryDirectory, log: string[] = []) {
      root.files.set('mapping.json', new Blob([v1Text]));
      const loaded = deserialize(v1Text);
      if (!loaded.ok || loaded.migratedFrom === null) throw new Error('fixture v1');
      const storage = createFolderStorage(root);
      return openSession({
        storage: {
          ...storage,
          writeBackup: async (name, text) => {
            log.push(`backup ${name}`);
            await storage.writeBackup(name, text);
          },
          saveMapping: async (text) => {
            log.push('mapping');
            await storage.saveMapping(text);
          },
        },
        project: loaded.project,
        migratedFrom: { version: loaded.migratedFrom, text: v1Text },
        prepareImage,
        now: () => NOW,
        newId: ids(),
      });
    }

    it('abrir o v1 não grava nada; o primeiro salvamento guarda o original e só então grava o v4', async () => {
      const root = new MemoryDirectory('p');
      const log: string[] = [];
      session = openV1(root, log);
      await vi.advanceTimersByTimeAsync(2000);
      expect(log).toEqual([]);
      expect(session.backupSaved.value).toBeNull();

      session.actions.renameProject('Migrado');
      await session.flush();
      expect(log).toEqual([`backup ${backupPath().slice('backups/'.length)}`, 'mapping']);
      expect(await root.read(backupPath())).toBe(v1Text);
      const saved = JSON.parse((await root.read('mapping.json')) ?? '') as {
        schemaVersion: number;
      };
      expect(saved.schemaVersion).toBe(SCHEMA_VERSION);
      expect((await savedProject(root)).project.name).toBe('Migrado');
      expect(session.backupSaved.value).toBe(1);

      // Só uma vez por abertura.
      session.actions.renameProject('De novo');
      await session.flush();
      expect(log).toEqual([
        `backup ${backupPath().slice('backups/'.length)}`,
        'mapping',
        'mapping',
      ]);
    });

    it('se o backup falhar, o mapping original não é sobrescrito', async () => {
      const root = new MemoryDirectory('p');
      session = openV1(root);
      session.actions.renameProject('Migrado');
      root.failWrites = new Error('sem permissão');
      await vi.advanceTimersByTimeAsync(800);
      expect(session.saveStatus.value).toBe('error');
      expect(await root.read('mapping.json')).toBe(v1Text);
      expect(session.backupSaved.value).toBeNull();

      // A pasta backups/ criada na tentativa herdou a falha (memoryFs).
      root.failWrites = null;
      const backups = root.dirs.get('backups');
      if (backups) backups.failWrites = null;
      await session.flush();
      expect(session.saveStatus.value).toBe('saved');
      expect(await root.read(backupPath())).toBe(v1Text);
      expect((await savedProject(root)).project.name).toBe('Migrado');
    });

    it('projeto já na versão atual não gera backup', async () => {
      const root = new MemoryDirectory('p');
      session = start(root);
      session.actions.renameProject('Outro');
      await session.flush();
      expect(root.dirs.has('backups')).toBe(false);
      expect(session.backupSaved.value).toBeNull();
    });
  });
});
