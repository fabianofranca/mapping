// A prova de desenho também no tamanho ajustado (MC2, decisão 10 da #898): um componente com eixo
// que depende do conteúdo (`sizing` `hug`, ou por expressão) é desenhado no `size` e no tamanho
// ajustado, com os valores do caso; o aviso do segundo cita `tamanho ajustado W×H`.
import { describe, expect, it } from 'vitest';
import { validateLibrary } from '../../src/model/library';

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SPEC_PATH = 'm.spec.json';

const LONG = 'aaaaaaaaaa bbbbbbbbbb cccccccccc dddddddddd';

function component(extra: Raw, textExtra: Raw = {}): Raw {
  return {
    format: 'mapping-component',
    formatVersion: 4,
    id: 'm',
    name: 'M',
    size: { width: 200, height: 50 },
    template: {
      type: 'frame',
      width: 'fill',
      height: 'fill',
      layout: { type: 'column' },
      children: [
        {
          type: 'text',
          name: 'msg',
          text: { $field: 'msg' },
          width: 'fill',
          height: 'hug',
          font: { family: 'Roboto', size: 10, weight: 400, lineHeight: 30 },
          color: '#000000',
          ...textExtra,
        },
      ],
      ...(extra.template as Raw | undefined),
    },
    ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'template')),
  };
}

const spec = (examples: unknown[] = []): Raw => ({
  format: 'mapping-spec',
  formatVersion: 15,
  id: 'm',
  name: 'M',
  version: 1,
  layers: [
    {
      id: 'l',
      name: 'L',
      color: '#112233',
      annotationTypes: [
        {
          id: 't',
          name: 'T',
          component: 'components/m.json',
          fields: [{ key: 'msg', label: 'Mensagem', type: 'string', default: LONG }],
          examples,
        },
      ],
    },
  ],
});

function warnings(comp: Raw, examples: unknown[] = []): string[] {
  const report = validateLibrary({
    specPath: SPEC_PATH,
    level: 3,
    files: [
      { path: SPEC_PATH, text: JSON.stringify(spec(examples)) },
      { path: 'components/m.json', text: JSON.stringify(comp) },
    ],
  });
  return report.warnings.map((w) => w.message);
}

describe('prova de desenho no tamanho ajustado (MC2, decisão 10)', () => {
  it('o que não cabe no size e passa a caber no tamanho ajustado avisa só no size', () => {
    // Duas linhas de 30 = 60 de texto numa caixa de 50; com a altura `hug` o tamanho ajustado é 200×60.
    const out = warnings(component({ sizing: { height: 'hug' } }));
    expect(out).toEqual([
      'type "t", the default values, initial size 200×50: content larger than the box: frame (approximate)',
    ]);
  });

  it('o que não cabe nem no tamanho ajustado avisa citando `tamanho ajustado W×H`', () => {
    // `maxHeight` 40 na raiz segura o ajuste: as duas linhas (60) não cabem em 200×40.
    const out = warnings(
      component({ sizing: { height: 'hug' }, template: { maxHeight: 40 } }),
    );
    expect(out).toContain(
      'type "t", the default values, fitted size 200×40: content larger than the box: frame (approximate)',
    );
  });

  it('o exemplo de valores também é provado no tamanho ajustado, com os valores dele', () => {
    const out = warnings(
      component({ sizing: { height: 'hug' }, template: { maxHeight: 40 } }),
      [{ name: 'longo', values: { msg: LONG } }],
    );
    expect(out).toContain(
      'type "t", the example "longo", fitted size 200×40: content larger than the box: frame (approximate)',
    );
  });

  it('sizing por expressão que dá px entra no tamanho ajustado', () => {
    const out = warnings(
      component({
        sizing: { height: { $if: { $has: 'msg' }, then: 40, else: 50 } },
      }),
    );
    expect(out).toContain(
      'type "t", the default values, fitted size 200×40: content larger than the box: frame (approximate)',
    );
  });

  it('componente sem eixo que depende do conteúdo não ganha o caso ajustado', () => {
    const out = warnings(component({}));
    expect(out).toEqual([
      'type "t", the default values, initial size 200×50: content larger than the box: frame (approximate)',
    ]);
  });

  it('nenhum desenho de hoje muda: sem aviso nos dois tamanhos quando cabe', () => {
    expect(
      warnings(
        component({ size: { width: 200, height: 80 }, sizing: { height: 'hug' } }),
        [],
      ),
    ).toEqual([]);
  });

  it('sizing com valor inválido avisa no caso do size (sem `aproximado`: não depende da medida) e cai no size', () => {
    const out = warnings(component({ sizing: { height: { $field: 'msg' } } }));
    expect(out).toContain(
      `type "t", the default values, initial size 200×50: invalid value in sizing.height: ${LONG}`,
    );
    expect(out.some((w) => w.includes('tamanho ajustado'))).toBe(false);
  });
});
