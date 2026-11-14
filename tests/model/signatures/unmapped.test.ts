// `unmappedParams` and `paramsOutsideSignature` (stage #1079, S1): what the signature has and the
// `code` does not bind to a field, and what the `code` binds and the signature lacks.
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
  it('name, path and positional', () => {
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
  it('lists, in the signature's order, what has no field: callback, modifier, slot and value', () => {
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

  it('ignore removes the parameter, without a notice', () => {
    const names = unmappedParams(signature(), {
      params: { label: 'enabled' },
      ignore: ['modifier', 'content', 'onClick'],
    }).map((p) => p.name);
    expect(names).toEqual(['shape', 'colors']);
  });

  it('a parameter with some factory field bound (path) counts as bound', () => {
    const names = unmappedParams(signature(), {
      params: { fill: 'colors.containerColor', on: 'enabled', s: 'shape' },
    }).map((p) => p.name);
    expect(names).toEqual(['onClick', 'modifier', 'content']);
  });

  it('the positional #n binds the n-th parameter with label _', () => {
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

  it('without params in the code, the whole signature is left without a field', () => {
    expect(unmappedParams(signature(), {})).toHaveLength(6);
  });
});

describe('paramsOutsideSignature', () => {
  it('a mapped parameter that the signature lacks', () => {
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

  it('a positional beyond the signature's positional parameters is also outside', () => {
    expect(paramsOutsideSignature(signature(), { params: { a: '#0' } })).toEqual([
      { field: 'a', name: '#0' },
    ]);
  });
});

describe('paramsOutsideSignature with the fieldModels expand (S5)', () => {
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

  it('the member of the expand of the owner parameter's type model counts, even if the signature's factory is another', () => {
    const params = { w: 'border.width', e: 'border.enabled', x: 'border.nope' };
    expect(paramsOutsideSignature(withBorder(), { params })).toEqual([
      { field: 'w', name: 'border.width' },
      { field: 'x', name: 'border.nope' },
    ]);
    // with the model, the model's expansion counts (the same as the importer's): `enabled` is an
    // argument of the signature's factory, but not of the `expand`, so the importer does not have it
    // as a unit (CL1, S5-c)
    expect(paramsOutsideSignature(withBorder(), { params }, models)).toEqual([
      { field: 'e', name: 'border.enabled' },
      { field: 'x', name: 'border.nope' },
    ]);
  });

  it('a member inherited from Object.prototype does not count as a member of the expand', () => {
    const params = { a: 'border.constructor', b: 'border.toString' };
    expect(paramsOutsideSignature(withBorder(), { params }, models)).toEqual([
      { field: 'a', name: 'border.constructor' },
      { field: 'b', name: 'border.toString' },
    ]);
  });
});

describe('Swift external label (fixed in S2)', () => {
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

  it('the params that cites the external label binds the parameter', () => {
    expect(unmappedParams(swift(), { params: { heading: 'title', icon: '#0' } })).toEqual(
      [],
    );
    expect(paramsOutsideSignature(swift(), { params: { heading: 'title' } })).toEqual([]);
  });

  it('the internal name also counts (what an agent writes by hand)', () => {
    expect(unmappedParams(swift(), { params: { heading: 'text', icon: '#0' } })).toEqual(
      [],
    );
    expect(paramsOutsideSignature(swift(), { params: { heading: 'text' } })).toEqual([]);
  });

  it('ignore accepts the label or the name', () => {
    const left = unmappedParams(swift(), { params: {}, ignore: ['title'] });
    expect(left.map((u) => u.name)).toEqual(['icon']);
  });
});

describe('paramsOutsideSignature and the importer use the same expansion (CL1, S5-c)', () => {
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
        // the expand model does not apply to what is not a value
        { name: 'spacing', role: 'other', type: 'Spacing' },
        // nor to the positional
        { name: 'pos', label: '_', role: 'value', type: 'Spacing' },
      ],
    });
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    return r.signature;
  };
  const outside = (value: string): string[] =>
    paramsOutsideSignature(sig(), { params: { f: value } }, models).map((o) => o.name);

  it('the factory argument that the model's expand does not expand is outside', () => {
    // the importer expands `colors` by the model (foo), not by the factory (containerColor)
    expect(outside('colors.foo')).toEqual([]);
    expect(outside('colors.containerColor')).toEqual(['colors.containerColor']);
  });

  it('the expand model of a parameter that does not expand (role other or positional) does not apply', () => {
    expect(outside('spacing.gap')).toEqual([]); // no factory described: not checked
    expect(
      paramsOutsideSignature(sig(), { params: { f: 'pos.gap' } }, models).map(
        (o) => o.name,
      ),
    ).toEqual([]);
  });

  it('every target that the importer generates as a unit is accepted by the validator', async () => {
    const { unitsOf } = await import('../../../src/model/signatures/importUnits');
    for (const unit of unitsOf(sig(), models)) {
      expect(outside(unit.target), unit.target).toEqual([]);
    }
  });
});
