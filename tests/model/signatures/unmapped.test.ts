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
