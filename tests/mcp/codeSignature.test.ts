import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addContainer,
  addTypedAnnotation,
  applySpecialization,
  createMarking,
  parseSpec,
  serialize,
  setFieldValue,
} from '../../src/model';
import { emptyProject } from '../model/fixtures';
import { idGen, layerOf } from '../model/specFixtures';
import { buttonSignature } from '../model/signatures/fixtures';
import { PNG_1X1, allIds, uuidFor, withUuids } from './workspace';
import { connect, type Connection } from './workspace';

// `get_code_hints` e as vistas do `code` com `calls`, `formats`, caminhos, posicionais e o
// `unmapped` da ficha (formatVersion 16; etapa #1079, S1), pelo dist-mcp/mapping-mcp.js por stdio.
// O servidor lê só a ficha (JSON) do pacote, nunca o código.

type Doc = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const COLORS = 'androidx.compose.material3.ButtonDefaults.buttonColors';

function specJson(): Doc {
  return {
    format: 'mapping-spec',
    formatVersion: 16,
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
              { key: 'width', type: 'number' },
            ],
            code: {
              compose: {
                symbol: 'androidx.compose.material3.Button',
                path: 'compose/Button.kt',
                signature: 'signatures/button.compose.json',
                ignore: ['modifier'],
                calls: { colors: COLORS },
                formats: { width: '{value}.dp' },
                params: {
                  title: '#0',
                  containerColor: 'colors.containerColor',
                  width: 'width',
                },
              },
            },
          },
          {
            id: 'badge',
            name: 'Badge',
            fields: [{ key: 'text', type: 'string' }],
            code: { compose: { symbol: 'androidx.compose.material3.Badge' } },
          },
        ],
      },
    ],
  };
}

interface Arg {
  field?: string;
  name?: string;
  position?: number;
  call?: string;
  value?: unknown;
  args?: Arg[];
}
interface Hints {
  types: Record<
    string,
    {
      symbol: string;
      calls?: Record<string, string>;
      unmapped?: Record<string, unknown>[];
    }
  >;
  tree: { annotations?: { args?: Arg[] }[] };
}

let base: string;
let mcp: Connection;
let markingRef: string;
let annotationRef: string;

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-mcp-sig-'));
  const dir = join(base, 'proj');
  mkdirSync(join(dir, 'images'), { recursive: true });
  mkdirSync(join(dir, 'specs', 'm3', 'signatures'), { recursive: true });
  const parsed = parseSpec(specJson());
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
  p = setFieldValue(p, 'B', 'title', 'OK');
  p = setFieldValue(p, 'B', 'containerColor', 'primary');
  p = setFieldValue(p, 'B', 'width', 16);
  const doc = JSON.parse(withUuids(serialize(p), [...allIds(p)])) as Doc;
  doc.specializations[0].file = 'specs/m3/m3.spec.json';
  writeFileSync(join(dir, 'mapping.json'), `${JSON.stringify(doc, null, 2)}\n`);
  writeFileSync(join(dir, 'images', 'a.png'), PNG_1X1);
  writeFileSync(join(dir, 'specs', 'm3', 'm3.spec.json'), JSON.stringify(specJson()));
  const signature = buttonSignature((s) => {
    s.params.push({
      name: 'title',
      label: '_',
      role: 'value',
      type: 'String',
      value: { kind: 'text' },
    });
  });
  writeFileSync(
    join(dir, 'specs', 'm3', 'signatures', 'button.compose.json'),
    JSON.stringify(signature),
  );
  mcp = await connect([base]);
  markingRef = `mapping://proj/m/${uuidFor('MB').replaceAll('-', '').slice(0, 8)}`;
  annotationRef = `mapping://proj/a/${uuidFor('B').replaceAll('-', '').slice(0, 8)}`;
});

afterAll(async () => {
  await mcp.close();
  rmSync(base, { recursive: true, force: true });
});

describe('get_code_hints com calls, formats, posicionais e unmapped', () => {
  it('monta a fábrica só com o campo preenchido, o 16.dp e o argumento posicional', async () => {
    const { data, isError } = await mcp.call<Hints>('get_code_hints', {
      ref: markingRef,
      platform: 'compose',
    });
    expect(isError).toBe(false);
    const args = data.tree.annotations?.[0]?.args;
    expect(args).toEqual([
      { field: 'title', position: 0, value: 'OK' },
      {
        name: 'colors',
        call: COLORS,
        args: [{ field: 'containerColor', name: 'containerColor', value: 'primary' }],
      },
      { field: 'width', name: 'width', value: '16.dp' },
    ]);
  });

  it('types traz o calls e o unmapped da ficha (sem o ignore e sem o que tem campo)', async () => {
    const { data } = await mcp.call<Hints>('get_code_hints', {
      ref: markingRef,
      platform: 'compose',
    });
    const type = data.types['m3/button'];
    expect(type?.calls).toEqual({ colors: COLORS });
    expect(type?.unmapped).toEqual([
      { name: 'onClick', role: 'callback', type: '() -> Unit', required: true },
      {
        name: 'enabled',
        role: 'value',
        type: 'Boolean',
        required: false,
        default: 'true',
      },
      {
        name: 'shape',
        role: 'value',
        type: 'Shape',
        required: false,
        default: 'ButtonDefaults.shape',
      },
      {
        name: 'content',
        role: 'slot',
        type: '@Composable RowScope.() -> Unit',
        required: true,
      },
    ]);
  });

  it('get_annotation traz o code com o unmapped', async () => {
    const { data } = await mcp.call<{ code?: Record<string, { unmapped?: unknown[] }> }>(
      'get_annotation',
      { ref: annotationRef },
    );
    expect(data.code?.compose?.unmapped).toHaveLength(4);
  });
});
