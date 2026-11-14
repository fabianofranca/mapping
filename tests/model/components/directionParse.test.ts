// R1 (#1106, decisões 5 a 7 da #1096): a validação das chaves de direção — `anchors.start`/`end`,
// `font.align` `start`/`end`, `direction` por nó, `$direction`, `mirror` de `icon` e `path`.
import { describe, expect, it } from 'vitest';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import { validateComponent } from '../../../src/model/components/parseComponent';

const V4 = 'só é permitido com formatVersion 4';

function withChild(child: Record<string, unknown>, version = 4): unknown {
  return {
    format: COMPONENT_FORMAT,
    formatVersion: version,
    id: 'c',
    name: 'C',
    size: { width: 100, height: 40 },
    template: { type: 'frame', layout: { type: 'none' }, children: [child] },
  };
}

const rect = (extra: Record<string, unknown>) => ({
  type: 'rect',
  width: 10,
  height: 10,
  ...extra,
});

describe('anchors.start e anchors.end', () => {
  it('valem na v4, com número ou expressão', () => {
    expect(
      validateComponent(withChild(rect({ anchors: { start: 4, end: { $field: 'x' } } }))),
    ).toEqual([]);
  });

  it('start com left e end com right no mesmo nó são erro', () => {
    expect(
      validateComponent(withChild(rect({ anchors: { start: 4, left: 2 } }))),
    ).toEqual(['template.children[0].anchors.start: não combina com left']);
    expect(validateComponent(withChild(rect({ anchors: { end: 4, right: 2 } })))).toEqual(
      ['template.children[0].anchors.end: não combina com right'],
    );
    // start com right (e end com left) não colidem em ltr: valem
    expect(
      validateComponent(withChild(rect({ anchors: { start: 4, right: 2 } }))),
    ).toEqual([]);
  });

  it('numa versão 1 a 3, o erro de versão no caminho da chave', () => {
    for (const version of [1, 2, 3])
      expect(
        validateComponent(withChild(rect({ anchors: { start: 4, end: 5 } }), version)),
      ).toEqual([
        `template.children[0].anchors.start: ${V4}`,
        `template.children[0].anchors.end: ${V4}`,
      ]);
  });
});

describe('font.align start e end', () => {
  const text = (align: unknown) => ({
    type: 'text',
    text: 'a',
    font: { align },
  });

  it('valem na v4 (literal e por expressão)', () => {
    expect(validateComponent(withChild(text('start')))).toEqual([]);
    expect(validateComponent(withChild(text('end')))).toEqual([]);
    expect(validateComponent(withChild(text({ $field: 'a', default: 'start' })))).toEqual(
      [],
    );
  });

  it('valor fora do conjunto é erro', () => {
    expect(validateComponent(withChild(text('meio')))).toEqual([
      'template.children[0].font.align: esperava um de: left, center, right, justify, start, end',
    ]);
  });

  it('numa versão 1 a 3 o literal start/end dá o erro de versão', () => {
    for (const version of [1, 2, 3])
      expect(validateComponent(withChild(text('start'), version))).toEqual([
        `template.children[0].font.align: ${V4}`,
      ]);
  });
});

describe('direction por nó', () => {
  it('aceita ltr e rtl em qualquer nó', () => {
    for (const d of ['ltr', 'rtl'])
      expect(validateComponent(withChild(rect({ direction: d })))).toEqual([]);
  });

  it('literal fora de ltr/rtl é erro (esperava um de: ltr, rtl)', () => {
    expect(validateComponent(withChild(rect({ direction: 'auto' })))).toEqual([
      'template.children[0].direction: esperava um de: ltr, rtl',
    ]);
  });

  it('numa versão 1 a 3, o erro de versão no caminho da chave', () => {
    for (const version of [1, 2, 3])
      expect(validateComponent(withChild(rect({ direction: 'rtl' }), version))).toEqual([
        `template.children[0].direction: ${V4}`,
      ]);
  });
});

describe('a condição $direction', () => {
  it('vale em visible, $if, $and, $or e $not', () => {
    const issues = validateComponent(
      withChild(
        rect({
          visible: {
            $and: [{ $direction: 'rtl' }, { $not: { $direction: 'ltr' } }],
          },
          fill: { $if: { $direction: 'rtl' }, then: '#fff', else: '#000' },
          opacity: { $if: { $or: [{ $direction: 'rtl' }] }, then: 1, else: 0.5 },
        }),
      ),
    );
    expect(issues).toEqual([]);
  });

  it('valor fora de ltr/rtl é erro', () => {
    expect(
      validateComponent(withChild(rect({ visible: { $direction: 'auto' } }))),
    ).toEqual(['template.children[0].visible.$direction: esperava um de: ltr, rtl']);
  });

  it('numa versão 1 a 3, o erro de versão no caminho da chave', () => {
    for (const version of [1, 2, 3])
      expect(
        validateComponent(withChild(rect({ visible: { $direction: 'rtl' } }), version)),
      ).toContain(`template.children[0].visible.$direction: ${V4}`);
  });
});

describe('mirror em icon e path', () => {
  const path = (extra: Record<string, unknown>) => ({
    type: 'path',
    d: 'M0 0L1 1',
    viewBox: [10, 10],
    ...extra,
  });

  it('valem na v4: literal, campo e $direction', () => {
    expect(validateComponent(withChild(path({ mirror: true })))).toEqual([]);
    expect(
      validateComponent(
        withChild({ type: 'icon', name: 'back', mirror: { $direction: 'rtl' } }),
      ),
    ).toEqual([]);
    expect(
      validateComponent(
        withChild({ type: 'icon', name: 'back', mirror: { $field: 'm' } }),
      ),
    ).toEqual([]);
  });

  it('mirror não é chave de rect (chave desconhecida)', () => {
    expect(validateComponent(withChild(rect({ mirror: true })))).toEqual([
      'template.children[0].mirror: chave desconhecida: mirror',
    ]);
  });

  it('path com mirror numa versão 1 a 3 dá o erro de versão', () => {
    for (const version of [1, 2, 3])
      expect(validateComponent(withChild(path({ mirror: true }), version))).toEqual([
        `template.children[0].mirror: ${V4}`,
      ]);
  });
});
