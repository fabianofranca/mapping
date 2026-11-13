// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { MAX_PACKAGE_BYTES, MAX_PACKAGE_FILES } from '../../src/model';
import { FOLDER_CONCURRENCY } from '../../src/storage/folderConcurrency';
import { loadLibraryIssues, readSpecPackage } from '../../src/storage/specPackage';
import type { ProjectStorage } from '../../src/storage/types';

function storageWith(paths: readonly string[]): ProjectStorage {
  return {
    listSpecDir: async () => paths,
    readSpecFile: async () => new Blob(['x']),
  } as unknown as ProjectStorage;
}

const project = {
  specializations: [{ id: 'm3', file: 'specs/m3/m3.spec.json' }],
} as unknown as Parameters<typeof loadLibraryIssues>[1];

describe('loadLibraryIssues', () => {
  it('pacote grande demais vira um problema com código, sem texto fixo para a interface', async () => {
    const many = Array.from(
      { length: MAX_PACKAGE_FILES + 1 },
      (_, i) => `specs/m3/${i}.md`,
    );
    const issues = await loadLibraryIssues(storageWith(many), project);
    expect(issues.get('m3')).toEqual([
      expect.objectContaining({ code: 'package-too-big', severity: 'error' }),
    ]);
  });

  it('lê os pacotes das especializações em série, mantendo a ordem do resultado', async () => {
    const order: string[] = [];
    const storage = {
      listSpecDir: vi.fn(async (dir: string) => {
        order.push(`start ${dir}`);
        await new Promise((r) => setTimeout(r, dir === 'specs/a' ? 20 : 1));
        order.push(`end ${dir}`);
        return [];
      }),
      readSpecFile: async () => null,
    } as unknown as ProjectStorage;
    const two = {
      specializations: [
        { id: 'a', file: 'specs/a/a.spec.json' },
        { id: 'b', file: 'specs/b/b.spec.json' },
      ],
    } as unknown as Parameters<typeof loadLibraryIssues>[1];
    const out = await loadLibraryIssues(storage, two);
    expect(order).toEqual([
      'start specs/a',
      'end specs/a',
      'start specs/b',
      'end specs/b',
    ]);
    expect([...out.keys()]).toEqual(['a', 'b']);
  });

  it('o pico de leituras simultâneas à pasta, com 3 especializações, fica no limite', async () => {
    let active = 0;
    let peak = 0;
    const storage = {
      listSpecDir: async (dir: string) =>
        Array.from({ length: 10 }, (_, i) => `${dir}/${i}.md`),
      readSpecFile: async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 2));
        active--;
        return new Blob(['x']);
      },
    } as unknown as ProjectStorage;
    const three = {
      specializations: ['a', 'b', 'c'].map((id) => ({
        id,
        file: `specs/${id}/${id}.spec.json`,
      })),
    } as unknown as Parameters<typeof loadLibraryIssues>[1];
    const out = await loadLibraryIssues(storage, three);
    expect([...out.keys()]).toEqual(['a', 'b', 'c']);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(FOLDER_CONCURRENCY);
  });
});

describe('readSpecPackage', () => {
  /** Blob de mentira: tamanho declarado e contador de `text()`. */
  function fakeBlob(size: number, counter: { texts: number }): Blob {
    return {
      size,
      text: async () => {
        counter.texts++;
        return 'x';
      },
    } as unknown as Blob;
  }

  it('passou do limite de bytes: devolve null sem ler o conteúdo do resto', async () => {
    const counter = { texts: 0 };
    let opened = 0;
    const size = MAX_PACKAGE_BYTES / 8;
    const paths = Array.from({ length: 60 }, (_, i) => `specs/m3/${i}.md`);
    const storage = {
      listSpecDir: async () => paths,
      readSpecFile: async () => {
        opened++;
        await new Promise((r) => setTimeout(r, 1));
        return fakeBlob(size, counter);
      },
    } as unknown as ProjectStorage;
    expect(await readSpecPackage(storage, 'specs/m3')).toBeNull();
    // Estoura no 9º arquivo; mais as tarefas já em curso.
    expect(counter.texts).toBeLessThanOrEqual(8 + FOLDER_CONCURRENCY);
    expect(opened).toBeLessThanOrEqual(9 + FOLDER_CONCURRENCY);
  });

  it('dentro do limite: entradas na ordem da listagem, bytes somados, ausente pulado', async () => {
    const counter = { texts: 0 };
    const paths = [
      'specs/m3/a.json',
      'specs/m3/b.png',
      'specs/m3/gone.md',
      'specs/m3/c.md',
    ];
    const storage = {
      listSpecDir: async () => paths,
      readSpecFile: async (p: string) =>
        p.endsWith('gone.md') ? null : fakeBlob(5, counter),
    } as unknown as ProjectStorage;
    expect(await readSpecPackage(storage, 'specs/m3')).toEqual({
      entries: [
        { path: 'specs/m3/a.json', text: 'x' },
        { path: 'specs/m3/b.png' },
        { path: 'specs/m3/c.md', text: 'x' },
      ],
      bytes: 15,
    });
  });
});
