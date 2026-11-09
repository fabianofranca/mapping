import { cpSync, mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it, vi } from 'vitest';
import {
  applySpecialization,
  createProject,
  parseSpecText,
  serialize,
} from '../../src/model';
import { NOW } from '../model/fixtures';

// `loadProject` (decisão 7 da etapa): o `mapping.json` é interpretado uma vez; o catálogo e as
// fontes ficam em cache por caminho, tamanho e `mtime`; `list_projects` não interpreta fontes.
const fontBooks = vi.hoisted(() => ({ created: 0 }));

vi.mock('../../mcp/image/textMeasurer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../mcp/image/textMeasurer')>();
  return {
    ...actual,
    createFontBook: (...args: Parameters<typeof actual.createFontBook>) => {
      fontBooks.created += 1;
      return actual.createFontBook(...args);
    },
  };
});

const { Roots } = await import('../../mcp/paths');
const { findProject, loadProject } = await import('../../mcp/projects');
const { createServer } = await import('../../mcp/server');

const LAYER = 'cccccccc-0000-4000-8000-000000000001';

const spec = {
  format: 'mapping-spec',
  formatVersion: 15,
  id: 'lib',
  name: 'Lib',
  version: 1,
  fonts: [{ family: 'Acme', file: 'fonts/Acme.ttf' }],
  layers: [
    {
      id: 'ui',
      name: 'UI',
      color: '#6750A4',
      annotationTypes: [
        { id: 'btn', name: 'Botão', component: 'components/btn.json', fields: [] },
      ],
    },
  ],
};

const component = (width: number) => ({
  format: 'mapping-component',
  formatVersion: 4,
  id: 'btn',
  name: 'btn',
  size: { width, height: 40 },
  template: { type: 'frame', layout: { type: 'row' }, children: [] },
});

function workspace() {
  const base = mkdtempSync(join(tmpdir(), 'mapping-cache-'));
  const dir = join(base, 'telas');
  const lib = join(dir, 'specs', 'lib');
  mkdirSync(join(lib, 'components'), { recursive: true });
  mkdirSync(join(lib, 'fonts'), { recursive: true });
  writeFileSync(join(lib, 'lib.spec.json'), JSON.stringify(spec));
  writeFileSync(join(lib, 'components', 'btn.json'), JSON.stringify(component(120)));
  cpSync('mcp/fonts/MappingMono-Bold.ttf', join(lib, 'fonts', 'Acme.ttf'));
  const parsed = parseSpecText(JSON.stringify(spec));
  if (!parsed.ok) throw new Error(`spec inválida: ${JSON.stringify(parsed)}`);
  const project = applySpecialization(
    createProject({
      name: 'Telas',
      now: NOW,
      firstLayer: { id: LAYER, name: 'Camada 1', color: '#D32F2F' },
    }),
    parsed.spec,
    { packageSpecName: 'lib.spec.json' },
  );
  writeFileSync(join(dir, 'mapping.json'), serialize(project));
  return { base, dir, lib, roots: new Roots([base]) };
}

describe('loadProject: cache e leitura única', () => {
  it('interpreta o mapping.json uma vez', async () => {
    const { dir, roots } = workspace();
    const location = await findProject(roots, 'telas');
    const text = (await import('node:fs')).readFileSync(
      join(dir, 'mapping.json'),
      'utf8',
    );
    const parse = vi.spyOn(JSON, 'parse');
    try {
      await loadProject(roots, location);
      expect(parse.mock.calls.filter(([arg]) => arg === text)).toHaveLength(1);
    } finally {
      parse.mockRestore();
    }
  });

  it('reaproveita o catálogo e as fontes quando nada mudou no disco', async () => {
    const { roots } = workspace();
    const location = await findProject(roots, 'telas');
    const first = await loadProject(roots, location);
    const second = await loadProject(roots, location);
    expect(second.fonts).toBe(first.fonts);
    expect(second.catalog.get('lib')).toBe(first.catalog.get('lib'));
  });

  it('vê o componente e a fonte trocados no disco', async () => {
    const { lib, roots } = workspace();
    const location = await findProject(roots, 'telas');
    const first = await loadProject(roots, location);
    const oldFont = first.fonts!.fontFor('Acme', 400, false);

    // Outro tamanho de arquivo e `mtime` diferente: o cache não vale mais.
    const later = new Date(Date.now() + 60_000);
    writeFileSync(
      join(lib, 'components', 'btn.json'),
      JSON.stringify(component(200), null, 2),
    );
    cpSync('mcp/fonts/MappingSans-Regular.ttf', join(lib, 'fonts', 'Acme.ttf'));
    utimesSync(join(lib, 'components', 'btn.json'), later, later);
    utimesSync(join(lib, 'fonts', 'Acme.ttf'), later, later);

    const second = await loadProject(roots, location);
    expect(second.catalog.get('lib')).not.toBe(first.catalog.get('lib'));
    expect(JSON.stringify(second.catalog.get('lib')!.byType.get('btn'))).toContain(
      '"width":200',
    );
    expect(second.fonts).not.toBe(first.fonts);
    expect(second.fonts!.fontFor('Acme', 400, false)).not.toBe(oldFont);
  });

  it('list_projects não interpreta as fontes', async () => {
    const { base } = workspace();
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await createServer({ roots: [base] }).connect(serverSide);
    const client = new Client({ name: 'teste', version: '0' });
    await client.connect(clientSide);
    const before = fontBooks.created;
    const result = await client.callTool({ name: 'list_projects', arguments: {} });
    const text = (result.content as { text: string }[])[0]!.text;
    expect(JSON.parse(text).projects).toHaveLength(1);
    expect(fontBooks.created).toBe(before);
    await client.close();
  });
});
