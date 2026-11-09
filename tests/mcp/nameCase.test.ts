import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { encodePng, quadrants } from './images';
import { connect, createWorkspace, type Connection, type Workspace } from './workspace';

// Nome livre sem diferenciar maiúsculas e minúsculas no lote do MCP (etapa #942, fase 2).

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

describe('nomes de imagem no lote sem diferenciar a caixa', () => {
  it('não escolhe o nome de um arquivo do disco que só muda na caixa', async () => {
    const created = await mcp.call('create_project', { path: 'caixa', name: 'Caixa' });
    expect(created.isError).toBe(false);
    const dir = ws.projectDir('caixa');
    mkdirSync(join(dir, 'images'), { recursive: true });
    writeFileSync(join(dir, 'images', 'tela.webp'), await encodePng(quadrants(40, 40)));
    const png = (await encodePng(quadrants(50, 50))).toString('base64');
    const files = await mcp.call<{ files: { images: string[] } }>('propose_changes', {
      project: 'caixa',
      title: 'Caixa',
      operations: [
        { op: 'add_container', base64: png, fileName: 'Tela.png' },
        { op: 'add_container', base64: png, fileName: 'Outra.png' },
        { op: 'add_container', base64: png, fileName: 'OUTRA.png' },
      ],
    });
    const names = files.data.files.images.map((f) => f.split('/').slice(2).join('/'));
    const keys = names.map((n) => n.toLowerCase());
    expect(new Set(keys).size).toBe(3);
    expect(keys).not.toContain('images/tela.webp');
  });
});
