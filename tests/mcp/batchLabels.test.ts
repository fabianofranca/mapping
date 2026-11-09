import { afterEach, describe, expect, it, vi } from 'vitest';
import { runBatch } from '../../mcp/batch';
import { Refs } from '../../mcp/items';
import { shortCode } from '../../src/model';
import { buildLargeProject } from '../model/largeProject';
import { NOW } from '../model/fixtures';

// O rótulo da marcação criada no resumo do lote sai sem montar o índice do projeto (#882, fase 3):
// tem de ser igual ao do `Refs`, que decide o nome e o código curto pelo projeto inteiro.
const project = buildLargeProject({ images: 4 });
const deps = {
  readSource: () => Promise.reject(new Error('sem arquivos')),
  readSpecInput: () => Promise.reject(new Error('sem arquivos')),
  takenImageFiles: new Set<string>(),
  now: () => new Date(NOW),
};
const loaded = (p: typeof project) => ({ project: p }) as never;
const create = (rect: { x: number; y: number }, extra: object = {}) => ({
  op: 'create_marking',
  container: 'I0',
  rect: { ...rect, width: 20, height: 20 },
  ...extra,
});

afterEach(() => vi.restoreAllMocks());

describe('lote: rótulo da marcação criada', () => {
  it('é o mesmo do Refs, com e sem nome', async () => {
    const result = await runBatch(
      loaded(project),
      [create({ x: 5, y: 2800 }), create({ x: 40, y: 2800 }, { name: 'Botão' })] as never,
      deps as never,
    );
    expect(result.errors).toEqual([]);
    const refs = new Refs({ project: result.project } as never);
    const ids = result.created.filter((c) => c.kind === 'm').map((c) => c.id);
    expect(ids).toHaveLength(2);
    for (const [n, id] of ids.entries()) {
      expect(result.steps[n + 0]!.description).toContain(`"${refs.label('m', id)}"`);
    }
    expect(result.steps[0]!.description).toContain(
      `Marcação ${shortCode(result.project, 'm', ids[0]!)}`,
    );
  });

  it('com outro id começando igual, o código é o do projeto inteiro (mais longo)', async () => {
    const first = 'aaaaaaaa-0000-4000-8000-000000000001';
    const second = 'aaaaaaaa-1111-4111-8111-000000000002';
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce(first as never)
      .mockReturnValueOnce(second as never);
    const result = await runBatch(
      loaded(project),
      [create({ x: 5, y: 2800 }), create({ x: 40, y: 2800 })] as never,
      deps as never,
    );
    expect(result.errors).toEqual([]);
    expect(result.created.filter((c) => c.kind === 'm').map((c) => c.id)).toEqual([
      first,
      second,
    ]);
    // A primeira nasceu sozinha (8 caracteres); a segunda divide o prefixo com ela (12).
    expect(result.steps[0]!.description).toContain('Marcação aaaaaaaa"');
    const code = shortCode(result.project, 'm', second);
    expect(code).toBe('aaaaaaaa1111');
    expect(result.steps[1]!.description).toContain(`Marcação ${code}`);
  });
});
