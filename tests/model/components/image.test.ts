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
    ['relative', 'images/a.png', 'invalid'],
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
    ['$switch', { $switch: 'k', cases: { a: URL_A } }],
    ['$if', { $if: { $has: 'photo' }, then: URL_A }],
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
