// Variáveis do componente (formatVersion 4, etapa #1504): `let` nos quadros e `{ "$var": … }`
// trocados na leitura. O componente lido não tem `let` nem `$var` e é igual ao escrito à mão.
import { describe, expect, it } from 'vitest';
import type { ComponentFile } from '../../../src/model/components/componentFormat';
import {
  parseComponent,
  validateComponent,
} from '../../../src/model/components/parseComponent';
import {
  MAX_EXPANDED_NODES,
  expandVariables,
  variableSyntaxPaths,
} from '../../../src/model/components/variables';

type Raw = Record<string, unknown>;

function file(template: Raw, formatVersion = 4): Raw {
  return {
    format: 'mapping-component',
    formatVersion,
    id: 'vars',
    name: 'Variáveis',
    size: { width: 200, height: 100 },
    template,
  };
}

function parsed(raw: Raw): ComponentFile {
  const result = parseComponent(raw);
  if (!result.ok) throw new Error(result.errors.join('; '));
  return result.component;
}

const rect = (extra: Raw = {}): Raw => ({
  type: 'rect',
  width: 10,
  height: 10,
  ...extra,
});
const frame = (extra: Raw = {}): Raw => ({ type: 'frame', ...extra });

describe('let e $var: a leitura troca e devolve o componente sem eles', () => {
  it('let na raiz usado num neto', () => {
    const withLet = file(
      frame({
        let: { pad: 12 },
        children: [frame({ children: [rect({ width: { $var: 'pad' } })] })],
      }),
    );
    const byHand = file(
      frame({ children: [frame({ children: [rect({ width: 12 })] })] }),
    );
    expect(parsed(withLet)).toEqual(parsed(byHand));
    expect(JSON.stringify(parsed(withLet))).not.toMatch(/"let"|\$var/);
  });

  it('let num template de repeat: o $index é o da linha do uso', () => {
    const next = { $add: [{ $field: '$index' }, 1] };
    const text = (t: unknown): Raw => ({ type: 'text', text: t, font: { size: 10 } });
    const withLet = file(
      frame({
        children: [
          {
            type: 'repeat',
            count: 3,
            template: frame({
              let: { n: next },
              children: [text({ $var: 'n' }), text({ $concat: ['#', { $var: 'n' }] })],
            }),
          },
        ],
      }),
    );
    const byHand = file(
      frame({
        children: [
          {
            type: 'repeat',
            count: 3,
            template: frame({ children: [text(next), text({ $concat: ['#', next] })] }),
          },
        ],
      }),
    );
    expect(parsed(withLet)).toEqual(parsed(byHand));
  });

  it('o $index numa variável da raiz vale dentro do repeat que a usa', () => {
    const next = { $add: [{ $field: '$index' }, 1] };
    const withLet = file(
      frame({
        let: { n: next },
        children: [
          {
            type: 'repeat',
            count: { $var: 'rows' },
            template: frame({
              children: [{ type: 'text', text: { $var: 'n' }, font: { size: 10 } }],
            }),
          },
        ],
      }),
    );
    // `rows` não existe: o erro é só dele (o $index continua a salvo de uma conferência fora do repeat)
    expect(validateComponent(withLet)).toEqual([
      'template.children[0].count: variável não definida: rows',
    ]);
    const fixed = file(
      frame({
        let: { n: next, rows: 3 },
        children: [
          {
            type: 'repeat',
            count: { $var: 'rows' },
            template: frame({
              children: [{ type: 'text', text: { $var: 'n' }, font: { size: 10 } }],
            }),
          },
        ],
      }),
    );
    expect(validateComponent(fixed)).toEqual([]);
    const lido = parsed(fixed).template as unknown as { children: Raw[] };
    expect(lido.children[0]?.count).toBe(3);
  });

  it('o $index numa variável usada fora de um repeat é erro no caminho do uso', () => {
    const raw = file(
      frame({
        let: { n: { $field: '$index' } },
        children: [{ type: 'text', text: { $var: 'n' }, font: { size: 10 } }],
      }),
    );
    expect(validateComponent(raw)).toEqual([
      'template.children[0].text.$var(n).$field: $index só vale dentro de um repeat',
    ]);
  });

  it('$size dentro da variável é o do lugar do uso', () => {
    const withLet = file(
      frame({
        let: { w: { $size: 'width' } },
        children: [rect({ width: { $mul: [{ $var: 'w' }, 0.5] } })],
      }),
    );
    const byHand = file(
      frame({ children: [rect({ width: { $mul: [{ $size: 'width' }, 0.5] } })] }),
    );
    expect(parsed(withLet)).toEqual(parsed(byHand));
  });

  it('o let de dentro esconde o de fora, e o irmão vê o de fora', () => {
    const withLet = file(
      frame({
        let: { x: 1 },
        children: [
          frame({ let: { x: 2 }, children: [rect({ width: { $var: 'x' } })] }),
          rect({ width: { $var: 'x' } }),
        ],
      }),
    );
    const byHand = file(
      frame({
        children: [frame({ children: [rect({ width: 2 })] }), rect({ width: 1 })],
      }),
    );
    expect(parsed(withLet)).toEqual(parsed(byHand));
  });

  it('a ordem dentro do mesmo let é livre', () => {
    const withLet = file(
      frame({
        let: { b: { $add: [{ $var: 'a' }, 1] }, a: 5 },
        children: [rect({ width: { $var: 'b' } })],
      }),
    );
    const byHand = file(frame({ children: [rect({ width: { $add: [5, 1] } })] }));
    expect(parsed(withLet)).toEqual(parsed(byHand));
  });

  it('o nome do mesmo let vale antes do de fora', () => {
    const withLet = file(
      frame({
        let: { a: 100 },
        children: [
          frame({
            let: { a: 1, b: { $var: 'a' } },
            children: [rect({ width: { $var: 'b' } })],
          }),
        ],
      }),
    );
    const byHand = file(frame({ children: [frame({ children: [rect({ width: 1 })] })] }));
    expect(parsed(withLet)).toEqual(parsed(byHand));
  });

  it('$var como condição (visible e $if), cor, texto e repeat.count', () => {
    const withLet = file(
      frame({
        let: {
          show: { $has: 'label' },
          ink: '#112233',
          title: { $concat: ['A', { $field: 'label' }] },
          rows: 2,
        },
        children: [
          rect({ visible: { $var: 'show' }, fill: { $var: 'ink' } }),
          rect({
            fill: { $if: { $var: 'show' }, then: { $var: 'ink' }, else: '#ffffff' },
          }),
          { type: 'text', text: { $var: 'title' }, font: { size: 10 } },
          { type: 'repeat', count: { $var: 'rows' }, template: frame() },
        ],
      }),
    );
    const byHand = file(
      frame({
        children: [
          rect({ visible: { $has: 'label' }, fill: '#112233' }),
          rect({ fill: { $if: { $has: 'label' }, then: '#112233', else: '#ffffff' } }),
          {
            type: 'text',
            text: { $concat: ['A', { $field: 'label' }] },
            font: { size: 10 },
          },
          { type: 'repeat', count: 2, template: frame() },
        ],
      }),
    );
    expect(parsed(withLet)).toEqual(parsed(byHand));
  });

  it('usa a variável em todas as chaves do próprio quadro (layout, tamanho, âncoras)', () => {
    const withLet = file(
      frame({
        let: { gap: 6 },
        layout: { type: 'row', gap: { $var: 'gap' } },
        children: [rect({ anchors: { left: { $var: 'gap' } } })],
      }),
    );
    const byHand = file(
      frame({
        layout: { type: 'row', gap: 6 },
        children: [rect({ anchors: { left: 6 } })],
      }),
    );
    expect(parsed(withLet)).toEqual(parsed(byHand));
  });

  it('a chave __proto__ do arquivo segue sendo chave desconhecida depois da troca', () => {
    const raw = file(
      frame({
        let: { w: 3 },
        children: [
          JSON.parse('{"type":"rect","width":{"$var":"w"},"height":4,"__proto__":1}'),
        ],
      }),
    );
    expect(validateComponent(raw)).toEqual([
      'template.children[0].__proto__: chave desconhecida: __proto__',
    ]);
  });

  it('sem let nem $var devolve o mesmo objeto', () => {
    const raw = file(frame({ children: [rect()] }));
    const result = parseComponent(raw);
    expect(result.ok && result.component).toBe(raw);
  });

  it('variável sem uso não gera erro nem aviso', () => {
    const raw = file(
      frame({ let: { unused: { $mul: 'quebrada' }, ghost: { $var: 'nobody' } } }),
    );
    const result = parseComponent(raw);
    expect(result.ok).toBe(true);
    expect(result.ok && result.warnings).toEqual([]);
  });

  it('o conteúdo da variável não é compartilhado entre os usos', () => {
    const raw = file(
      frame({
        let: { w: { $add: [1, 2] } },
        children: [rect({ width: { $var: 'w' } }), rect({ width: { $var: 'w' } })],
      }),
    );
    const kids = (parsed(raw).template as unknown as { children: Raw[] }).children;
    expect(kids[0]?.width).toEqual(kids[1]?.width);
    expect(kids[0]?.width).not.toBe(kids[1]?.width);
  });
});

describe('let e $var: erros', () => {
  it('nome fora de [a-z][a-zA-Z0-9]*', () => {
    for (const bad of ['Gap', '1gap', 'gap-1', 'a_b', '$x'])
      expect(validateComponent(file(frame({ let: { [bad]: 1 } })))).toEqual([
        `template.let.${bad}: esperava nome de variável ([a-z][a-zA-Z0-9]*)`,
      ]);
    expect(validateComponent(file(frame({ let: { gap1A: 1, g: 2 } })))).toEqual([]);
  });

  it('o nome do $var tem o mesmo padrão e é texto', () => {
    const at = (name: unknown) =>
      validateComponent(file(frame({ children: [rect({ width: { $var: name } })] })));
    expect(at('Gap')).toEqual([
      'template.children[0].width.$var: esperava nome de variável ([a-z][a-zA-Z0-9]*)',
    ]);
    expect(at(3)).toEqual([
      'template.children[0].width.$var: esperava nome de variável ([a-z][a-zA-Z0-9]*)',
    ]);
  });

  it('let precisa ser objeto', () => {
    expect(validateComponent(file(frame({ let: [1] })))).toEqual([
      'template.let: esperava objeto',
    ]);
  });

  it('variável não definida, no caminho do uso', () => {
    const raw = file(
      frame({ let: { a: 1 }, children: [rect({ width: { $var: 'gap' } })] }),
    );
    expect(validateComponent(raw)).toEqual([
      'template.children[0].width: variável não definida: gap',
    ]);
  });

  it('uma variável do irmão não vale (o escopo é do quadro e dos descendentes)', () => {
    const raw = file(
      frame({
        children: [
          frame({ let: { w: 4 } }),
          frame({ children: [rect({ width: { $var: 'w' } })] }),
        ],
      }),
    );
    expect(validateComponent(raw)).toEqual([
      'template.children[1].children[0].width: variável não definida: w',
    ]);
  });

  it('ciclo a → b → a, no caminho do let', () => {
    const raw = file(
      frame({
        let: { a: { $add: [{ $var: 'b' }, 1] }, b: { $mul: [{ $var: 'a' }, 2] } },
        children: [rect({ width: { $var: 'a' } })],
      }),
    );
    expect(validateComponent(raw)).toEqual([
      'template.let.a: ciclo de variáveis: a → b → a',
    ]);
  });

  it('a variável que usa a si mesma é um ciclo, mesmo escondendo a de fora', () => {
    const raw = file(
      frame({
        let: { a: 1 },
        children: [
          frame({
            let: { a: { $add: [{ $var: 'a' }, 1] } },
            children: [rect({ width: { $var: 'a' } })],
          }),
        ],
      }),
    );
    expect(validateComponent(raw)).toEqual([
      'template.children[0].let.a: ciclo de variáveis: a → a',
    ]);
  });

  it('$var com outra chave junto', () => {
    const raw = file(
      frame({ let: { a: 1 }, children: [rect({ width: { $var: 'a', default: 2 } })] }),
    );
    expect(validateComponent(raw)).toEqual([
      'template.children[0].width.default: chave desconhecida: default',
    ]);
  });

  it('let num rect é uma chave desconhecida', () => {
    const raw = file(frame({ children: [rect({ let: { a: 1 } })] }));
    expect(validateComponent(raw)).toEqual([
      'template.children[0].let: chave desconhecida: let',
    ]);
  });

  it('let e $var na formatVersion 3: só é permitido com formatVersion 4', () => {
    const raw = file(
      frame({ let: { a: 1 }, children: [rect({ width: { $var: 'a' } })] }),
      3,
    );
    expect(validateComponent(raw)).toEqual([
      'template.let: só é permitido com formatVersion 4',
      'template.children[0].width: só é permitido com formatVersion 4',
    ]);
  });

  it('uma variável de expressão na versão 3 não repete o erro do mesmo caminho', () => {
    const raw = file(
      frame({ let: { w: { $add: [1, 2] } }, children: [rect({ width: { $var: 'w' } })] }),
      3,
    );
    const errors = validateComponent(raw);
    expect(errors).toEqual([...new Set(errors)]);
    expect(errors).toContain(
      'template.children[0].width: só é permitido com formatVersion 4',
    );
  });

  it('o erro de tipo dentro da variável sai no caminho do uso, com $var(<nome>)', () => {
    const inner = file(
      frame({
        let: { gap: { $add: ['larga', 1] } },
        children: [rect({ width: { $var: 'gap' } })],
      }),
    );
    expect(validateComponent(inner)).toEqual([
      'template.children[0].width.$var(gap).$add[0]: precisa ser número',
    ]);
    const direct = file(
      frame({
        let: { gap: 'larga' },
        children: [rect({ width: { $add: [{ $var: 'gap' }, 1] } })],
      }),
    );
    expect(validateComponent(direct)).toEqual([
      'template.children[0].width.$add[0].$var(gap): precisa ser número',
    ]);
  });

  it('variáveis dentro de variáveis acumulam os $var(<nome>) no caminho', () => {
    const raw = file(
      frame({
        let: { outer: { $add: [{ $var: 'inner' }, 1] }, inner: 'texto' },
        children: [rect({ width: { $var: 'outer' } })],
      }),
    );
    expect(validateComponent(raw)).toEqual([
      'template.children[0].width.$var(outer).$add[0].$var(inner): precisa ser número',
    ]);
  });

  it('a mesma variável usada em dois lugares erra nos dois caminhos', () => {
    const raw = file(
      frame({
        let: { w: 'x' },
        children: [rect({ width: { $var: 'w' } }), rect({ height: { $var: 'w' } })],
      }),
    );
    const errors = validateComponent(raw);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(/^template\.children\[0\]\.width\.\$var\(w\): /);
    expect(errors[1]).toMatch(/^template\.children\[1\]\.height\.\$var\(w\): /);
  });

  it('a expansão passa do teto de nós: erro na raiz', () => {
    const lets: Raw = { v0: 1 };
    for (let i = 1; i <= 20; i++)
      lets[`v${i}`] = { $add: [{ $var: `v${i - 1}` }, { $var: `v${i - 1}` }] };
    const raw = file(frame({ let: lets, children: [rect({ width: { $var: 'v20' } })] }));
    expect(validateComponent(raw)).toEqual([
      `expansão das variáveis grande demais (mais de ${MAX_EXPANDED_NODES} nós)`,
    ]);
  });

  it('um componente grande com uma variável pequena não passa do teto (só conta o que a troca cria)', () => {
    const many = Array.from({ length: 30000 }, () => rect({ fill: '#112233' }));
    const raw = file(
      frame({ let: { w: 3 }, children: [...many, rect({ width: { $var: 'w' } })] }),
    );
    expect(validateComponent(raw)).toEqual([]);
  });

  it('uma cadeia muito longa de variáveis é um erro de tamanho, sem estourar a pilha', () => {
    const lets: Raw = {};
    for (let i = 0; i < 20000; i++) lets[`a${i}`] = { $var: `a${i + 1}` };
    lets.a20000 = 1;
    const raw = file(frame({ let: lets, children: [rect({ width: { $var: 'a0' } })] }));
    expect(validateComponent(raw)).toEqual([
      `expansão das variáveis grande demais (mais de ${MAX_EXPANDED_NODES} nós)`,
    ]);
  });

  it('o aviso de família de fonte de uma variável leva o $var(<nome>) no caminho', () => {
    const raw = file(
      frame({
        let: { fam: '"Roboto' },
        children: [
          {
            type: 'text',
            text: 'x',
            font: { size: 10, family: { $var: 'fam' } },
          },
        ],
      }),
    );
    const result = parseComponent(raw);
    expect(result.ok && result.warnings.map((w) => w.path)).toEqual([
      'template.children[0].font.family.$var(fam)',
    ]);
  });

  it('os erros do resto do arquivo seguem quando a expansão falha', () => {
    const raw = {
      ...file(frame({ children: [rect({ width: { $var: 'x' } })] })),
      id: '',
    };
    expect(validateComponent(raw)).toEqual([
      'id: esperava texto no padrão ^[a-z0-9][a-z0-9-_]*$',
      'template.children[0].width: variável não definida: x',
    ]);
  });
});

describe('expandVariables', () => {
  it('devolve o mesmo template quando não há let nem $var', () => {
    const template = frame({ children: [rect()] });
    const out = expandVariables(template);
    expect(out.value).toBe(template);
    expect(out.issues).toEqual([]);
    expect(out.rewrite('template.children[0]')).toBe('template.children[0]');
  });

  it('variableSyntaxPaths acha o let dos quadros e todo $var, inclusive em variável sem uso', () => {
    const template = frame({
      let: { a: { $var: 'b' } },
      children: [rect({ width: { $var: 'a' } })],
    });
    expect(variableSyntaxPaths(template)).toEqual([
      'template.let',
      'template.let.a',
      'template.children[0].width',
    ]);
  });
});
