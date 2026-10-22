// O nó `repeat` (ME4, componente `formatVersion` 2): validação, expansão e desenho.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type {
  ComponentFile,
  FieldValues,
  FrameTemplate,
  TemplateNode,
} from '../../../src/model/components/componentFormat';
import {
  evaluateCondition,
  isEmpty,
  referencedFields,
  repeatInnerFields,
  truthy,
} from '../../../src/model/components/expressions';
import {
  approximateMeasurer,
  instantiate,
  measureComponent,
  type Box,
} from '../../../src/model/components/instantiate';
import { parseComponent } from '../../../src/model/components/parseComponent';
import {
  columnsOf,
  expandRepeats,
  hasRepeat,
  rowsOf,
} from '../../../src/model/components/repeat';
import type { FrameNode, SceneNode, TextNode } from '../../../src/model/components/scene';
import { collectFieldKeys } from '../../../src/model/components/parseComponent';
import { checkSchema } from '../../support/jsonSchema';

const schema: Record<string, unknown> = JSON.parse(
  readFileSync(new URL('../../../docs/component.schema.json', import.meta.url), 'utf8'),
);

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const row = (children: Raw[] = []): Raw => ({
  type: 'frame',
  name: 'linha',
  layout: { type: 'row', gap: 10 },
  children,
});

const text = (field: string, extra: Raw = {}): Raw => ({
  type: 'text',
  text: { $field: field },
  font: { size: 10, lineHeight: 12 },
  ...extra,
});

/** Componente com um `repeat` de `linhas` dentro de uma coluna com um título. */
function raw(over: Raw = {}, repeat: Raw = {}, version = 2): Raw {
  return {
    format: 'mapping-component',
    formatVersion: version,
    id: 'tabela',
    name: 'Tabela',
    size: { width: 200, height: 100 },
    template: {
      type: 'frame',
      layout: { type: 'column', gap: 6, padding: 8 },
      children: [
        text('titulo', { name: 'título' }),
        {
          type: 'repeat',
          field: 'linhas',
          gap: 2,
          template: row([
            text('chave', { width: 'hug' }),
            text('valor', { width: 'fill' }),
          ]),
          ...repeat,
        },
      ],
    },
    ...over,
  };
}

function component(over: Raw = {}, repeat: Raw = {}, version = 2): ComponentFile {
  const parsed = parseComponent(raw(over, repeat, version));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.component;
}

function errorsOf(input: unknown): string[] {
  const parsed = parseComponent(input);
  if (parsed.ok) throw new Error('era para falhar');
  return parsed.errors;
}

const BOX: Box = { x: 0, y: 0, width: 200, height: 100 };

const ROWS = [
  { chave: 'origem', valor: 'carrinho' },
  { chave: 'total', valor: '149,90' },
  { chave: 'itens', valor: '3' },
];

function draw(c: ComponentFile, values: FieldValues, box: Box = BOX) {
  return instantiate(c, values, box, { measure: approximateMeasurer });
}

interface Placed {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly node: TextNode;
}

function texts(root: FrameNode): Placed[] {
  const out: Placed[] = [];
  const visit = (node: SceneNode, ox: number, oy: number): void => {
    const x = ox + node.transform[4];
    const y = oy + node.transform[5];
    if (node.type === 'text') out.push({ text: node.text, x, y, node });
    if (node.type === 'frame') for (const child of node.children) visit(child, x, y);
  };
  visit(root, 0, 0);
  return out;
}

function ids(node: SceneNode, found: string[] = []): string[] {
  found.push(node.id);
  if (node.type === 'frame') for (const child of node.children) ids(child, found);
  return found;
}

describe('parseComponent: repeat', () => {
  it('aceita o repeat na formatVersion 2, com direction e gap', () => {
    expect(parseComponent(raw()).ok).toBe(true);
    expect(
      parseComponent(raw({}, { direction: 'row', gap: { $field: 'espaco' } })).ok,
    ).toBe(true);
  });

  it('o schema JSON aceita o mesmo componente e a formatVersion 1 sem repeat', () => {
    expect(checkSchema(schema, raw())).toEqual([]);
    expect(checkSchema(schema, raw({}, { direction: 'row' }))).toEqual([]);
    const v1 = raw({}, {}, 1);
    v1.template.children.pop();
    expect(checkSchema(schema, v1)).toEqual([]);
    expect(parseComponent(v1).ok).toBe(true);
  });

  it('repeat numa formatVersion 1 é erro, no caminho do nó', () => {
    expect(errorsOf(raw({}, {}, 1))).toEqual([
      'template.children[1].type: o nó repeat só existe na formatVersion 2',
    ]);
  });

  it('a formatVersion 3 é recusada e as duas aceitas são citadas', () => {
    const v3 = raw({ formatVersion: 3 });
    v3.template.children.pop();
    expect(errorsOf(v3)).toEqual(['formatVersion: esperava 1 ou 2']);
  });

  it('field e template são obrigatórios; field não pode ser vazio', () => {
    const noField = raw();
    delete noField.template.children[1].field;
    expect(errorsOf(noField)).toContain('template.children[1].field: campo obrigatório');
    const noTemplate = raw();
    delete noTemplate.template.children[1].template;
    expect(errorsOf(noTemplate)).toContain(
      'template.children[1].template: campo obrigatório',
    );
    expect(errorsOf(raw({}, { field: '' }))[0]).toContain('template.children[1].field:');
  });

  it('direction só aceita column e row; gap não é negativo', () => {
    expect(errorsOf(raw({}, { direction: 'grid' }))[0]).toContain(
      'template.children[1].direction: esperava um de: column, row',
    );
    expect(errorsOf(raw({}, { gap: -1 }))[0]).toContain('template.children[1].gap:');
  });

  it('o template de uma linha é um quadro', () => {
    expect(errorsOf(raw({}, { template: text('chave') }))).toContain(
      'template.children[1].template.type: o template de uma linha deve ser do tipo "frame"',
    );
  });

  it('não vale fill, stroke, shadow nem cornerRadius no repeat (o desenho é do template)', () => {
    for (const key of ['fill', 'stroke', 'shadow', 'cornerRadius']) {
      expect(errorsOf(raw({}, { [key]: key === 'fill' ? '#fff' : {} }))[0]).toContain(
        `template.children[1].${key}: não vale em repeat`,
      );
    }
  });

  it('repeat e slot dentro do repeat são recusados', () => {
    const nested = errorsOf(
      raw(
        {},
        {
          template: row([
            { type: 'repeat', field: 'outro', template: row() },
            { type: 'slot' },
          ]),
        },
      ),
    );
    expect(nested).toContain(
      'template.children[1].template.children[0].type: repeat não é permitido dentro de um repeat',
    );
    expect(nested).toContain(
      'template.children[1].template.children[1].type: slot não é permitido dentro de um repeat',
    );
  });

  it('o template do repeat é conferido como qualquer nó', () => {
    const errors = errorsOf(
      raw({}, { template: row([{ type: 'text', text: 3, bogus: 1 }]) }),
    );
    expect(errors).toContain(
      'template.children[1].template.children[0].bogus: chave desconhecida: bogus',
    );
  });

  it('o preview aceita linhas (lista de objetos) e confere cada célula', () => {
    expect(parseComponent(raw({ preview: { titulo: 'T', linhas: ROWS } })).ok).toBe(true);
    expect(checkSchema(schema, raw({ preview: { titulo: 'T', linhas: ROWS } }))).toEqual(
      [],
    );
    expect(errorsOf(raw({ preview: { linhas: ['x'] } }))).toContain(
      'preview.linhas[0]: esperava objeto (uma linha)',
    );
    expect(errorsOf(raw({ preview: { linhas: [{ chave: true }] } }))).toContain(
      'preview.linhas[0].chave: esperava texto, número ou null',
    );
    expect(errorsOf(raw({ preview: { x: true } }))[0]).toContain('preview.x:');
  });
});

describe('campos citados', () => {
  it('collectFieldKeys conta o campo table do repeat e as expressões do próprio nó, não as do template', () => {
    const c = component({}, { visible: { $has: 'mostrar' }, gap: { $field: 'espaco' } });
    expect(collectFieldKeys(c)).toEqual(['espaco', 'linhas', 'mostrar', 'titulo']);
    expect([...repeatInnerFields(c.template)].sort()).toEqual(['chave', 'valor']);
    expect([...referencedFields(c.template)].sort()).toEqual(
      ['espaco', 'linhas', 'mostrar', 'titulo'].sort(),
    );
  });

  it('sem repeat, repeatInnerFields é vazio', () => {
    expect(repeatInnerFields({ type: 'frame', children: [text('a')] }).size).toBe(0);
  });

  it('isEmpty e truthy leem a lista de linhas', () => {
    expect(isEmpty([])).toBe(true);
    expect(isEmpty(ROWS)).toBe(false);
    expect(truthy([])).toBe(false);
    expect(truthy(ROWS)).toBe(true);
    expect(evaluateCondition({ $has: 'linhas' }, { linhas: ROWS })).toBe(true);
    expect(evaluateCondition({ $has: 'linhas' }, { linhas: [] })).toBe(false);
  });
});

describe('expandRepeats', () => {
  it('sem repeat devolve os mesmos objetos', () => {
    const plain = component({}, {});
    const noRepeat: ComponentFile = {
      ...plain,
      template: { ...plain.template, children: [plain.template.children![0]!] },
    };
    const values: FieldValues = { titulo: 'x' };
    const out = expandRepeats(noRepeat, values);
    expect(hasRepeat(noRepeat.template)).toBe(false);
    expect(out.component).toBe(noRepeat);
    expect(out.values).toBe(values);
    expect(out.warnings).toEqual([]);
  });

  it('troca o repeat por um quadro com uma cópia do template por linha e valores próprios de cada linha', () => {
    const out = expandRepeats(component(), { titulo: 'T', linhas: ROWS });
    expect(hasRepeat(out.component.template)).toBe(false);
    const frame = out.component.template.children![1] as FrameTemplate;
    expect(frame).toMatchObject({
      type: 'frame',
      name: 'repeat',
      width: 'fill',
      height: 'hug',
      layout: { type: 'column', gap: 2 },
    });
    expect(frame.children).toHaveLength(3);
    // Cada cópia lê os campos extras da própria linha.
    const first = frame.children![0] as FrameTemplate;
    expect(first.height).toBe('hug');
    expect(JSON.stringify(first)).toContain('$r0_0:chave');
    expect(out.values['$r0_0:chave']).toBe('origem');
    expect(out.values['$r0_2:valor']).toBe('3');
    expect(out.values.titulo).toBe('T');
  });

  it('o repeat em linha é hug na largura e fill na altura; o template da linha é hug na largura', () => {
    const out = expandRepeats(component({}, { direction: 'row' }), { linhas: ROWS });
    const frame = out.component.template.children![1] as FrameTemplate;
    expect(frame).toMatchObject({
      width: 'hug',
      height: 'fill',
      layout: { type: 'row' },
    });
    expect((frame.children![0] as FrameTemplate).width).toBe('hug');
  });

  it('o width/height do template e do nó prevalecem sobre o padrão', () => {
    const out = expandRepeats(
      component({}, { height: 80, template: { ...row([text('chave')]), height: 20 } }),
      { linhas: ROWS },
    );
    const frame = out.component.template.children![1] as FrameTemplate;
    expect(frame.height).toBe(80);
    expect((frame.children![0] as FrameTemplate).height).toBe(20);
  });

  it('só a coluna sombreia o campo do tipo; o resto continua lendo o campo', () => {
    const c = component(
      {},
      {
        template: row([text('chave'), text('titulo')]),
      },
    );
    const out = expandRepeats(c, { titulo: 'T', linhas: [{ chave: 'a' }] });
    const body = JSON.stringify(out.component.template.children![1]);
    expect(body).toContain('$r0_0:chave');
    expect(body).not.toContain('$r0_0:titulo');
    expect(body).toContain('"$field":"titulo"');
  });

  it('reescreve $has, $eq, $switch e as expressões aninhadas', () => {
    const c = component(
      {},
      {
        template: row([
          text('chave', { visible: { $has: 'valor' } }),
          text('valor', {
            color: {
              $if: { $eq: ['chave', 'total'] },
              then: '#ff0000',
              else: { $switch: 'chave', cases: { a: '#00ff00' }, default: '#000000' },
            },
          }),
        ]),
      },
    );
    const out = expandRepeats(c, { linhas: [{ chave: 'total', valor: '1' }] });
    const body = JSON.stringify(out.component.template.children![1]);
    expect(body).toContain('"$has":"$r0_0:valor"');
    expect(body).toContain('"$eq":["$r0_0:chave","total"]');
    expect(body).toContain('"$switch":"$r0_0:chave"');
  });

  it('dois repeat no mesmo componente não misturam as linhas', () => {
    const base = raw();
    base.template.children.push({
      ...base.template.children[1],
      field: 'outras',
      template: row([text('chave')]),
    });
    const parsed = parseComponent(base);
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    const out = expandRepeats(parsed.component, {
      linhas: [{ chave: 'a', valor: 'b' }],
      outras: [{ chave: 'z' }],
    });
    expect(out.values['$r0_0:chave']).toBe('a');
    expect(out.values['$r1_0:chave']).toBe('z');
  });

  it('linhas esparsas: a coluna que falta numa linha fica vazia, não lê o campo do tipo', () => {
    const out = expandRepeats(component(), {
      chave: 'DO TIPO',
      linhas: [{ chave: 'a', valor: 'b' }, { chave: 'c' }],
    });
    expect(out.values['$r0_1:valor']).toBeNull();
    expect(out.values['$r0_1:chave']).toBe('c');
  });

  it('o campo table não informado vira aviso; informado vazio ou nulo, não', () => {
    expect(expandRepeats(component(), {}).warnings).toEqual([
      'campo não informado: linhas',
    ]);
    expect(expandRepeats(component(), { linhas: null }).warnings).toEqual([]);
    expect(expandRepeats(component(), { linhas: [] }).warnings).toEqual([]);
  });

  it('rowsOf e columnsOf', () => {
    expect(rowsOf(ROWS)).toEqual(ROWS);
    expect(rowsOf('x')).toEqual([]);
    expect(rowsOf(null)).toEqual([]);
    expect(
      columnsOf([
        { _id: 'R1', a: 1 },
        { b: 2, a: 3 },
      ]),
    ).toEqual(['a', 'b']);
  });
});

describe('instantiate com repeat', () => {
  it('desenha o título e uma linha por registro, empilhadas, com a chave à esquerda e o valor à direita', () => {
    const { root, warnings } = draw(component(), { titulo: 'T', linhas: ROWS });
    expect(warnings).toEqual([]);
    const all = texts(root);
    expect(all.map((t) => t.text)).toEqual([
      'T',
      'origem',
      'carrinho',
      'total',
      '149,90',
      'itens',
      '3',
    ]);
    const [, k1, v1, k2, , k3] = all;
    // Mesma linha: chave antes do valor, no mesmo y. Linhas seguintes abaixo, com o gap.
    expect(v1!.x).toBeGreaterThan(k1!.x);
    expect(v1!.y).toBe(k1!.y);
    expect(k2!.y).toBeGreaterThan(k1!.y);
    expect(k3!.y).toBeGreaterThan(k2!.y);
    // A altura da linha é a do texto (12) e o gap entre linhas, 2.
    expect(k2!.y - k1!.y).toBe(14);
    expect(k3!.y - k2!.y).toBe(14);
  });

  it('o valor ocupa o resto da linha (fill) e a largura da chave é a do texto', () => {
    const { root } = draw(component(), { titulo: 'T', linhas: ROWS });
    const [, key, value] = texts(root);
    expect(value!.node.width).toBeGreaterThan(key!.node.width);
    expect(key!.x + key!.node.width + 10).toBeCloseTo(value!.x, 5);
    expect(value!.x + value!.node.width).toBeCloseTo(200 - 8, 5);
  });

  it('sem linhas (ou com a tabela nula) desenha só o título', () => {
    for (const linhas of [[], null, undefined]) {
      const { root, warnings } = draw(component(), { titulo: 'T', linhas });
      expect(texts(root).map((t) => t.text)).toEqual(['T']);
      expect(warnings).toEqual([]);
    }
  });

  it('o repeat em linha (row) coloca os registros lado a lado', () => {
    const c = component({}, { direction: 'row' });
    const { root } = draw(
      c,
      { titulo: 'T', linhas: ROWS.slice(0, 2) },
      { ...BOX, width: 400 },
    );
    const keys = texts(root).filter((t) => ['origem', 'total'].includes(t.text));
    expect(keys[1]!.x).toBeGreaterThan(keys[0]!.x);
    expect(keys[1]!.y).toBe(keys[0]!.y);
  });

  it('visible no repeat esconde a tabela inteira', () => {
    const c = component({}, { visible: { $has: 'mostrar' } });
    expect(
      texts(draw(c, { titulo: 'T', mostrar: null, linhas: ROWS }).root),
    ).toHaveLength(1);
    expect(
      texts(draw(c, { titulo: 'T', mostrar: 'sim', linhas: ROWS }).root),
    ).toHaveLength(7);
  });

  it('o eixo das linhas é hug: mais linhas, mais altura medida; o quadro não é dividido com os fill', () => {
    const c = component();
    const measure = (linhas: FieldValues[string]) =>
      measureComponent(
        c,
        { titulo: 'T', linhas },
        { width: 200, height: null },
        { measure: approximateMeasurer },
      );
    const none = measure([]);
    const one = measure(ROWS.slice(0, 1));
    const three = measure(ROWS);
    // 8 + 12 (título) + 6 + 8 = 34 sem linhas (o repeat vazio ocupa 0 mas entra no gap).
    expect(none.warnings).toEqual([]);
    expect(one.height - none.height).toBeGreaterThan(0);
    expect(three.height - one.height).toBe(2 * 14);
  });

  it('as colunas sombreiam os campos do tipo e os campos do tipo seguem valendo', () => {
    const c = component(
      {},
      { template: row([text('chave'), text('titulo', { name: 'do tipo' })]) },
    );
    const { root } = draw(c, {
      titulo: 'DO TIPO',
      chave: 'campo',
      linhas: [{ chave: 'coluna' }],
    });
    expect(texts(root).map((t) => t.text)).toEqual(['DO TIPO', 'coluna', 'DO TIPO']);
  });

  it('uma condição que cita a coluna escolhe o ramo de cada linha', () => {
    const c = component(
      {},
      {
        template: row([
          text('chave', {
            color: { $if: { $eq: ['chave', 'total'] }, then: '#ff0000', else: '#00ff00' },
          }),
        ]),
      },
    );
    const { root } = draw(c, { titulo: 'T', linhas: ROWS });
    const fills = texts(root)
      .filter((t) => ['origem', 'total', 'itens'].includes(t.text))
      .map((t) => t.node.fills[0] && 'color' in t.node.fills[0] && t.node.fills[0].color);
    expect(fills).toEqual(['#00ff00', '#ff0000', '#00ff00']);
  });

  it('os ids dos nós são únicos e estáveis (prefixo/caminho.índice)', () => {
    const a = ids(draw(component(), { titulo: 'T', linhas: ROWS }).root);
    const b = ids(draw(component(), { titulo: 'T', linhas: ROWS }).root);
    expect(new Set(a).size).toBe(a.length);
    expect(b).toEqual(a);
  });

  it('colunas com números viram texto; célula vazia vira texto vazio', () => {
    const { root } = draw(component(), {
      titulo: 'T',
      linhas: [
        { chave: 'n', valor: 42 },
        { chave: 'vazio', valor: null },
      ],
    });
    expect(texts(root).map((t) => t.text)).toEqual(['T', 'n', '42', 'vazio', '']);
  });

  it('o aviso de conteúdo maior que a caixa vale para as linhas que passam', () => {
    const { warnings } = draw(
      component(),
      { titulo: 'T', linhas: [...ROWS, ...ROWS, ...ROWS] },
      { ...BOX, height: 40 },
    );
    expect(warnings.some((w) => w.startsWith('conteúdo maior que a caixa'))).toBe(true);
  });

  it('um componente da formatVersion 1 (sem repeat) desenha como antes', () => {
    const base = raw({}, {}, 1);
    base.template.children.pop();
    const parsed = parseComponent(base);
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    const { root } = draw(parsed.component, { titulo: 'só o título' });
    expect(texts(root).map((t) => t.text)).toEqual(['só o título']);
  });
});

describe('o desenho não depende de o repeat estar numa posição fixa', () => {
  it('um repeat dentro de um quadro aninhado também é expandido', () => {
    const base = raw();
    const repeat = base.template.children.pop() as TemplateNode;
    base.template.children.push({
      type: 'frame',
      name: 'caixa',
      layout: { type: 'column' },
      children: [repeat],
    });
    const parsed = parseComponent(base);
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    const { root } = draw(parsed.component, { titulo: 'T', linhas: ROWS });
    expect(texts(root)).toHaveLength(7);
  });
});
