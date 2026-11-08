import { describe, expect, it } from 'vitest';
import { serialize } from '../../../src/model';
import { createFolderStorage } from '../../../src/storage/folder';
import { loadProject } from '../../../src/storage/loadProject';
import { openSession, type ProjectSession } from '../../../src/store/session';
import { buildScaleProject } from '../../model/scaleProject';
import { MemoryDirectory } from '../../storage/memoryFs';
import { GROWTH_OPTIONS, expectLinearGrowthAsync } from '../../support/growth';

// Casos da sessão do teste de crescimento (#881): gravar um projeto já aberto e abri-lo, 1.250 × 5.000 marcações.
async function folderWith(markings: number) {
  const root = new MemoryDirectory('escala');
  const text = serialize(buildScaleProject({ markings }));
  root.put('mapping.json', text);
  return { root };
}

const storageOf = (root: MemoryDirectory) =>
  createFolderStorage(root, { copyId: 'escala' });

async function open(root: MemoryDirectory): Promise<ProjectSession> {
  const storage = storageOf(root);
  const loaded = await loadProject(storage);
  if (!loaded.ok) throw new Error(`projeto de escala não abre: ${loaded.error}`);
  return openSession({
    storage,
    project: loaded.project,
    loadedText: loaded.text,
    readOnly: false,
    prepareImage: () => Promise.reject(new Error('sem imagens')),
  });
}

describe('crescimento da sessão (n = 1.250, 4n = 5.000 marcações)', () => {
  it(
    'grava um projeto já aberto (conferir revision e conteúdo, revision + 1)',
    GROWTH_OPTIONS,
    async () => {
      const sessions: ProjectSession[] = [];
      let counter = 0;
      // Prova de que a medida é a gravação de verdade: o arquivo sai com revision + 1 e o nome novo.
      const { root: probeRoot } = await folderWith(25);
      const probe = await open(probeRoot);
      probe.actions.renameProject('Sonda');
      expect((await probe.flush()).ok).toBe(true);
      const saved = JSON.parse((await probeRoot.read('mapping.json')) ?? '{}');
      expect(saved.revision).toBe(1);
      expect(saved.project.name).toBe('Sonda');
      await probe.close();
      await expectLinearGrowthAsync('sessão: gravar', {
        build: async (n) => {
          const { root } = await folderWith(n);
          const session = await open(root);
          sessions.push(session);
          return { root, session };
        },
        // A edição entra fora do tempo; a medida é a gravação.
        prepare: ({ session }) => {
          session.actions.renameProject(`Escala ${++counter}`);
        },
        run: async ({ session }) => {
          const saved = await session.flush();
          if (!saved.ok) throw new Error('a gravação falhou');
        },
      });
      for (const session of sessions) await session.close();
    },
  );

  it(
    'abre o projeto (ler, validar, migrar e montar a sessão)',
    GROWTH_OPTIONS,
    async () => {
      let last: ProjectSession | null = null;
      await expectLinearGrowthAsync('sessão: abrir', {
        build: async (n) => folderWith(n),
        // A sessão da rodada anterior sai antes (fora do tempo), para o heap não crescer com as rodadas.
        prepare: async () => {
          await last?.close();
          last = null;
        },
        run: async ({ root }) => {
          last = await open(root);
        },
        warmup: 4,
        runs: 9,
      });
      await (last as ProjectSession | null)?.close();
    },
  );
});
