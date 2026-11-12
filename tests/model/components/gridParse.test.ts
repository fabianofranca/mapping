// L3 (#1078, decisões 10 a 16): validação de `layout.type: "grid"`, `span`, `weight` e `repeat.layout`.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import { validateComponent } from '../../../src/model/components/parseComponent';
import { checkSchema } from '../../support/jsonSchema';

const schema: Record<string, unknown> = JSON.parse(
  readFileSync(new URL('../../../docs/component.schema.json', import.meta.url), 'utf8'),
);

type Json = Record<string, unknown>;
const V4 = 'só é permitido com formatVersion 4';
const TRACKS =
  'layout: informe exatamente uma entre columns, minColumnWidth, rows e minRowHeight';

function component(template: unknown, version = 4): Json {
  return {
    format: COMPONENT_FORMAT,
    formatVersion: version,
    id: 'c',
    name: 'C',
    size: { width: 200, height: 100 },
    template,
  };
}

const rect = (extra: Json = {}): Json => ({
  type: 'rect',
  width: 10,
  height: 10,
  ...extra,
});

function host(layout: unknown, children: Json[] = [], version = 4): Json {
  return component({ type: 'frame', layout, children }, version);
}

const issues = (doc: Json): string[] => validateComponent(doc);

describe('layout grid: tipo e chaves', () => {
  it('aceita grid literal com uma trilha e as chaves da grade', () => {
    const layout = {
      type: 'grid',
      columns: 3,
      gap: 4,
      padding: 2,
      align: 'center',
      justify: 'stretch',
      reverse: true,
      lineGap: 8,
    };
    expect(issues(host(layout))).toEqual([]);
    for (const track of [
      { rows: 2 },
      { minColumnWidth: 80.5 },
      { minRowHeight: 40 },
      { columns: { $field: 'n', default: 2 } },
    ])
      expect(issues(host({ type: 'grid', ...track }))).toEqual([]);
  });

  it('o tipo inválido cita grid na mensagem', () => {
    expect(issues(host({ type: 'diagonal' }))).toEqual([
      'template.layout.type: esperava "none", "row", "column" ou "grid"',
    ]);
  });

  it('exige exatamente uma trilha', () => {
    expect(issues(host({ type: 'grid' }))).toEqual([`template.layout: ${TRACKS}`]);
    expect(issues(host({ type: 'grid', columns: 2, rows: 2 }))).toEqual([
      `template.layout: ${TRACKS}`,
    ]);
    expect(issues(host({ type: 'grid', columns: 2, minColumnWidth: 40 }))).toEqual([
      `template.layout: ${TRACKS}`,
    ]);
  });

  it('confere os valores das trilhas', () => {
    expect(issues(host({ type: 'grid', columns: 0 }))).toEqual([
      'template.layout.columns: esperava inteiro maior ou igual a 1',
    ]);
    expect(issues(host({ type: 'grid', rows: 1.5 }))).toEqual([
      'template.layout.rows: esperava inteiro maior ou igual a 1',
    ]);
    expect(issues(host({ type: 'grid', minColumnWidth: 0 }))).toEqual([
      'template.layout.minColumnWidth: esperava número maior que 0',
    ]);
    expect(issues(host({ type: 'grid', minRowHeight: -3 }))).toEqual([
      'template.layout.minRowHeight: esperava número maior que 0',
    ]);
  });

  it('wrap, maxPerLine e maxLines não valem na grade', () => {
    expect(
      issues(
        host({ type: 'grid', columns: 2, wrap: 'wrap', maxPerLine: 2, maxLines: 3 }),
      ),
    ).toEqual([
      'template.layout.wrap: não vale em layout grid',
      'template.layout.maxPerLine: não vale em layout grid',
      'template.layout.maxLines: não vale em layout grid',
    ]);
  });

  it('align e justify da grade: start, center, end e stretch', () => {
    expect(issues(host({ type: 'grid', columns: 2, align: 'baseline' }))).toEqual([
      'template.layout.align: esperava um de: start, center, end, stretch',
    ]);
    expect(issues(host({ type: 'grid', columns: 2, justify: 'space-between' }))).toEqual([
      'template.layout.justify: esperava um de: start, center, end, stretch',
    ]);
  });

  it('chave de trilha fora de layout grid literal', () => {
    expect(issues(host({ type: 'row', columns: 2 }))).toEqual([
      'template.layout.columns: só vale em layout grid',
    ]);
    expect(issues(host({ type: 'column', minRowHeight: 2 }))).toEqual([
      'template.layout.minRowHeight: só vale em layout grid',
    ]);
  });

  it('com type por expressão aceita as chaves de trilha', () => {
    const type = { $field: 't', default: 'row' };
    expect(issues(host({ type, columns: 2 }))).toEqual([]);
    expect(issues(host({ type: { $field: 't', default: 'grid' }, rows: 2 }))).toEqual([]);
  });

  it('o slot aceita layout grid com as mesmas regras', () => {
    const doc = (layout: Json): Json =>
      component({ type: 'frame', children: [{ type: 'slot', layout }] });
    expect(issues(doc({ type: 'grid', columns: 2 }))).toEqual([]);
    expect(issues(doc({ type: 'grid' }))).toEqual([
      `template.children[0].layout: ${TRACKS}`,
    ]);
  });

  it('numa formatVersion de 1 a 3 grid e as trilhas são só da v4', () => {
    for (const version of [1, 2, 3]) {
      expect(issues(host({ type: 'grid', columns: 2 }, [], version))).toContain(
        `template.layout.type: ${V4}`,
      );
      expect(issues(host({ type: 'grid', columns: 2 }, [], version))).toContain(
        `template.layout.columns: ${V4}`,
      );
    }
    expect(issues(host({ type: 'grid', minRowHeight: 2 }, [], 3))).toContain(
      `template.layout.minRowHeight: ${V4}`,
    );
  });
});

describe('span', () => {
  const grid = { type: 'grid', columns: 3 };

  it('vale em filho direto de grade, literal ou expressão', () => {
    expect(
      issues(
        host(grid, [rect({ span: 2 }), rect({ span: { $field: 's', default: 1 } })]),
      ),
    ).toEqual([]);
  });

  it('literal fora de grade é erro no caminho do filho', () => {
    expect(issues(host({ type: 'row' }, [rect({ span: 2 })]))).toEqual([
      'template.children[0].span: span: só vale em filho de layout grid',
    ]);
    expect(issues(component({ type: 'frame', children: [rect({ span: 2 })] }))).toEqual([
      'template.children[0].span: span: só vale em filho de layout grid',
    ]);
  });

  it('com o type do pai por expressão, ou expressão em span, aceita', () => {
    const type = { $field: 't', default: 'grid' };
    expect(issues(host({ type, columns: 2 }, [rect({ span: 2 })]))).toEqual([]);
    expect(
      issues(host({ type: 'row' }, [rect({ span: { $field: 's', default: 2 } })])),
    ).toEqual([]);
  });

  it('inteiro maior ou igual a 1', () => {
    expect(issues(host(grid, [rect({ span: 0 })]))).toEqual([
      'template.children[0].span: esperava inteiro maior ou igual a 1',
    ]);
    expect(issues(host(grid, [rect({ span: 1.5 })]))).toEqual([
      'template.children[0].span: esperava inteiro maior ou igual a 1',
    ]);
  });

  it('o template do repeat é filho da grade de repeat.layout', () => {
    const repeat = (layout: Json): Json => ({
      type: 'repeat',
      count: 3,
      layout,
      template: { type: 'frame', span: 2 },
    });
    expect(
      issues(
        component({ type: 'frame', children: [repeat({ type: 'grid', columns: 2 })] }),
      ),
    ).toEqual([]);
    expect(
      issues(component({ type: 'frame', children: [repeat({ type: 'row' })] })),
    ).toEqual([
      'template.children[0].template.span: span: só vale em filho de layout grid',
    ]);
  });

  it('numa formatVersion de 1 a 3 span é da v4', () => {
    expect(issues(host({ type: 'row' }, [rect({ span: 2 })], 3))).toContain(
      `template.children[0].span: ${V4}`,
    );
  });
});

describe('weight', () => {
  const WEIGHT = 'weight: só vale em filho fill no eixo principal de row ou column';

  it('vale em filho fill no eixo principal (ausente, "fill" ou expressão)', () => {
    const fillRow = [
      { type: 'rect', weight: 2 },
      { type: 'rect', width: 'fill', weight: 0.5 },
      { type: 'rect', width: { $field: 'w', default: 10 }, weight: 1 },
      { type: 'rect', weight: { $field: 'p', default: 2 } },
    ];
    expect(issues(host({ type: 'row' }, fillRow))).toEqual([]);
    expect(
      issues(host({ type: 'column' }, [{ type: 'rect', height: 'fill', weight: 3 }])),
    ).toEqual([]);
  });

  it('filho hug, px ou % é erro no caminho do peso', () => {
    for (const width of ['hug', 40, '50%'])
      expect(issues(host({ type: 'row' }, [rect({ width, weight: 2 })]))).toEqual([
        `template.children[0].weight: ${WEIGHT}`,
      ]);
  });

  it('o eixo principal da row é a largura e o da column é a altura', () => {
    expect(
      issues(
        host({ type: 'row' }, [
          { type: 'rect', width: 'hug', height: 'fill', weight: 1 },
        ]),
      ),
    ).toEqual([`template.children[0].weight: ${WEIGHT}`]);
    expect(
      issues(
        host({ type: 'column' }, [
          { type: 'rect', width: 'fill', height: 20, weight: 1 },
        ]),
      ),
    ).toEqual([`template.children[0].weight: ${WEIGHT}`]);
  });

  it('texto sem tamanho é hug: erro; com fill vale', () => {
    expect(
      issues(host({ type: 'row' }, [{ type: 'text', text: 'a', weight: 1 }])),
    ).toEqual([`template.children[0].weight: ${WEIGHT}`]);
    expect(
      issues(
        host({ type: 'row' }, [{ type: 'text', text: 'a', width: 'fill', weight: 1 }]),
      ),
    ).toEqual([]);
  });

  it('pai none, sem layout ou grid é erro; pai com type por expressão aceita', () => {
    const child = [{ type: 'rect', weight: 1 }];
    expect(issues(host({ type: 'none' }, child))).toEqual([
      `template.children[0].weight: ${WEIGHT}`,
    ]);
    expect(issues(component({ type: 'frame', children: child }))).toEqual([
      `template.children[0].weight: ${WEIGHT}`,
    ]);
    expect(issues(host({ type: 'grid', columns: 2 }, child))).toEqual([
      `template.children[0].weight: ${WEIGHT}`,
    ]);
    expect(issues(host({ type: { $field: 't', default: 'row' } }, child))).toEqual([]);
  });

  it('número maior que 0', () => {
    expect(issues(host({ type: 'row' }, [{ type: 'rect', weight: 0 }]))).toEqual([
      'template.children[0].weight: esperava número maior que 0',
    ]);
  });

  it('o template do repeat segue o tipo do quadro gerado', () => {
    const repeat = (extra: Json): Json => ({
      type: 'repeat',
      count: 3,
      ...extra,
      template: { type: 'frame', weight: 2 },
    });
    expect(
      issues(component({ type: 'frame', children: [repeat({ direction: 'row' })] })),
    ).toEqual([]);
    expect(
      issues(
        component({ type: 'frame', children: [repeat({ layout: { type: 'column' } })] }),
      ),
    ).toEqual([]);
    expect(
      issues(
        component({
          type: 'frame',
          children: [repeat({ layout: { type: 'grid', columns: 2 } })],
        }),
      ),
    ).toEqual([`template.children[0].template.weight: ${WEIGHT}`]);
  });

  it('numa formatVersion de 1 a 3 weight é da v4', () => {
    expect(issues(host({ type: 'row' }, [{ type: 'rect', weight: 2 }], 3))).toContain(
      `template.children[0].weight: ${V4}`,
    );
  });
});

describe('repeat.layout', () => {
  const repeat = (extra: Json, version = 4): Json =>
    component(
      {
        type: 'frame',
        children: [{ type: 'repeat', count: 3, template: { type: 'frame' }, ...extra }],
      },
      version,
    );

  it('aceita um layout completo e confere as regras do layout', () => {
    expect(
      issues(repeat({ layout: { type: 'grid', minColumnWidth: 60, gap: 4 } })),
    ).toEqual([]);
    expect(issues(repeat({ layout: { type: 'row', wrap: 'wrap', lineGap: 2 } }))).toEqual(
      [],
    );
    expect(issues(repeat({ layout: { type: 'grid' } }))).toEqual([
      `template.children[0].layout: ${TRACKS}`,
    ]);
    expect(
      issues(repeat({ layout: { type: 'grid', columns: 2, wrap: 'wrap' } })),
    ).toEqual(['template.children[0].layout.wrap: não vale em layout grid']);
  });

  it('não combina com direction nem gap', () => {
    const layout = { type: 'grid', columns: 2 };
    expect(issues(repeat({ layout, direction: 'row' }))).toEqual([
      'template.children[0]: repeat.layout: não combina com direction nem gap',
    ]);
    expect(issues(repeat({ layout, gap: 4 }))).toEqual([
      'template.children[0]: repeat.layout: não combina com direction nem gap',
    ]);
  });

  it('as chaves de quebra soltas do repeat não combinam com repeat.layout (code-review)', () => {
    expect(
      issues(repeat({ layout: { type: 'column' }, wrap: 'wrap', lineGap: 2 })),
    ).toEqual([
      'template.children[0].wrap: repeat.layout: a chave vai dentro de layout (wrap)',
      'template.children[0].lineGap: repeat.layout: a chave vai dentro de layout (lineGap)',
    ]);
  });

  it('repeat.layout com type none não vale (code-review)', () => {
    expect(issues(repeat({ layout: { type: 'none' } }))).toEqual([
      'template.children[0].layout.type: repeat.layout: use row, column ou grid',
    ]);
  });

  it('distribute fill não vale com layout grid', () => {
    expect(
      issues(repeat({ layout: { type: 'grid', columns: 2 }, distribute: 'fill' })),
    ).toEqual(['template.children[0].distribute: distribute: não vale com layout grid']);
    expect(issues(repeat({ layout: { type: 'row' }, distribute: 'fill' }))).toEqual([]);
    expect(
      issues(repeat({ layout: { type: 'grid', columns: 2 }, distribute: 'none' })),
    ).toEqual([]);
  });

  it('numa formatVersion de 1 a 3 repeat.layout é da v4', () => {
    expect(issues(repeat({ layout: { type: 'row' }, field: undefined }, 3))).toContain(
      `template.children[0].layout: ${V4}`,
    );
  });
});

describe('docs/component.schema.json', () => {
  const ok = (doc: Json): void => expect(checkSchema(schema, doc)).toEqual([]);
  const bad = (doc: Json): void =>
    expect(checkSchema(schema, doc).length).toBeGreaterThan(0);

  it('aceita a grade, span, weight e repeat.layout', () => {
    ok(
      host({
        type: 'grid',
        columns: 3,
        gap: 4,
        lineGap: 2,
        align: 'center',
        justify: 'stretch',
      }),
    );
    ok(
      host({ type: 'grid', minRowHeight: 30.5 }, [
        rect({ span: 2 }),
        rect({ span: { $field: 's', default: 1 } }),
      ]),
    );
    ok(
      host({ type: 'row' }, [
        { type: 'rect', weight: 2.5 },
        { type: 'text', text: 'a', weight: 1 },
      ]),
    );
    ok(host({ type: { $field: 't', default: 'grid' }, columns: 2 }));
    ok(
      component({
        type: 'frame',
        children: [
          {
            type: 'repeat',
            count: 3,
            layout: { type: 'grid', columns: 2 },
            template: { type: 'frame', span: 2, weight: 1 },
          },
        ],
      }),
    );
  });

  it('recusa chave solta, valor fora do tipo e align fora do conjunto da grade', () => {
    bad(host({ type: 'grid', columns: 0 }));
    bad(host({ type: 'grid', minColumnWidth: 0 }));
    bad(host({ type: 'grid', columns: 2, wrap: 'wrap' }));
    bad(host({ type: 'grid', columns: 2, align: 'baseline' }));
    bad(host({ type: 'grid', columns: 2, justify: 'space-between' }));
    bad(host({ type: 'row' }, [{ type: 'rect', weight: 0 }]));
    bad(host({ type: 'grid', columns: 2 }, [rect({ span: 0 })]));
    bad(host({ type: 'grid', columns: 2 }, [rect({ span: 1.5 })]));
  });
});
