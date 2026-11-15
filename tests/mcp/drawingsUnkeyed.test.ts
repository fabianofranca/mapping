import { rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Roots } from '../../mcp/paths';
import { findProject, loadProject, type LoadedProject } from '../../mcp/projects';
import { projectDrawings, projectIssuesWithDrawings } from '../../mcp/drawings';
import { slotsWorkspace, type Workspace } from './slotsWorkspace';

// CL1, P3: a project without a valid `drawingKey` (a `LoadedProject` whose `project` was spread in, or a load
// without fonts) used to instantiate the drawings on every read; a list read once per row did it per row.

let ws: Workspace;
let loaded: LoadedProject;

beforeAll(async () => {
  ws = await slotsWorkspace((add) => {
    add('bar', 'bar', { rect: { x: 100, y: 100, width: 360, height: 56 } });
  });
  const roots = new Roots([ws.base]);
  const location = await findProject(roots, 'slots');
  loaded = await loadProject(roots, location, undefined, { fonts: false });
});

afterAll(async () => {
  await ws.client.close();
  rmSync(ws.base, { recursive: true, force: true });
});

describe('drawings of a load with no drawing key', () => {
  it('has no valid key', () => {
    expect(loaded.drawingKey).toBeUndefined();
  });

  it('instantiate once per loaded project, not once per read', () => {
    expect(projectDrawings(loaded)).toBe(projectDrawings(loaded));
    expect(projectIssuesWithDrawings(loaded)).toBe(projectIssuesWithDrawings(loaded));
  });
});
