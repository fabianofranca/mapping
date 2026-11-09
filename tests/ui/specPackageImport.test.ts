import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Limite de 100 bytes no lugar dos 64 MiB, para provar a contagem sem arquivos enormes.
vi.mock('../../src/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/model')>()),
  packageWithinLimits: (count: number, bytes: number) => count <= 500 && bytes <= 100,
}));

import type { DirectoryHandleLike } from '../../src/storage/folder';
import {
  readPackageFromDirectory,
  readPackageFromZip,
} from '../../src/ui/specPackageImport';

// Fase 1 da #954 (item 69): o limite do pacote conta bytes e vale antes de descomprimir.

afterEach(() => vi.restoreAllMocks());

async function zipOf(files: Record<string, string>): Promise<Blob> {
  const zip = new JSZip();
  for (const [name, text] of Object.entries(files)) zip.file(name, text);
  return new Blob([await zip.generateAsync({ type: 'arraybuffer' })]);
}

describe('readPackageFromZip: limite do pacote', () => {
  it('conta bytes UTF-8, não unidades UTF-16', async () => {
    // 60 caracteres, 120 bytes: cabe em 100 só se contar unidades UTF-16.
    const result = await readPackageFromZip(await zipOf({ 'a.json': 'é'.repeat(60) }));
    expect(result).toEqual({ ok: false, reason: 'too-big' });
  });

  it('um pacote dentro do limite entra', async () => {
    const result = await readPackageFromZip(await zipOf({ 'a.json': '{}' }));
    expect(result.ok).toBe(true);
  });

  it('recusa pelo tamanho declarado, sem descomprimir a entrada', async () => {
    const zip = await JSZip.loadAsync(
      await (await zipOf({ 'a.json': 'x'.repeat(5000) })).arrayBuffer(),
    );
    const entry = zip.files['a.json'];
    if (!entry) throw new Error('entrada ausente');
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
    name: 'pacote',
    values: async function* () {
      for (const entry of entries) yield entry;
    },
  } as unknown as DirectoryHandleLike;
}

describe('readPackageFromDirectory: limite do pacote', () => {
  it('para no primeiro arquivo que passa do limite, sem ler o conteúdo dele nem dos seguintes', async () => {
    const reads: string[] = [];
    const result = await readPackageFromDirectory(
      folderOf([
        fileHandle('ok.json', 10, reads),
        fileHandle('grande.json', 500, reads),
        fileHandle('depois.json', 10, reads),
      ]),
    );
    expect(result).toEqual({ ok: false, reason: 'too-big' });
    expect(reads).toEqual(['ok.json']);
  });
});
