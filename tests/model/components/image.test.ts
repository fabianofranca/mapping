// O nó `image` (imagem remota, componente `formatVersion` 3): validação do `src` restrito,
// versões, cena montada e layout independente da URL. Nenhuma requisição de rede.
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

const URL_A = 'https://cdn.exemplo.com/a.png';

const image = (extra: Raw = {}): Raw => ({
  type: 'image',
  name: 'foto',
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
      children: [node, { type: 'text', text: { $field: 'nome' } }],
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

/** O primeiro nó `rect` da cena (o nó `image` do componente vira um). */
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
  it('aceita na formatVersion 3 o literal https://, o $field e o fit', () => {
    expect(problems(raw())).toEqual([]);
    expect(problems(raw(image({ src: { $field: 'foto' } })))).toEqual([]);
    for (const fit of ['cover', 'contain', 'fill'])
      expect(problems(raw(image({ fit })))).toEqual([]);
  });

  it('aceita um literal de host local (a política decide em execução)', () => {
    expect(problems(raw(image({ src: 'https://localhost:8443/a.png' })))).toEqual([]);
    expect(problems(raw(image({ src: 'https://192.168.0.2/a.png' })))).toEqual([]);
  });

  it('vale dentro do template de um repeat', () => {
    const input = raw({
      type: 'repeat',
      field: 'fotos',
      template: {
        type: 'frame',
        children: [image({ src: { $field: 'url' } })],
      },
    });
    expect(problems(input)).toEqual([]);
  });

  it('o repeat vale na 2 e na 3, e a 1 o recusa', () => {
    const rep = {
      type: 'repeat',
      field: 'l',
      template: { type: 'frame', children: [] },
    };
    expect(problems(raw(rep, 3))).toEqual([]);
    expect(problems(raw(rep, 2))).toEqual([]);
    expect(problems(raw(rep, 1))).toEqual([
      'template.children[0].type: o nó repeat só existe na formatVersion 2',
    ]);
  });

  it('image na formatVersion 1 ou 2 é erro, no caminho do nó', () => {
    for (const version of [1, 2]) {
      expect(problems(raw(image(), version))).toEqual([
        'template.children[0].type: o nó image só existe na formatVersion 3',
      ]);
    }
  });

  it('a 1 e a 2 continuam aceitas sem image', () => {
    const plain = { type: 'rect', width: 10, height: 10 };
    expect(problems(raw(plain, 1))).toEqual([]);
    expect(problems(raw(plain, 2))).toEqual([]);
  });

  it('src é obrigatório', () => {
    const node = image();
    delete node.src;
    expect(problems(raw(node))).toEqual(['template.children[0].src: campo obrigatório']);
  });

  it('fit inválido', () => {
    expect(problems(raw(image({ fit: 'zoom' })))).toEqual([
      'template.children[0].fit: esperava um de: cover, contain, fill',
    ]);
  });

  it('hug na largura e na altura é erro', () => {
    expect(problems(raw(image({ width: 'hug' })))).toEqual([
      'template.children[0].width: o nó image não aceita hug: a arrumação não depende da imagem baixada',
    ]);
    expect(problems(raw(image({ height: 'hug' })))).toEqual([
      'template.children[0].height: o nó image não aceita hug: a arrumação não depende da imagem baixada',
    ]);
  });

  it('children e layout caem na mensagem de nó que não é quadro', () => {
    expect(problems(raw(image({ children: [] })))).toEqual([
      'template.children[0].children: só nós do tipo frame aceitam children (este é image)',
    ]);
    expect(problems(raw(image({ layout: { type: 'none' } })))).toEqual([
      'template.children[0].layout: só nós do tipo frame aceitam layout (este é image)',
    ]);
  });

  it.each([
    ['relativo', 'imagens/a.png', 'invalid'],
    ['http', 'http://cdn.exemplo.com/a.png', 'insecure'],
    ['data', 'data:image/png;base64,AAAA', 'invalid'],
    ['com credenciais', 'https://u:p@cdn.exemplo.com/a.png', 'credentials'],
    ['vazio', '', 'empty'],
  ])('src literal %s é erro de formato', (_name, src, reason) => {
    expect(problems(raw(image({ src })))).toEqual([
      `template.children[0].src: esperava URL https:// absoluta (${reason})`,
    ]);
  });

  it.each([
    ['$concat', { $concat: ['https://x.com/', { $field: 'id' }] }],
    ['$switch', { $switch: 'k', cases: { a: URL_A } }],
    ['$if', { $if: { $has: 'foto' }, then: URL_A }],
    ['$field com default', { $field: 'foto', default: URL_A }],
    ['número', 5],
    ['objeto sem operador', { url: URL_A }],
  ])('src com %s é erro', (_name, src) => {
    expect(problems(raw(image({ src })))).toEqual([
      'template.children[0].src: src só aceita texto literal ou { "$field": "<campo>" }',
    ]);
  });

  it('$field vazio no src é erro de chave', () => {
    expect(problems(raw(image({ src: { $field: '' } })))).toEqual([
      'template.children[0].src.$field: esperava chave de campo (texto não vazio)',
    ]);
  });

  it('o $field do src entra nos campos citados', () => {
    const c = component(raw(image({ src: { $field: 'foto' } })));
    expect(collectFieldKeys(c)).toEqual(['foto', 'nome']);
    expect([...referencedFields(c.template)].sort()).toEqual(['foto', 'nome']);
  });
});

describe('instantiate: image', () => {
  const withField = component(
    raw(image({ src: { $field: 'foto' }, fill: '#eeeeee', cornerRadius: 4 })),
  );
  const imageNode = (root: FrameNode) => firstRect(root);

  it('vira um rect com o fundo e depois o paint image com url e fit (padrão cover)', () => {
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

  it('respeita o fit e o stroke do nó', () => {
    const c = component(
      raw(image({ fit: 'contain', stroke: { color: '#112233', width: 2 } })),
    );
    const node = imageNode(draw(c, {}).root);
    expect(node?.fills).toEqual([{ type: 'image', fit: 'contain', url: URL_A }]);
    expect(node?.stroke).toMatchObject({ width: 2, align: 'inside' });
  });

  it('o campo string vira a url (aparada); vazio, ausente ou número ficam sem url', () => {
    const url = (values: FieldValues) => {
      const paints = imageNode(draw(withField, values).root)?.fills ?? [];
      return paints[paints.length - 1];
    };
    expect(url({ foto: `  ${URL_A} ` })).toEqual({
      type: 'image',
      fit: 'cover',
      url: URL_A,
    });
    for (const foto of ['', '   ', null, 42, undefined])
      expect(url({ foto })).toEqual({ type: 'image', fit: 'cover' });
    expect(url({})).toEqual({ type: 'image', fit: 'cover' });
  });

  it('o modelo não aplica a política: a url inválida passa como está', () => {
    const paints =
      imageNode(draw(withField, { foto: 'http://10.0.0.1/a.png' }).root)?.fills ?? [];
    expect(paints[paints.length - 1]).toMatchObject({ url: 'http://10.0.0.1/a.png' });
  });

  it('dentro de um repeat, cada linha recebe a url da própria coluna', () => {
    const c = component(
      raw({
        type: 'repeat',
        field: 'fotos',
        template: {
          type: 'frame',
          height: 20,
          children: [image({ src: { $field: 'url' }, width: 20, height: 20 })],
        },
      }),
    );
    const { root } = draw(c, {
      nome: 'x',
      url: 'https://do.tipo/ignorada.png',
      fotos: [{ url: 'https://a.com/1.png' }, { url: 'https://a.com/2.png' }, {}],
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
    // A coluna sombreia o campo `url` do tipo: a linha sem valor fica sem url.
    expect(urls).toEqual(['https://a.com/1.png', 'https://a.com/2.png', undefined]);
  });

  it('o layout é idêntico com e sem url', () => {
    const boxes = (values: FieldValues) =>
      [...absoluteBoxes(draw(withField, values).root)].map(([id, b]) => [id, b]);
    expect(boxes({ foto: URL_A, nome: 'Ana' })).toEqual(boxes({ nome: 'Ana' }));
  });
});
