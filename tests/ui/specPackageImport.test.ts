import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Limit of 100 bytes in place of 64 MiB, to prove the count without huge files.
vi.mock('../../src/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/model')>()),
  packageWithinLimits: (count: number, bytes: number) => count <= 500 && bytes <= 100,
}));

import type { DirectoryHandleLike } from '../../src/storage/folder';
import {
  readPackageFromDirectory,
  readPackageFromZip,
} from '../../src/ui/specPackageImport';

// Phase 1 of #954 (item 69): the package limit counts bytes and applies before decompressing.

afterEach(() => vi.restoreAllMocks());

async function zipOf(files: Record<string, string>): Promise<Blob> {
  const zip = new JSZip();
  for (const [name, text] of Object.entries(files)) zip.file(name, text);
  return new Blob([await zip.generateAsync({ type: 'arraybuffer' })]);
}

describe('readPackageFromZip: package limit', () => {
  it('counts UTF-8 bytes, not UTF-16 units', async () => {
    // 60 characters, 120 bytes: fits in 100 only if it counts UTF-16 units.
    // pt-BR kept: a multi-byte accented character is the test data (UTF-8 byte count)
    const result = await readPackageFromZip(await zipOf({ 'a.json': 'é'.repeat(60) }));
    expect(result).toEqual({ ok: false, reason: 'too-big' });
  });

  it('a package within the limit gets in', async () => {
    const result = await readPackageFromZip(await zipOf({ 'a.json': '{}' }));
    expect(result.ok).toBe(true);
  });

  it('refuses by the declared size, without decompressing the entry', async () => {
    const zip = await JSZip.loadAsync(
      await (await zipOf({ 'a.json': 'x'.repeat(5000) })).arrayBuffer(),
    );
    const entry = zip.files['a.json'];
    if (!entry) throw new Error('missing entry');
    const decompress = vi.spyOn(Object.getPrototypeOf(entry), 'async');
    const result = await readPackageFromZip(await zipOf({ 'a.json': 'x'.repeat(5000) }));
    expect(result).toEqual({ ok: false, reason: 'too-big' });
    expect(decompress).not.toHaveBeenCalled();
  });
});

function fileHandle(name: string, size: number, reads: string[]) {
  return {
    kind: 'file' as const,
    name,
    getFile: async () => ({
      size,
      text: async () => {
        reads.push(name);
        return 'x'.repeat(size);
      },
      arrayBuffer: async () => {
        reads.push(name);
        return new ArrayBuffer(size);
      },
    }),
  };
}

function folderOf(entries: ReturnType<typeof fileHandle>[]): DirectoryHandleLike {
  return {
    kind: 'directory',
    name: 'package',
    values: async function* () {
      for (const entry of entries) yield entry;
    },
  } as unknown as DirectoryHandleLike;
}

describe('readPackageFromDirectory: package limit', () => {
  it('stops at the first file over the limit, without reading its content or the following ones', async () => {
    const reads: string[] = [];
    const result = await readPackageFromDirectory(
      folderOf([
        fileHandle('ok.json', 10, reads),
        fileHandle('big.json', 500, reads),
        fileHandle('after.json', 10, reads),
      ]),
    );
    expect(result).toEqual({ ok: false, reason: 'too-big' });
    expect(reads).toEqual(['ok.json']);
  });
});
