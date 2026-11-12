// Validador da biblioteca com variáveis (`let` e `$var`, etapa #1504): as conferências que olham
// os campos citados pelo desenho (coluna do repeat, campo do tipo, `$rows`) leem o componente com as
// variáveis trocadas, então uma variável do `let` da raiz usada dentro de um `repeat` vale como a
// citação escrita ali.
import { describe, expect, it } from 'vitest';
import { validateLibrary } from '../../src/model/library';

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SPEC_PATH = 'tab.spec.json';

const text = (expr: unknown): Raw => ({
  type: 'text',
  text: expr,
  font: { size: 10, lineHeight: 12 },
});

function component(lets: Raw, rowText: unknown): Raw {
  return {
    format: 'mapping-component',
    formatVersion: 4,
    id: 'tab',
    name: 'Tab',
    size: { width: 200, height: 100 },
    minSize: { width: 120, height: 60 },
    preview: { linhas: [{ chave: 'a' }, { chave: 'b' }] },
    template: {
      type: 'frame',
      let: lets,
      layout: { type: 'column' },
      children: [
        {
          type: 'repeat',
          field: 'linhas',
          template: { type: 'frame', children: [text(rowText)] },
        },
      ],
    },
  };
}

const SPEC: Raw = {
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
            {
              key: 'linhas',
              type: 'table',
              columns: [{ key: 'chave', type: 'string' }],
            },
            { key: 'cor', type: 'string' },
          ],
        },
      ],
    },
  ],
};

function validate(comp: Raw) {
  return validateLibrary({
    specPath: SPEC_PATH,
    files: [
      { path: SPEC_PATH, text: JSON.stringify(SPEC) },
      { path: 'components/tab.json', text: JSON.stringify(comp) },
    ],
  });
}

describe('validateLibrary com variáveis', () => {
  it('a variável da raiz que cita uma coluna, usada dentro do repeat, vale como a citação ali', () => {
    const report = validate(component({ nome: { $field: 'chave' } }, { $var: 'nome' }));
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('a variável que cita um campo do tipo, usada só dentro do repeat, conta o campo como usado', () => {
    const report = validate(component({ tom: { $field: 'cor' } }, { $var: 'tom' }));
    expect(report.errors).toEqual([]);
    expect(report.warnings.map((w) => w.message).join('\n')).not.toContain('campo "cor"');
  });

  it('a variável que cita o que não é coluna nem campo do tipo, usada no repeat, é erro', () => {
    const report = validate(component({ x: { $field: 'sumiu' } }, { $var: 'x' }));
    expect(report.errors.map((e) => e.message)).toEqual([
      'o desenho da linha usa "sumiu", que não é coluna da table "linhas" nem campo do tipo "tabela"',
    ]);
  });

  it('a variável sem uso que cita um campo inexistente não gera erro nem conta como uso', () => {
    const report = validate(
      component({ solta: { $field: 'sumiu' } }, { $field: 'chave' }),
    );
    expect(report.errors).toEqual([]);
  });
});
