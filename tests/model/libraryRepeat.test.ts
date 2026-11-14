// Validador da biblioteca com o nó `repeat` (ME4): o campo citado é uma `table` do tipo, o
// desenho da linha só lê colunas dela ou campos do tipo, e a prova de desenho aceita linhas no
// `preview`.
import { describe, expect, it } from 'vitest';
import { validateLibrary, type LibraryIssue } from '../../src/model/library';

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SPEC_PATH = 'tab.spec.json';

const text = (field: string, extra: Raw = {}): Raw => ({
  type: 'text',
  text: { $field: field },
  font: { size: 10, lineHeight: 12 },
  ...extra,
});

function component(repeat: Raw = {}, over: Raw = {}): Raw {
  return {
    format: 'mapping-component',
    formatVersion: 2,
    id: 'tab',
    name: 'Tab',
    size: { width: 200, height: 100 },
    minSize: { width: 120, height: 60 },
    preview: {
      titulo: 'T',
      linhas: [
        { chave: 'a', valor: '1' },
        { chave: 'b', valor: '2' },
      ],
    },
    template: {
      type: 'frame',
      layout: { type: 'column', gap: 4, padding: 8 },
      children: [
        text('titulo'),
        {
          type: 'repeat',
          field: 'linhas',
          gap: 2,
          template: {
            type: 'frame',
            layout: { type: 'row', gap: 8 },
            children: [text('chave', { width: 'hug' }), text('valor')],
          },
          ...repeat,
        },
      ],
    },
    ...over,
  };
}

function spec(edit: (raw: Raw) => void = () => undefined): Raw {
  const raw: Raw = {
    format: 'mapping-spec',
    formatVersion: 7,
    id: 'tab',
    name: 'Tab',
    version: 1,
    layers: [
      {
        id: 'l',
        name: 'L',
        color: '#112233',
        annotationTypes: [
          {
            id: 'tabela',
            name: 'Tabela',
            component: 'components/tab.json',
            fields: [
              { key: 'titulo', type: 'string' },
              {
                key: 'linhas',
                type: 'table',
                columns: [
                  { key: 'chave', type: 'string' },
                  { key: 'valor', type: 'string' },
                ],
              },
              { key: 'cor', type: 'string' },
              { key: 'total', type: 'number' },
            ],
          },
        ],
      },
    ],
  };
  edit(raw);
  return raw;
}

function validate(comp: Raw, edit?: (raw: Raw) => void) {
  return validateLibrary({
    specPath: SPEC_PATH,
    files: [
      { path: SPEC_PATH, text: JSON.stringify(spec(edit)) },
      { path: 'components/tab.json', text: JSON.stringify(comp) },
    ],
  });
}

const brief = (i: LibraryIssue) => [i.severity, i.file, i.path, i.message];

describe('validateLibrary com repeat', () => {
  it('o pacote com um repeat válido (e o preview com linhas) passa sem erro e sem aviso de campo', () => {
    const report = validate(component());
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
    // Só os campos `cor` e `total` não são usados pelo desenho.
    expect(report.warnings.map((w) => w.message)).toEqual([
      expect.stringContaining('field "cor" of the type "tabela" is not used'),
      expect.stringContaining('field "total" of the type "tabela" is not used'),
    ]);
  });

  it('o repeat que cita um campo que o tipo não declara é erro, no campo do repeat', () => {
    const report = validate(component({ field: 'inexistente' }));
    expect(report.errors.map(brief)).toContainEqual([
      'error',
      'components/tab.json',
      'template.children[1].field',
      'the drawing uses the field "inexistente", which the type "tabela" does not declare',
    ]);
  });

  it('o repeat que cita um campo que não é table é erro', () => {
    const report = validate(component({ field: 'titulo' }));
    expect(report.errors.map(brief)).toContainEqual([
      'error',
      'components/tab.json',
      'template.children[1].field',
      'the repeat repeats the rows of "titulo", which is a string field of the type "tabela", not a table',
    ]);
  });

  it('o desenho da linha que cita o que não é coluna nem campo do tipo é erro, no lugar da citação', () => {
    const report = validate(
      component({
        template: {
          type: 'frame',
          layout: { type: 'row' },
          children: [text('chave'), text('sumiu', { name: 'x' })],
        },
      }),
    );
    expect(report.errors.map(brief)).toEqual([
      [
        'error',
        'components/tab.json',
        'template.children[1].template.children[1].text.$field',
        'the row drawing uses "sumiu", which is neither a column of the table "linhas" nor a field of the type "tabela"',
      ],
    ]);
  });

  it('o desenho da linha pode ler um campo do tipo que não é coluna, e isso o conta como usado', () => {
    const report = validate(
      component({
        template: {
          type: 'frame',
          layout: { type: 'row' },
          children: [text('chave'), text('cor')],
        },
      }),
    );
    expect(report.errors).toEqual([]);
    expect(report.warnings.map((w) => w.message).join('\n')).not.toContain('field "cor"');
    expect(report.warnings.map((w) => w.message).join('\n')).toContain('field "total"');
  });

  it('a coluna usada que não existe mais na table é erro', () => {
    const report = validate(component(), (raw) => {
      raw.layers[0].annotationTypes[0].fields[1].columns.pop();
    });
    expect(report.errors.map((e) => e.path)).toEqual([
      'template.children[1].template.children[1].text.$field',
    ]);
  });

  it('repeat numa formatVersion 1 é erro do componente, no caminho do nó', () => {
    const report = validate(component({}, { formatVersion: 1 }));
    expect(report.errors.map(brief)).toEqual([
      [
        'error',
        'components/tab.json',
        'template.children[1].type',
        'the repeat node only exists in formatVersion 2',
      ],
    ]);
  });

  it('o preview de uma table precisa ser uma lista de linhas com colunas que existem', () => {
    const notList = validate(component({}, { preview: { linhas: 'x' } }));
    expect(notList.warnings.map(brief)).toContainEqual([
      'warning',
      'components/tab.json',
      'preview.linhas',
      '"linhas" is a table of the type "tabela"; its preview must be a list of rows',
    ]);
    const extra = validate(
      component({}, { preview: { linhas: [{ chave: 'a', extra: 'x' }] } }),
    );
    expect(extra.warnings.map(brief)).toContainEqual([
      'warning',
      'components/tab.json',
      'preview.linhas[0].extra',
      '"extra" is not a column of the table "linhas" of the type "tabela"',
    ]);
    const scalar = validate(component({}, { preview: { titulo: [{ a: 'b' }] } }));
    expect(scalar.warnings.map(brief)).toContainEqual([
      'warning',
      'components/tab.json',
      'preview.titulo',
      '"titulo" is not a table of the type "tabela"; its preview must be a simple value',
    ]);
  });

  it('a prova de desenho usa as linhas do preview: a tabela que não cabe no tamanho inicial avisa', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ chave: `k${i}`, valor: 'v' }));
    const report = validate(component({}, { preview: { titulo: 'T', linhas: many } }));
    expect(report.errors).toEqual([]);
    const overflow = report.warnings.filter((w) => w.message.includes('content larger'));
    expect(overflow.map((w) => [w.file, w.path])).toEqual([
      ['components/tab.json', 'preview'],
    ]);
    // O tamanho mínimo não é desenhado: só o tamanho inicial.
    expect(overflow[0]?.message).toContain('initial size 200×100');
  });

  it('sem preview, a prova usa a tabela vazia e passa', () => {
    const comp = component();
    delete comp.preview;
    const report = validate(comp);
    expect(report.errors).toEqual([]);
    expect(report.warnings.map((w) => w.message).join('\n')).not.toContain(
      'conteúdo maior',
    );
  });
});

describe('validateLibrary: $rows, $index e repeat por count (formato 4)', () => {
  const v4 = (children: Raw[]): Raw => {
    const comp = component();
    comp.formatVersion = 4;
    comp.template.children = children;
    return comp;
  };

  it('$rows sobre uma table do tipo é válido e conta o campo como usado', () => {
    const report = validate(
      v4([text('titulo'), { ...text('x'), text: { $rows: 'linhas' } }]),
    );
    expect(report.errors).toEqual([]);
    expect(report.warnings.map((w) => w.message).join('\n')).not.toContain('"linhas"');
  });

  it('$rows sobre campo que não é table é erro, no caminho do $rows', () => {
    const report = validate(v4([{ ...text('x'), text: { $rows: 'titulo' } }]));
    expect(report.errors.map(brief)).toContainEqual([
      'error',
      'components/tab.json',
      'template.children[0].text.$rows',
      '$rows counts the rows of "titulo", which is a string field of the type "tabela", not a table',
    ]);
  });

  it('$rows sobre campo inexistente é erro de campo não declarado', () => {
    const report = validate(v4([{ ...text('x'), text: { $rows: 'nada' } }]));
    expect(report.errors.map((e) => e.message)).toContain(
      'the drawing uses the field "nada", which the type "tabela" does not declare',
    );
  });

  it('$index não é campo do tipo: nem erro nem exigência de campo', () => {
    const report = validate(
      v4([
        {
          type: 'repeat',
          count: 3,
          template: {
            type: 'frame',
            layout: { type: 'row' },
            children: [{ ...text('x'), text: { $field: '$index' } }, text('titulo')],
          },
        },
      ]),
    );
    expect(report.errors).toEqual([]);
  });

  it('o repeat por count lê campos do tipo no template; campo inexistente é erro', () => {
    const report = validate(
      v4([
        {
          type: 'repeat',
          count: { $rows: 'linhas' },
          template: {
            type: 'frame',
            layout: { type: 'row' },
            children: [text('inexistente')],
          },
        },
      ]),
    );
    expect(report.errors.map(brief)).toContainEqual([
      'error',
      'components/tab.json',
      'template.children[0].template.children[0].text.$field',
      'the row drawing uses "inexistente", which the type "tabela" does not declare',
    ]);
  });
});

describe('validateLibrary: $index em condições', () => {
  it('$eq, $has e $switch sobre $index não são campos do tipo', () => {
    const comp = component();
    comp.formatVersion = 4;
    comp.template.children = [
      {
        type: 'repeat',
        count: 3,
        template: {
          type: 'frame',
          layout: { type: 'row' },
          children: [
            { ...text('titulo'), visible: { $eq: ['$index', 0] } },
            { ...text('titulo'), visible: { $has: '$index' } },
            { ...text('titulo'), width: { $switch: '$index', cases: { '0': 10 } } },
          ],
        },
      },
    ];
    expect(validate(comp).errors).toEqual([]);
  });
});
