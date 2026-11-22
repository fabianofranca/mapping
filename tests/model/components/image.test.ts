// The `image` node (remote image, `formatVersion` 3 component): validation of the restricted `src`,
// versions, assembled scene and layout independent of the URL. No network request.
import { describe, expect, it } from 'vitest';
import type {
  ComponentFile,
  FieldValues,
} from '../../../src/model/components/componentFormat';
import {
  collectFieldKeys,
  parseComponent,
} from '../../../src/model/components/parseComponent';
import {
  approximateMeasurer,
  instantiate,
  type Box,
} from '../../../src/model/components/instantiate';
import { referencedFields } from '../../../src/model/components/expressions';
import { isPackageImagePath } from '../../../src/model/components/imagePath';
import {
  absoluteBoxes,
  type FrameNode,
  type SceneNode,
} from '../../../src/model/components/scene';

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const URL_A = 'https://cdn.example.com/a.png';

const image = (extra: Raw = {}): Raw => ({
  type: 'image',
  name: 'photo',
  src: URL_A,
  width: 40,
  height: 40,
  ...extra,
});

function raw(node: Raw = image(), version = 3): Raw {
  return {
    format: 'mapping-component',
    formatVersion: version,
    id: 'avatar',
    name: 'Avatar',
    size: { width: 200, height: 100 },
    template: {
      type: 'frame',
      layout: { type: 'row', gap: 8, padding: 8 },
      children: [node, { type: 'text', text: { $field: 'name' } }],
    },
  };
}

function problems(input: unknown): string[] {
  const parsed = parseComponent(input);
  return parsed.ok ? [] : parsed.errors;
}

function component(input: Raw): ComponentFile {
  const parsed = parseComponent(input);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.component;
}

const BOX: Box = { x: 0, y: 0, width: 200, height: 100 };

function draw(c: ComponentFile, values: FieldValues) {
  return instantiate(c, values, BOX, { measure: approximateMeasurer });
}

/** The first `rect` node of the scene (the component's `image` node becomes one). */
function firstRect(node: SceneNode): SceneNode | undefined {
  if (node.type === 'rect') return node;
  if (node.type === 'frame') {
    for (const child of node.children) {
      const found = firstRect(child);
      if (found) return found;
    }
  }
  return undefined;
}

describe('parseComponent: image', () => {
  it('accepts the https:// literal, the $field and the fit in formatVersion 3', () => {
    expect(problems(raw())).toEqual([]);
    expect(problems(raw(image({ src: { $field: 'photo' } })))).toEqual([]);
    for (const fit of ['cover', 'contain', 'fill'])
      expect(problems(raw(image({ fit })))).toEqual([]);
  });

  it('accepts a local host literal (the policy decides at runtime)', () => {
    expect(problems(raw(image({ src: 'https://localhost:8443/a.png' })))).toEqual([]);
    expect(problems(raw(image({ src: 'https://192.168.0.2/a.png' })))).toEqual([]);
  });

  it('works inside the template of a repeat', () => {
    const input = raw({
      type: 'repeat',
      field: 'photos',
      template: {
        type: 'frame',
        children: [image({ src: { $field: 'url' } })],
      },
    });
    expect(problems(input)).toEqual([]);
  });

  it('the repeat works in 2 and 3, and 1 rejects it', () => {
    const rep = {
      type: 'repeat',
      field: 'l',
      template: { type: 'frame', children: [] },
    };
    expect(problems(raw(rep, 3))).toEqual([]);
    expect(problems(raw(rep, 2))).toEqual([]);
    expect(problems(raw(rep, 1))).toEqual([
      'template.children[0].type: the repeat node only exists in formatVersion 2',
    ]);
  });

  it('image in formatVersion 1 or 2 is an error, at the node path', () => {
    for (const version of [1, 2]) {
      expect(problems(raw(image(), version))).toEqual([
        'template.children[0].type: the image node only exists in formatVersion 3',
      ]);
    }
  });

  it('1 and 2 are still accepted without image', () => {
    const plain = { type: 'rect', width: 10, height: 10 };
    expect(problems(raw(plain, 1))).toEqual([]);
    expect(problems(raw(plain, 2))).toEqual([]);
  });

  it('src is required', () => {
    const node = image();
    delete node.src;
    expect(problems(raw(node))).toEqual(['template.children[0].src: required field']);
  });

  it('invalid fit', () => {
    expect(problems(raw(image({ fit: 'zoom' })))).toEqual([
      'template.children[0].fit: expected one of: cover, contain, fill, fill-width, fill-height, scale-down, none',
    ]);
  });

  it('hug on width and height is an error', () => {
    expect(problems(raw(image({ width: 'hug' })))).toEqual([
      'template.children[0].width: the image node does not accept hug: the layout does not depend on the downloaded image',
    ]);
    expect(problems(raw(image({ height: 'hug' })))).toEqual([
      'template.children[0].height: the image node does not accept hug: the layout does not depend on the downloaded image',
    ]);
  });

  it('children and layout fall into the message for a node that is not a frame', () => {
    expect(problems(raw(image({ children: [] })))).toEqual([
      'template.children[0].children: only nodes of type frame accept children (this is image)',
    ]);
    expect(problems(raw(image({ layout: { type: 'none' } })))).toEqual([
      'template.children[0].layout: only nodes of type frame accept layout (this is image)',
    ]);
  });

  it.each([
    ['relative without a known image extension', 'images/a.txt', 'invalid'],
    ['http', 'http://cdn.example.com/a.png', 'insecure'],
    ['data', 'data:image/png;base64,AAAA', 'invalid'],
    ['with credentials', 'https://u:p@cdn.example.com/a.png', 'credentials'],
    ['empty', '', 'empty'],
  ])('literal src %s is a format error', (_name, src, reason) => {
    expect(problems(raw(image({ src })))).toEqual([
      `template.children[0].src: expected an absolute https:// URL (${reason})`,
    ]);
  });

  it.each([
    ['$concat', { $concat: ['https://x.com/', { $field: 'id' }] }],
    ['$field with default', { $field: 'photo', default: URL_A }],
    ['number', 5],
    ['object without operator', { url: URL_A }],
  ])('src with %s is an error', (_name, src) => {
    expect(problems(raw(image({ src })))).toEqual([
      'template.children[0].src: src only accepts literal text or { "$field": "<field>" }',
    ]);
  });

  it('empty $field in src is a key error', () => {
    expect(problems(raw(image({ src: { $field: '' } })))).toEqual([
      'template.children[0].src.$field: expected a field key (non-empty text)',
    ]);
  });

  it('the src $field enters the referenced fields', () => {
    const c = component(raw(image({ src: { $field: 'photo' } })));
    expect(collectFieldKeys(c)).toEqual(['name', 'photo']);
    expect([...referencedFields(c.template)].sort()).toEqual(['name', 'photo']);
  });
});

describe('instantiate: image', () => {
  const withField = component(
    raw(image({ src: { $field: 'photo' }, fill: '#eeeeee', cornerRadius: 4 })),
  );
  const imageNode = (root: FrameNode) => firstRect(root);

  it('becomes a rect with the background and then the image paint with url and fit (default cover)', () => {
    const { root } = draw(
      component(raw(image({ fill: '#eeeeee', cornerRadius: 4 }))),
      {},
    );
    const node = imageNode(root);
    expect(node?.type).toBe('rect');
    expect(node?.fills).toEqual([
      { type: 'solid', color: '#eeeeee' },
      { type: 'image', fit: 'cover', url: URL_A },
    ]);
    expect(node?.type === 'rect' ? node.cornerRadius : undefined).toBe(4);
  });

  it('respects the fit and stroke of the node', () => {
    const c = component(
      raw(image({ fit: 'contain', stroke: { color: '#112233', width: 2 } })),
    );
    const node = imageNode(draw(c, {}).root);
    expect(node?.fills).toEqual([{ type: 'image', fit: 'contain', url: URL_A }]);
    expect(node?.stroke).toMatchObject({ width: 2, align: 'inside' });
  });

  it('the string field becomes the url (trimmed); empty, missing or number end up without url', () => {
    const url = (values: FieldValues) => {
      const paints = imageNode(draw(withField, values).root)?.fills ?? [];
      return paints[paints.length - 1];
    };
    expect(url({ photo: `  ${URL_A} ` })).toEqual({
      type: 'image',
      fit: 'cover',
      url: URL_A,
    });
    for (const photo of ['', '   ', null, 42, undefined])
      expect(url({ photo })).toEqual({ type: 'image', fit: 'cover' });
    expect(url({})).toEqual({ type: 'image', fit: 'cover' });
  });

  it('the model does not apply the policy: the invalid url passes as is', () => {
    const paints =
      imageNode(draw(withField, { photo: 'http://10.0.0.1/a.png' }).root)?.fills ?? [];
    expect(paints[paints.length - 1]).toMatchObject({ url: 'http://10.0.0.1/a.png' });
  });

  it('inside a repeat, each row gets the url of its own column', () => {
    const c = component(
      raw({
        type: 'repeat',
        field: 'photos',
        template: {
          type: 'frame',
          height: 20,
          children: [image({ src: { $field: 'url' }, width: 20, height: 20 })],
        },
      }),
    );
    const { root } = draw(c, {
      name: 'x',
      url: 'https://of.type/ignored.png',
      photos: [{ url: 'https://a.com/1.png' }, { url: 'https://a.com/2.png' }, {}],
    });
    const urls: (string | undefined)[] = [];
    const visit = (node: SceneNode): void => {
      if (node.type === 'rect') {
        const last = node.fills[node.fills.length - 1];
        if (last?.type === 'image') urls.push(last.url);
      }
      if (node.type === 'frame') node.children.forEach(visit);
    };
    visit(root);
    // The column shadows the type's `url` field: the row without a value ends up without url.
    expect(urls).toEqual(['https://a.com/1.png', 'https://a.com/2.png', undefined]);
  });

  it('the layout is identical with and without url', () => {
    const boxes = (values: FieldValues) =>
      [...absoluteBoxes(draw(withField, values).root)].map(([id, b]) => [id, b]);
    expect(boxes({ photo: URL_A, name: 'Ana' })).toEqual(boxes({ name: 'Ana' }));
  });
});

describe('parseComponent: package image in src (formatVersion 4)', () => {
  const at = 'template.children[0].src';
  const ONLY_RESULTS = `${at}: in $switch and $if every result must be a package image path`;
  const V4_ONLY = `${at}: only allowed with formatVersion 4`;
  const v4 = (src: unknown, version = 4) => problems(raw(image({ src }), version));

  it.each([
    'images/a.png',
    'a.jpg',
    'deep/er/photo.JPEG',
    'img/x.WebP',
    'with space/a b.png',
  ])('accepts the literal package path %s', (src) => {
    expect(v4(src)).toEqual([]);
  });

  it.each([
    ['a ".." segment', 'images/../a.png'],
    ['a leading ".." segment', '../a.png'],
    ['a leading slash', '/images/a.png'],
    ['a drive letter', 'C:/images/a.png'],
    ['a scheme', 'file:images/a.png'],
    ['a backslash', 'images\\a.png'],
    ['a wrong extension', 'images/a.gif'],
    ['no extension', 'images/a'],
  ])('rejects a path with %s', (_name, src) => {
    expect(v4(src)).toEqual([
      expect.stringMatching(
        /^template\.children\[0\]\.src: expected an absolute https:\/\/ URL/,
      ),
    ]);
  });

  it.each([
    ['http', 'http://cdn.example.com/a.png'],
    ['data', 'data:image/png;base64,AAAA'],
  ])('still rejects a %s literal', (_name, src) => {
    expect(v4(src)).toHaveLength(1);
  });

  it('still rejects $concat', () => {
    expect(v4({ $concat: ['images/', { $field: 'n' }, '.png'] })).toEqual([
      `${at}: src only accepts literal text or { "$field": "<field>" }`,
    ]);
  });

  it('accepts a $switch whose every result is a package path', () => {
    expect(
      v4({
        $switch: 'kind',
        cases: { a: 'img/a.png', b: 'img/b.webp' },
        default: 'img/c.jpg',
      }),
    ).toEqual([]);
    expect(v4({ $switch: 'kind', cases: { a: 'img/a.png' } })).toEqual([]);
  });

  it('accepts an $if whose then and else are package paths', () => {
    expect(v4({ $if: { $has: 'x' }, then: 'img/a.png', else: 'img/b.png' })).toEqual([]);
    expect(v4({ $if: { $has: 'x' }, then: 'img/a.png' })).toEqual([]);
  });

  it.each([
    ['a URL in a case', { $switch: 'k', cases: { a: 'img/a.png', b: URL_A } }],
    ['a URL in default', { $switch: 'k', cases: { a: 'img/a.png' }, default: URL_A }],
    ['an expression in a case', { $switch: 'k', cases: { a: { $field: 'f' } } }],
    ['a URL in then', { $if: { $has: 'x' }, then: URL_A }],
    [
      'an expression in else',
      { $if: { $has: 'x' }, then: 'a.png', else: { $field: 'f' } },
    ],
    ['a bad path in then', { $if: { $has: 'x' }, then: '../a.png' }],
  ])('rejects %s', (_name, src) => {
    expect(v4(src)).toEqual([ONLY_RESULTS]);
  });

  it('accepts $field unchanged', () => {
    expect(v4({ $field: 'photo' })).toEqual([]);
  });

  it('in formatVersion 3 a package path is only allowed with formatVersion 4', () => {
    expect(v4('images/a.png', 3)).toEqual([V4_ONLY]);
    expect(
      v4({ $switch: 'k', cases: { a: 'img/a.png' }, default: 'img/b.png' }, 3),
    ).toEqual([V4_ONLY]);
    expect(v4(URL_A, 3)).toEqual([]);
    expect(v4({ $field: 'photo' }, 3)).toEqual([]);
  });
});

describe('instantiate: package image', () => {
  const paintOf = (src: unknown, values: FieldValues = {}) => {
    const node = firstRect(draw(component(raw(image({ src }), 4)), values).root);
    const paints = node?.fills ?? [];
    return paints[paints.length - 1];
  };

  it('a literal package path gives asset and no url', () => {
    expect(paintOf('images/a.png')).toEqual({
      type: 'image',
      fit: 'cover',
      asset: 'images/a.png',
    });
  });

  it('a $field value that is a package path gives asset (trimmed; extension in any case)', () => {
    expect(paintOf({ $field: 'p' }, { p: '  img/A.PNG ' })).toEqual({
      type: 'image',
      fit: 'cover',
      asset: 'img/A.PNG',
    });
  });

  it('an https $field value keeps url', () => {
    expect(paintOf({ $field: 'p' }, { p: URL_A })).toEqual({
      type: 'image',
      fit: 'cover',
      url: URL_A,
    });
  });

  it('other text gives neither asset nor url', () => {
    for (const p of ['banner', '../a.png', '/a.png', 'a.gif', 'file:a.png'])
      expect(paintOf({ $field: 'p' }, { p }), p).toEqual({ type: 'image', fit: 'cover' });
  });

  it('a $switch result gives asset; without a match and without default, the placeholder', () => {
    const src = { $switch: 'kind', cases: { a: 'img/a.png', b: 'img/b.webp' } };
    expect(paintOf(src, { kind: 'b' })).toEqual({
      type: 'image',
      fit: 'cover',
      asset: 'img/b.webp',
    });
    expect(paintOf(src, { kind: 'zzz' })).toEqual({ type: 'image', fit: 'cover' });
    expect(paintOf({ ...src, default: 'img/d.png' }, { kind: 'zzz' })).toEqual({
      type: 'image',
      fit: 'cover',
      asset: 'img/d.png',
    });
  });

  it('an $if result gives asset', () => {
    const src = { $if: { $has: 'x' }, then: 'img/yes.png', else: 'img/no.png' };
    expect(paintOf(src, { x: 'v' })).toMatchObject({ asset: 'img/yes.png' });
    expect(paintOf(src, {})).toMatchObject({ asset: 'img/no.png' });
  });
});

describe('isPackageImagePath: the text is taken as written', () => {
  it('rejects leading or trailing whitespace (the engine trims a field value, a literal is not trimmed)', () => {
    expect(isPackageImagePath('images/a.png')).toBe(true);
    expect(isPackageImagePath(' images/a.png')).toBe(false);
    expect(isPackageImagePath('images/a.png ')).toBe(false);
    expect(isPackageImagePath('images/a.png\n')).toBe(false);
  });
});
