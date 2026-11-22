// Package images in the library validator: an `image` node's `src` can cite a PNG, JPEG or WebP
// file of the package. Level 1 checks that the file exists and, with its bytes, that the content
// matches the extension and the size limits (1 MB each, 2048 px a side, 8 MB in all); level 3
// warns about an example value that names a missing package image.
import { describe, expect, it } from 'vitest';
import {
  validateLibrary,
  type LibraryFile,
  type LibraryIssue,
} from '../../src/model/library';
import { loadLibrary } from '../../src/model/components/library';
import { toLibraryFiles } from '../../src/model/libraryPackage';
import { jpegBytes, pngBytes, webpBytes } from '../support/imageBytes';

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const MB = 1024 * 1024;
const SPEC_PATH = 'card.spec.json';
const COMPONENT_PATH = 'components/card.json';

const image = (src: unknown): Raw => ({ type: 'image', src, width: 24, height: 24 });

function component(children: Raw[]): Raw {
  return {
    format: 'mapping-component',
    formatVersion: 4,
    id: 'card',
    name: 'Card',
    size: { width: 200, height: 60 },
    minSize: { width: 100, height: 40 },
    template: { type: 'frame', layout: { type: 'row', gap: 8 }, children },
  };
}

function spec(examples?: Raw[]): Raw {
  return {
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
          {
            id: 'card',
            name: 'Card',
            component: COMPONENT_PATH,
            fields: [
              { key: 'photo', type: 'string' },
              { key: 'mode', type: 'enum', options: ['a', 'b'] },
            ],
            ...(examples === undefined ? {} : { examples }),
          },
        ],
      },
    ],
  };
}

const present = (path: string): LibraryFile => ({ path, binary: true });
const withBytes = (path: string, bytes: Uint8Array): LibraryFile => ({
  path,
  binary: true,
  bytes,
});

function validate(comp: Raw, images: LibraryFile[], examples?: Raw[], level?: 1 | 2 | 3) {
  return validateLibrary({
    specPath: SPEC_PATH,
    ...(level === undefined ? {} : { level }),
    files: [
      { path: SPEC_PATH, text: JSON.stringify(spec(examples)) },
      { path: COMPONENT_PATH, text: JSON.stringify(comp) },
      ...images,
    ],
  });
}

// The fixture's unused fields are not what these tests look at.
const aboutFiles = (i: LibraryIssue): boolean => i.code !== 'library.fieldUnused';
const where = (i: LibraryIssue) => [i.file, i.path, i.message];

describe('level 1: package image files', () => {
  it('a valid image passes and counts in the summary', () => {
    const report = validate(component([image('images/a.png')]), [
      withBytes('images/a.png', pngBytes(64, 64)),
    ]);
    expect(report.errors).toEqual([]);
    expect(report.summary.images).toBe(1);
  });

  it('a missing file is "file not found", at the src path of the component', () => {
    const report = validate(component([image('images/a.png')]), []);
    expect(report.errors.map(where)).toEqual([
      [COMPONENT_PATH, 'template.children[0].src', 'file not found: images/a.png'],
    ]);
    expect(report.errors[0]?.code).toBe('library.fileNotFound');
  });

  it('the format must be the one the extension names', () => {
    const report = validate(component([image('images/a.png'), image('images/b.jpg')]), [
      withBytes('images/a.png', jpegBytes(10, 10)),
      withBytes('images/b.jpg', Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
    ]);
    expect(report.errors.map(where)).toEqual([
      [
        COMPONENT_PATH,
        'template.children[0].src',
        'image is not PNG, JPEG or WebP: images/a.png',
      ],
      [
        COMPONENT_PATH,
        'template.children[1].src',
        'image is not PNG, JPEG or WebP: images/b.jpg',
      ],
    ]);
    expect(report.errors[0]?.code).toBe('library.imageBadFormat');
  });

  it.each([
    ['.png', 'images/a.png', pngBytes(8, 8)],
    ['.jpg', 'images/a.jpg', jpegBytes(8, 8)],
    ['.jpeg', 'images/a.jpeg', jpegBytes(8, 8)],
    ['.webp', 'images/a.webp', webpBytes(8, 8)],
    ['.PNG (any case)', 'images/A.PNG', pngBytes(8, 8)],
  ])('%s with matching content passes', (_name, path, bytes) => {
    const report = validate(component([image(path)]), [withBytes(path, bytes)]);
    expect(report.errors).toEqual([]);
  });

  it('a webp file named .png is the wrong format', () => {
    const report = validate(component([image('images/a.png')]), [
      withBytes('images/a.png', webpBytes(8, 8)),
    ]);
    expect(report.errors.map((e) => e.code)).toEqual(['library.imageBadFormat']);
  });

  it('more than 1 MB is an error; exactly 1 MB passes', () => {
    const over = validate(component([image('images/a.png')]), [
      withBytes('images/a.png', pngBytes(10, 10, MB + 1)),
    ]);
    expect(over.errors.map(where)).toEqual([
      [
        COMPONENT_PATH,
        'template.children[0].src',
        'image larger than 1 MB: images/a.png',
      ],
    ]);
    expect(over.errors[0]?.code).toBe('library.imageTooHeavy');
    const exact = validate(component([image('images/a.png')]), [
      withBytes('images/a.png', pngBytes(10, 10, MB)),
    ]);
    expect(exact.errors).toEqual([]);
  });

  it('more than 2048 px on a side is an error (with the real size); 2048 passes', () => {
    const wide = validate(component([image('images/a.png')]), [
      withBytes('images/a.png', pngBytes(2049, 100)),
    ]);
    expect(wide.errors.map(where)).toEqual([
      [
        COMPONENT_PATH,
        'template.children[0].src',
        'image larger than 2048 px: images/a.png (2049×100)',
      ],
    ]);
    expect(wide.errors[0]?.code).toBe('library.imageTooWide');
    const tall = validate(component([image('images/a.jpg')]), [
      withBytes('images/a.jpg', jpegBytes(100, 3000)),
    ]);
    expect(tall.errors.map((e) => e.message)).toEqual([
      'image larger than 2048 px: images/a.jpg (100×3000)',
    ]);
    const exact = validate(component([image('images/a.webp')]), [
      withBytes('images/a.webp', webpBytes(2048, 2048)),
    ]);
    expect(exact.errors).toEqual([]);
  });

  it('the cited images together over 8 MB is a package error (file "")', () => {
    const names = Array.from({ length: 9 }, (_, i) => `images/i${i}.png`);
    const files = names.map((n) => withBytes(n, pngBytes(10, 10, MB)));
    const report = validate(component(names.map((n) => image(n))), files);
    expect(report.errors.map(where)).toEqual([
      ['', '', 'the package images exceed 8 MB'],
    ]);
    expect(report.errors[0]?.code).toBe('library.imagesTooHeavy');
    // 8 MB exactly is fine.
    const ok = validate(
      component(names.slice(0, 8).map((n) => image(n))),
      files.slice(0, 8),
    );
    expect(ok.errors).toEqual([]);
  });

  it('the total counts each distinct cited image once, and only the cited ones', () => {
    const names = Array.from({ length: 9 }, (_, i) => `images/i${i}.png`);
    const files = names.map((n) => withBytes(n, pngBytes(10, 10, MB)));
    // The same 8 cited twice, and a ninth that nobody cites.
    const cited = names.slice(0, 8);
    const report = validate(component([...cited, ...cited].map((n) => image(n))), files);
    expect(report.errors).toEqual([]);
  });

  it('without bytes, only the existence is checked', () => {
    const report = validate(component([image('images/a.png'), image('images/b.png')]), [
      present('images/a.png'),
    ]);
    expect(report.errors.map(where)).toEqual([
      [COMPONENT_PATH, 'template.children[1].src', 'file not found: images/b.png'],
    ]);
  });

  it('a size without bytes still gives "larger than 1 MB" and counts in the 8 MB total', () => {
    const big = validate(component([image('images/a.png')]), [
      { path: 'images/a.png', binary: true, size: MB + 1 },
    ]);
    expect(big.errors.map(where)).toEqual([
      [
        COMPONENT_PATH,
        'template.children[0].src',
        'image larger than 1 MB: images/a.png',
      ],
    ]);
    const names = Array.from({ length: 9 }, (_, i) => `images/i${i}.png`);
    const total = validate(
      component(names.map((n) => image(n))),
      names.map((n) => ({ path: n, binary: true, size: MB })),
    );
    expect(total.errors.map((e) => e.code)).toEqual(['library.imagesTooHeavy']);
  });

  it('an image file that nobody cites gives no warning and does not count', () => {
    const report = validate(component([image('images/a.png')]), [
      withBytes('images/a.png', pngBytes(8, 8)),
      withBytes('images/unused.png', pngBytes(8, 8)),
      withBytes('images/bad.png', Uint8Array.from([1, 2, 3])),
    ]);
    expect(report.errors).toEqual([]);
    expect(report.warnings.filter(aboutFiles)).toEqual([]);
    expect(report.summary.images).toBe(1);
    const none = validate(component([image('https://cdn.example.com/a.png')]), [
      withBytes('images/unused.png', pngBytes(8, 8)),
    ]);
    expect(none.warnings.filter(aboutFiles)).toEqual([]);
    expect(none.summary.images).toBe(0);
  });

  it('summary.images counts the distinct cited images', () => {
    const report = validate(
      component([
        image('images/a.png'),
        image('images/a.png'),
        image('images/b.jpg'),
        image({ $field: 'photo' }),
        image('https://cdn.example.com/a.png'),
      ]),
      [
        withBytes('images/a.png', pngBytes(8, 8)),
        withBytes('images/b.jpg', jpegBytes(8, 8)),
      ],
    );
    expect(report.summary.images).toBe(2);
  });

  it('checks every literal result of a $switch and of a $if', () => {
    const report = validate(
      component([
        image({
          $switch: 'mode',
          cases: { a: 'images/a.png' },
          default: 'images/b.png',
        }),
        image({ $if: { $field: 'photo' }, then: 'images/c.png', else: 'images/d.png' }),
      ]),
      [
        withBytes('images/a.png', pngBytes(8, 8)),
        withBytes('images/c.png', pngBytes(8, 8)),
      ],
    );
    expect(report.errors.map(where)).toEqual([
      [
        COMPONENT_PATH,
        'template.children[0].src.default',
        'file not found: images/b.png',
      ],
      [COMPONENT_PATH, 'template.children[1].src.else', 'file not found: images/d.png'],
    ]);
    expect(report.summary.images).toBe(4);
  });

  it('a case of a $switch with the wrong content is reported at the case path', () => {
    const report = validate(
      component([
        image({ $switch: 'mode', cases: { a: 'images/a.png' }, default: 'images/b.png' }),
      ]),
      [
        withBytes('images/a.png', jpegBytes(8, 8)),
        withBytes('images/b.png', pngBytes(8, 8)),
      ],
    );
    expect(report.errors.map(where)).toEqual([
      [
        COMPONENT_PATH,
        'template.children[0].src.cases.a',
        'image is not PNG, JPEG or WebP: images/a.png',
      ],
    ]);
  });

  it('finds an image inside a repeat template', () => {
    const repeat = {
      type: 'repeat',
      count: 2,
      template: { type: 'frame', layout: { type: 'row' }, children: [image('x/y.png')] },
    };
    const report = validate(component([repeat]), []);
    expect(report.errors.map(where)).toEqual([
      [
        COMPONENT_PATH,
        'template.children[0].template.children[0].src',
        'file not found: x/y.png',
      ],
    ]);
  });

  it('the path is relative to the specialization folder', () => {
    const report = validateLibrary({
      specPath: 'pkg/card.spec.json',
      files: [
        {
          path: 'pkg/card.spec.json',
          text: JSON.stringify({
            ...spec(),
            layers: [
              {
                id: 'l',
                name: 'L',
                color: '#112233',
                annotationTypes: [
                  {
                    id: 'card',
                    name: 'Card',
                    component: 'components/card.json',
                    fields: [{ key: 'photo', type: 'string' }],
                  },
                ],
              },
            ],
          }),
        },
        {
          path: 'pkg/components/card.json',
          text: JSON.stringify(component([image('images/a.png')])),
        },
        withBytes('pkg/images/a.png', pngBytes(8, 8)),
      ],
    });
    expect(report.errors).toEqual([]);
    expect(report.summary.images).toBe(1);
  });

  it('the early summary (no readable specialization) has images: 0', () => {
    expect(validateLibrary({ files: [] }).summary.images).toBe(0);
  });
});

describe('level 3: example value that names a missing package image', () => {
  const photoComponent = (): Raw => component([image({ $field: 'photo' })]);

  it('warns at the example value when the file is missing', () => {
    const report = validate(
      photoComponent(),
      [],
      [{ name: 'one', values: { photo: 'images/missing.png' } }],
    );
    expect(report.errors).toEqual([]);
    const issue = report.warnings.find((w) => w.code === 'library.imageValueMissing');
    expect(issue?.message).toBe('package image not found: images/missing.png');
    expect(issue?.severity).toBe('warning');
    expect(issue?.file).toBe(SPEC_PATH);
    expect(issue?.path).toBe('layers[0].annotationTypes[0].examples[0].values.photo');
  });

  it('does not warn when the file is in the package, or when the text is not a package path', () => {
    const report = validate(
      photoComponent(),
      [withBytes('images/ok.png', pngBytes(8, 8))],
      [
        { name: 'one', values: { photo: 'images/ok.png' } },
        { name: 'two', values: { photo: 'https://cdn.example.com/a.png' } },
        { name: 'three', values: { photo: 'just text' } },
      ],
    );
    expect(report.warnings.filter((w) => w.code === 'library.imageValueMissing')).toEqual(
      [],
    );
  });

  it('warns about a missing image in the component preview', () => {
    const comp = { ...photoComponent(), preview: { photo: 'images/none.webp' } };
    const report = validate(comp, []);
    const issue = report.warnings.find((w) => w.code === 'library.imageValueMissing');
    expect(issue?.message).toBe('package image not found: images/none.webp');
    expect(issue?.file).toBe(COMPONENT_PATH);
    expect(issue?.path).toBe('preview.photo');
  });

  it('only fields read by an image src count', () => {
    const report = validate(
      photoComponent(),
      [],
      [{ name: 'one', values: { mode: 'a', photo: 'x.png' } }],
    );
    // `mode` is not an image field; `photo` is, and `x.png` is missing.
    expect(
      report.warnings.filter((w) => w.code === 'library.imageValueMissing'),
    ).toHaveLength(1);
  });
});

describe('toLibraryFiles with images', () => {
  it('passes the bytes (and size) of image files, not of other binaries', () => {
    const png = pngBytes(8, 8);
    const font = Uint8Array.from([0, 1, 2, 3]);
    const files = toLibraryFiles('specs/x', [
      { path: 'specs/x/a.spec.json', text: '{}' },
      { path: 'specs/x/images/a.PNG', bytes: png },
      { path: 'specs/x/images/big.jpg', size: 5 * MB },
      { path: 'specs/x/fonts/f.ttf', bytes: font },
    ]);
    expect(files).toEqual([
      { path: 'a.spec.json', text: '{}' },
      { path: 'images/a.PNG', binary: true, bytes: png, size: png.length },
      { path: 'images/big.jpg', binary: true, size: 5 * MB },
      { path: 'fonts/f.ttf', binary: true },
    ]);
  });
});

describe('loadLibrary with images', () => {
  const texts = [
    { path: SPEC_PATH, text: JSON.stringify(spec()) },
    { path: COMPONENT_PATH, text: JSON.stringify(component([image('images/a.png')])) },
  ];

  it('keeps the bytes of the image files by path, and only of image files', () => {
    const png = pngBytes(8, 8);
    const library = loadLibrary([
      ...texts,
      { path: 'images/a.png', bytes: png },
      { path: 'images/b.WEBP', bytes: webpBytes(8, 8).buffer as ArrayBuffer },
      { path: 'fonts/f.ttf', bytes: Uint8Array.from([0, 1, 2, 3]) },
    ]);
    expect([...(library.images ?? new Map()).keys()]).toEqual([
      'images/a.png',
      'images/b.WEBP',
    ]);
    expect(library.images?.get('images/a.png')).toBe(png);
    expect(library.images?.get('images/b.WEBP')).toBeInstanceOf(Uint8Array);
  });

  it('has no images when no file carries bytes', () => {
    expect(loadLibrary(texts).images?.size).toBe(0);
  });
});
