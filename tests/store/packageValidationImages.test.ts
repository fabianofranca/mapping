// DX5 (stage #1903, decision 18): applying a library package (folder or zip) validates it with the
// bytes of the image files, so the limits of decision 12 block the apply: over 1 MB (from the size,
// without reading the file), over 2048 px, not the format the extension names. The refusal reads in
// both locales through the model messages.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { locale } from '../../src/store/settings';
import { packageImageBytes, validatePackage } from '../../src/store/packageValidation';
import type { SpecPackageFiles } from '../../src/store/project';
import { issueText } from '../../src/ui/LibraryIssueList';
import { pngBytes } from '../support/imageBytes';

const MB = 1024 * 1024;

const COMPONENT = {
  format: 'mapping-component',
  formatVersion: 4,
  id: 'card',
  name: 'Card',
  size: { width: 200, height: 60 },
  minSize: { width: 100, height: 40 },
  template: {
    type: 'frame',
    layout: { type: 'row', gap: 8 },
    children: [{ type: 'image', src: 'images/a.png', width: 24, height: 24 }],
  },
};

const SPEC = {
  format: 'mapping-spec',
  formatVersion: 7,
  id: 'card',
  name: 'Card',
  version: 1,
  layers: [
    {
      id: 'l',
      name: 'L',
      color: '#112233',
      annotationTypes: [
        { id: 'card', name: 'Card', component: 'components/card.json', fields: [] },
      ],
    },
  ],
};

function packageWith(image: Blob): SpecPackageFiles {
  return new Map<string, string | Blob>([
    ['card.spec.json', JSON.stringify(SPEC)],
    ['components/card.json', JSON.stringify(COMPONENT)],
    ['images/a.png', image],
  ]);
}

const blobOf = (bytes: Uint8Array): Blob => new Blob([bytes as BlobPart]);

afterEach(() => {
  locale.value = 'en-US';
  vi.restoreAllMocks();
});

describe('packageImageBytes', () => {
  it('reads only the image files within 1 MB; text files and heavy images are not read', async () => {
    const heavy = blobOf(pngBytes(8, 8, MB + 1));
    const light = blobOf(pngBytes(8, 8));
    const spy = vi.spyOn(heavy, 'arrayBuffer');
    const files: SpecPackageFiles = new Map<string, string | Blob>([
      ['card.spec.json', '{}'],
      ['images/heavy.png', heavy],
      ['images/light.PNG', light],
      ['fonts/f.ttf', blobOf(new Uint8Array(4))],
    ]);
    const bytes = await packageImageBytes(files);
    expect([...bytes.keys()]).toEqual(['images/light.PNG']);
    expect(bytes.get('images/light.PNG')?.length).toBe(pngBytes(8, 8).length);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('validatePackage with the image bytes', () => {
  it('a good image passes', async () => {
    const files = packageWith(blobOf(pngBytes(64, 64)));
    const report = validatePackage(files, undefined, await packageImageBytes(files));
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('refuses an image over 2048 px, in both locales', async () => {
    const files = packageWith(blobOf(pngBytes(2049, 10)));
    const report = validatePackage(files, undefined, await packageImageBytes(files));
    expect(report.ok).toBe(false);
    const error = report.errors.find((e) => e.code === 'library.imageTooWide');
    if (!error) throw new Error('no imageTooWide error');
    locale.value = 'en-US';
    const en = issueText(error);
    locale.value = 'pt-BR';
    const pt = issueText(error);
    expect(en).toContain('images/a.png');
    expect(pt).toContain('images/a.png');
    expect(pt).not.toBe(en);
  });

  it('refuses an image over 1 MB from its size alone, without reading it', async () => {
    const heavy = blobOf(pngBytes(8, 8, MB + 1));
    const spy = vi.spyOn(heavy, 'arrayBuffer');
    const files = packageWith(heavy);
    const report = validatePackage(files, undefined, await packageImageBytes(files));
    expect(report.errors.map((e) => e.code)).toContain('library.imageTooHeavy');
    expect(spy).not.toHaveBeenCalled();
  });

  it('refuses content that is not the format the extension names', async () => {
    const files = packageWith(blobOf(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])));
    const report = validatePackage(files, undefined, await packageImageBytes(files));
    expect(report.errors.map((e) => e.code)).toContain('library.imageBadFormat');
  });
});
