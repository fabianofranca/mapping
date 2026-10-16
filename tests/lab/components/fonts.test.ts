// Laboratório Componentes: fontes do design system vêm dos bytes dos arquivos da pasta.
import { describe, expect, it, vi } from 'vitest';
import { describeFont, registerFonts } from '../../../lab/components/fonts';
import { loadLibrary } from '../../../lab/components/library';
import { M3_FILES } from '../../../lab/components/samplesMaterial3';

const bytes = new Uint8Array([0, 1, 0, 0]).buffer;

describe('fontes', () => {
  it('a especialização do Material 3 declara a Roboto; sem os arquivos, as fontes ficam sem bytes', () => {
    const lib = loadLibrary(M3_FILES);
    expect(lib.fonts.map((f) => [f.family, f.weight, f.path])).toEqual([
      ['Roboto', '400', 'fonts/Roboto-Regular.ttf'],
      ['Roboto', '500', 'fonts/Roboto-Medium.ttf'],
    ]);
    expect(lib.fonts.every((f) => f.bytes === undefined)).toBe(true);
    expect(lib.problems).toEqual([]);
  });

  it('com os arquivos na pasta, os bytes ficam na fonte; faixa de peso e itálico são aceitos', () => {
    const spec = JSON.parse(M3_FILES[0]!.text!) as Record<string, unknown>;
    spec.fonts = [
      { family: 'Roboto', file: 'fonts/Roboto-VF.ttf', weight: '100 900' },
      {
        family: 'Roboto',
        file: './fonts/Roboto-Italic.ttf',
        weight: 400,
        style: 'italic',
      },
      { family: 'Quebrada' },
    ];
    const lib = loadLibrary([
      { path: 'material3.spec.json', text: JSON.stringify(spec) },
      ...M3_FILES.slice(1),
      { path: 'fonts/Roboto-VF.ttf', bytes },
    ]);
    expect(lib.fonts).toHaveLength(2);
    expect(lib.fonts[0]).toMatchObject({ weight: '100 900', style: 'normal', bytes });
    expect(lib.fonts[1]).toMatchObject({
      weight: '400',
      style: 'italic',
      path: 'fonts/Roboto-Italic.ttf',
    });
    expect(lib.fonts[1]?.bytes).toBeUndefined();
    expect(lib.problems).toEqual(['fonts[2]: precisa de family e file']);
  });

  it('registerFonts cria FontFace dos bytes, substitui as faces anteriores e reporta ausentes e falhas', async () => {
    const added: unknown[] = [];
    const deleted: unknown[] = [];
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
    const host = {
      FontFace: FakeFace,
      fonts: {
        add: (f: unknown) => added.push(f),
        delete: (f: unknown) => deleted.push(f) > 0,
      },
    };
    const first = await registerFonts(
      [
        { family: 'Roboto', weight: '400', style: 'normal', path: 'fonts/a.ttf', bytes },
        { family: 'Roboto', weight: '500', style: 'normal', path: 'fonts/b.ttf' },
        { family: 'Ruim', weight: '400', style: 'italic', path: 'fonts/c.ttf', bytes },
      ],
      host,
    );
    expect(first.map((s) => s.status)).toEqual(['loaded', 'missing', 'failed']);
    expect(first[1]?.detail).toContain('fonts/b.ttf');
    expect(first[2]?.detail).toContain('formato inválido');
    expect(added).toHaveLength(1);
    expect((added[0] as FakeFace).descriptors).toEqual({
      weight: '400',
      style: 'normal',
    });

    const second = await registerFonts(
      [{ family: 'Inter', weight: '400', style: 'normal', path: 'fonts/i.ttf', bytes }],
      host,
    );
    expect(second[0]?.status).toBe('loaded');
    expect(deleted).toEqual([added[0]]);
    expect(describeFont(first[2]!.font)).toBe('Ruim 400 itálico');
  });

  it('sem FontFace no ambiente, o status é "failed" com explicação', async () => {
    const out = await registerFonts(
      [{ family: 'Roboto', weight: '400', style: 'normal', path: 'x.ttf', bytes }],
      {},
    );
    expect(out[0]).toMatchObject({
      status: 'failed',
      detail: expect.stringContaining('FontFace'),
    });
  });
});
