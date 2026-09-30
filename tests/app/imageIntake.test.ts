import { describe, expect, it } from 'vitest';
import { isImageFile, nameForPasted, splitImageFiles } from '../../src/app/imageIntake';

describe('imageIntake', () => {
  it('separa imagens de outros arquivos', () => {
    const files = [
      new File([''], 'a.png', { type: 'image/png' }),
      new File([''], 'b.pdf', { type: 'application/pdf' }),
      new File([''], 'c.JPG'),
    ];
    const { images, ignored } = splitImageFiles(files);
    expect(images.map((f) => f.name)).toEqual(['a.png', 'c.JPG']);
    expect(ignored).toEqual(['b.pdf']);
  });
  it('sem tipo, decide pela extensão', () => {
    expect(isImageFile({ name: 'x.webp', type: '' })).toBe(true);
    expect(isImageFile({ name: 'x.txt', type: '' })).toBe(false);
  });
  it('nomeia a imagem colada', () => {
    const file = nameForPasted(
      new Blob(['x'], { type: 'image/png' }),
      new Date(2026, 8, 30, 12, 29, 15),
    );
    expect(file.name).toBe('img-20260930-122915.png');
    expect(file.type).toBe('image/png');
  });
});
