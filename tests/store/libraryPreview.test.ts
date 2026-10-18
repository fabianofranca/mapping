import { describe, expect, it, vi } from 'vitest';
import type { LoadedFont } from '../../src/model/components/library';
import type { FontRegistry } from '../../src/storage/fonts';
import { openLibraryPreview } from '../../src/store/libraryPreview';
import { material3Package } from '../storage/packageFixture';

// B5: biblioteca aberta sem projeto — catálogo e fontes em memória.

function fakeRegistry() {
  const register = vi.fn(async (fonts: readonly LoadedFont[]) =>
    fonts.map((font) => ({ font, status: 'loaded' as const })),
  );
  const clear = vi.fn();
  return { registry: { register, clear } satisfies FontRegistry, register, clear };
}

describe('openLibraryPreview', () => {
  it('monta o catálogo do pacote', () => {
    const { registry } = fakeRegistry();
    const preview = openLibraryPreview(material3Package(), { fonts: registry });
    expect(preview.specId).toBe('material3');
    expect(preview.name).toBe('Material Design 3 (baseline)');
    expect(preview.version).toBeGreaterThan(0);
    expect(preview.catalog.report.errors).toEqual([]);
    preview.dispose();
  });

  it('registra as fontes do pacote com os bytes, sobe o epoch e tira ao fechar', async () => {
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
    // A outra fonte declarada não tem arquivo: vai sem bytes (o registro avisa).
    expect(registered?.some((f) => f.bytes === undefined)).toBe(true);

    preview.dispose();
    expect(clear).toHaveBeenCalled();
  });

  it('um pacote sem especialização legível devolve o relatório, sem nome', () => {
    const { registry } = fakeRegistry();
    const preview = openLibraryPreview(new Map([['x.md', 'oi']]), { fonts: registry });
    expect(preview.name).toBe('');
    expect(preview.catalog.report.errors.length).toBeGreaterThan(0);
    preview.dispose();
  });
});
