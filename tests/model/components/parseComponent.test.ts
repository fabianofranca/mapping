// Laboratório Componentes: validação do arquivo `mapping-component`.
import { describe, expect, it } from 'vitest';
import type { ComponentFile } from '../../../src/model/components/componentFormat';
import {
  collectFieldKeys,
  parseComponent,
  parseComponentText,
  validateComponent,
} from '../../../src/model/components/parseComponent';

/** Valida e devolve o arquivo tipado; falha o teste se o resultado não for ok. */
function parsedOf(input: unknown): ComponentFile {
  const result = parseComponent(input);
  if (!result.ok) throw new Error(result.errors.join('; '));
  return result.component;
}

/** Um botão realista: ícone opcional, rótulo ligado ao campo, cor por variante, borda condicional. */
function button(): Record<string, unknown> {
  return {
    format: 'mapping-component',
    formatVersion: 1,
    id: 'button',
    name: 'Botão',
    description: 'Botão com ícone opcional.',
    size: { width: 120, height: 40 },
    minSize: { width: 60, height: 32 },
    preview: { label: 'Salvar', variant: 'primary', icon: 'sim', count: 3, note: null },
    template: {
      type: 'frame',
      name: 'Raiz',
      clip: true,
      layout: {
        type: 'row',
        gap: 8,
        padding: [8, 16],
        align: 'center',
        justify: 'center',
      },
      cornerRadius: 8,
      fill: {
        $switch: 'variant',
        cases: {
          primary: '#0a84ff',
          danger: {
            type: 'linear',
            angle: 90,
            stops: [
              { offset: 0, color: '#ff453a' },
              { offset: 1, color: '#d70015' },
            ],
          },
        },
        default: '#e5e5ea',
      },
      stroke: {
        color: { $if: { $eq: ['variant', 'secondary'] }, then: '#8e8e93', else: 'none' },
        width: 1,
        align: 'inside',
        dash: [4, 2],
      },
      shadow: { color: '#00000033', x: 0, y: 2, blur: 4 },
      children: [
        {
          type: 'path',
          name: 'Ícone',
          visible: { $field: 'icon' },
          width: 16,
          height: 16,
          d: 'M0 0L10 10',
          viewBox: [16, 16],
          fillRule: 'evenodd',
          fill: '#ffffff',
        },
        {
          type: 'text',
          width: 'hug',
          height: '100%',
          opacity: { $if: { $field: 'disabled' }, then: 0.4, else: 1 },
          text: {
            $concat: [{ $field: 'label', default: 'Botão' }, ' ', { $field: 'count' }],
          },
          font: {
            family: 'Inter',
            size: 14,
            weight: { $switch: 'variant', cases: { primary: 600 }, default: 400 },
            italic: false,
            lineHeight: 1.2,
            letterSpacing: 0,
            align: 'center',
            verticalAlign: { $field: 'valign', default: 'middle' },
            decoration: 'none',
          },
          color: '#ffffff',
        },
        {
          type: 'frame',
          layout: { type: 'none' },
          width: 'fill',
          visible: {
            $if: { $and: [{ $has: 'badge' }, { $not: { $field: 'hidden' } }] },
            then: true,
            else: false,
          },
          children: [
            {
              type: 'ellipse',
              anchors: { right: 0, top: 0 },
              width: 8,
              height: 8,
              fill: '#ff3b30',
            },
            {
              type: 'rect',
              anchors: { centerX: true, centerY: true },
              cornerRadius: [1, 2, 3, 4],
            },
            { type: 'slot', label: { $field: 'slotLabel', default: 'Conteúdo' } },
          ],
        },
      ],
    },
  };
}

type Mutate = (c: Record<string, any>) => void; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Aplica a mutação a um botão válido e devolve os problemas. */
function problemsAfter(mutate: Mutate): string[] {
  const c = button();
  mutate(c);
  return validateComponent(c);
}

/** Afirma que existe um problema exatamente no caminho dado, com o trecho de mensagem. */
function expectProblem(problems: string[], path: string, fragment: string): void {
  const found = problems.find((p) => p.startsWith(`${path}: `));
  expect(found, `problemas: ${JSON.stringify(problems)}`).toBeDefined();
  expect(found).toContain(fragment);
}

describe('parseComponent: componente válido', () => {
  it('aceita o botão completo e devolve o mesmo objeto', () => {
    const input = button();
    expect(validateComponent(input)).toEqual([]);
    const parsed = parsedOf(input);
    expect(parsed.id).toBe('button');
    expect(parsed.template.children).toHaveLength(3);
  });

  it('collectFieldKeys lista as chaves citadas, ordenadas e sem repetição', () => {
    expect(collectFieldKeys(parsedOf(button()))).toEqual([
      'badge',
      'count',
      'disabled',
      'hidden',
      'icon',
      'label',
      'slotLabel',
      'valign',
      'variant',
    ]);
  });

  it('aceita o mínimo: só os campos obrigatórios', () => {
    const minimal = {
      format: 'mapping-component',
      formatVersion: 1,
      id: 'box',
      name: 'Caixa',
      size: { width: 10, height: 10 },
      template: { type: 'frame' },
    };
    expect(validateComponent(minimal)).toEqual([]);
    expect(collectFieldKeys(parsedOf(minimal))).toEqual([]);
  });
});

describe('parseComponent: raiz', () => {
  it('format errado', () => {
    const problems = problemsAfter((c) => (c.format = 'outro'));
    expectProblem(problems, 'format', 'mapping-component');
  });

  it('formatVersion errada', () => {
    expectProblem(
      problemsAfter((c) => (c.formatVersion = 4)),
      'formatVersion',
      'esperava 1, 2 ou 3',
    );
  });

  it('id inválido', () => {
    expectProblem(
      problemsAfter((c) => (c.id = 'Botão Grande')),
      'id',
      'padrão',
    );
    expectProblem(
      problemsAfter((c) => (c.id = '-x')),
      'id',
      'padrão',
    );
    expectProblem(
      problemsAfter((c) => (c.id = '')),
      'id',
      'padrão',
    );
  });

  it('name vazio e description não texto', () => {
    expectProblem(
      problemsAfter((c) => (c.name = ' ')),
      'name',
      'não vazio',
    );
    expectProblem(
      problemsAfter((c) => (c.description = 3)),
      'description',
      'texto',
    );
  });

  it('size ausente ou com valor inválido', () => {
    expectProblem(
      problemsAfter((c) => delete c.size),
      'size',
      'obrigatório',
    );
    expectProblem(
      problemsAfter((c) => (c.size.width = 0)),
      'size.width',
      'positivo',
    );
    expectProblem(
      problemsAfter((c) => (c.size.height = '40')),
      'size.height',
      'positivo',
    );
  });

  it('minSize maior que size', () => {
    const problems = problemsAfter((c) => (c.minSize = { width: 200, height: 10 }));
    expectProblem(problems, 'minSize', 'maior que size');
  });

  it('preview com valor de tipo inválido', () => {
    expectProblem(
      problemsAfter((c) => (c.preview.flag = true)),
      'preview.flag',
      'texto, número ou null',
    );
    expectProblem(
      problemsAfter((c) => (c.preview = [])),
      'preview',
      'objeto',
    );
  });

  it('template ausente ou que não é frame', () => {
    expectProblem(
      problemsAfter((c) => delete c.template),
      'template',
      'obrigatório',
    );
    const problems = problemsAfter((c) => (c.template = { type: 'rect' }));
    expectProblem(problems, 'template.type', 'frame');
  });

  it('chave desconhecida na raiz', () => {
    expectProblem(
      problemsAfter((c) => (c.extra = 1)),
      'extra',
      'chave desconhecida: extra',
    );
  });

  it('entrada que não é objeto', () => {
    expect(validateComponent(null)).toEqual(['componente: esperava objeto']);
    expect(validateComponent([])).toEqual(['componente: esperava objeto']);
  });
});

describe('parseComponent: nós', () => {
  it('tipo de nó desconhecido', () => {
    const problems = problemsAfter((c) => (c.template.children[1].type = 'blob'));
    expectProblem(problems, 'template.children[1].type', 'tipo de nó desconhecido');
  });

  it('chave desconhecida em nó (erro de digitação)', () => {
    const problems = problemsAfter((c) => (c.template.children[0].colour = '#fff'));
    expectProblem(problems, 'template.children[0].colour', 'chave desconhecida: colour');
  });

  it('SizeSpec inválido', () => {
    expectProblem(
      problemsAfter((c) => (c.template.children[0].width = '10px')),
      'template.children[0].width',
      '"fill", "hug"',
    );
    expectProblem(
      problemsAfter((c) => (c.template.children[0].height = -1)),
      'template.children[0].height',
      'maior ou igual a 0',
    );
  });

  it('opacidade fora de 0..1', () => {
    expectProblem(
      problemsAfter((c) => (c.template.opacity = 2)),
      'template.opacity',
      'entre 0 e 1',
    );
    // literal dentro da expressão segue a mesma regra
    expectProblem(
      problemsAfter((c) => (c.template.children[1].opacity.then = 5)),
      'template.children[1].opacity.then',
      'entre 0 e 1',
    );
  });

  it('âncoras inválidas', () => {
    const problems = problemsAfter((c) => {
      const anchors = c.template.children[2].children[0].anchors;
      anchors.left = '4';
      anchors.centerX = 1;
      anchors.middle = true;
    });
    const base = 'template.children[2].children[0].anchors';
    expectProblem(problems, `${base}.left`, 'número');
    expectProblem(problems, `${base}.centerX`, 'booleano');
    expectProblem(problems, `${base}.middle`, 'chave desconhecida: middle');
  });

  it('gradiente com uma parada só', () => {
    const problems = problemsAfter((c) => {
      c.template.fill.cases.danger.stops = [{ offset: 0, color: '#fff' }];
    });
    expectProblem(problems, 'template.fill.cases.danger.stops', 'ao menos 2');
  });

  it('parada com offset fora de 0..1', () => {
    const problems = problemsAfter(
      (c) => (c.template.fill.cases.danger.stops[1].offset = 3),
    );
    expectProblem(problems, 'template.fill.cases.danger.stops[1].offset', 'entre 0 e 1');
  });

  it('borda sem cor', () => {
    const problems = problemsAfter((c) => delete c.template.stroke.color);
    expectProblem(problems, 'template.stroke.color', 'obrigatório');
  });

  it('borda com align inválido e sombra sem cor', () => {
    const problems = problemsAfter((c) => {
      c.template.stroke.align = 'middle';
      delete c.template.shadow.color;
    });
    expectProblem(problems, 'template.stroke.align', 'inside, center, outside');
    expectProblem(problems, 'template.shadow.color', 'obrigatório');
  });

  it('cornerRadius inválido', () => {
    const problems = problemsAfter((c) => (c.template.cornerRadius = [1, 2]));
    expectProblem(problems, 'template.cornerRadius', '4 números');
  });

  it('layout inválido', () => {
    const problems = problemsAfter((c) => {
      c.template.layout.justify = 'around';
      c.template.layout.padding = [1, 2, 3];
    });
    expectProblem(problems, 'template.layout.justify', 'space-between');
    expectProblem(problems, 'template.layout.padding', 'lista de 4');
  });

  it('texto sem text', () => {
    const problems = problemsAfter((c) => delete c.template.children[1].text);
    expectProblem(problems, 'template.children[1].text', 'obrigatório');
  });

  it('fonte com peso fora de 100..900 e alinhamento inválido', () => {
    const problems = problemsAfter((c) => {
      c.template.children[1].font.weight = 1000;
      c.template.children[1].font.align = 'justify';
    });
    expectProblem(problems, 'template.children[1].font.weight', '100 e 900');
    expectProblem(problems, 'template.children[1].font.align', 'left, center, right');
  });

  it('path sem viewBox ou com viewBox inválido', () => {
    expectProblem(
      problemsAfter((c) => delete c.template.children[0].viewBox),
      'template.children[0].viewBox',
      'obrigatório',
    );
    expectProblem(
      problemsAfter((c) => (c.template.children[0].viewBox = [16, 0])),
      'template.children[0].viewBox',
      'positivos',
    );
  });

  it('children em um rect', () => {
    const problems = problemsAfter(
      (c) => (c.template.children[2].children[1].children = []),
    );
    expectProblem(problems, 'template.children[2].children[1].children', 'frame');
  });

  it('layout em um text', () => {
    const problems = problemsAfter(
      (c) => (c.template.children[1].layout = { type: 'none' }),
    );
    expectProblem(problems, 'template.children[1].layout', 'frame');
  });
});

describe('parseComponent: visible e italic como BoolExpr', () => {
  it('aceita condição direta, $field, literal e $if', () => {
    const visibles = [
      { $has: 'label' },
      { $not: { $field: 'on' } },
      { $eq: ['variant', 'primary'] },
      { $and: [{ $has: 'a' }, { $or: [{ $field: 'b' }, { $has: 'c' }] }] },
      { $field: 'icon' },
      true,
      { $if: { $has: 'label' }, then: true, else: false },
    ];
    for (const visible of visibles) {
      const problems = problemsAfter((c) => (c.template.children[0].visible = visible));
      expect(problems, JSON.stringify(visible)).toEqual([]);
    }
  });

  it('italic aceita condição direta', () => {
    const problems = problemsAfter(
      (c) => (c.template.children[1].font.italic = { $has: 'em' }),
    );
    expect(problems).toEqual([]);
  });

  it('campos da condição direta entram em collectFieldKeys', () => {
    const c = button();
    (c.template as Record<string, unknown>).visible = { $has: 'extra' };
    expect(collectFieldKeys(parsedOf(c))).toContain('extra');
  });

  it('$has com valor que não é texto é inválido', () => {
    const problems = problemsAfter((c) => (c.template.children[0].visible = { $has: 3 }));
    expectProblem(problems, 'template.children[0].visible.$has', 'chave de campo');
  });

  it('condição direta inválida em italic e com operador extra', () => {
    expectProblem(
      problemsAfter((c) => (c.template.children[1].font.italic = { $has: 3 })),
      'template.children[1].font.italic.$has',
      'chave de campo',
    );
    expectProblem(
      problemsAfter(
        (c) => (c.template.children[0].visible = { $has: 'a', $not: { $field: 'b' } }),
      ),
      'template.children[0].visible',
      'mais de um operador',
    );
  });

  it('literal que não é booleano continua inválido', () => {
    expectProblem(
      problemsAfter((c) => (c.template.children[0].visible = 'sim')),
      'template.children[0].visible',
      'booleano',
    );
  });
});

describe('parseComponent: expressões', () => {
  it('expressão com dois operadores', () => {
    const problems = problemsAfter(
      (c) =>
        (c.template.children[0].visible = { $field: 'icon', $switch: 'x', cases: {} }),
    );
    expectProblem(problems, 'template.children[0].visible', 'mais de um operador');
  });

  it('chave desconhecida dentro de expressão', () => {
    const problems = problemsAfter((c) => (c.template.children[0].visible.defualt = 'x'));
    expectProblem(
      problems,
      'template.children[0].visible.defualt',
      'chave desconhecida: defualt',
    );
  });

  it('$if sem then', () => {
    const problems = problemsAfter((c) => delete c.template.stroke.color.then);
    expectProblem(problems, 'template.stroke.color.then', 'obrigatório');
  });

  it('$eq que não é lista', () => {
    const problems = problemsAfter(
      (c) => (c.template.stroke.color.$if = { $eq: 'variant' }),
    );
    expectProblem(problems, 'template.stroke.color.$if.$eq', 'esperava lista');
  });

  it('$eq com valor que não é texto nem número', () => {
    const problems = problemsAfter(
      (c) => (c.template.stroke.color.$if = { $eq: ['v', true] }),
    );
    expectProblem(problems, 'template.stroke.color.$if.$eq', 'esperava lista');
  });

  it('condição sem operador ou com operador desconhecido', () => {
    const problems = problemsAfter((c) => (c.template.stroke.color.$if = { $nope: 'x' }));
    expectProblem(problems, 'template.stroke.color.$if', 'sem operador');
  });

  it('literal do tipo errado dentro de then', () => {
    const problems = problemsAfter((c) => (c.template.stroke.color.then = 12));
    expectProblem(problems, 'template.stroke.color.then', 'esperava cor');
  });

  it('literal do tipo errado em fill por $if e em $concat', () => {
    expectProblem(
      problemsAfter((c) => (c.template.fill = { $if: { $field: 'a' }, then: 12 })),
      'template.fill.then',
      'esperava cor',
    );
    expectProblem(
      problemsAfter((c) => (c.template.children[1].text.$concat[0] = true)),
      'template.children[1].text.$concat[0]',
      'texto ou número',
    );
  });

  it('$switch com casos e default conferidos', () => {
    const problems = problemsAfter((c) => {
      c.template.fill.cases.primary = 5;
      c.template.fill.default = false;
      c.template.fill.cases = [];
    });
    expectProblem(problems, 'template.fill.default', 'esperava cor');
    expectProblem(problems, 'template.fill.cases', 'objeto de casos');
  });

  it('$field com chave vazia e default do tipo errado', () => {
    const problems = problemsAfter((c) => {
      c.template.children[1].text.$concat[0] = { $field: '' };
      c.template.children[0].visible = { $field: 'icon', default: 'sim' };
    });
    expectProblem(
      problems,
      'template.children[1].text.$concat[0].$field',
      'chave de campo',
    );
    expectProblem(problems, 'template.children[0].visible.default', 'booleano');
  });
});

describe('validateComponent e parseComponent', () => {
  it('validateComponent devolve todos os problemas de uma vez', () => {
    const problems = problemsAfter((c) => {
      c.format = 'x';
      c.id = 'Ruim';
      delete c.size;
      c.template.children[0].width = '10px';
      c.template.children[1].opacity = 2;
      c.template.children[2].children[1].children = [];
    });
    expect(problems).toHaveLength(6);
    expectProblem(problems, 'format', 'mapping-component');
    expectProblem(problems, 'id', 'padrão');
    expectProblem(problems, 'size', 'obrigatório');
    expectProblem(problems, 'template.children[0].width', '"fill", "hug"');
    expectProblem(problems, 'template.children[1].opacity', 'entre 0 e 1');
    expectProblem(problems, 'template.children[2].children[1].children', 'frame');
  });

  it('parseComponent devolve issues com caminho e mensagem, e errors no formato de validateComponent', () => {
    const input = button();
    input.format = 'x';
    input.id = 'Ruim';
    input.name = '';
    const result = parseComponent(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toHaveLength(3);
    expect(result.issues[0]).toEqual({
      path: 'format',
      message: 'esperava "mapping-component"',
    });
    expect(result.errors).toEqual(validateComponent(input));
  });

  it('parseComponent devolve o componente quando válido', () => {
    const input = button();
    expect(parseComponent(input)).toEqual({ ok: true, component: input });
  });

  it('parseComponentText lê o texto JSON e trata JSON inválido como issue de caminho vazio', () => {
    expect(parseComponentText(JSON.stringify(button())).ok).toBe(true);
    const bad = parseComponentText('{ nao json');
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.issues).toHaveLength(1);
    expect(bad.issues[0]?.path).toBe('');
    expect(bad.issues[0]?.message).toMatch(/^JSON inválido: /);
    expect(bad.errors[0]).toMatch(/^JSON inválido: /);
  });
});
