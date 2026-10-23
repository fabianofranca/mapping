import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acceptAllAndApply, ok, propose } from './proposalSupport';
import { connect, type Connection } from './workspace';

// Instância de componente sem nome (a Paleta cria assim): no MCP o nome do tipo toma o lugar
// da palavra "Marcação" e o código curto fica ("Nota 1680c843"); marcação comum continua
// "Marcação <código>". Nada é gravado: `name` segue `null`.

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
const project = 'sem-nome';

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

describe('nome da marcação sem nome no MCP', () => {
  let noteId = '';
  let plainId = '';

  beforeAll(async () => {
    const proposed = await propose(mcp, project, [
      {
        op: 'create_marking',
        as: '$nota',
        annotationAs: '$nota-a',
        annotation: { type: 'notas/nota' },
        rect: { x: 0, y: 0, width: 200, height: 100 },
      },
      {
        op: 'create_marking',
        as: '$comum',
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

  it('get_marking: o caminho mostra "<Tipo> <código>" e o nome gravado segue null', async () => {
    const note = ok(await mcp.call<MarkingData>('get_marking', { project, ref: noteId }));
    expect(note.name).toBeNull();
    expect(note.path.at(-1)?.name).toMatch(/^Nota [0-9a-f]{8}$/);
    expect(note.ref).toContain(`Nota ${note.path.at(-1)!.name.slice(5)}`);
    const plain = ok(
      await mcp.call<MarkingData>('get_marking', { project, ref: plainId }),
    );
    expect(plain.path.at(-1)?.name).toMatch(/^Marcação [0-9a-f]{8}$/);
  });

  it('a seta que sai da instância sem nome mostra "<Tipo> <código>" na ponta', async () => {
    const proposed = await propose(mcp, project, [
      { op: 'create_arrow', as: '$seta', from: noteId, to: plainId },
    ]);
    expect(proposed.valid).toBe(true);
    acceptAllAndApply(dir, proposed.proposal.id);
    const plain = ok(
      await mcp.call<ArrowsData>('get_marking', { project, ref: plainId }),
    );
    expect(plain.arrows.incoming[0]?.from.name).toMatch(/^Nota [0-9a-f]{8}$/);
  });
});
