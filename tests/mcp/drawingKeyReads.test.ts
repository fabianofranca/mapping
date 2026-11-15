import { rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { slotsWorkspace, type Workspace } from './slotsWorkspace';

// CL1, P4: `loadProject` computed the drawing key by rereading and rehashing every component file on each
// load; the hash is now cached by path, size and `mtime`, so only the catalog's own (cached) read remains.
const reads = vi.hoisted(() => ({ component: 0 }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    readFile: ((...args: Parameters<typeof actual.readFile>) => {
      if (String(args[0]).endsWith('components/bar.json')) reads.component += 1;
      return actual.readFile(...args);
    }) as typeof actual.readFile,
  };
});

const { Roots } = await import('../../mcp/paths');
const { findProject, loadProject } = await import('../../mcp/projects');

let ws: Workspace;

beforeAll(async () => {
  ws = await slotsWorkspace((add) => {
    add('bar', 'bar', { rect: { x: 100, y: 100, width: 360, height: 56 } });
  });
});

afterAll(async () => {
  await ws.client.close();
  rmSync(ws.base, { recursive: true, force: true });
});

describe('the drawing key of a reload', () => {
  it('does not reread a component file that did not change', async () => {
    const roots = new Roots([ws.base]);
    const location = await findProject(roots, 'slots');
    const first = await loadProject(roots, location);
    const before = reads.component;
    const second = await loadProject(roots, location);
    expect(second.drawingKey).toBe(first.drawingKey);
    expect(reads.component).toBe(before);
  });
});
