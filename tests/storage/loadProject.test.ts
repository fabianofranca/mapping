// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { serialize } from '../../src/model';
import { createFolderStorage } from '../../src/storage/folder';
import { loadProject } from '../../src/storage/loadProject';
import { emptyProject, sampleProject } from '../model/fixtures';
import { loadExample } from '../model/specFixtures';
import { MemoryDirectory } from './memoryFs';

describe('loadProject', () => {
  it('lê o mapping.json e devolve o projeto e o texto original', async () => {
    const root = new MemoryDirectory('p');
    const text = serialize({ ...sampleProject(), revision: 3 });
    root.put('mapping.json', text);
    const loaded = await loadProject(createFolderStorage(root));
    expect(loaded).toMatchObject({ ok: true, readOnly: false, migratedFrom: null, text });
    expect(loaded.ok && loaded.project.revision).toBe(3);
  });

  it('sem mapping.json: not-found', async () => {
    const loaded = await loadProject(createFolderStorage(new MemoryDirectory('p')));
    expect(loaded).toEqual({ ok: false, error: 'not-found' });
  });

  it('JSON inválido: invalid-json', async () => {
    const root = new MemoryDirectory('p');
    root.put('mapping.json', '{ nada');
    expect(await loadProject(createFolderStorage(root))).toEqual({
      ok: false,
      error: 'invalid-json',
    });
  });

  it('um arquivo de schema antigo é migrado e informa a versão de origem', async () => {
    const root = new MemoryDirectory('p');
    const v5 = JSON.parse(serialize(emptyProject())) as Record<string, unknown>;
    v5.schemaVersion = 5;
    delete v5.revision;
    root.put('mapping.json', JSON.stringify(v5));
    const loaded = await loadProject(createFolderStorage(root));
    expect(loaded.ok && loaded.migratedFrom).toBe(5);
    expect(loaded.ok && loaded.project.revision).toBe(0);
  });

  it('lê as cópias de specs/ citadas pelo projeto', async () => {
    const root = new MemoryDirectory('p');
    const sdui = loadExample('sdui');
    const { applySpecialization } = await import('../../src/model');
    const project = applySpecialization(emptyProject(), sdui);
    root.put('mapping.json', serialize(project));
    root.put('specs/sdui.json', JSON.stringify(sdui));
    const loaded = await loadProject(createFolderStorage(root));
    expect(loaded.ok && loaded.project.specializations).toHaveLength(1);
  });
});
