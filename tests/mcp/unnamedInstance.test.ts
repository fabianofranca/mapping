import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acceptAllAndApply, ok, propose } from './proposalSupport';
import { connect, type Connection } from './workspace';

// Unnamed component instance (the Palette creates it this way): in the MCP the type name takes the place
// of the word "Marking" and the short code stays ("Nota 1680c843"); a plain marking remains
// "Marking <code>". Nothing is written: `name` stays `null`.

interface PathSegment {
  ref: string;
  name: string;
}
interface MarkingData {
  ref: string;
  name: string | null;
  path: PathSegment[];
}
interface ArrowsData {
  arrows: { incoming: { from: { name: string | null } }[] };
}

let root: string;
let mcp: Connection;
let dir: string;
const project = 'unnamed';

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'mapping-unnamed-'));
  mcp = await connect([root]);
  ok(await mcp.call('create_project', { path: `projetos/${project}`, name: project }));
  dir = join(root, 'projetos', project);
});

afterAll(async () => {
  await mcp?.close();
  rmSync(root, { recursive: true, force: true });
});

describe('name of an unnamed marking in the MCP', () => {
  let noteId = '';
  let plainId = '';

  beforeAll(async () => {
    const proposed = await propose(mcp, project, [
      {
        op: 'create_marking',
        as: '$note',
        annotationAs: '$note-a',
        annotation: { type: 'notas/nota' },
        rect: { x: 0, y: 0, width: 200, height: 100 },
      },
      {
        op: 'create_marking',
        as: '$plain',
        rect: { x: 400, y: 0, width: 200, height: 100 },
      },
    ]);
    expect(proposed.valid).toBe(true);
    const saved = acceptAllAndApply(dir, proposed.proposal.id);
    const note = saved.markings.find((m) => m.floating);
    const plain = saved.markings.find((m) => !m.floating);
    expect(note?.name).toBeNull();
    expect(plain?.name).toBeNull();
    noteId = note!.id;
    plainId = plain!.id;
  });

  it('get_marking: the path shows "<Type> <code>" and the stored name stays null', async () => {
    const note = ok(await mcp.call<MarkingData>('get_marking', { project, ref: noteId }));
    expect(note.name).toBeNull();
    expect(note.path.at(-1)?.name).toMatch(/^Nota [0-9a-f]{8}$/);
    expect(note.ref).toMatch(/^mapping:\/\/[^/]+\/m\/[0-9a-f]{8}$/);
    const plain = ok(
      await mcp.call<MarkingData>('get_marking', { project, ref: plainId }),
    );
    expect(plain.path.at(-1)?.name).toMatch(/^Marking [0-9a-f]{8}$/);
  });

  it('the arrow leaving the unnamed instance shows "<Type> <code>" at the end', async () => {
    const proposed = await propose(mcp, project, [
      { op: 'create_arrow', as: '$arrow', from: noteId, to: plainId },
    ]);
    expect(proposed.valid).toBe(true);
    acceptAllAndApply(dir, proposed.proposal.id);
    const plain = ok(
      await mcp.call<ArrowsData>('get_marking', { project, ref: plainId }),
    );
    expect(plain.arrows.incoming[0]?.from.name).toMatch(/^Nota [0-9a-f]{8}$/);
  });
});
