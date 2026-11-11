// Formato 4, fase CF2: limites de tamanho, expressão em tamanho e layout, repeat.distribute.
import { describe, expect, it } from 'vitest';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import { validateComponent } from '../../../src/model/components/parseComponent';

const V4 = 'só é permitido com formatVersion 4';

function component(template: unknown, version = 4): unknown {
  return {
    format: COMPONENT_FORMAT,
    formatVersion: version,
    id: 'c',
    name: 'C',
    size: { width: 200, height: 100 },
    template,
  };
}

/** Um quadro raiz com um filho do tipo dado, já com as chaves extras. */
function withChild(child: Record<string, unknown>, version = 4): unknown {
  return component({ type: 'frame', children: [child] }, version);
}

const rect = (extra: Record<string, unknown>): Record<string, unknown> => ({
  type: 'rect',
  ...extra,
});

describe('minWidth, maxWidth, minHeight e maxHeight', () => {
  it('valem em qualquer nó, inclusive repeat, com número ou expressão', () => {
    const limits = {
      minWidth: 10,
      maxWidth: { $field: 'w', default: 300 },
      minHeight: { $if: { $has: 'x' }, then: 5, else: 0 },
      maxHeight: 80,
    };
    expect(validateComponent(withChild(rect(limits)))).toEqual([]);
    expect(
      validateComponent(
        withChild({
          type: 'repeat',
          field: 'rows',
          ...limits,
          template: { type: 'frame' },
        }),
      ),
    ).toEqual([]);
  });

  it('valor negativo ou que não é número falha no caminho da chave', () => {
    expect(validateComponent(withChild(rect({ minWidth: -1, maxHeight: 'x' })))).toEqual([
      'template.children[0].minWidth: esperava número maior ou igual a 0',
      'template.children[0].maxHeight: esperava número maior ou igual a 0',
    ]);
  });

  it('min maior que max, com os dois literais, falha no caminho do min', () => {
    expect(validateComponent(withChild(rect({ minWidth: 200, maxWidth: 100 })))).toEqual([
      'template.children[0].minWidth: não pode ser maior que maxWidth',
    ]);
    expect(validateComponent(withChild(rect({ minHeight: 9, maxHeight: 3 })))).toEqual([
      'template.children[0].minHeight: não pode ser maior que maxHeight',
    ]);
  });

  it('min igual a max, ou com uma expressão, não falha', () => {
    expect(validateComponent(withChild(rect({ minWidth: 100, maxWidth: 100 })))).toEqual(
      [],
    );
    expect(
      validateComponent(withChild(rect({ minWidth: 200, maxWidth: { $field: 'm' } }))),
    ).toEqual([]);
  });

  it('na formatVersion 3 dão o erro de versão no caminho da chave', () => {
    expect(validateComponent(withChild(rect({ minWidth: 1, maxHeight: 2 }), 3))).toEqual([
      `template.children[0].minWidth: ${V4}`,
      `template.children[0].maxHeight: ${V4}`,
    ]);
  });
});

describe('repeat.distribute', () => {
  const repeat = (distribute: unknown): Record<string, unknown> => ({
    type: 'repeat',
    field: 'rows',
    distribute,
    template: { type: 'frame' },
  });

  it('aceita none e fill; recusa outro valor e expressão', () => {
    expect(validateComponent(withChild(repeat('none')))).toEqual([]);
    expect(validateComponent(withChild(repeat('fill')))).toEqual([]);
    expect(validateComponent(withChild(repeat('spread')))).toEqual([
      'template.children[0].distribute: esperava um de: none, fill',
    ]);
    expect(validateComponent(withChild(repeat({ $field: 'd' })))).toEqual([
      'template.children[0].distribute: esperava um de: none, fill',
    ]);
  });

  it('na formatVersion 3 dá o erro de versão', () => {
    expect(validateComponent(withChild(repeat('fill'), 3))).toEqual([
      `template.children[0].distribute: ${V4}`,
    ]);
  });

  it('em nó que não é repeat continua chave desconhecida', () => {
    expect(validateComponent(withChild(rect({ distribute: 'fill' })))).toContain(
      'template.children[0].distribute: chave desconhecida: distribute',
    );
  });
});

describe('expressão em width e height', () => {
  it('aceita expressão cujos ramos são tamanhos válidos', () => {
    const width = {
      $switch: 'size',
      cases: { s: 40, m: '50%', l: 'fill' },
      default: 'hug',
    };
    expect(
      validateComponent(withChild(rect({ width, height: { $field: 'h', default: 20 } }))),
    ).toEqual([]);
  });

  it('confere o literal dentro da expressão', () => {
    expect(
      validateComponent(withChild(rect({ width: { $field: 'w', default: -3 } }))),
    ).toEqual([
      'template.children[0].width.default: esperava número maior ou igual a 0, "fill", "hug" ou "<número>%"',
    ]);
    expect(
      validateComponent(
        withChild(rect({ height: { $if: { $has: 'x' }, then: 'wide', else: 10 } })),
      ),
    ).toEqual([
      'template.children[0].height.then: esperava número maior ou igual a 0, "fill", "hug" ou "<número>%"',
    ]);
  });

  it('o nó image recusa hug, também num ramo de expressão', () => {
    const image = (extra: Record<string, unknown>): Record<string, unknown> => ({
      type: 'image',
      src: { $field: 'foto' },
      ...extra,
    });
    const hug = 'o nó image não aceita hug: a arrumação não depende da imagem baixada';
    expect(validateComponent(withChild(image({ width: 'hug' }), 3))).toEqual([
      `template.children[0].width: ${hug}`,
    ]);
    expect(
      validateComponent(
        withChild(image({ height: { $if: { $has: 'x' }, then: 'hug', else: 10 } })),
      ),
    ).toEqual([`template.children[0].height.then: ${hug}`]);
    expect(
      validateComponent(withChild(image({ width: { $field: 'w', default: 'fill' } }))),
    ).toEqual([]);
  });
});

describe('expressão em layout.type, align e justify', () => {
  const frameWith = (layout: unknown, version = 4): unknown =>
    component({ type: 'frame', layout }, version);

  it('layout.type por expressão aceita gap, padding, align e justify', () => {
    const layout = {
      type: { $switch: 'dir', cases: { h: 'row', v: 'column' }, default: 'none' },
      gap: 8,
      padding: [4, 8],
      align: { $field: 'a', default: 'center' },
      justify: { $if: { $has: 'x' }, then: 'space-between', else: 'start' },
    };
    expect(validateComponent(frameWith(layout))).toEqual([]);
  });

  it('o mesmo vale no layout de um slot', () => {
    const layout = {
      type: { $field: 'dir', default: 'row' },
      align: { $field: 'a', default: 'end' },
    };
    expect(
      validateComponent(
        component({ type: 'frame', children: [{ type: 'slot', layout }] }),
      ),
    ).toEqual([]);
  });

  it('confere os literais dos ramos', () => {
    expect(
      validateComponent(frameWith({ type: { $field: 'd', default: 'diagonal' } })),
    ).toEqual(['template.layout.type.default: esperava "none", "row" ou "column"']);
    expect(
      validateComponent(
        frameWith({ type: 'row', align: { $field: 'a', default: 'middle' } }),
      ),
    ).toEqual([
      'template.layout.align.default: esperava um de: start, center, end, stretch, baseline',
    ]);
    expect(
      validateComponent(
        frameWith({ type: 'row', justify: { $field: 'j', default: 'around' } }),
      ),
    ).toEqual([
      'template.layout.justify.default: esperava um de: start, center, end, space-between, space-around, space-evenly',
    ]);
  });

  it('literal inválido em type mantém a mensagem de sempre', () => {
    expect(validateComponent(frameWith({ type: 'grid' }))).toEqual([
      'template.layout.type: esperava "none", "row" ou "column"',
    ]);
  });

  it('com type literal none, só type vale', () => {
    expect(validateComponent(frameWith({ type: 'none', gap: 4 }))).toEqual([
      'template.layout.gap: chave desconhecida: gap',
    ]);
  });
});

describe('expressão nas cinco chaves antes da formatVersion 4', () => {
  it('v3 com minWidth, distribute e width por expressão dá exatamente três erros', () => {
    const doc = component(
      {
        type: 'frame',
        children: [
          rect({ minWidth: 10 }),
          {
            type: 'repeat',
            field: 'rows',
            distribute: 'fill',
            template: { type: 'frame' },
          },
          rect({ width: { $field: 'w' } }),
        ],
      },
      3,
    );
    expect(validateComponent(doc)).toEqual([
      `template.children[0].minWidth: ${V4}`,
      `template.children[1].distribute: ${V4}`,
      `template.children[2].width: ${V4}`,
    ]);
  });

  it('height e layout.type/align/justify por expressão também, em slot e em repeat', () => {
    const layout = {
      type: { $field: 'd', default: 'row' },
      align: { $field: 'a', default: 'start' },
      justify: { $field: 'j', default: 'start' },
    };
    const doc = component(
      {
        type: 'frame',
        layout,
        children: [
          rect({ height: { $field: 'h', default: 3 } }),
          { type: 'slot', layout },
          {
            type: 'repeat',
            field: 'rows',
            template: { type: 'frame', width: { $field: 'w', default: 5 } },
          },
        ],
      },
      2,
    );
    expect(validateComponent(doc)).toEqual([
      `template.layout.type: ${V4}`,
      `template.layout.align: ${V4}`,
      `template.layout.justify: ${V4}`,
      `template.children[0].height: ${V4}`,
      `template.children[1].layout.type: ${V4}`,
      `template.children[1].layout.align: ${V4}`,
      `template.children[1].layout.justify: ${V4}`,
      `template.children[2].template.width: ${V4}`,
    ]);
  });

  it('literais nessas chaves continuam valendo em todas as versões', () => {
    const doc = component(
      {
        type: 'frame',
        width: 'fill',
        layout: { type: 'row', align: 'center', justify: 'end' },
        children: [rect({ width: '50%', height: 'hug' })],
      },
      1,
    );
    expect(validateComponent(doc)).toEqual([]);
  });
});

describe('componente v4 com tudo junto', () => {
  it('passa', () => {
    const doc = component({
      type: 'frame',
      width: { $field: 'w', default: 'fill' },
      minHeight: 40,
      maxHeight: { $field: 'mh', default: 400 },
      layout: {
        type: { $field: 'dir', default: 'column' },
        gap: 8,
        align: { $field: 'a', default: 'stretch' },
        justify: { $field: 'j', default: 'start' },
      },
      children: [
        rect({
          minWidth: 10,
          maxWidth: 100,
          width: 'fill',
          height: { $field: 'h', default: 20 },
        }),
        {
          type: 'repeat',
          field: 'rows',
          direction: 'column',
          distribute: 'fill',
          minHeight: 20,
          template: { type: 'frame', height: 'fill', maxWidth: 300 },
        },
      ],
    });
    expect(validateComponent(doc)).toEqual([]);
  });
});
