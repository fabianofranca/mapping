// MF2: lista de sombras (1 a 4), `shadow.spread` e `stroke.gap` (formato 4) — validador.
import { describe, expect, it } from 'vitest';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import {
  parseComponent,
  validateComponent,
} from '../../../src/model/components/parseComponent';

const V4 = 'só é permitido com formatVersion 4';
const t = (name: string) => ({ $token: name });
const shadow = (extra: Record<string, unknown> = {}) => ({ color: '#000', ...extra });

function withChild(child: Record<string, unknown>, version = 4): unknown {
  return {
    format: COMPONENT_FORMAT,
    formatVersion: version,
    id: 'c',
    name: 'C',
    size: { width: 100, height: 40 },
    template: { type: 'frame', children: [child] },
  };
}

const rect = (extra: Record<string, unknown>) => ({
  type: 'rect',
  width: 10,
  height: 10,
  ...extra,
});

describe('shadow como lista (decisão 3)', () => {
  it('de 1 a 4 sombras vale', () => {
    for (let n = 1; n <= 4; n++) {
      const list = Array.from({ length: n }, () => shadow({ y: 2 }));
      expect(validateComponent(withChild(rect({ shadow: list })))).toEqual([]);
    }
  });

  it('o objeto único continua valendo, em todas as versões', () => {
    for (const version of [1, 2, 3, 4])
      expect(validateComponent(withChild(rect({ shadow: shadow() }), version))).toEqual(
        [],
      );
  });

  it('lista vazia ou com 5 sombras é erro', () => {
    const msg = 'template.children[0].shadow: esperava de 1 a 4 sombras';
    expect(validateComponent(withChild(rect({ shadow: [] })))).toEqual([msg]);
    const five = Array.from({ length: 5 }, () => shadow());
    expect(validateComponent(withChild(rect({ shadow: five })))).toEqual([msg]);
  });

  it('cada item é validado no caminho dele', () => {
    const list = [shadow(), { x: 1 }, shadow({ blur: -1 }), shadow({ cor: 1 })];
    expect(validateComponent(withChild(rect({ shadow: list })))).toEqual([
      'template.children[0].shadow[1].color: campo obrigatório',
      'template.children[0].shadow[2].blur: esperava número maior ou igual a 0',
      'template.children[0].shadow[3].cor: chave desconhecida: cor',
    ]);
  });

  it('numa versão de 1 a 3 a lista dá o erro de versão, no caminho de shadow', () => {
    for (const version of [1, 2, 3])
      expect(
        validateComponent(withChild(rect({ shadow: [shadow(), shadow()] }), version)),
      ).toEqual([`template.children[0].shadow: ${V4}`]);
  });

  it('um item da lista com $token coleta a referência no caminho do item', () => {
    const r = parseComponent(
      withChild(rect({ shadow: [shadow(), shadow({ blur: t('e-blur') })] })),
    );
    if (!r.ok) throw new Error(r.errors.join('\n'));
    expect([...r.tokenRefs].map((x) => [x.path, x.kind])).toEqual([
      ['template.children[0].shadow[1].blur', 'number'],
    ]);
  });
});

describe('shadow.spread (decisão 4)', () => {
  it('vale literal (inclusive negativo) e $token de número', () => {
    expect(validateComponent(withChild(rect({ shadow: shadow({ spread: 2 }) })))).toEqual(
      [],
    );
    expect(
      validateComponent(withChild(rect({ shadow: shadow({ spread: -3 }) }))),
    ).toEqual([]);
    const r = parseComponent(
      withChild(rect({ shadow: [shadow({ spread: t('e-spread') })] })),
    );
    if (!r.ok) throw new Error(r.errors.join('\n'));
    expect([...r.tokenRefs].map((x) => [x.path, x.kind])).toEqual([
      ['template.children[0].shadow[0].spread', 'number'],
    ]);
  });

  it('texto não vale', () => {
    expect(
      validateComponent(withChild(rect({ shadow: shadow({ spread: 'x' }) }))),
    ).toEqual(['template.children[0].shadow.spread: esperava número']);
  });

  it('nas versões 1 a 3 dá o erro de versão, no caminho da chave', () => {
    for (const version of [1, 2, 3])
      expect(
        validateComponent(withChild(rect({ shadow: shadow({ spread: 2 }) }), version)),
      ).toEqual([`template.children[0].shadow.spread: ${V4}`]);
  });
});

describe('stroke.gap (decisão 7)', () => {
  const labelled = (stroke: Record<string, unknown>, version = 4, type = 'frame') => {
    const node: Record<string, unknown> = {
      type,
      width: 60,
      height: 20,
      stroke: { color: '#000', ...stroke },
    };
    return {
      format: COMPONENT_FORMAT,
      formatVersion: version,
      id: 'c',
      name: 'C',
      size: { width: 100, height: 40 },
      template: {
        type: 'frame',
        children: [
          node,
          { type: 'text', name: 'label', text: 'Nome', width: 'hug', height: 'hug' },
        ],
      },
    };
  };

  it('vale com o nome de um nó do template, com e sem padding', () => {
    expect(validateComponent(labelled({ gap: { node: 'label', padding: 4 } }))).toEqual(
      [],
    );
    expect(validateComponent(labelled({ gap: { node: 'label' } }))).toEqual([]);
    expect(
      validateComponent(labelled({ gap: { node: 'label', padding: 4 } }, 4, 'rect')),
    ).toEqual([]);
  });

  it('o nome padrão de um nó (o tipo) também é achado', () => {
    const unnamed = labelled({ gap: { node: 'text' } }) as {
      template: { children: Record<string, unknown>[] };
    };
    delete unnamed.template.children[1]!.name;
    expect(validateComponent(unnamed)).toEqual([]);
  });

  it('um nome que nenhum nó tem é erro de validação', () => {
    expect(validateComponent(labelled({ gap: { node: 'nada' } }))).toEqual([
      'template.children[0].stroke.gap.node: nó não encontrado: nada',
    ]);
  });

  it('gap junto com sides é erro', () => {
    expect(
      validateComponent(labelled({ gap: { node: 'label' }, sides: ['top', 'left'] })),
    ).toEqual(['template.children[0].stroke.gap: gap não vale com sides']);
  });

  it('só vale em frame e rect', () => {
    expect(validateComponent(labelled({ gap: { node: 'label' } }, 4, 'ellipse'))).toEqual(
      ['template.children[0].stroke.gap: só vale em frame e rect (este é ellipse)'],
    );
  });

  it('forma errada: node é obrigatório, chave desconhecida, padding numérico', () => {
    expect(validateComponent(labelled({ gap: {} }))).toEqual([
      'template.children[0].stroke.gap.node: campo obrigatório',
    ]);
    expect(validateComponent(labelled({ gap: { node: 'label', foo: 1 } }))).toEqual([
      'template.children[0].stroke.gap.foo: chave desconhecida: foo',
    ]);
    expect(validateComponent(labelled({ gap: { node: 'label', padding: 'x' } }))).toEqual(
      ['template.children[0].stroke.gap.padding: esperava número'],
    );
  });

  it('nas versões 1 a 3 dá o erro de versão, no caminho da chave', () => {
    for (const version of [1, 2, 3])
      expect(
        validateComponent(labelled({ gap: { node: 'label', padding: 4 } }, version)),
      ).toContain(`template.children[0].stroke.gap: ${V4}`);
  });
});
