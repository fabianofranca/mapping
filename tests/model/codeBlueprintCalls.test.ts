// `calls`, `formats`, paths and positionals in `code` (formatVersion 16; stage #1079, S1):
// `codeBlueprint` builds the nested, formatted and positional `params`; `resolveCode` applies the
// `calls` of the `variants` case. Without the new keys (or on a v15), nothing changes.
import { describe, expect, it } from 'vitest';
import {
  addContainer,
  addTypedAnnotation,
  applySpecialization,
  codeBlueprint,
  createMarking,
  parseSpec,
  resolveCode,
  setFieldValue,
  type BlueprintAnnotation,
  type Project,
  type SpecCode,
} from '../../src/model';
import { blueprintParams } from '../../src/model/codeArgs';
import type { SpecField } from '../../src/model/spec';
import { emptyProject } from './fixtures';
import { idGen, layerOf } from './specFixtures';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const BUTTON_COLORS = 'androidx.compose.material3.ButtonDefaults.buttonColors';
const OUTLINED_COLORS = 'androidx.compose.material3.ButtonDefaults.outlinedButtonColors';

function specJson(formatVersion: number, edit?: (code: Json) => void): Json {
  const code: Json = {
    symbol: 'androidx.compose.material3.Button',
    path: 'compose/Button.kt',
    calls: { colors: BUTTON_COLORS },
    formats: { width: '{value}.dp', size: '{value}.sp' },
    params: {
      title: '#0',
      containerColor: 'colors.containerColor',
      contentColor: 'colors.contentColor',
      width: 'width',
      size: 'fontSize',
      style: 'kind',
    },
    values: { style: { filled: 'Kind.Filled' } },
    variants: {
      field: 'style',
      cases: {
        outlined: {
          symbol: 'androidx.compose.material3.OutlinedButton',
          calls: { colors: OUTLINED_COLORS },
        },
      },
    },
  };
  edit?.(code);
  if (formatVersion < 16) {
    delete code.calls;
    delete code.formats;
    delete code.variants.cases.outlined.calls;
  }
  return {
    format: 'mapping-spec',
    formatVersion,
    id: 'm3',
    name: 'M3',
    version: 1,
    platforms: [{ id: 'compose', name: 'Compose', language: 'kotlin' }],
    layers: [
      {
        id: 'ui',
        name: 'UI',
        color: '#1E88E5',
        annotationTypes: [
          {
            id: 'button',
            name: 'Button',
            fields: [
              { key: 'title', type: 'string' },
              { key: 'containerColor', type: 'string' },
              { key: 'contentColor', type: 'string' },
              { key: 'width', type: 'number' },
              { key: 'size', type: 'number' },
              {
                key: 'style',
                type: 'enum',
                options: ['filled', 'outlined'],
                default: 'filled',
              },
            ],
            code: { compose: code },
          },
        ],
      },
    ],
  };
}

function projectWith(
  values: Record<string, string | number>,
  formatVersion = 16,
  edit?: (code: Json) => void,
): Project {
  const parsed = parseSpec(specJson(formatVersion, edit));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  let p = applySpecialization(emptyProject(), parsed.spec, { newId: idGen('LV') });
  p = addContainer(p, { id: 'I1', file: 'images/a.png', width: 1000, height: 1000 });
  p = createMarking(p, {
    id: 'MB',
    containerId: 'I1',
    rect: { x: 0, y: 0, width: 50, height: 50 },
    name: 'B',
  });
  p = addTypedAnnotation(p, {
    id: 'B',
    markingId: 'MB',
    layerId: layerOf(p, 'm3', 'ui'),
    type: { specId: 'm3', typeId: 'button' },
  });
  for (const [key, value] of Object.entries(values))
    p = setFieldValue(p, 'B', key, value);
  return p;
}

function annotationOf(p: Project): BlueprintAnnotation {
  const a = codeBlueprint(p, 'MB', 'compose').root.annotations[0];
  if (!a) throw new Error('no annotation');
  return a;
}

describe('codeBlueprint with calls, formats, paths and positionals (v16)', () => {
  it('colors = ButtonDefaults.buttonColors(containerColor = …) only with a filled field of the factory', () => {
    const a = annotationOf(projectWith({ containerColor: 'primary' }));
    expect(a.params).toEqual([
      { key: 'title', name: '#0', position: 0, value: null },
      {
        key: 'colors',
        name: 'colors',
        call: BUTTON_COLORS,
        value: null,
        args: [{ key: 'containerColor', name: 'containerColor', value: 'primary' }],
      },
      { key: 'width', name: 'width', value: null },
      { key: 'size', name: 'fontSize', value: null },
      { key: 'style', name: 'kind', value: 'Kind.Filled' },
    ]);
  });

  it('the factory takes only the filled fields, in the order of the type fields', () => {
    const a = annotationOf(
      projectWith({ contentColor: 'onPrimary', containerColor: 'primary' }),
    );
    const colors = a.params.find((param) => param.name === 'colors');
    expect(colors?.args?.map((arg) => arg.name)).toEqual([
      'containerColor',
      'contentColor',
    ]);
  });

  it('nothing from the factory when all its fields are empty', () => {
    const a = annotationOf(projectWith({ width: 16 }));
    expect(a.params.map((param) => param.name)).toEqual([
      '#0',
      'width',
      'fontSize',
      'kind',
    ]);
    expect(a.params.some((param) => param.call !== undefined)).toBe(false);
  });

  it('formats: 16.dp in the field value; empty stays empty', () => {
    const a = annotationOf(projectWith({ width: 16, size: 14 }));
    expect(a.params.filter((p) => p.key === 'width' || p.key === 'size')).toEqual([
      { key: 'width', name: 'width', value: '16.dp' },
      { key: 'size', name: 'fontSize', value: '14.sp' },
    ]);
    const empty = annotationOf(projectWith({ title: 'x' }));
    expect(empty.params.find((p) => p.key === 'width')?.value).toBeNull();
  });

  it('the template comes after the enum translation in values', () => {
    const a = annotationOf(
      projectWith({ style: 'filled' }, 16, (code) => {
        code.formats = { style: 'Style({value})' };
      }),
    );
    expect(a.params.find((p) => p.key === 'style')?.value).toBe('Style(Kind.Filled)');
  });

  it('positional: #0 becomes the unnamed argument, at its position', () => {
    const a = annotationOf(projectWith({ title: 'OK' }));
    expect(a.params[0]).toEqual({ key: 'title', name: '#0', position: 0, value: 'OK' });
  });

  it('the calls of the variants case replaces the base one', () => {
    const a = annotationOf(projectWith({ containerColor: 'primary', style: 'outlined' }));
    const colors = a.params.find((param) => param.name === 'colors');
    expect(colors?.call).toBe(OUTLINED_COLORS);
    expect(a.symbol).toBe('androidx.compose.material3.OutlinedButton');
  });

  it("on a v15 the params are opaque texts: the output is today's", () => {
    const a = annotationOf(
      projectWith({ title: 'OK', containerColor: 'primary', width: 16 }, 15),
    );
    expect(a.params).toEqual([
      { key: 'title', name: '#0', value: 'OK' },
      { key: 'containerColor', name: 'colors.containerColor', value: 'primary' },
      { key: 'contentColor', name: 'colors.contentColor', value: null },
      { key: 'width', name: 'width', value: 16 },
      { key: 'size', name: 'fontSize', value: null },
      { key: 'style', name: 'kind', value: 'Kind.Filled' },
    ]);
  });
});

describe('resolveCode with the new keys', () => {
  const base: SpecCode = {
    symbol: 'B',
    signature: 'signatures/b.json',
    ignore: ['modifier'],
    calls: { colors: 'X.colors', elevation: 'X.elevation' },
    formats: { width: '{value}.dp' },
    variants: {
      field: 'kind',
      cases: {
        outlined: {
          signature: 'signatures/b.outlined.json',
          ignore: ['shape'],
          calls: { colors: 'X.outlinedColors' },
          formats: { height: '{value}.dp' },
        },
      },
    },
  };

  it('the calls of the case replace the base ones key by key; the formats add up', () => {
    const resolved = resolveCode(base, { kind: 'outlined' }, [
      { key: 'kind', type: 'enum', options: ['filled', 'outlined'] } as never,
    ]);
    expect(resolved.calls).toEqual({
      colors: 'X.outlinedColors',
      elevation: 'X.elevation',
    });
    expect(resolved.formats).toEqual({ width: '{value}.dp', height: '{value}.dp' });
    expect(resolved.signature).toBe('signatures/b.outlined.json');
    expect(resolved.ignore).toEqual(['shape']);
  });

  it('without an applied case, the base stays as is (without variants)', () => {
    const resolved = resolveCode(base, { kind: 'filled' }, [
      { key: 'kind', type: 'enum', options: ['filled', 'outlined'] } as never,
    ]);
    expect(resolved.calls).toEqual(base.calls);
    expect(resolved.signature).toBe('signatures/b.json');
    expect(resolved.variants).toBeUndefined();
  });
});

describe('codeBlueprint: a key inherited from Object is not a factory', () => {
  it('"constructor.x" without a factory of that name is a plain-named parameter', () => {
    const fields = [{ key: 'x', type: 'string' }] as unknown as SpecField[];
    const code = {
      symbol: 'S',
      calls: { colors: 'S.colors' },
      params: { x: 'constructor.y' },
    } as SpecCode;
    expect(blueprintParams(fields, code, 16, () => 'v')).toEqual([
      { key: 'x', name: 'constructor.y', value: 'v' },
    ]);
  });
});
