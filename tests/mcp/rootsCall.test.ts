import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// `Roots` resolves the `realpath` of the roots once per tool call (`beginCall`), and
// so does the discovery of projects by name: file by file, nothing is redone.
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

describe('Roots: one resolution per tool call', () => {
  beforeEach(() => {
    calls.realpath.length = 0;
  });

  it('the realpath of the roots is done once, not per file', async () => {
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

  it('a new call resolves again (a root created after startup shows up)', async () => {
    const first = mkdtempSync(join(tmpdir(), 'mapping-call-a-'));
    const late = join(first, 'later');
    const roots = new Roots([late], first);
    roots.beginCall();
    expect(await roots.realRoots()).toEqual([null]);
    mkdirSync(late);
    roots.beginCall();
    expect((await roots.realRoots())[0]).not.toBeNull();
  });

  it('the project discovery is done once per call', async () => {
    const { first, roots } = workspace();
    roots.beginCall();
    mkdirSync(join(first, 'one'));
    writeFileSync(join(first, 'one', 'mapping.json'), '{}');
    expect((await discoverProjects(roots)).map((l) => l.name)).toEqual(['one']);
    mkdirSync(join(first, 'two'));
    writeFileSync(join(first, 'two', 'mapping.json'), '{}');
    expect((await discoverProjects(roots)).map((l) => l.name)).toEqual(['one']);
    roots.beginCall();
    expect((await discoverProjects(roots)).map((l) => l.name)).toEqual(['one', 'two']);
  });

  it('without beginCall nothing is cached', async () => {
    const { first, roots } = workspace();
    mkdirSync(join(first, 'one'));
    writeFileSync(join(first, 'one', 'mapping.json'), '{}');
    expect(await discoverProjects(roots)).toHaveLength(1);
    mkdirSync(join(first, 'two'));
    writeFileSync(join(first, 'two', 'mapping.json'), '{}');
    expect(await discoverProjects(roots)).toHaveLength(2);
  });
});
