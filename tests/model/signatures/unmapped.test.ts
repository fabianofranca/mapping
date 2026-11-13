// `unmappedParams` e `paramsOutsideSignature` (etapa #1079, S1): o que a ficha tem e o `code` não
// liga a campo, e o que o `code` liga e a ficha não tem.
import { describe, expect, it } from 'vitest';
import {
  parseSignature,
  paramsOutsideSignature,
  unmappedParams,
  type Signature,
} from '../../../src/model/signatures';
import { paramTarget } from '../../../src/model/codeParams';
import { buttonSignature, type Json } from './fixtures';

function signature(edit?: (s: Json) => void): Signature {
  const r = parseSignature(buttonSignature(edit));
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.signature;
}

describe('paramTarget', () => {
  it('nome, caminho e posicional', () => {
    expect(paramTarget('text')).toEqual({ kind: 'name', name: 'text' });
    expect(paramTarget('colors.containerColor')).toEqual({
      kind: 'path',
      call: 'colors',
      name: 'containerColor',
    });
    expect(paramTarget('#0')).toEqual({ kind: 'position', position: 0 });
    expect(paramTarget('#12')).toEqual({ kind: 'position', position: 12 });
    expect(paramTarget('#x')).toEqual({ kind: 'name', name: '#x' });
  });
});

describe('unmappedParams', () => {
  it('lista, na ordem da ficha, o que não tem campo: callback, modifier, slot e value', () => {
    expect(unmappedParams(signature(), { params: { label: 'enabled' } })).toEqual([
      { name: 'onClick', role: 'callback', type: '() -> Unit', required: true },
      {
        name: 'modifier',
        role: 'modifier',
        type: 'Modifier',
        required: false,
        default: 'Modifier',
      },
      {
        name: 'shape',
        role: 'value',
        type: 'Shape',
        required: false,
        default: 'ButtonDefaults.shape',
      },
      {
        name: 'colors',
        role: 'value',
        type: 'ButtonColors',
        required: false,
        default: 'ButtonDefaults.buttonColors()',
      },
      {
        name: 'content',
        role: 'slot',
        type: '@Composable RowScope.() -> Unit',
        required: true,
      },
    ]);
  });

  it('o ignore tira o parâmetro, sem aviso', () => {
    const names = unmappedParams(signature(), {
      params: { label: 'enabled' },
      ignore: ['modifier', 'content', 'onClick'],
    }).map((p) => p.name);
    expect(names).toEqual(['shape', 'colors']);
  });

  it('um parâmetro com algum campo da fábrica ligado (caminho) conta como ligado', () => {
    const names = unmappedParams(signature(), {
      params: { fill: 'colors.containerColor', on: 'enabled', s: 'shape' },
    }).map((p) => p.name);
    expect(names).toEqual(['onClick', 'modifier', 'content']);
  });

  it('o posicional #n liga o n-ésimo parâmetro de rótulo _', () => {
    const sig = signature((s) => {
      s.params.push({
        name: 'title',
        label: '_',
        role: 'value',
        type: 'String',
        value: { kind: 'text' },
      });
      s.params.push({
        name: 'sub',
        label: '_',
        role: 'value',
        type: 'String',
        value: { kind: 'text' },
      });
    });
    const unmapped = (params: Record<string, string>) =>
      unmappedParams(sig, {
        params,
        ignore: ['onClick', 'modifier', 'content', 'enabled', 'shape', 'colors'],
      }).map((p) => p.name);
    expect(unmapped({})).toEqual(['title', 'sub']);
    expect(unmapped({ a: '#0' })).toEqual(['sub']);
    expect(unmapped({ a: '#1' })).toEqual(['title']);
  });

  it('sem params no code, a ficha inteira fica sem campo', () => {
    expect(unmappedParams(signature(), {})).toHaveLength(6);
  });
});

describe('paramsOutsideSignature', () => {
  it('um parâmetro mapeado que a ficha não tem', () => {
    expect(
      paramsOutsideSignature(signature(), {
        params: {
          label: 'enabled',
          gone: 'removedParam',
          ok: 'colors.containerColor',
          bad: 'colors.nope',
        },
      }),
    ).toEqual([
      { field: 'gone', name: 'removedParam' },
      { field: 'bad', name: 'colors.nope' },
    ]);
  });

  it('posicional além dos parâmetros posicionais da ficha também é fora', () => {
    expect(paramsOutsideSignature(signature(), { params: { a: '#0' } })).toEqual([
      { field: 'a', name: '#0' },
    ]);
  });
});

describe('paramsOutsideSignature com o expand do fieldModels (S5)', () => {
  const withBorder = (): Signature =>
    signature((s) => {
      (s.params as Json[]).push({
        name: 'border',
        role: 'value',
        type: 'BorderStroke?',
        factory: {
          call: 'androidx.compose.material3.ButtonDefaults.outlinedButtonBorder',
          params: [{ name: 'enabled', role: 'value', type: 'Boolean' }],
        },
      });
    });
  const models = {
    'BorderStroke?': { expand: { call: 'BorderStroke', params: { width: 'Dp' } } },
  };

  it('o membro do expand do modelo do tipo do parâmetro dono vale, mesmo que a fábrica da ficha seja outra', () => {
    const params = { w: 'border.width', e: 'border.enabled', x: 'border.nope' };
    expect(paramsOutsideSignature(withBorder(), { params })).toEqual([
      { field: 'w', name: 'border.width' },
      { field: 'x', name: 'border.nope' },
    ]);
    // com o modelo, vale a expansão do modelo (a mesma do importador): `enabled` é argumento da
    // fábrica da ficha, mas não do `expand`, então o importador não o tem como unidade (CL1, S5-c)
    expect(paramsOutsideSignature(withBorder(), { params }, models)).toEqual([
      { field: 'e', name: 'border.enabled' },
      { field: 'x', name: 'border.nope' },
    ]);
  });

  it('um membro herdado de Object.prototype não conta como membro do expand', () => {
    const params = { a: 'border.constructor', b: 'border.toString' };
    expect(paramsOutsideSignature(withBorder(), { params }, models)).toEqual([
      { field: 'a', name: 'border.constructor' },
      { field: 'b', name: 'border.toString' },
    ]);
  });
});

describe('rótulo externo do Swift (corrigido na S2)', () => {
  const swift = (): Signature =>
    signature((s) => {
      s.params = [
        {
          name: 'text',
          label: 'title',
          role: 'value',
          type: 'String',
          value: { kind: 'text' },
        },
        {
          name: 'icon',
          label: '_',
          role: 'value',
          type: 'String',
          value: { kind: 'text' },
        },
      ];
    });

  it('o params que cita o rótulo externo liga o parâmetro', () => {
    expect(unmappedParams(swift(), { params: { titulo: 'title', icone: '#0' } })).toEqual(
      [],
    );
    expect(paramsOutsideSignature(swift(), { params: { titulo: 'title' } })).toEqual([]);
  });

  it('o nome interno também vale (o que um agente escreve à mão)', () => {
    expect(unmappedParams(swift(), { params: { titulo: 'text', icone: '#0' } })).toEqual(
      [],
    );
    expect(paramsOutsideSignature(swift(), { params: { titulo: 'text' } })).toEqual([]);
  });

  it('o ignore aceita o rótulo ou o nome', () => {
    const left = unmappedParams(swift(), { params: {}, ignore: ['title'] });
    expect(left.map((u) => u.name)).toEqual(['icon']);
  });
});

describe('paramsOutsideSignature e o importador usam a mesma expansão (CL1, S5-c)', () => {
  const models = {
    ButtonColors: { expand: { params: { foo: 'Color' } } },
    Spacing: { expand: { params: { gap: 'Dp' } } },
  } as const;
  const sig = (): Signature => {
    const r = parseSignature({
      format: 'mapping-signature',
      formatVersion: 1,
      source: {
        kind: 'code',
        platform: 'compose',
        language: 'kotlin',
        symbol: 'x.Button',
        path: 'Button.kt',
        extractor: 'agent',
      },
      params: [
        {
          name: 'colors',
          role: 'value',
          type: 'ButtonColors',
          value: { kind: 'opaque' },
          factory: {
            call: 'ButtonDefaults.buttonColors',
            params: [{ name: 'containerColor', role: 'value', type: 'Color' }],
          },
        },
        // o modelo expand não vale para quem não é value
        { name: 'spacing', role: 'other', type: 'Spacing' },
        // nem para o posicional
        { name: 'pos', label: '_', role: 'value', type: 'Spacing' },
      ],
    });
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    return r.signature;
  };
  const outside = (value: string): string[] =>
    paramsOutsideSignature(sig(), { params: { f: value } }, models).map((o) => o.name);

  it('o argumento da fábrica que o expand do modelo não expande está fora', () => {
    // o importador expande `colors` pelo modelo (foo), não pela fábrica (containerColor)
    expect(outside('colors.foo')).toEqual([]);
    expect(outside('colors.containerColor')).toEqual(['colors.containerColor']);
  });

  it('o modelo expand de um parâmetro que não expande (role other ou posicional) não vale', () => {
    expect(outside('spacing.gap')).toEqual([]); // sem fábrica descrita: não conferido
    expect(
      paramsOutsideSignature(sig(), { params: { f: 'pos.gap' } }, models).map(
        (o) => o.name,
      ),
    ).toEqual([]);
  });

  it('todo alvo que o importador gera como unidade é aceito pelo validador', async () => {
    const { unitsOf } = await import('../../../src/model/signatures/importUnits');
    for (const unit of unitsOf(sig(), models)) {
      expect(outside(unit.target), unit.target).toEqual([]);
    }
  });
});
