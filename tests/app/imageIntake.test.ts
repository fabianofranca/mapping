import { describe, expect, it } from 'vitest';
import {
  isImageFile,
  nameForPasted,
  pasteTarget,
  splitImageFiles,
} from '../../src/app/imageIntake';
import { sampleProject } from '../model/fixtures';

describe('imageIntake', () => {
  it('separates images from other files', () => {
    const files = [
      new File([''], 'a.png', { type: 'image/png' }),
      new File([''], 'b.pdf', { type: 'application/pdf' }),
      new File([''], 'c.JPG'),
    ];
    const { images, ignored } = splitImageFiles(files);
    expect(images.map((f) => f.name)).toEqual(['a.png', 'c.JPG']);
    expect(ignored).toEqual(['b.pdf']);
  });
  it('without a type, decides by the extension', () => {
    expect(isImageFile({ name: 'x.webp', type: '' })).toBe(true);
    expect(isImageFile({ name: 'x.txt', type: '' })).toBe(false);
  });
  it('names the pasted image', () => {
    const file = nameForPasted(
      new Blob(['x'], { type: 'image/png' }),
      new Date(2026, 8, 30, 12, 29, 15),
    );
    expect(file.name).toBe('img-20260930-122915.png');
    expect(file.type).toBe('image/png');
  });
});

// Decision 12 of #2721: when Ctrl+V asks "replace or add".
describe('pasteTarget', () => {
  const project = sampleProject();
  const withoutFile = {
    ...project,
    containers: project.containers.map((c) => (c.id === 'I2' ? { ...c, file: null } : c)),
  };

  it('one image and exactly one selected image container with a file: its id', () => {
    expect(pasteTarget([{ kind: 'image', id: 'I1' }], project, 1)).toBe('I1');
  });
  it('several pasted images: null', () => {
    expect(pasteTarget([{ kind: 'image', id: 'I1' }], project, 2)).toBeNull();
  });
  it('no pasted image: null', () => {
    expect(pasteTarget([{ kind: 'image', id: 'I1' }], project, 0)).toBeNull();
  });
  it('no selection: null', () => {
    expect(pasteTarget([], project, 1)).toBeNull();
  });
  it('a marking selected: null', () => {
    expect(pasteTarget([{ kind: 'marking', id: 'M1' }], project, 1)).toBeNull();
  });
  it('a multiple selection: null', () => {
    const items = [
      { kind: 'image', id: 'I1' },
      { kind: 'image', id: 'I2' },
    ] as const;
    expect(pasteTarget(items, project, 1)).toBeNull();
  });
  it('a container without a file: null', () => {
    expect(pasteTarget([{ kind: 'image', id: 'I2' }], withoutFile, 1)).toBeNull();
  });
  it('an unknown container: null', () => {
    expect(pasteTarget([{ kind: 'image', id: 'nope' }], project, 1)).toBeNull();
  });
});
