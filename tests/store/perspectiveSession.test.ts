import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deserialize,
  removeContainer,
  serialize,
  type Perspective,
  type Project,
} from '../../src/model';
import { createFolderStorage } from '../../src/storage/folder';
import {
  openLocalPerspectives,
  type LocalPerspectiveStore,
} from '../../src/storage/localPerspectives';
import { openSession, type ProjectSession } from '../../src/store/session';
import { clearReportedErrors } from '../../src/utils/report';
import { NOW, PROJECT_ID, sampleProject } from '../model/fixtures';
import { MemoryDirectory } from '../storage/memoryFs';

// Etapa #659, PE2: a sessão com perspectivas. A aberta fica neste navegador por `project.id`; as
// "Para todos" vão no `mapping.json`; as "Só eu" ficam no IndexedDB (nunca no arquivo).

let store: LocalPerspectiveStore | null = null;
let session: ProjectSession | null = null;
let counter = 0;

beforeEach(async () => {
  localStorage.clear();
  store = await openLocalPerspectives();
  if (!store) throw new Error('IndexedDB indisponível');
  await store.save(PROJECT_ID, []);
});

afterEach(async () => {
  await session?.close();
  session = null;
  store?.close();
  store = null;
  clearReportedErrors();
});

/** Pasta com o projeto já gravado (revisão 0), como a app a encontra ao abrir. */
function folder(project: Project = sampleProject()): MemoryDirectory {
  const root = new MemoryDirectory('mapeamento');
  root.put('mapping.json', serialize({ ...project, revision: 0 }));
  return root;
}

async function diskText(root: MemoryDirectory): Promise<string> {
  return (await root.read('mapping.json')) ?? '';
}

async function diskProject(root: MemoryDirectory): Promise<Project> {
  const parsed = deserialize(await diskText(root));
  if (!parsed.ok) throw new Error('mapping.json inválido');
  return parsed.project;
}

/** Abre a sessão como a app: com o projeto do arquivo e as "Só eu" lidas do IndexedDB. */
async function open(
  root: MemoryDirectory,
  options: { readonly localStore?: LocalPerspectiveStore | null } = {},
): Promise<ProjectSession> {
  const text = await diskText(root);
  const parsed = deserialize(text);
  if (!parsed.ok) throw new Error('mapping.json inválido');
  const localStore = options.localStore === undefined ? store : options.localStore;
  const initial = localStore ? await localStore.load(parsed.project.project.id) : [];
  session = openSession({
    storage: createFolderStorage(root),
    project: parsed.project,
    loadedText: text,
    localPerspectives: { store: localStore, initial },
    prepareImage: () => Promise.reject(new Error('sem imagens aqui')),
    now: () => NOW,
    newId: () => `PS-${++counter}`,
    autosaveDelay: 1,
  });
  return session;
}

/** Reabre a sessão sobre a mesma pasta (fecha a atual antes). */
async function reopen(root: MemoryDirectory): Promise<ProjectSession> {
  await session?.flush();
  await session?.close();
  return open(root);
}

function created(result: { readonly ok: boolean; readonly value?: string }): string {
  if (!result.ok || result.value === undefined) throw new Error('perspectiva não criada');
  return result.value;
}

async function savedLocals(): Promise<readonly Perspective[]> {
  return (await store?.load(PROJECT_ID)) ?? [];
}

describe('perspectiva aberta', () => {
  it('abrir uma perspectiva troca session.perspective.id; null volta à Principal', async () => {
    const s = await open(folder());
    const id = created(
      s.perspectiveActions.createPerspective({
        name: 'Mobile',
        startFrom: null,
        local: false,
      }),
    );
    expect(s.perspective.id.value).toBeNull();
    expect(s.perspective.open(id)).toBe(true);
    expect(s.perspective.id.value).toBe(id);
    expect(s.perspective.openId()).toBe(id);
    expect(s.perspective.open(null)).toBe(true);
    expect(s.perspective.id.value).toBeNull();
  });

  it('recusa um id que o projeto não tem', async () => {
    const s = await open(folder());
    expect(s.perspective.open('nao-existe')).toBe(false);
    expect(s.perspective.id.value).toBeNull();
  });

  it('trocar de perspectiva não entra no desfazer', async () => {
    const s = await open(folder());
    const id = created(
      s.perspectiveActions.createPerspective({
        name: 'Mobile',
        startFrom: null,
        local: false,
      }),
    );
    s.perspective.open(id);
    s.perspective.open(null);
    s.store.undo();
    expect(s.store.project.value?.perspectives).toEqual([]);
    expect(s.store.canUndo.value).toBe(false);
  });

  it('a escolha guardada volta ao reabrir a sessão (mesmo project.id)', async () => {
    const root = folder();
    const s = await open(root);
    const id = created(
      s.perspectiveActions.createPerspective({
        name: 'Mobile',
        startFrom: null,
        local: false,
      }),
    );
    s.perspective.open(id);

    const again = await reopen(root);
    expect(again.perspective.id.value).toBe(id);
    expect(again.perspective.notice.value).toBeNull();
  });

  it('a guardada que sumiu cai na Principal, com o aviso e o nome', async () => {
    const root = folder();
    const s = await open(root);
    const id = created(
      s.perspectiveActions.createPerspective({
        name: 'Mobile',
        startFrom: null,
        local: false,
      }),
    );
    s.perspective.open(id);
    await s.flush();
    const saved = await diskText(root);
    await s.close();

    // Outro arquivo (a perspectiva foi apagada noutro lugar): o mesmo projeto, sem ela.
    root.put('mapping.json', serialize({ ...sampleProject(), revision: 5 }));
    expect(saved).not.toBe(await diskText(root));
    const again = await open(root);
    expect(again.perspective.id.value).toBeNull();
    expect(again.perspective.notice.value).toEqual({ kind: 'removed', name: 'Mobile' });
  });

  it('apagar a aberta volta à Principal com o aviso; desfazer a traz de volta', async () => {
    const s = await open(folder());
    const id = created(
      s.perspectiveActions.createPerspective({
        name: 'Mobile',
        startFrom: null,
        local: false,
      }),
    );
    s.perspective.open(id);
    expect(s.perspectiveActions.removePerspective(id).ok).toBe(true);
    expect(s.perspective.id.value).toBeNull();
    expect(s.perspective.notice.value).toEqual({ kind: 'removed', name: 'Mobile' });
    expect(s.store.project.value?.perspectives).toEqual([]);

    expect(s.store.undo()).toBe(true);
    expect(s.store.project.value?.perspectives.map((x) => x.id)).toEqual([id]);
  });

  it('travar a troca abre a Principal (aviso review) e recusa abrir', async () => {
    const s = await open(folder());
    const id = created(
      s.perspectiveActions.createPerspective({
        name: 'Mobile',
        startFrom: null,
        local: false,
      }),
    );
    s.perspective.open(id);
    s.perspective.setLocked(true);
    expect(s.perspective.locked.value).toBe(true);
    expect(s.perspective.id.value).toBeNull();
    expect(s.perspective.notice.value).toEqual({ kind: 'review' });
    expect(s.perspective.open(id)).toBe(false);
    s.perspective.setLocked(false);
    expect(s.perspective.open(id)).toBe(true);
  });
});

describe('Só eu (IndexedDB)', () => {
  it('criar grava no IndexedDB e NÃO no mapping.json', async () => {
    const root = folder();
    const before = await diskText(root);
    const s = await open(root);
    const id = created(
      s.perspectiveActions.createPerspective({
        name: 'Rascunho',
        startFrom: null,
        local: true,
      }),
    );
    await s.flush();

    expect(s.perspective.localIds.value.has(id)).toBe(true);
    expect(s.store.project.value?.perspectives.map((x) => x.id)).toEqual([id]);
    await vi.waitFor(async () => {
      expect((await savedLocals()).map((x) => x.id)).toEqual([id]);
    });
    // O arquivo continua o mesmo (nem a revisão mudou), e não cita a perspectiva.
    expect(await diskText(root)).toBe(before);
    expect((await diskProject(root)).perspectives).toEqual([]);
  });

  it('ao reabrir, as Só eu voltam do IndexedDB', async () => {
    const root = folder();
    const s = await open(root);
    const id = created(
      s.perspectiveActions.createPerspective({
        name: 'Rascunho',
        startFrom: null,
        local: true,
      }),
    );
    await vi.waitFor(async () => expect(await savedLocals()).toHaveLength(1));

    const again = await reopen(root);
    expect(again.store.project.value?.perspectives.map((x) => x.name)).toEqual([
      'Rascunho',
    ]);
    expect(again.perspective.localIds.value.has(id)).toBe(true);
    again.perspective.open(id);
    expect(again.perspective.id.value).toBe(id);
  });

  it('as Só eu usam os nomes das Para todos na unicidade', async () => {
    const s = await open(folder());
    s.perspectiveActions.createPerspective({
      name: 'Mobile',
      startFrom: null,
      local: false,
    });
    const result = s.perspectiveActions.createPerspective({
      name: 'mobile',
      startFrom: null,
      local: true,
    });
    expect(result).toEqual({ ok: false, error: 'perspective-name-taken' });
    expect(s.perspective.localIds.value.size).toBe(0);
  });

  it('setPerspectiveLocal(id, false) leva ao arquivo e tira do navegador', async () => {
    const root = folder();
    const s = await open(root);
    const id = created(
      s.perspectiveActions.createPerspective({
        name: 'Rascunho',
        startFrom: null,
        local: true,
      }),
    );
    await vi.waitFor(async () => expect(await savedLocals()).toHaveLength(1));

    const result = await s.perspectiveActions.setPerspectiveLocal(id, false);
    expect(result.ok).toBe(true);

    expect(s.perspective.localIds.value.has(id)).toBe(false);
    expect((await diskProject(root)).perspectives.map((x) => x.id)).toEqual([id]);
    await vi.waitFor(async () => expect(await savedLocals()).toEqual([]));
  });

  it('setPerspectiveLocal(id, true) traz para o navegador e o arquivo deixa de citá-la', async () => {
    const root = folder();
    const s = await open(root);
    const id = created(
      s.perspectiveActions.createPerspective({
        name: 'Para todos',
        startFrom: null,
        local: false,
      }),
    );
    await s.flush();
    expect((await diskProject(root)).perspectives.map((x) => x.id)).toEqual([id]);

    const result = await s.perspectiveActions.setPerspectiveLocal(id, true);
    expect(result.ok).toBe(true);
    await s.flush();

    expect((await savedLocals()).map((x) => x.id)).toEqual([id]);
    expect((await diskProject(root)).perspectives).toEqual([]);
    expect(s.perspective.localIds.value.has(id)).toBe(true);
    // A perspectiva continua no projeto da memória.
    expect(s.store.project.value?.perspectives.map((x) => x.id)).toEqual([id]);
  });

  it('setPerspectiveLocal não entra no desfazer', async () => {
    const s = await open(folder());
    const id = created(
      s.perspectiveActions.createPerspective({
        name: 'Para todos',
        startFrom: null,
        local: false,
      }),
    );
    await s.perspectiveActions.setPerspectiveLocal(id, true);
    s.store.undo();
    // Desfez só a criação.
    expect(s.store.project.value?.perspectives).toEqual([]);
    expect(s.store.canUndo.value).toBe(false);
  });

  it('sem IndexedDB, criar Só eu falha com local-unavailable', async () => {
    const s = await open(folder(), { localStore: null });
    expect(s.perspective.localAvailable).toBe(false);
    const result = s.perspectiveActions.createPerspective({
      name: 'Rascunho',
      startFrom: null,
      local: true,
    });
    expect(result).toEqual({ ok: false, error: 'local-unavailable' });
    expect(s.store.project.value?.perspectives).toEqual([]);
    // As Para todos seguem funcionando, mas não viram Só eu.
    const shared = created(
      s.perspectiveActions.createPerspective({
        name: 'Mobile',
        startFrom: null,
        local: false,
      }),
    );
    expect(await s.perspectiveActions.setPerspectiveLocal(shared, true)).toEqual({
      ok: false,
      error: 'local-unavailable',
    });
    expect(s.perspective.localIds.value.size).toBe(0);
  });

  it('duplicar uma Só eu dá outra Só eu', async () => {
    const s = await open(folder());
    const id = created(
      s.perspectiveActions.createPerspective({
        name: 'Rascunho',
        startFrom: null,
        local: true,
      }),
    );
    const copy = created(s.perspectiveActions.duplicatePerspective(id, 'Rascunho 2'));
    expect(s.perspective.localIds.value.has(copy)).toBe(true);
    await vi.waitFor(async () => expect(await savedLocals()).toHaveLength(2));
  });
});

describe('gravação do mapping.json', () => {
  it('cada gravação sobe a revisão em 1 e mudar só uma Só eu não grava o arquivo', async () => {
    const root = folder();
    const s = await open(root);
    s.perspectiveActions.createPerspective({
      name: 'Mobile',
      startFrom: null,
      local: false,
    });
    await s.flush();
    expect((await diskProject(root)).revision).toBe(1);

    const local = created(
      s.perspectiveActions.createPerspective({
        name: 'Rascunho',
        startFrom: null,
        local: true,
      }),
    );
    await s.flush();
    expect((await diskProject(root)).revision).toBe(1);

    s.perspectiveActions.renamePerspective(local, 'Rascunho novo');
    s.perspectiveActions.setPerspectiveHiddenLayers(local, ['L1']);
    await s.flush();
    expect((await diskProject(root)).revision).toBe(1);
    expect(s.saveStatus.value).toBe('saved');

    s.perspectiveActions.createPerspective({
      name: 'Tablet',
      startFrom: 'empty',
      local: false,
    });
    await s.flush();
    const onDisk = await diskProject(root);
    expect(onDisk.revision).toBe(2);
    expect(onDisk.perspectives.map((x) => x.name)).toEqual(['Mobile', 'Tablet']);
  });

  it('o zip exportado também não leva as Só eu', async () => {
    const s = await open(folder());
    s.perspectiveActions.createPerspective({
      name: 'Mobile',
      startFrom: null,
      local: false,
    });
    s.perspectiveActions.createPerspective({
      name: 'Rascunho',
      startFrom: null,
      local: true,
    });
    const files = await s.collectFiles();
    const parsed = deserialize(files.mapping);
    if (!parsed.ok) throw new Error('mapping inválido');
    expect(parsed.project.perspectives.map((x) => x.name)).toEqual(['Mobile']);
  });
});

describe('recarga externa', () => {
  it('a raiz que sumiu sai das perspectivas Para todos e das Só eu', async () => {
    const root = folder();
    const s = await open(root);
    const shared = created(
      s.perspectiveActions.createPerspective({
        name: 'Todos',
        startFrom: null,
        local: false,
      }),
    );
    const mine = created(
      s.perspectiveActions.createPerspective({
        name: 'Eu',
        startFrom: null,
        local: true,
      }),
    );
    await s.flush();
    await vi.waitFor(async () => expect(await savedLocals()).toHaveLength(1));

    // Outro processo apaga o container I2 e grava o arquivo.
    const current = await diskProject(root);
    const external = {
      ...removeContainer(current, 'I2'),
      revision: current.revision + 1,
    };
    root.put('mapping.json', serialize(external));

    expect(await s.sync()).toBe('reloaded');

    const project = s.store.project.value as Project;
    const rootsOf = (id: string) =>
      project.perspectives.find((x) => x.id === id)?.items.map((i) => i.root);
    expect(rootsOf(shared)).toEqual(['I1']);
    expect(rootsOf(mine)).toEqual(['I1']);
    // As Só eu continuam Só eu e a reconciliada vai para o IndexedDB.
    expect(s.perspective.localIds.value.has(mine)).toBe(true);
    await vi.waitFor(async () => {
      expect((await savedLocals())[0]?.items.map((i) => i.root)).toEqual(['I1']);
    });
    // Recarregar não regrava o arquivo.
    await s.flush();
    expect((await diskProject(root)).revision).toBe(external.revision);
  });

  it('a perspectiva aberta que sumiu volta à Principal com o aviso e o nome', async () => {
    const root = folder();
    const s = await open(root);
    const id = created(
      s.perspectiveActions.createPerspective({
        name: 'Mobile',
        startFrom: null,
        local: false,
      }),
    );
    await s.flush();
    s.perspective.open(id);

    const current = await diskProject(root);
    root.put('mapping.json', serialize({ ...current, perspectives: [], revision: 9 }));
    expect(await s.sync()).toBe('reloaded');

    expect(s.perspective.id.value).toBeNull();
    expect(s.perspective.notice.value).toEqual({ kind: 'removed', name: 'Mobile' });
  });

  it('a Só eu aberta continua aberta depois da recarga', async () => {
    const root = folder();
    const s = await open(root);
    const id = created(
      s.perspectiveActions.createPerspective({
        name: 'Eu',
        startFrom: null,
        local: true,
      }),
    );
    s.perspective.open(id);
    await s.flush();
    const current = await diskProject(root);
    root.put('mapping.json', serialize({ ...current, revision: 3 }));

    expect(await s.sync()).toBe('reloaded');
    expect(s.perspective.id.value).toBe(id);
    expect(s.perspective.notice.value).toBeNull();
    expect(s.store.project.value?.perspectives.map((x) => x.id)).toEqual([id]);
  });
});

describe('actions das perspectivas', () => {
  it('renomear, duplicar, apagar e escolher camadas escondidas entram no desfazer', async () => {
    const s = await open(folder());
    const id = created(
      s.perspectiveActions.createPerspective({
        name: 'Mobile',
        startFrom: null,
        local: false,
      }),
    );
    expect(s.perspectiveActions.renamePerspective(id, 'Celular').ok).toBe(true);
    const copy = created(s.perspectiveActions.duplicatePerspective(id, 'Celular 2'));
    expect(s.perspectiveActions.setPerspectiveHiddenLayers(copy, ['L2']).ok).toBe(true);
    const names = () => s.store.project.value?.perspectives.map((x) => x.name);
    expect(names()).toEqual(['Celular', 'Celular 2']);
    expect(s.store.project.value?.perspectives[1]?.hiddenLayers).toEqual(['L2']);

    s.store.undo();
    expect(s.store.project.value?.perspectives[1]?.hiddenLayers).toEqual([]);
    s.store.undo();
    expect(names()).toEqual(['Celular']);
    s.store.undo();
    expect(names()).toEqual(['Mobile']);
  });

  it('enviar e tirar raízes usam a perspectiva aberta como fonte', async () => {
    const s = await open(folder());
    const id = created(
      s.perspectiveActions.createPerspective({
        name: 'Vazia',
        startFrom: 'empty',
        local: false,
      }),
    );
    expect(s.perspectiveActions.sendRootsToPerspective(id, ['I1', 'I2']).ok).toBe(true);
    const roots = () =>
      s.store.project.value?.perspectives
        .find((x) => x.id === id)
        ?.items.map((i) => i.root);
    expect(roots()).toEqual(['I1', 'I2']);
    expect(s.perspectiveActions.removeRootsFromPerspective(id, ['I1']).ok).toBe(true);
    expect(roots()).toEqual(['I2']);
    // Uma marcação que não é raiz é recusada.
    expect(s.perspectiveActions.sendRootsToPerspective(id, ['M1'])).toEqual({
      ok: false,
      error: 'not-root',
    });
  });

  it('dismissArrival tira a marca "Veio de…"', async () => {
    const s = await open(folder());
    s.store.apply((p) => ({
      ...p,
      arrivals: [{ root: 'I1', from: 'PX', fromName: 'Antiga' }],
    }));
    expect(s.perspectiveActions.dismissArrival('I1').ok).toBe(true);
    expect(s.store.project.value?.arrivals).toEqual([]);
  });
});
