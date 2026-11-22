import { describe, expect, it, vi } from 'vitest';
import type { LoadedFont } from '../../src/model/components/library';
import type { FontRegistry } from '../../src/storage/fonts';
import { openLibraryPreview } from '../../src/store/libraryPreview';
import { material3Package } from '../storage/packageFixture';
import { pngBytes } from '../support/imageBytes';

// B5: library opened without a project: catalog and fonts in memory.

function fakeRegistry() {
  const register = vi.fn(async (fonts: readonly LoadedFont[]) =>
    fonts.map((font) => ({ font, status: 'loaded' as const })),
  );
  const clear = vi.fn();
  return { registry: { register, clear } satisfies FontRegistry, register, clear };
}

describe('openLibraryPreview', () => {
  it('builds the package catalog', () => {
    const { registry } = fakeRegistry();
    const preview = openLibraryPreview(material3Package(), { fonts: registry });
    expect(preview.specId).toBe('material3');
    expect(preview.name).toBe('Material Design 3 (baseline)');
    expect(preview.version).toBeGreaterThan(0);
    expect(preview.catalog.report.errors).toEqual([]);
    preview.dispose();
  });

  it('registers the package fonts with the bytes, bumps the epoch and removes on close', async () => {
    const files = new Map(material3Package());
    const spec = JSON.parse(String(files.get('material3.spec.json'))) as {
      fonts?: { file: string }[];
    };
    const fontFile = spec.fonts?.[0]?.file ?? '';
    expect(fontFile).not.toBe('');
    files.set(fontFile, new Blob([new Uint8Array([1, 2, 3])]));

    const { registry, register, clear } = fakeRegistry();
    const preview = openLibraryPreview(files, { fonts: registry });
    expect(preview.fontsEpoch.value).toBe(0);
    await vi.waitFor(() => expect(preview.fontsEpoch.value).toBe(1));
    const registered = register.mock.calls[0]?.[0] as
      { path: string; bytes?: ArrayBuffer }[] | undefined;
    const withBytes = registered?.find((f) => f.path === fontFile);
    expect(withBytes?.bytes?.byteLength).toBe(3);
    // The other declared font has no file: goes without bytes (the registry warns).
    expect(registered?.some((f) => f.bytes === undefined)).toBe(true);

    preview.dispose();
    expect(clear).toHaveBeenCalled();
  });

  it('a package without a readable specialization returns the report, without a name', () => {
    const { registry } = fakeRegistry();
    const preview = openLibraryPreview(new Map([['x.md', 'hi']]), { fonts: registry });
    expect(preview.name).toBe('');
    expect(preview.catalog.report.errors.length).toBeGreaterThan(0);
    preview.dispose();
  });

  it('decodes the package images from the files in memory, bumps the images epoch and frees them on close', async () => {
    const close = vi.fn();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.resolve({ width: 8, height: 4, close })),
    );
    try {
      const files = new Map(material3Package());
      files.set('images/logo.png', new Blob([pngBytes(8, 4) as BlobPart]));
      const { registry } = fakeRegistry();
      const preview = openLibraryPreview(files, { fonts: registry });
      expect(preview.images.resolve('material3', 'images/logo.png')).toEqual({
        state: 'loading',
      });
      await vi.waitFor(() => expect(preview.imagesEpoch.value).toBe(1));
      expect(preview.images.resolve('material3', 'images/logo.png').state).toBe('ready');
      // Another specialization or a file that is not in the package: a failure, not a read.
      expect(preview.images.resolve('other', 'images/logo.png').state).not.toBe('ready');
      preview.dispose();
      expect(preview.images.size).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
