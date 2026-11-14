// Library: the design system fonts declared in the specialization (the bytes come from the folder).
import { describe, expect, it } from 'vitest';
import { loadLibrary } from '../../../src/model/components/library';
import { M3_FILES } from '../../../viewer/samples/samplesMaterial3';

const bytes = new Uint8Array([0, 1, 0, 0]).buffer;

describe('fonts', () => {
  it('the Material 3 specialization declares Roboto; without the files, the fonts have no bytes', () => {
    const lib = loadLibrary(M3_FILES);
    expect(lib.fonts.map((f) => [f.family, f.weight, f.path])).toEqual([
      ['Roboto', '400', 'fonts/Roboto-Regular.ttf'],
      ['Roboto', '500', 'fonts/Roboto-Medium.ttf'],
    ]);
    expect(lib.fonts.every((f) => f.bytes === undefined)).toBe(true);
    expect(lib.problems).toEqual([]);
  });

  it('with the files in the folder, the bytes stay in the font; weight range and italic are accepted', () => {
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
    expect(lib.problems).toEqual(['fonts[2]: needs family and file']);
  });
});
