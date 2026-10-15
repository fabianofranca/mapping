// @vitest-environment node
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SCHEMA_VERSION,
  deserialize,
  serialize,
  serializeProposal,
  specFiles,
  type Project,
} from '../../src/model';
import { AUTOSAVE_DELAY_MS } from '../../src/storage/autosave';
import { createFolderStorage } from '../../src/storage/folder';
import type { PreparedImage } from '../../src/storage/imageImport';
import { loadProposals } from '../../src/storage/loadProposals';
import { HISTORY_LIMIT } from '../../src/store/history';
import { openSession, type ProjectSession } from '../../src/store/session';
import { clearReportedErrors, reportedErrors } from '../../src/utils/report';
import { NOW, emptyProject, sampleProject } from '../model/fixtures';
import { cadastroProject, loadExample } from '../model/specFixtures';
import { richScenario } from './proposalHarness';
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
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    const copy = await root.read('specs/sdui.json');
    expect(JSON.parse(copy ?? '')).toEqual(sdui);
    expect((await savedProject(root)).specializations).toEqual([
      { id: 'sdui', version: sdui.version, file: 'specs/sdui.json', spec: null },
    ]);

    expect(session.actions.removeSpecialization('sdui', 'convert').ok).toBe(true);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(await root.read('specs/sdui.json')).toBeNull();
    expect((await savedProject(root)).specializations).toEqual([]);

    session.store.undo();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(await root.read('specs/sdui.json')).toBe(copy);

    const files = await session.collectFiles();
    expect([...files.specs.keys()]).toEqual(['specs/sdui.json']);
    expect(files.specs.get('specs/sdui.json')).toBe(copy);
  });

  it('adiciona imagens: grava o arquivo, cria a entrada e salva o mapping sem esperar o debounce', async () => {
    const root = new MemoryDirectory('p');
    session = start(root);
    const result = await session.addImages([
      file('a.jpg', '400x300'),
      file('a.jpg', '100x100'),
    ]);

    expect(result).toEqual({ added: ['images/a.jpg', 'images/a-2.jpg'], failed: [] });
    expect(await root.read('images/a.jpg')).toBe('400x300');
    expect(await root.read('images/a-2.jpg')).toBe('100x100');
    // Operação cara (fase 5.5): a importação inteira grava uma vez, ao terminar.
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

    it('guarda uma cópia em memória: num disco real o arquivo lido some junto com o arquivo', async () => {
      const root = new MemoryDirectory('p');
      const real = createFolderStorage(root);
      const gone = new Set<string>();
      // Como o `File` de uma pasta: depois que o arquivo é removido, ler o conteúdo falha.
      const storage: typeof real = {
        ...real,
        readImage: async (path) => {
          const blob = await real.readImage(path);
          if (!blob) return null;
          return {
            type: blob.type,
            arrayBuffer: () =>
              gone.has(path)
                ? Promise.reject(new Error('NotReadableError'))
                : blob.arrayBuffer(),
          } as unknown as Blob;
        },
        removeImage: async (path) => {
          await real.removeImage(path);
          gone.add(path);
        },
      };
      const s = openSession({
        storage,
        project: emptyProject(),
        readOnly: false,
        prepareImage,
        now: () => NOW,
        newId: ids(),
      });
      session = s;
      await s.addImages([file('a.jpg', '400x300')]);
      await s.flush();
      s.store.undo();
      await s.flush();
      expect(await root.read('images/a.jpg')).toBeNull();
      s.store.redo();
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
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
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
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(session.saveStatus.value).toBe('error');

    root.failWrites = null;
    await session.flush();
    expect(session.saveStatus.value).toBe('saved');
    expect((await savedProject(root)).project.name).toBe('Outro nome');
  });

  it('falha na limpeza depois do mapping.json não é erro de gravação (fase 5.2)', async () => {
    clearReportedErrors();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const root = new MemoryDirectory('p');
    session = start(root);
    const storage = session.storage;
    await session.addImages([file('a.jpg', '400x300')]);
    await session.flush();
    const revision = (await savedProject(root)).revision;
    const imageId = session.store.project.value?.images[0]?.id ?? '';

    const remove = vi
      .spyOn(storage, 'removeImage')
      .mockRejectedValue(new Error('arquivo em uso'));
    session.actions.removeImage(imageId);
    const flushed = await session.flush();
    expect(session.saveStatus.value).toBe('saved');
    expect(flushed).toEqual({ ok: true });
    expect((await savedProject(root)).revision).toBe(revision + 1);
    expect((await savedProject(root)).images).toEqual([]);
    expect(reportedErrors.value.map((e) => [e.context, e.message])).toEqual([
      ['session.cleanup', 'arquivo em uso'],
    ]);

    // A próxima gravação sobe só uma revisão e tenta a remoção de novo.
    remove.mockRestore();
    session.actions.renameProject('Outro nome');
    await session.flush();
    expect(session.saveStatus.value).toBe('saved');
    expect((await savedProject(root)).revision).toBe(revision + 2);
    expect(await root.read('images/a.jpg')).toBeNull();
    vi.restoreAllMocks();
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

  describe('gesto em andamento (fase 5.1)', () => {
    /** Sessão sobre a pasta, contando as gravações do `mapping.json`. */
    function startCounting(root: MemoryDirectory) {
      const storage = createFolderStorage(root);
      let saves = 0;
      const s = openSession({
        storage: {
          ...storage,
          saveMapping: async (text) => {
            saves++;
            await storage.saveMapping(text);
          },
        },
        project: sampleProject(),
        prepareImage,
        now: () => NOW,
        newId: ids(),
      });
      return { session: s, saves: () => saves };
    }

    const m4x = (p: { markings: readonly { id: string; rect: { x: number } }[] }) =>
      p.markings.find((m) => m.id === 'M4')?.rect.x;

    it('timer no meio do gesto cancelado: o disco fica igual ao confirmado', async () => {
      const root = new MemoryDirectory('p');
      const counting = startCounting(root);
      session = counting.session;
      session.actions.renameProject('Renomeado');
      expect(session.actions.beginGesture().ok).toBe(true);
      expect(session.actions.previewMarkingMove('M4', 50, 0).ok).toBe(true);
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
      session.actions.cancelGesture();
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);

      const saved = await savedProject(root);
      expect(saved.project.name).toBe('Renomeado');
      expect(m4x(saved)).toBe(0);
      const committed = session.store.committed.value;
      if (!committed) throw new Error('sem projeto');
      expect(await root.read('mapping.json')).toBe(
        serialize({ ...committed, revision: saved.revision }),
      );
      expect(session.saveStatus.value).toBe('saved');
    });

    it('gesto confirmado grava uma vez, com a geometria final', async () => {
      const root = new MemoryDirectory('p');
      const counting = startCounting(root);
      session = counting.session;
      session.actions.beginGesture();
      session.actions.previewMarkingMove('M4', 20, 0);
      session.actions.previewMarkingMove('M4', 50, 0);
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
      expect(counting.saves()).toBe(0);
      session.actions.commitGesture();
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
      expect(counting.saves()).toBe(1);
      expect(m4x(await savedProject(root))).toBe(50);
    });

    it('flush durante o gesto grava o confirmado, não a prévia', async () => {
      const root = new MemoryDirectory('p');
      session = start(root, sampleProject());
      session.actions.renameProject('Renomeado');
      session.actions.beginGesture();
      session.actions.previewMarkingMove('M4', 50, 0);
      await session.flush();
      expect(m4x(await savedProject(root))).toBe(0);
      session.actions.commitGesture();
      await session.flush();
      expect(m4x(await savedProject(root))).toBe(50);
    });

    it('collectFiles durante o gesto exporta o confirmado', async () => {
      const root = new MemoryDirectory('p');
      session = start(root, sampleProject());
      session.actions.beginGesture();
      session.actions.previewMarkingMove('M4', 50, 0);
      const files = await session.collectFiles();
      const parsed = deserialize(files.mapping);
      if (!parsed.ok) throw new Error('mapping inválido');
      expect(m4x(parsed.project)).toBe(0);
      session.actions.cancelGesture();
    });
  });

  it('collectFiles lista as imagens ausentes no armazenamento', async () => {
    const root = new MemoryDirectory('p');
    session = start(root, sampleProject());
    root.put('images/frente.jpg', 'jpg');
    const files = await session.collectFiles();
    expect([...files.images.keys()]).toEqual(['images/frente.jpg']);
    expect(files.missingImages).toEqual(['images/lateral.jpg']);
  });

  describe('operações caras gravam sem debounce (fase 5.5)', () => {
    /** Sessão sobre a pasta, medindo quantas gravações do `mapping.json` correm ao mesmo tempo. */
    function startTracking(
      root: MemoryDirectory,
      project = emptyProject(),
      gate: Promise<void> = Promise.resolve(),
    ) {
      const storage = createFolderStorage(root);
      let saves = 0;
      let running = 0;
      let maxParallel = 0;
      const s = openSession({
        storage: {
          ...storage,
          saveMapping: async (text) => {
            saves++;
            running++;
            maxParallel = Math.max(maxParallel, running);
            await gate;
            await storage.saveMapping(text);
            running--;
          },
        },
        project,
        prepareImage,
        now: () => NOW,
        newId: ids(),
      });
      return { session: s, saves: () => saves, maxParallel: () => maxParallel };
    }

    it('adicionar imagem grava o mapping.json sem esperar o timer', async () => {
      const root = new MemoryDirectory('p');
      const t = startTracking(root);
      session = t.session;
      await session.addImages([file('a.jpg', '400x300')]);
      expect(session.saveStatus.value).toBe('saved');
      expect((await savedProject(root)).images.map((i) => i.file)).toEqual([
        'images/a.jpg',
      ]);
      expect(t.saves()).toBe(1);
    });

    it('trocar imagem grava sem esperar o timer', async () => {
      const root = new MemoryDirectory('p');
      root.put('images/lateral.jpg', 'jpg');
      session = startTracking(root, sampleProject()).session;
      const result = await session.replaceImage('I1', file('nova.jpg', '4000x3000'), () =>
        Promise.resolve(true),
      );
      expect(result).toBe('replaced');
      expect((await savedProject(root)).images.find((i) => i.id === 'I1')?.file).toBe(
        'images/nova.jpg',
      );
    });

    it('remover imagem e aplicar, atualizar ou remover especialização gravam sem esperar o timer', async () => {
      const root = new MemoryDirectory('p');
      session = startTracking(root, sampleProject()).session;
      const sdui = loadExample('sdui');

      expect(session.actions.applySpecialization(sdui).ok).toBe(true);
      await vi.advanceTimersByTimeAsync(0);
      expect((await savedProject(root)).specializations.map((s) => s.id)).toEqual([
        'sdui',
      ]);

      expect(
        session.actions.updateSpecialization({ ...sdui, version: sdui.version + 1 }).ok,
      ).toBe(true);
      await vi.advanceTimersByTimeAsync(0);
      expect((await savedProject(root)).specializations[0]?.version).toBe(
        sdui.version + 1,
      );

      expect(session.actions.removeSpecialization('sdui', 'convert').ok).toBe(true);
      await vi.advanceTimersByTimeAsync(0);
      expect((await savedProject(root)).specializations).toEqual([]);

      expect(session.actions.removeImage('I2').ok).toBe(true);
      await vi.advanceTimersByTimeAsync(0);
      expect((await savedProject(root)).images.map((i) => i.id)).toEqual(['I1']);
    });

    it('duas operações caras seguidas não gravam em paralelo', async () => {
      const root = new MemoryDirectory('p');
      let release = () => {};
      const gate = new Promise<void>((resolve) => (release = resolve));
      const t = startTracking(root, sampleProject(), gate);
      session = t.session;
      // Libera a gravação mesmo se uma conferência falhar, para o `close` do afterEach terminar.
      try {
        expect(session.actions.applySpecialization(loadExample('sdui')).ok).toBe(true);
        await vi.advanceTimersByTimeAsync(0);
        // A primeira gravação está em andamento quando a segunda operação chega.
        expect(t.saves()).toBe(1);
        expect(session.actions.removeImage('I2').ok).toBe(true);
        await vi.advanceTimersByTimeAsync(0);
        expect(t.saves()).toBe(1);
        release();
        await vi.advanceTimersByTimeAsync(0);
        expect(t.saves()).toBe(2);
        expect(t.maxParallel()).toBe(1);
        expect(session.saveStatus.value).toBe('saved');
        const saved = await savedProject(root);
        expect(saved.revision).toBe(sampleProject().revision + 2);
        expect(saved.images.map((i) => i.id)).toEqual(['I1']);
        expect(saved.specializations.map((s) => s.id)).toEqual(['sdui']);
      } finally {
        release();
      }
    });

    it('uma edição comum chega ao disco em até 250 ms', async () => {
      const root = new MemoryDirectory('p');
      session = startTracking(root).session;
      session.actions.renameProject('Rápido');
      await vi.advanceTimersByTimeAsync(250);
      expect((await savedProject(root)).project.name).toBe('Rápido');
    });

    it('edições comuns continuam esperando o debounce', async () => {
      const root = new MemoryDirectory('p');
      session = startTracking(root).session;
      session.actions.renameProject('Devagar');
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 1);
      expect(await root.read('mapping.json')).toBeNull();
      await vi.advanceTimersByTimeAsync(1);
      expect((await savedProject(root)).project.name).toBe('Devagar');
    });
  });

  it('fechar grava o que estiver pendente', async () => {
    const root = new MemoryDirectory('p');
    const s = start(root);
    s.actions.renameProject('Fechado');
    await s.close();
    expect((await savedProject(root)).project.name).toBe('Fechado');
    expect(s.store.project.value).toBeNull();
  });

  // Fase 8.1: `onChanged` (S4, S8), imagens órfãs ao recarregar (S6) e `collectFiles().saved`.
  describe('o que mudou no armazenamento e os arquivos órfãos (fase 8.1)', () => {
    /** Outro processo grava o `mapping.json`: muda o nome e sobe a revisão. */
    function externalWrite(root: MemoryDirectory, project: Project, name: string) {
      const next = {
        ...project,
        revision: project.revision + 1,
        project: { ...project.project, name },
      };
      root.put('mapping.json', serialize(next));
      return next;
    }

    /** Sessão sobre a pasta, com `onChanged` contado e a próxima gravação do mapping segurável. */
    function hookedStart(root: MemoryDirectory, project: Project) {
      const storage = createFolderStorage(root);
      const gates: { resolve: () => void; promise: Promise<void> }[] = [];
      let savesStarted = 0;
      const onChanged = vi.fn();
      const s = openSession({
        storage: {
          ...storage,
          saveMapping: async (text) => {
            savesStarted++;
            const gate = gates.shift();
            if (gate) await gate.promise;
            await storage.saveMapping(text);
          },
        },
        project,
        prepareImage,
        now: () => NOW,
        newId: ids(),
        onChanged,
      });
      return {
        session: s,
        onChanged,
        savesStarted: () => savesStarted,
        holdSave() {
          let resolve: () => void = () => undefined;
          const promise = new Promise<void>((res) => (resolve = res));
          const gate = { resolve: () => resolve(), promise };
          gates.push(gate);
          return gate;
        },
      };
    }

    beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined));
    afterEach(() => vi.restoreAllMocks());

    it('gravar uma proposta chama onChanged, sem gravar o mapping.json (S4)', async () => {
      const root = new MemoryDirectory('p');
      const { proposal, ids: changeIds } = richScenario();
      const project = sampleProject();
      const text = serialize(project);
      root.put('mapping.json', text);
      root.put('proposals/P1/proposal.json', serializeProposal(proposal));
      const storage = createFolderStorage(root);
      const onChanged = vi.fn();
      session = openSession({
        storage,
        project,
        loadedText: text,
        prepareImage,
        now: () => NOW,
        onChanged,
        proposals: await loadProposals(storage),
      });
      const decided = await session.proposalActions.decide(
        'P1',
        { level: 'change', id: changeIds.name },
        'accepted',
      );
      expect(decided.ok).toBe(true);
      expect(onChanged).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(2000);
      expect(await root.read('mapping.json')).toBe(text);
    });

    it('Recarregar depois de adicionar uma imagem com a gravação recusada apaga o arquivo órfão (S6)', async () => {
      const root = new MemoryDirectory('p');
      const project = sampleProject();
      root.put('mapping.json', serialize(project));
      session = start(root, project);
      externalWrite(root, project, 'De fora');
      const added = await session.addImages([file('a.jpg', '400x300')]);
      expect(added.added).toEqual(['images/a.jpg']);
      expect(await root.read('images/a.jpg')).toBe('400x300');
      expect(session.conflict.value).not.toBeNull();

      await session.resolveConflict('reload');
      expect(session.store.project.value?.project.name).toBe('De fora');
      // O arquivo que só a gravação recusada citaria não fica para sempre na pasta.
      expect(await root.read('images/a.jpg')).toBeNull();
    });

    it('um arquivo citado por um mapping.json já gravado não é apagado no Recarregar (S6)', async () => {
      const root = new MemoryDirectory('p');
      const project = sampleProject();
      root.put('mapping.json', serialize(project));
      session = start(root, project);
      await session.addImages([file('a.jpg', '400x300')]);
      const saved = await savedProject(root);
      expect(saved.images.map((i) => i.file)).toContain('images/a.jpg');

      session.actions.renameProject('Pendente');
      // Alguém de fora regrava o arquivo sem a imagem: ela virou órfã por decisão de fora.
      externalWrite(
        root,
        { ...saved, images: saved.images.filter((i) => i.file !== 'images/a.jpg') },
        'De fora',
      );
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
      expect(session.conflict.value).not.toBeNull();
      await session.resolveConflict('reload');
      expect(await root.read('images/a.jpg')).toBe('400x300');
    });

    it('imagem adicionada durante uma gravação em curso, gravação seguinte recusada, Recarregar: o arquivo é apagado (S6, A3)', async () => {
      const root = new MemoryDirectory('p');
      const project = sampleProject();
      root.put('mapping.json', serialize(project));
      const h = hookedStart(root, project);
      session = h.session;
      session.actions.renameProject('Um');
      const first = h.holdSave();
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
      await vi.waitFor(() => expect(h.savesStarted()).toBe(1));
      // A imagem entra enquanto a primeira gravação (que não a cita) está parada.
      const adding = session.addImages([file('a.jpg', '400x300')]);
      await vi.waitFor(async () =>
        expect(await root.read('images/a.jpg')).toBe('400x300'),
      );
      const second = h.holdSave();
      first.resolve();
      await vi.waitFor(() => expect(h.savesStarted()).toBe(2));
      // A segunda gravação (a que citaria a imagem) falha no disco.
      root.failWrites = new Error('NoModificationAllowedError');
      second.resolve();
      await adding;
      expect(session.saveStatus.value).toBe('error');
      root.failWrites = null;

      const onDisk = await savedProject(root);
      expect(onDisk.project.name).toBe('Um');
      externalWrite(root, onDisk, 'De fora');
      expect(await session.sync()).toBe('conflict');
      await session.resolveConflict('reload');
      expect(session.store.project.value?.project.name).toBe('De fora');
      expect(await root.read('images/a.jpg')).toBeNull();
    });

    it('imagem adicionada durante uma gravação em curso: a primeira não a cita e a apaga; a segunda a regrava antes de citar (auditoria §6.2)', async () => {
      const root = new MemoryDirectory('p');
      const project = sampleProject();
      root.put('mapping.json', serialize(project));
      const h = hookedStart(root, project);
      session = h.session;
      session.actions.renameProject('Um');
      const first = h.holdSave();
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
      await vi.waitFor(() => expect(h.savesStarted()).toBe(1));
      const adding = session.addImages([file('a.jpg', '400x300')]);
      await vi.waitFor(async () =>
        expect(await root.read('images/a.jpg')).toBe('400x300'),
      );
      const second = h.holdSave();
      first.resolve();
      await vi.waitFor(() => expect(h.savesStarted()).toBe(2));
      // A primeira gravação não cita a imagem; a segunda já a regravou (está parada no saveMapping).
      const between = await savedProject(root);
      expect(between.project.name).toBe('Um');
      expect(between.images.map((i) => i.file)).not.toContain('images/a.jpg');
      expect(await root.read('images/a.jpg')).toBe('400x300');
      second.resolve();
      await adding;
      expect(session.saveStatus.value).toBe('saved');
      const after = await savedProject(root);
      expect(after.images.map((i) => i.file)).toContain('images/a.jpg');
      expect(await root.read('images/a.jpg')).toBe('400x300');
    });

    it('imagem adicionada durante uma gravação, desfeita antes da seguinte e refeita: o disco nunca cita arquivo ausente (auditoria §6.2)', async () => {
      const root = new MemoryDirectory('p');
      const project = sampleProject();
      root.put('mapping.json', serialize(project));
      const h = hookedStart(root, project);
      session = h.session;
      session.actions.renameProject('Um');
      const first = h.holdSave();
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
      await vi.waitFor(() => expect(h.savesStarted()).toBe(1));
      const adding = session.addImages([file('a.jpg', '400x300')]);
      await vi.waitFor(async () =>
        expect(await root.read('images/a.jpg')).toBe('400x300'),
      );
      expect(session.store.undo()).toBe(true);
      first.resolve();
      await adding;
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
      expect(session.saveStatus.value).toBe('saved');
      // Nada a gravar depois do desfazer (o disco já tem 'Um'); a limpeza da primeira apagou o arquivo.
      expect(h.savesStarted()).toBe(1);
      expect((await savedProject(root)).images.map((i) => i.file)).not.toContain(
        'images/a.jpg',
      );
      expect(await root.read('images/a.jpg')).toBeNull();
      // Refazer: a imagem volta da lixeira em memória antes do mapping.json que a cita.
      expect(session.store.redo()).toBe(true);
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
      await vi.waitFor(() => expect(h.session.saveStatus.value).toBe('saved'));
      expect(h.savesStarted()).toBe(2);
      expect((await savedProject(root)).images.map((i) => i.file)).toContain(
        'images/a.jpg',
      );
      expect(await root.read('images/a.jpg')).toBe('400x300');
    });

    it('collectFiles com a gravação em erro devolve saved: false e leva o confirmado (S8)', async () => {
      const root = new MemoryDirectory('p');
      const h = hookedStart(root, emptyProject());
      session = h.session;
      session.actions.renameProject('Não gravado');
      root.failWrites = new Error('sem permissão');
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
      expect(session.saveStatus.value).toBe('error');

      const files = await session.collectFiles();
      expect(files.saved).toBe(false);
      expect(deserialize(files.mapping)).toMatchObject({
        ok: true,
        project: { project: { name: 'Não gravado' } },
      });
      root.failWrites = null;
      expect((await session.collectFiles()).saved).toBe(true);
    });

    it('a gravação que enfim passa com o conteúdo já exportado não chama onChanged; a de um projeto diferente chama (S8)', async () => {
      const root = new MemoryDirectory('p');
      const h = hookedStart(root, emptyProject());
      session = h.session;
      session.actions.renameProject('Exportado');
      root.failWrites = new Error('sem permissão');
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
      expect(session.saveStatus.value).toBe('error');
      expect(h.onChanged).not.toHaveBeenCalled();

      // A exportação só conta quando o arquivo saiu (8.7): o controller chama noteExported
      // no mesmo ponto do markExported.
      const files = await session.collectFiles();
      session.noteExported(files.snapshot);
      root.failWrites = null;
      expect(await session.flush()).toEqual({ ok: true });
      expect(h.onChanged).not.toHaveBeenCalled();

      session.actions.renameProject('Outro');
      expect(await session.flush()).toEqual({ ok: true });
      expect(h.onChanged).toHaveBeenCalledTimes(1);
    });
    // Etapa 8 (8.7), decisão do dono: gerar o zip (`collectFiles`) sem o download não marca
    // nada como exportado; a gravação que enfim passa com o mesmo conteúdo chama onChanged.
    it('collectFiles sem noteExported: a gravação do mesmo conteúdo chama onChanged', async () => {
      const root = new MemoryDirectory('p');
      const h = hookedStart(root, emptyProject());
      session = h.session;
      session.actions.renameProject('Cancelado');
      root.failWrites = new Error('sem permissão');
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
      expect(session.saveStatus.value).toBe('error');

      await session.collectFiles();
      root.failWrites = null;
      expect(await session.flush()).toEqual({ ok: true });
      expect(h.onChanged).toHaveBeenCalledTimes(1);
    });
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
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
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

    it('projeto migrado: editar e desfazer até o início ainda grava o formato novo (A2)', async () => {
      const root = new MemoryDirectory('p');
      const log: string[] = [];
      session = openV1(root, log);
      session.actions.renameProject('Migrado');
      session.store.undo();
      await session.flush();
      // O que está em memória (v8) difere do disco (v1): a gravação acontece, com o backup.
      expect(log).toEqual([`backup ${backupPath().slice('backups/'.length)}`, 'mapping']);
      const saved = JSON.parse((await root.read('mapping.json')) ?? '') as {
        schemaVersion: number;
      };
      expect(saved.schemaVersion).toBe(SCHEMA_VERSION);
      expect(await root.read(backupPath())).toBe(v1Text);
    });

    it('projeto v6: o original vai para backups/mapping.v6.… e o salvamento grava v8', async () => {
      const root = new MemoryDirectory('p');
      const project = cadastroProject();
      const data = JSON.parse(serialize(project)) as Record<string, unknown>;
      delete data.platformRepos;
      const v6Text = `${JSON.stringify({ ...data, schemaVersion: 6 }, null, 2)}\n`;
      root.put('mapping.json', v6Text);
      const specs = specFiles(project);
      for (const [path, text] of specs) root.put(path, text);
      const loaded = deserialize(v6Text, undefined, specs);
      if (!loaded.ok || loaded.migratedFrom !== 6) throw new Error('fixture v6');
      session = openSession({
        storage: createFolderStorage(root),
        project: loaded.project,
        migratedFrom: { version: loaded.migratedFrom, text: v6Text },
        prepareImage,
        now: () => NOW,
        newId: ids(),
      });
      await vi.advanceTimersByTimeAsync(2000);
      expect(root.dirs.has('backups')).toBe(false);

      session.actions.setPlatformRepo('android', { localPath: '../..' });
      await session.flush();
      const backup = backupPath().replace('mapping.v1.', 'mapping.v6.');
      expect(await root.read(backup)).toBe(v6Text);
      const saved = JSON.parse((await root.read('mapping.json')) ?? '') as {
        schemaVersion: number;
        revision: number;
        platformRepos: unknown;
      };
      expect(saved.schemaVersion).toBe(8);
      expect(saved.revision).toBe(1);
      expect(saved.platformRepos).toEqual({
        android: { urlTemplate: null, localPath: '../..' },
      });
      expect(session.backupSaved.value).toBe(6);
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
