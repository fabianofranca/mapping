// Fontes do design system: FontFace a partir dos bytes, sem rede; o registro é de quem o cria.
import { describe, expect, it, vi } from 'vitest';
import type { LoadedFont } from '../../src/model/components/library';
import { createFontRegistry, describeFont } from '../../src/storage/fonts';

const bytes = new Uint8Array([0, 1, 0, 0]).buffer;

class FakeFace {
  constructor(
    readonly family: string,
    readonly source: ArrayBuffer,
    readonly descriptors?: { weight?: string; style?: string },
  ) {}
  load = vi.fn(async () => {
    if (this.family === 'Ruim') throw new Error('formato inválido');
    return this;
  });
}

function fakeHost() {
  const added: unknown[] = [];
  const deleted: unknown[] = [];
  const host = {
    FontFace: FakeFace,
    fonts: {
      add: (f: unknown) => added.push(f),
      delete: (f: unknown) => deleted.push(f) > 0,
    },
  };
  return { host, added, deleted };
}

const font = (family: string, extra: Partial<LoadedFont> = {}): LoadedFont => ({
  family,
  weight: '400',
  style: 'normal',
  path: `fonts/${family}.ttf`,
  bytes,
  ...extra,
});

describe('registro de fontes', () => {
  it('cria FontFace dos bytes, substitui as faces anteriores e reporta ausentes e falhas', async () => {
    const { host, added, deleted } = fakeHost();
    const registry = createFontRegistry(host);
    const first = await registry.register([
      font('Roboto'),
      font('Roboto', { weight: '500', path: 'fonts/b.ttf', bytes: undefined }),
      font('Ruim', { style: 'italic' }),
    ]);
    expect(first.map((s) => s.status)).toEqual(['loaded', 'missing', 'failed']);
    expect(first[1]?.detail).toContain('fonts/b.ttf');
    expect(first[2]?.detail).toContain('formato inválido');
    expect(added).toHaveLength(1);
    expect((added[0] as FakeFace).descriptors).toEqual({
      weight: '400',
      style: 'normal',
    });

    const second = await registry.register([font('Inter')]);
    expect(second[0]?.status).toBe('loaded');
    expect(deleted).toEqual([added[0]]);
    expect(describeFont(first[2]!.font)).toBe('Ruim 400 itálico');
  });

  it('clear tira as faces do registro e não mexe nas de outro registro', async () => {
    const { host, added, deleted } = fakeHost();
    const a = createFontRegistry(host);
    const b = createFontRegistry(host);
    await a.register([font('Roboto')]);
    await b.register([font('Inter')]);
    expect(added).toHaveLength(2);
    a.clear();
    expect(deleted).toEqual([added[0]]);
    a.clear();
    expect(deleted).toHaveLength(1);
    // Registrar de novo em `b` tira só a face dele.
    await b.register([]);
    expect(deleted).toEqual([added[0], added[1]]);
  });

  it('sem FontFace no ambiente, o status é "failed" com explicação', async () => {
    const out = await createFontRegistry({}).register([font('Roboto')]);
    expect(out[0]).toMatchObject({
      status: 'failed',
      detail: expect.stringContaining('FontFace'),
    });
  });
});
