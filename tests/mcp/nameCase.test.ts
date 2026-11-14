import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { encodePng, quadrants } from './images';
import { connect, createWorkspace, type Connection, type Workspace } from './workspace';

// Free name without distinguishing upper and lower case in the MCP batch (stage #942, phase 2).

let ws: Workspace;
let mcp: Connection;

beforeAll(async () => {
  ws = createWorkspace();
  mkdirSync(ws.root, { recursive: true });
  mcp = await connect([ws.root]);
});

afterAll(async () => {
  await mcp?.close();
});

describe('image names in the batch, case-insensitive', () => {
  it('does not pick the name of a file on disk that differs only in case', async () => {
    const created = await mcp.call('create_project', { path: 'casing', name: 'Casing' });
    expect(created.isError).toBe(false);
    const dir = ws.projectDir('casing');
    mkdirSync(join(dir, 'images'), { recursive: true });
    writeFileSync(join(dir, 'images', 'screen.webp'), await encodePng(quadrants(40, 40)));
    const png = (await encodePng(quadrants(50, 50))).toString('base64');
    const files = await mcp.call<{ files: { images: string[] } }>('propose_changes', {
      project: 'casing',
      title: 'Casing',
      operations: [
        { op: 'add_container', base64: png, fileName: 'Screen.png' },
        { op: 'add_container', base64: png, fileName: 'Other.png' },
        { op: 'add_container', base64: png, fileName: 'OTHER.png' },
      ],
    });
    const names = files.data.files.images.map((f) => f.split('/').slice(2).join('/'));
    const keys = names.map((n) => n.toLowerCase());
    expect(new Set(keys).size).toBe(3);
    expect(keys).not.toContain('images/screen.webp');
  });
});
