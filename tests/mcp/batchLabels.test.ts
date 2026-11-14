import { afterEach, describe, expect, it, vi } from 'vitest';
import { runBatch } from '../../mcp/batch';
import { Refs } from '../../mcp/items';
import { shortCode } from '../../src/model';
import { buildLargeProject } from '../model/largeProject';
import { NOW } from '../model/fixtures';

// The label of the created marking in the batch summary comes out without building the project index (#882, phase 3):
// it must equal the one from `Refs`, which decides the name and the short code from the whole project.
const project = buildLargeProject({ images: 4 });
const deps = {
  readSource: () => Promise.reject(new Error('no files')),
  readSpecInput: () => Promise.reject(new Error('no files')),
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

describe('batch: label of the created marking', () => {
  it('is the same as the one from Refs, with and without a name', async () => {
    const result = await runBatch(
      loaded(project),
      [
        create({ x: 5, y: 2800 }),
        create({ x: 40, y: 2800 }, { name: 'Button' }),
      ] as never,
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
      `Marking ${shortCode(result.project, 'm', ids[0]!)}`,
    );
  });

  it('with another id starting the same, the code is the whole-project one (longer)', async () => {
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
    // The first was born alone (8 characters); the second shares the prefix with it (12).
    expect(result.steps[0]!.description).toContain('Marking aaaaaaaa"');
    const code = shortCode(result.project, 'm', second);
    expect(code).toBe('aaaaaaaa1111');
    expect(result.steps[1]!.description).toContain(`Marking ${code}`);
  });
});
