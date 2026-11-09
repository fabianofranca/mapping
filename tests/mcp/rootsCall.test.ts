import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// `Roots` resolve o `realpath` das raízes uma vez por chamada de tool (`beginCall`), e a
// descoberta de projetos por nome também: arquivo a arquivo, nada é refeito.
const calls = vi.hoisted(() => ({ realpath: [] as string[] }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    realpath: ((path: string, ...rest: unknown[]) => {
      calls.realpath.push(String(path));
      return (actual.realpath as (...a: unknown[]) => Promise<string>)(path, ...rest);
    }) as typeof actual.realpath,
  };
});

const { Roots } = await import('../../mcp/paths');
const { discoverProjects } = await import('../../mcp/projects');

function workspace() {
  const first = mkdtempSync(join(tmpdir(), 'mapping-call-a-'));
  const second = mkdtempSync(join(tmpdir(), 'mapping-call-b-'));
  return { first, second, roots: new Roots([first, second], first) };
}

describe('Roots: uma resolução por chamada de tool', () => {
  beforeEach(() => {
    calls.realpath.length = 0;
  });

  it('o realpath das raízes é feito uma vez, não por arquivo', async () => {
    const { first, second, roots } = workspace();
    roots.beginCall();
    const [a, b] = [join(first, 'x'), join(second, 'y')];
    mkdirSync(a);
    mkdirSync(b);
    await roots.locate(a);
    await roots.locate(b);
    await roots.locate(a);
    const rootCalls = calls.realpath.filter((p) => p === first || p === second);
    expect(rootCalls).toHaveLength(2);
  });

  it('uma nova chamada resolve de novo (a raiz criada depois da partida aparece)', async () => {
    const first = mkdtempSync(join(tmpdir(), 'mapping-call-a-'));
    const late = join(first, 'tarde');
    const roots = new Roots([late], first);
    roots.beginCall();
    expect(await roots.realRoots()).toEqual([null]);
    mkdirSync(late);
    roots.beginCall();
    expect((await roots.realRoots())[0]).not.toBeNull();
  });

  it('a descoberta de projetos é feita uma vez por chamada', async () => {
    const { first, roots } = workspace();
    roots.beginCall();
    mkdirSync(join(first, 'um'));
    writeFileSync(join(first, 'um', 'mapping.json'), '{}');
    expect((await discoverProjects(roots)).map((l) => l.name)).toEqual(['um']);
    mkdirSync(join(first, 'dois'));
    writeFileSync(join(first, 'dois', 'mapping.json'), '{}');
    expect((await discoverProjects(roots)).map((l) => l.name)).toEqual(['um']);
    roots.beginCall();
    expect((await discoverProjects(roots)).map((l) => l.name)).toEqual(['dois', 'um']);
  });

  it('sem beginCall nada fica em cache', async () => {
    const { first, roots } = workspace();
    mkdirSync(join(first, 'um'));
    writeFileSync(join(first, 'um', 'mapping.json'), '{}');
    expect(await discoverProjects(roots)).toHaveLength(1);
    mkdirSync(join(first, 'dois'));
    writeFileSync(join(first, 'dois', 'mapping.json'), '{}');
    expect(await discoverProjects(roots)).toHaveLength(2);
  });
});
