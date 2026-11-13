// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createFolderStorage } from '../../src/storage/folder';
import { FOLDER_CONCURRENCY } from '../../src/storage/folderConcurrency';
import type { ProjectStorage } from '../../src/storage/types';
import { openSession, type ProjectSession } from '../../src/store/session';
import { NOW, sampleProject } from '../model/fixtures';
import { MemoryDirectory } from '../storage/memoryFs';
import { material3Package, material3Spec } from '../storage/packageFixture';

// FA2, decisão 10: os arquivos de um pacote (e as cópias de `specs/`) gravam em paralelo com
// limite, mas SEMPRE antes do `mapping.json`: nenhum `saveMapping` começa antes de todos
// terminarem, e uma falha aborta a gravação sem tocar o `mapping.json`.

interface Probe {
  readonly session: ProjectSession;
  readonly root: MemoryDirectory;
  readonly state: {
    inFlight: number;
    peak: number;
    started: number;
    finished: number;
    /** Arquivos terminados / iniciados quando o `saveMapping` começou (um item por chamada). */
    atSave: { started: number; finished: number; inFlight: number }[];
    /** Falha toda gravação a partir da `failFrom`-ésima (enquanto não for `null`). */
    failFrom: number | null;
  };
}

let current: ProjectSession | null = null;
afterEach(async () => {
  await current?.close();
  current = null;
});

function start(): Probe {
  const root = new MemoryDirectory('p');
  const inner = createFolderStorage(root);
  const state: Probe['state'] = {
    inFlight: 0,
    peak: 0,
    started: 0,
    finished: 0,
    atSave: [],
    failFrom: null,
  };
  const tracked =
    <A extends unknown[]>(fn: (...args: A) => Promise<void>) =>
    async (...args: A): Promise<void> => {
      const index = state.started++;
      state.inFlight++;
      state.peak = Math.max(state.peak, state.inFlight);
      try {
        await new Promise((r) => setTimeout(r, 3));
        if (state.failFrom !== null && index >= state.failFrom)
          throw new Error('disco cheio');
        await fn(...args);
      } finally {
        state.inFlight--;
        state.finished++;
      }
    };
  const storage: ProjectStorage = {
    ...inner,
    writeSpecFile: tracked(inner.writeSpecFile),
    writeSpec: tracked(inner.writeSpec),
    async saveMapping(text) {
      state.atSave.push({
        started: state.started,
        finished: state.finished,
        inFlight: state.inFlight,
      });
      await inner.saveMapping(text);
    },
  };
  const session = openSession({
    storage,
    project: sampleProject(),
    prepareImage: () => Promise.reject(new Error('sem imagens')),
    now: () => NOW,
    autosaveDelay: 1,
  });
  current = session;
  return { session, root, state };
}

describe('gravação do pacote em paralelo com limite', () => {
  it('grava os arquivos do pacote com pico de 4 e nenhum saveMapping antes de todos terminarem', async () => {
    const h = start();
    const files = material3Package();
    expect(files.size).toBeGreaterThan(8);
    expect(
      h.session.actions.applySpecialization({ ...material3Spec(), version: 1 }, files).ok,
    ).toBe(true);
    await h.session.flush();
    expect(h.state.peak).toBe(FOLDER_CONCURRENCY);
    expect(h.state.atSave.length).toBeGreaterThan(0);
    for (const at of h.state.atSave) {
      expect(at.inFlight).toBe(0);
      expect(at.finished).toBe(at.started);
    }
    // O pacote inteiro chegou ao disco (os arquivos mais a cópia da especialização).
    expect(h.state.atSave[0]?.started).toBeGreaterThanOrEqual(files.size);
  });

  it('falha em um arquivo do pacote: o mapping.json não é tocado e a regravação refaz o pacote', async () => {
    const h = start();
    h.state.failFrom = 2;
    const files = material3Package();
    h.session.actions.applySpecialization({ ...material3Spec(), version: 1 }, files);
    await expect(h.session.flush()).resolves.toMatchObject({ ok: false });
    expect(h.state.atSave).toEqual([]);
    expect(await h.root.read('mapping.json')).toBeNull();
    // Passou: a próxima gravação regrava o pacote inteiro e só então o mapping.json.
    h.state.failFrom = null;
    h.state.started = 0;
    h.state.finished = 0;
    await expect(h.session.flush()).resolves.toMatchObject({ ok: true });
    expect(h.state.started).toBeGreaterThanOrEqual(files.size);
    expect(h.state.atSave[0]?.finished).toBe(h.state.atSave[0]?.started);
    expect(await h.root.read('mapping.json')).not.toBeNull();
  });
});
