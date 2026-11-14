// Variáveis do componente (formatVersion 4, etapa #1504, VL1): o MCP aceita `let` e `$var` no
// `validate_library` (servidor real, por stdio) e o `render_marking` de um componente com variáveis
// sai igual ao do mesmo componente escrito à mão sem elas. Os erros dizem o nome e o caminho do uso.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applySpecialization,
  createProject,
  parseSpecText,
  serialize,
} from '../../src/model';
import { runBatch } from '../../mcp/batch';
import { decodeImage } from '../../mcp/image/codecs';
import type { Raster } from '../../mcp/image/raster';
import { Refs } from '../../mcp/items';
import type { Operation } from '../../mcp/operations';
import { Roots } from '../../mcp/paths';
import { findProject, loadProject, type LoadedProject } from '../../mcp/projects';
import { renderMarking } from '../../mcp/renderImage';
import { NOW } from '../model/fixtures';
import { ok } from './proposalSupport';
import { connect, type Connection } from './workspace';

const LAYER = 'cccccccc-0000-4000-8000-000000000001';

const SPEC = {
  format: 'mapping-spec',
  formatVersion: 15,
  id: 'lib',
  name: 'Lib',
  version: 1,
  layers: [
    {
      id: 'ui',
      name: 'UI',
      color: '#6750A4',
      annotationTypes: [
        { id: 'card', name: 'Card', component: 'components/card.json', fields: [] },
      ],
    },
  ],
};

const RED = '#D32F2F';
const BLUE = '#1976D2';

type Doc = Record<string, unknown>;

/** O mesmo componente escrito à mão, sem `let` nem `$var`. */
function byHand(): Doc {
  return {
    format: 'mapping-component',
    formatVersion: 4,
    id: 'card',
    name: 'Card',
    size: { width: 300, height: 120 },
    template: {
      type: 'frame',
      fill: '#FFFFFF',
      layout: { type: 'none' },
      children: [
        {
          type: 'frame',
          anchors: { left: 20, top: 20 },
          width: 110,
          height: 20,
          layout: { type: 'column' },
          children: [
            {
              type: 'repeat',
              count: 4,
              direction: 'row',
              gap: 10,
              template: {
                type: 'frame',
                width: 20,
                height: 20,
                fill: { $if: { $lt: [{ $field: '$index' }, 2] }, then: RED, else: BLUE },
              },
            },
          ],
        },
        {
          type: 'frame',
          anchors: { left: 170, top: 20 },
          width: 60,
          height: 40,
          layout: { type: 'none' },
          children: [
            {
              type: 'rect',
              anchors: { left: 0, top: 0 },
              width: 60,
              height: 40,
              fill: '#2E7D32',
            },
          ],
        },
        {
          type: 'rect',
          anchors: { left: 240, top: 20 },
          width: 40,
          height: 40,
          fill: '#FF9800',
        },
        {
          type: 'rect',
          anchors: { left: 0, top: 100 },
          width: { $mul: [{ $size: 'width' }, 0.5] },
          height: 10,
          fill: '#6A1B9A',
        },
      ],
    },
  };
}

let base: string;
let mcp: Connection;

const LET_SCRIPT = 'scripts/testing/let.mjs';

/** Grava `components/card.json` em `lib`: o dado, ou (`null`) o do `let.mjs` com o caso de erro, se houver. */
function writeCard(lib: string, card: Doc | null, kind?: string): void {
  mkdirSync(join(lib, 'components'), { recursive: true });
  if (card !== null) {
    writeFileSync(join(lib, 'components', 'card.json'), JSON.stringify(card));
    return;
  }
  const args: string[] = [LET_SCRIPT, lib];
  if (kind !== undefined) args.push(kind);
  execFileSync(process.execPath, args);
}

/** Um projeto em `<base>/<name>` com a biblioteca `lib` de um tipo `card`. */
function writeProject(name: string, card: Doc | null): void {
  const dir = join(base, name);
  const lib = join(dir, 'specs', 'lib');
  mkdirSync(lib, { recursive: true });
  writeFileSync(join(lib, 'lib.spec.json'), JSON.stringify(SPEC));
  writeCard(lib, card);
  const parsed = parseSpecText(readFileSync(join(lib, 'lib.spec.json'), 'utf8'));
  if (!parsed.ok) throw new Error(`spec inválida: ${JSON.stringify(parsed)}`);
  let p = createProject({
    name,
    now: NOW,
    firstLayer: { id: LAYER, name: 'Camada 1', color: '#D32F2F' },
  });
  p = applySpecialization(p, parsed.spec, { packageSpecName: 'lib.spec.json' });
  writeFileSync(join(dir, 'mapping.json'), serialize(p));
}

/** Uma cópia da biblioteca `lib` com o card do `let.mjs` (e o caso de erro), para o `validate_library`. */
function writeLibrary(name: string, kind?: string): void {
  const lib = join(base, 'bibliotecas', name);
  mkdirSync(lib, { recursive: true });
  writeFileSync(join(lib, 'lib.spec.json'), JSON.stringify(SPEC));
  writeCard(lib, null, kind);
}

const io = {
  readSource: () => Promise.reject(new Error('sem arquivos')),
  readSpecInput: () => Promise.reject(new Error('sem arquivos')),
  takenImageFiles: new Set<string>(),
  now: () => new Date(NOW),
};

const OPERATIONS: Operation[] = [
  { op: 'add_container', as: '$tela', width: 340, height: 160, background: '#FFFFFF' },
  {
    op: 'create_marking',
    as: '$card',
    container: '$tela',
    rect: { x: 20, y: 20, width: 300, height: 120 },
    annotation: { type: 'lib/card', values: {} },
  },
];

async function render(name: string) {
  const roots = new Roots([base]);
  const loaded: LoadedProject = await loadProject(roots, await findProject(roots, name));
  const result = await runBatch(loaded, OPERATIONS, io);
  expect(result.errors).toEqual([]);
  const refs = new Refs({ ...loaded, project: result.project });
  const marking = result.project.markings.find(
    (m) => m.id === (result.aliases.get('$card') as { id: string }).id,
  )!;
  const out = await renderMarking(roots, refs, marking, { padding: 0, zoom: 1 });
  return { out, raster: (await decodeImage(out.image.bytes)).raster };
}

const hex = (r: Raster, x: number, y: number): string => {
  const i = (y * r.width + x) * 4;
  return [0, 1, 2]
    .map((k) => r.data[i + k]!.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
};

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-let-'));
  writeProject('com-let', null);
  writeProject('sem-let', byHand());
  writeLibrary('valida');
  for (const kind of ['indefinida', 'ciclo', 'tipo', 'nome', 'v3'])
    writeLibrary(kind, kind);
  mcp = await connect([base]);
});

afterAll(async () => {
  await mcp?.close();
  rmSync(base, { recursive: true, force: true });
});

interface Validated {
  valid: boolean;
  errors: { file: string; path: string; message: string; severity: string }[];
  warnings: { message: string }[];
}

describe('validate_library com let e $var (servidor real)', () => {
  it('aceita a biblioteca com variáveis, sem erro nem aviso (nível 3)', async () => {
    const result = ok(
      await mcp.call<Validated>('validate_library', { path: 'bibliotecas/valida' }),
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it.each([
    ['indefinida', 'template.children[0].children[0].gap', 'undefined variable: space'],
    ['ciclo', 'template.let.a', 'variable cycle: a → b → a'],
    ['nome', 'template.let.Gap', 'expected a variable name ([a-z][a-zA-Z0-9]*)'],
    [
      'tipo',
      'template.children[0].children[0].gap.$var(gap).$mul[0]',
      'must be a number',
    ],
  ])('%s: o erro e o caminho do uso', async (name, path, message) => {
    const result = ok(
      await mcp.call<Validated>('validate_library', { path: `bibliotecas/${name}` }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      { file: 'components/card.json', path, message, severity: 'error' },
    ]);
  });

  it('v3: cada let e $var é só permitido com formatVersion 4', async () => {
    const result = ok(
      await mcp.call<Validated>('validate_library', { path: 'bibliotecas/v3' }),
    );
    expect(result.valid).toBe(false);
    const paths = result.errors.map((e) => e.path);
    expect(paths).toContain('template.let');
    expect(paths).toContain('template.children[0].children[0].template.let');
    expect(paths).toContain('template.children[0].children[0].gap');
    expect(result.errors.every((e) => e.message.includes('formatVersion 4'))).toBe(true);
  });
});

describe('get_component de um componente com let e $var', () => {
  it('mostra o arquivo como está, com let e $var (a troca é só na leitura do desenho)', async () => {
    const got = ok(
      await mcp.call<{ component: { template: Doc } | null }>('get_component', {
        path: 'bibliotecas/valida',
        type: 'card',
      }),
    );
    const template = got.component?.template as Doc;
    expect(Object.keys(template.let as Doc)).toEqual(['gap', 'tone', 'dot', 'half']);
    expect(JSON.stringify(got.component)).toContain('{"$var":"gap"}');
  });
});

describe('render_marking de um componente com let e $var', () => {
  it('o PNG é igual ao do componente escrito sem variáveis', async () => {
    const withVars = await render('com-let');
    const without = await render('sem-let');
    expect(withVars.out.json).toMatchObject({ width: 300, height: 120 });
    expect(
      Buffer.from(withVars.out.image.bytes).equals(Buffer.from(without.out.image.bytes)),
    ).toBe(true);
  });

  it('o $index é o da linha do uso, o de dentro esconde o de fora e $size vale o da instância', async () => {
    const { raster } = await render('com-let');
    // os quadrados de 20 a partir de (20, 20), vão 10: vermelho, vermelho, azul, azul
    expect([30, 60, 90, 120].map((x) => hex(raster, x, 30))).toEqual([
      'D32F2F',
      'D32F2F',
      '1976D2',
      '1976D2',
    ]);
    expect(hex(raster, 45, 30)).toBe('FFFFFF'); // o vão de 10 (a variável gap)
    expect(hex(raster, 200, 40)).toBe('2E7D32'); // a tone do quadro de dentro
    expect(hex(raster, 260, 40)).toBe('FF9800'); // a tone da raiz
    expect(hex(raster, 100, 105)).toBe('6A1B9A'); // a barra: metade de 300
    expect(hex(raster, 160, 105)).toBe('FFFFFF');
  });
});
