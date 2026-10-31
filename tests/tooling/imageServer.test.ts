// @vitest-environment node
// O servidor de imagens do roteiro R15: responde o PNG sem CORS, anota cada pedido (com o
// `Origin`) e encerra em /parar.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem declaração de tipos
import { createImageServer } from '../../scripts/servidor-imagens.mjs';

const png = readFileSync('public/imagens-teste/foto.png');
let stop: (() => void) | undefined;

afterEach(() => stop?.());

async function start() {
  const dir = mkdtempSync(join(tmpdir(), 'imgsrv-'));
  writeFileSync(join(dir, 'foto.png'), png);
  const logFile = join(dir, 'servidor.log');
  const server = createImageServer({ dir, logFile });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  stop = () => {
    server.close();
    server.closeAllConnections();
  };
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, logFile };
}

describe('scripts/servidor-imagens.mjs', () => {
  it('serve o foto.png sem nenhum cabeçalho de CORS e anota o pedido com o Origin', async () => {
    const { base, logFile } = await start();
    const withOrigin = await fetch(`${base}/foto.png`, {
      headers: { origin: 'https://exemplo.test' },
    });
    expect(withOrigin.status).toBe(200);
    expect(withOrigin.headers.get('content-type')).toBe('image/png');
    expect(withOrigin.headers.get('access-control-allow-origin')).toBeNull();
    expect(Buffer.from(await withOrigin.arrayBuffer()).equals(png)).toBe(true);
    await fetch(`${base}/foto.png`);
    const lines = readFileSync(logFile, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/GET \/foto\.png origin=https:\/\/exemplo\.test$/);
    expect(lines[1]).toMatch(/GET \/foto\.png origin=none$/);
  });

  it('outro caminho é 404 e /parar encerra o servidor', async () => {
    const { base } = await start();
    expect((await fetch(`${base}/outra.png`)).status).toBe(404);
    expect(await (await fetch(`${base}/parar`)).text()).toBe('parado');
    await expect(fetch(`${base}/foto.png`)).rejects.toThrow();
  });
});
