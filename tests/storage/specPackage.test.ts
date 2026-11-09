// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { MAX_PACKAGE_FILES } from '../../src/model';
import { loadLibraryIssues } from '../../src/storage/specPackage';
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

  it('lê os pacotes de várias especializações em paralelo, mantendo a ordem do resultado', async () => {
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
    expect(order.slice(0, 2)).toEqual(['start specs/a', 'start specs/b']);
    expect([...out.keys()]).toEqual(['a', 'b']);
  });
});
