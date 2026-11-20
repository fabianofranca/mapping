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

// `get_code_hints` and the `code` views with `calls`, `formats`, paths, positionals and the
// `unmapped` of the sheet (formatVersion 16; stage #1079, S1), through dist-mcp/mapping-mcp.js over stdio.
// The server reads only the sheet (JSON) of the package, never the code.

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
            id: 'topbar',
            name: 'Top app bar',
            fields: [
              { key: 'title', type: 'string' },
              { key: 'subtitle', type: 'string' },
              {
                key: 'style',
                type: 'enum',
                options: ['small', 'center'],
                default: 'small',
              },
            ],
            code: {
              compose: {
                symbol: 'androidx.compose.material3.TopAppBar',
                path: 'compose/TopAppBar.kt',
                signature: 'signatures/topbar.compose.json',
                params: { title: 'title', subtitle: 'subtitle' },
                variants: {
                  field: 'style',
                  cases: {
                    center: {
                      symbol: 'androidx.compose.material3.CenterAlignedTopAppBar',
                      path: 'compose/CenterAlignedTopAppBar.kt',
                      signature: 'signatures/topbar.center.compose.json',
                    },
                  },
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
let centerRef: string;
let smallRef: string;
let centerAnnotationRef: string;

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
  for (const [id, style] of [
    ['TC', 'center'],
    ['TS', 'small'],
  ] as const) {
    p = createMarking(p, {
      id: `M${id}`,
      containerId: 'I1',
      rect: { x: 100, y: 0, width: 50, height: 50 },
      name: id,
    });
    p = addTypedAnnotation(p, {
      id,
      markingId: `M${id}`,
      layerId: layerOf(p, 'm3', 'ui'),
      type: { specId: 'm3', typeId: 'topbar' },
    });
    p = setFieldValue(p, id, 'title', 'Home');
    p = setFieldValue(p, id, 'subtitle', 'Sub');
    p = setFieldValue(p, id, 'style', style);
  }
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
  const topbarSheet = (symbol: string, path: string, names: string[]) => ({
    format: 'mapping-signature',
    formatVersion: 1,
    source: {
      kind: 'code',
      platform: 'compose',
      language: 'kotlin',
      symbol,
      path,
      extractor: 'agent',
    },
    params: names.map((name) => ({
      name,
      role: 'value',
      type: 'String',
      value: { kind: 'text' },
    })),
  });
  writeFileSync(
    join(dir, 'specs', 'm3', 'signatures', 'topbar.compose.json'),
    JSON.stringify(
      topbarSheet('androidx.compose.material3.TopAppBar', 'compose/TopAppBar.kt', [
        'title',
        'subtitle',
      ]),
    ),
  );
  writeFileSync(
    join(dir, 'specs', 'm3', 'signatures', 'topbar.center.compose.json'),
    JSON.stringify(
      topbarSheet(
        'androidx.compose.material3.CenterAlignedTopAppBar',
        'compose/CenterAlignedTopAppBar.kt',
        ['title'],
      ),
    ),
  );
  mcp = await connect([base]);
  centerRef = `mapping://proj/m/${uuidFor('MTC').replaceAll('-', '').slice(0, 8)}`;
  smallRef = `mapping://proj/m/${uuidFor('MTS').replaceAll('-', '').slice(0, 8)}`;
  centerAnnotationRef = `mapping://proj/a/${uuidFor('TC').replaceAll('-', '').slice(0, 8)}`;
  markingRef = `mapping://proj/m/${uuidFor('MB').replaceAll('-', '').slice(0, 8)}`;
  annotationRef = `mapping://proj/a/${uuidFor('B').replaceAll('-', '').slice(0, 8)}`;
});

afterAll(async () => {
  await mcp.close();
  rmSync(base, { recursive: true, force: true });
});

describe('get_code_hints with calls, formats, positionals and unmapped', () => {
  it('builds the factory only with the filled field, the 16.dp and the positional argument', async () => {
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

  it('types brings the calls and the unmapped of the sheet (without the ignore and without what has a field)', async () => {
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

  it('get_annotation brings the code with the unmapped', async () => {
    const { data } = await mcp.call<{ code?: Record<string, { unmapped?: unknown[] }> }>(
      'get_annotation',
      { ref: annotationRef },
    );
    expect(data.code?.compose?.unmapped).toHaveLength(4);
  });
});

describe('a variants case no longer inherits base params its sheet lacks', () => {
  interface Node {
    annotations?: {
      args?: Arg[];
      values?: Record<string, unknown>;
      code?: { symbol: string; params?: Record<string, string> };
    }[];
  }

  it('get_code_hints: the center case has no arg or code.params entry for the subtitle; the value stays in values', async () => {
    const { data, isError } = await mcp.call<{ tree: Node }>('get_code_hints', {
      ref: centerRef,
      platform: 'compose',
    });
    expect(isError).toBe(false);
    const annotation = data.tree.annotations?.[0];
    expect(annotation?.args).toEqual([{ field: 'title', name: 'title', value: 'Home' }]);
    expect(annotation?.code?.symbol).toBe(
      'androidx.compose.material3.CenterAlignedTopAppBar',
    );
    expect(annotation?.code?.params).toEqual({ title: 'title' });
    expect(annotation?.values).toMatchObject({ subtitle: 'Sub' });
  });

  it('get_code_hints: the small one (the base, no case) keeps the subtitle', async () => {
    const { data } = await mcp.call<{ tree: Node }>('get_code_hints', {
      ref: smallRef,
      platform: 'compose',
    });
    expect(data.tree.annotations?.[0]?.args).toEqual([
      { field: 'title', name: 'title', value: 'Home' },
      { field: 'subtitle', name: 'subtitle', value: 'Sub' },
    ]);
  });

  it('get_annotation: the resolved code.params of the center case has no subtitle', async () => {
    const { data } = await mcp.call<{
      code?: Record<string, { symbol: string; params?: Record<string, string> }>;
    }>('get_annotation', { ref: centerAnnotationRef });
    expect(data.code?.compose?.symbol).toBe(
      'androidx.compose.material3.CenterAlignedTopAppBar',
    );
    expect(data.code?.compose?.params).toEqual({ title: 'title' });
  });
});
