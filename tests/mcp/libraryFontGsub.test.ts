import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applySpecialization,
  createProject,
  parseSpecText,
  serialize,
} from '../../src/model';
import { runBatch } from '../../mcp/batch';
import { Roots } from '../../mcp/paths';
import { findProject, loadProject } from '../../mcp/projects';
import { createServer } from '../../mcp/server';
import { createMeasurer } from '../../mcp/image/textMeasurer';
import { NOW } from '../model/fixtures';

// Stage #2089 (FM1), stage #2121 (HB2): a project whose library cites a font with chaining and contextual GSUB
// subtables (which `opentype.js` could not apply) is read, planned and drawn through the MCP without
// `internal-error`, shaped by HarfBuzz. The font is the one `scripts/testing/gsub-font.mjs` writes (a copy of Mapping
// Sans with a type 6 format 2 and a type 3 format 1 subtable, and a ligature `ii` → `m`).

const LAYER = 'cccccccc-0000-4000-8000-000000000001';

const spec = {
  format: 'mapping-spec',
  formatVersion: 15,
  id: 'lib',
  name: 'Lib',
  version: 1,
  fonts: [{ family: 'Gsub', file: 'fonts/Gsub.ttf' }],
  layers: [
    {
      id: 'ui',
      name: 'UI',
      color: '#6750A4',
      annotationTypes: [
        {
          id: 'label',
          name: 'Label',
          component: 'components/label.json',
          fields: [{ key: 'label', type: 'string', default: 'fit with ii' }],
        },
      ],
    },
  ],
};

const component = {
  format: 'mapping-component',
  formatVersion: 4,
  id: 'label',
  name: 'label',
  size: { width: 160, height: 40 },
  template: {
    type: 'frame',
    layout: { type: 'row' },
    children: [
      {
        type: 'text',
        name: 'label',
        text: { $field: 'label', default: 'fit with ii' },
        width: 'fill',
        height: 'fill',
        font: { size: 14, lineHeight: 20, family: 'Gsub' },
        color: '#000000',
      },
    ],
  },
};

let base: string;
let client: Client;
/** The reference of the screen the project is seeded with. */
let screen: string;

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-gsub-'));
  const dir = join(base, 'screens');
  const lib = join(dir, 'specs', 'lib');
  mkdirSync(join(lib, 'components'), { recursive: true });
  mkdirSync(join(lib, 'fonts'), { recursive: true });
  mkdirSync(join(dir, 'images'), { recursive: true });
  writeFileSync(join(lib, 'lib.spec.json'), JSON.stringify(spec));
  writeFileSync(join(lib, 'components', 'label.json'), JSON.stringify(component));
  execFileSync('node', ['scripts/testing/gsub-font.mjs', join(lib, 'fonts', 'Gsub.ttf')]);
  const parsed = parseSpecText(JSON.stringify(spec));
  if (!parsed.ok) throw new Error(`invalid spec: ${JSON.stringify(parsed)}`);
  let p = createProject({
    name: 'Screens',
    now: NOW,
    firstLayer: { id: LAYER, name: 'Layer 1', color: '#D32F2F' },
  });
  p = applySpecialization(p, parsed.spec, { packageSpecName: 'lib.spec.json' });
  writeFileSync(join(dir, 'mapping.json'), serialize(p));
  // A marking of the component already in the project: reading it measures with the font.
  const roots = new Roots([base]);
  const loaded = await loadProject(roots, await findProject(roots, 'screens'));
  const seeded = await runBatch(
    loaded,
    [
      {
        op: 'add_container',
        as: '$screen',
        width: 300,
        height: 200,
        background: '#FFFFFF',
      },
      {
        op: 'create_marking',
        container: '$screen',
        rect: { x: 10, y: 10, width: 160, height: 40 },
        annotation: { type: 'lib/label' },
      },
    ],
    {
      readSource: () => Promise.reject(new Error('no files')),
      readSpecInput: () => Promise.reject(new Error('no files')),
      takenImageFiles: new Set<string>(),
      now: () => new Date(NOW),
    },
  );
  expect(seeded.errors).toEqual([]);
  writeFileSync(join(dir, 'mapping.json'), serialize(seeded.project));
  screen = `mapping://screens/i/${seeded.project.containers[0]!.id.replaceAll('-', '').slice(0, 8)}`;
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer({ roots: [base] }).connect(serverSide);
  client = new Client({ name: 'test', version: '0' });
  await client.connect(clientSide);
});

afterAll(async () => {
  await client.close();
  rmSync(base, { recursive: true, force: true });
});

interface Reply {
  isError: boolean;
  text: string;
  data: Record<string, unknown>;
  image: boolean;
}

async function call(name: string, args: Record<string, unknown>): Promise<Reply> {
  const result = await client.callTool({ name, arguments: args });
  const content = result.content as { type: string; text?: string }[];
  const text = content.find((c) => c.type === 'text')?.text ?? '';
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Not JSON: the text stays in `text`.
  }
  return {
    isError: result.isError === true,
    text,
    data,
    image: content.some((c) => c.type === 'image'),
  };
}

describe('a library font with chaining and contextual GSUB subtables', () => {
  it('get_project reads the project', async () => {
    const reply = await call('get_project', { project: 'screens' });
    expect(reply.text).not.toContain('internal-error');
    expect(reply.isError).toBe(false);
    expect(reply.data).toMatchObject({ name: 'screens' });
  });

  it('plan_changes creates a component marking with text in that font', async () => {
    const reply = await call('plan_changes', {
      project: 'screens',
      operations: [
        {
          op: 'create_marking',
          container: screen,
          rect: { x: 10, y: 80, width: 200, height: 40 },
          annotation: { type: 'lib/label', values: { label: 'Hamburgefonstiv ii' } },
        },
      ],
    });
    expect(reply.text).not.toContain('internal-error');
    expect(reply.isError).toBe(false);
    expect(reply.data.errors).toBeUndefined();
    expect(reply.data.valid).toBe(true);
  });

  it('render_container draws the screen', async () => {
    const reply = await call('render_container', {
      ref: screen,
    });
    expect(reply.text).not.toContain('internal-error');
    expect(reply.isError).toBe(false);
    expect(reply.image).toBe(true);
  });
});

describe('the server shapes with the library font', () => {
  it('`ii` measures as `m` (the ligature applies) and nothing is skipped', () => {
    const file = new Uint8Array(
      readFileSync(join(base, 'screens/specs/lib/fonts/Gsub.ttf')),
    );
    const measure = createMeasurer([
      {
        family: 'Gsub',
        weight: '400',
        style: 'normal',
        path: 'fonts/Gsub.ttf',
        bytes: file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
      },
    ]);
    const font = {
      family: 'Gsub',
      size: 14,
      weight: 400,
      italic: false,
      lineHeight: 20,
      letterSpacing: 0,
    };
    expect(measure('ii', font).width).toBeCloseTo(measure('m', font).width, 6);
  });
});
