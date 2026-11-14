import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addContainer,
  applySpecialization,
  createProject,
  parseSpecText,
  serialize,
} from '../../src/model';
import { runBatch, type BatchResult } from '../../mcp/batch';
import type { Operation } from '../../mcp/operations';
import { Roots } from '../../mcp/paths';
import { findProject, loadProject, type LoadedProject } from '../../mcp/projects';
import { NOW } from '../model/fixtures';

// CL1, achado 1.2 (#1890): `dropdown-menu` criado ancorado e sem `rect` nasce no tamanho do desenho
// com as linhas que o próprio lote informa (a tabela `items`), não no do menu vazio (112 × 16).

const LIBRARY = resolve('libraries/material3-compose');
const IMAGE = 'bbbbbbbb-0000-4000-8000-000000000001';
const LAYER = 'cccccccc-0000-4000-8000-000000000001';

let base: string;
let loaded: LoadedProject;

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-anchor-table-'));
  const dir = join(base, 'telas');
  mkdirSync(join(dir, 'specs'), { recursive: true });
  cpSync(LIBRARY, join(dir, 'specs', 'material3-compose'), { recursive: true });
  const parsed = parseSpecText(
    readFileSync(join(LIBRARY, 'material3-compose.spec.json'), 'utf8'),
  );
  if (!parsed.ok) throw new Error('material3-compose inválida');
  let p = createProject({
    name: 'Telas',
    now: NOW,
    firstLayer: { id: LAYER, name: 'Camada 1', color: '#D32F2F' },
  });
  p = addContainer(p, { id: IMAGE, file: 'images/foto.png', width: 420, height: 560 });
  p = applySpecialization(p, parsed.spec, {
    packageSpecName: 'material3-compose.spec.json',
  });
  writeFileSync(join(dir, 'mapping.json'), serialize(p));
  const roots = new Roots([base]);
  loaded = await loadProject(roots, await findProject(roots, 'telas'));
}, 30_000);

afterAll(() => rmSync(base, { recursive: true, force: true }));

const io = {
  readSource: () => Promise.reject(new Error('sem arquivos')),
  readSpecInput: () => Promise.reject(new Error('sem arquivos')),
  takenImageFiles: new Set<string>(),
  now: () => new Date(NOW),
};

const lot = (menuExtra: Record<string, unknown>): Operation[] => [
  {
    op: 'create_marking',
    as: '$campo',
    container: IMAGE,
    rect: { x: 20, y: 340, width: 280, height: 56 },
    annotation: { type: 'material3-compose/text-field' },
  } as Operation,
  {
    op: 'create_marking',
    as: '$menu',
    container: IMAGE,
    annotation: {
      type: 'material3-compose/dropdown-menu',
      values: {
        style: 'menu',
        expanded: 'true',
        items: [
          { text: 'Editar', leadingIcon: 'Edit' },
          { text: 'Compartilhar', leadingIcon: 'Share' },
          { text: 'Excluir', leadingIcon: 'Delete' },
        ],
      },
    },
    ...menuExtra,
  } as Operation,
];

const menuRect = (r: BatchResult) =>
  r.project.markings.find((m) => m.id === (r.aliases.get('$menu') as { id: string }).id)!
    .rect;

describe('create_marking sem rect: o tamanho inclui as linhas do próprio lote', () => {
  it('ancorado: o menu nasce com a altura dos três itens, não 112 × 16', async () => {
    const result = await runBatch(
      loaded,
      lot({ anchor: { to: '$campo', side: 'bottom' } }),
      io,
    );
    expect(result.errors).toEqual([]);
    const rect = menuRect(result);
    expect(rect.height).toBe(160);
    // Já no tamanho do conteúdo: ajustar de novo não muda nada, e fica encostado sob o campo.
    expect(rect).toMatchObject({ x: 20, y: 396 });
    const again = await runBatch(
      loaded,
      [
        ...lot({ anchor: { to: '$campo', side: 'bottom' } }),
        { op: 'fit_marking', marking: '$menu' } as Operation,
      ],
      io,
    );
    expect(again.steps[2]!.description).toContain('nada muda');
  }, 30_000);
});

// CL1, achado 3.2 (#1890): o servidor completa o que o lote não informa com o `preview` do
// componente (como a Paleta da app; documentado em `create_marking`). O guia (R17.22 e R17.31)
// informa vazio o que o passo não quer, e então nada além do pedido fica na anotação.
describe('create_marking: o preview só entra no que o lote não informa', () => {
  const valuesOf = (r: BatchResult, alias: string): Record<string, unknown> => {
    const id = (r.aliases.get(alias) as { id: string }).id;
    const a = r.project.annotations.find((x) => x.markingId === id)!;
    return (a.values ?? {}) as Record<string, unknown>;
  };
  const make = (
    alias: string,
    type: string,
    values: Record<string, unknown>,
  ): Operation =>
    ({
      op: 'create_marking',
      as: alias,
      container: IMAGE,
      rect: { x: 10, y: 10, width: 344, height: 48 },
      annotation: { type: `material3-compose/${type}`, values },
    }) as Operation;

  it('o preview completa o campo que o lote não informa (decisão em aberto: bug do dono)', async () => {
    const r = await runBatch(loaded, [make('$sn', 'snackbar', { message: 'Oi' })], io);
    expect(r.errors).toEqual([]);
    expect(valuesOf(r, '$sn').actionLabel).toBe('Desfazer');
  }, 30_000);

  it('com o campo informado vazio (como no R17.31), nada além do pedido entra', async () => {
    const r = await runBatch(
      loaded,
      [
        make('$sn', 'snackbar', { message: 'Oi', actionLabel: '' }),
        make('$cd', 'card', {
          title: 'Título',
          style: 'elevated',
          subtitle: '',
          supportingText: '',
          media: '',
        }),
        make('$ad', 'alert-dialog', { title: 'T', text: 'x', icon: '' }),
      ],
      io,
    );
    expect(r.errors).toEqual([]);
    expect(valuesOf(r, '$sn').actionLabel ?? '').toBe('');
    expect(valuesOf(r, '$cd').media ?? '').toBe('');
    expect(valuesOf(r, '$cd').subtitle ?? '').toBe('');
    expect(valuesOf(r, '$ad').icon ?? '').toBe('');
  }, 30_000);
});
