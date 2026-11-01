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
      expect.stringContaining('campo "cor" do tipo "tabela" não é usado'),
      expect.stringContaining('campo "total" do tipo "tabela" não é usado'),
    ]);
  });

  it('o repeat que cita um campo que o tipo não declara é erro, no campo do repeat', () => {
    const report = validate(component({ field: 'inexistente' }));
    expect(report.errors.map(brief)).toContainEqual([
      'error',
      'components/tab.json',
      'template.children[1].field',
      'o desenho usa o campo "inexistente", que o tipo "tabela" não declara',
    ]);
  });

  it('o repeat que cita um campo que não é table é erro', () => {
    const report = validate(component({ field: 'titulo' }));
    expect(report.errors.map(brief)).toContainEqual([
      'error',
      'components/tab.json',
      'template.children[1].field',
      'o repeat repete as linhas de "titulo", que é um campo string do tipo "tabela", não uma table',
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
        'o desenho da linha usa "sumiu", que não é coluna da table "linhas" nem campo do tipo "tabela"',
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
    expect(report.warnings.map((w) => w.message).join('\n')).not.toContain('campo "cor"');
    expect(report.warnings.map((w) => w.message).join('\n')).toContain('campo "total"');
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
        'o nó repeat só existe na formatVersion 2',
      ],
    ]);
  });

  it('o preview de uma table precisa ser uma lista de linhas com colunas que existem', () => {
    const notList = validate(component({}, { preview: { linhas: 'x' } }));
    expect(notList.warnings.map(brief)).toContainEqual([
      'warning',
      'components/tab.json',
      'preview.linhas',
      '"linhas" é uma table do tipo "tabela"; o preview dele deve ser uma lista de linhas',
    ]);
    const extra = validate(
      component({}, { preview: { linhas: [{ chave: 'a', extra: 'x' }] } }),
    );
    expect(extra.warnings.map(brief)).toContainEqual([
      'warning',
      'components/tab.json',
      'preview.linhas[0].extra',
      '"extra" não é coluna da table "linhas" do tipo "tabela"',
    ]);
    const scalar = validate(component({}, { preview: { titulo: [{ a: 'b' }] } }));
    expect(scalar.warnings.map(brief)).toContainEqual([
      'warning',
      'components/tab.json',
      'preview.titulo',
      '"titulo" não é uma table do tipo "tabela"; o preview dele deve ser um valor simples',
    ]);
  });

  it('a prova de desenho usa as linhas do preview: a tabela que não cabe no tamanho inicial avisa', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ chave: `k${i}`, valor: 'v' }));
    const report = validate(component({}, { preview: { titulo: 'T', linhas: many } }));
    expect(report.errors).toEqual([]);
    const overflow = report.warnings.filter((w) => w.message.includes('conteúdo maior'));
    expect(overflow.map((w) => [w.file, w.path])).toEqual([
      ['components/tab.json', 'preview'],
    ]);
    // O tamanho mínimo não é desenhado: só o tamanho inicial.
    expect(overflow[0]?.message).toContain('tamanho inicial 200×100');
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
