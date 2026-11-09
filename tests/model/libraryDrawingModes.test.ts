// A prova de desenho (nível 3) roda cada caso em cada modo da especialização, com os tokens do
// modo resolvidos (FX4, decisão 22 da #896): o aviso cita o modo e o tamanho vem do token tipado.
import { describe, expect, it } from 'vitest';
import { validateLibrary } from '../../src/model/library';

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SPEC_PATH = 'm.spec.json';

const component = (fontSize: unknown): Raw => ({
  format: 'mapping-component',
  formatVersion: 4,
  id: 'm',
  name: 'M',
  size: { width: 100, height: 50 },
  template: {
    type: 'frame',
    layout: { type: 'row', align: 'center' },
    children: [
      {
        type: 'text',
        name: 'label',
        text: 'Hello world',
        font: { family: 'Roboto', size: fontSize, weight: 400, lineHeight: 20 },
        color: '#000000',
      },
    ],
  },
});

const spec = (tokens: unknown): Raw => ({
  format: 'mapping-spec',
  formatVersion: 15,
  id: 'm',
  name: 'M',
  version: 1,
  ...(tokens === null ? {} : { tokens }),
  layers: [
    {
      id: 'l',
      name: 'L',
      color: '#112233',
      annotationTypes: [
        { id: 't', name: 'T', component: 'components/m.json', fields: [] },
      ],
    },
  ],
});

function warnings(fontSize: unknown, tokens: unknown) {
  const report = validateLibrary({
    specPath: SPEC_PATH,
    level: 3,
    files: [
      { path: SPEC_PATH, text: JSON.stringify(spec(tokens)) },
      { path: 'components/m.json', text: JSON.stringify(component(fontSize)) },
    ],
  });
  return report.warnings.map((w) => w.message);
}

describe('prova de desenho por modo (FX4)', () => {
  const TOKENS = {
    modes: ['light', 'dark'],
    values: { size: { light: 10, dark: 20 } },
  };

  it('um caso que só não cabe no dark avisa citando o modo dark (e mede com o token)', () => {
    // 11 caracteres × 0,55 × corpo: 10 px = 60,5 (cabe em 100); 20 px = 121 (não cabe). Sem o
    // token resolvido o texto mediria 14 px (84,7) e não avisaria em modo nenhum.
    expect(warnings({ $token: 'size' }, TOKENS)).toEqual([
      'tipo "t", os valores padrão, modo dark, tamanho inicial 100×50: conteúdo maior que a caixa: frame (aproximado)',
    ]);
  });

  it('o aviso que vale em todos os modos sai uma vez, sem modo', () => {
    const both = { modes: ['light', 'dark'], values: { size: 40 } };
    expect(warnings({ $token: 'size' }, both)).toEqual([
      'tipo "t", os valores padrão, tamanho inicial 100×50: conteúdo maior que a caixa: frame (aproximado)',
    ]);
  });

  it('sem tokens na especialização a mensagem não cita modo', () => {
    expect(warnings(30, null)).toEqual([
      'tipo "t", os valores padrão, tamanho inicial 100×50: conteúdo maior que a caixa: frame (aproximado)',
    ]);
  });
});
