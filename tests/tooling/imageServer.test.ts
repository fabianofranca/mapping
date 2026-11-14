// @vitest-environment node
// The image server of test script R15: serves the PNG without CORS, logs each request (with the
// `Origin`) and shuts down on /parar.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error .mjs module without type declarations
import { createImageServer } from '../../scripts/image-server.mjs';

const png = readFileSync('public/test-images/foto.png');
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
  return { base, logFile, dir };
}

describe('scripts/image-server.mjs', () => {
  it('serves foto.png without any CORS header and logs the request with the Origin', async () => {
    const { base, logFile } = await start();
    const withOrigin = await fetch(`${base}/foto.png`, {
      headers: { origin: 'https://example.test' },
    });
    expect(withOrigin.status).toBe(200);
    expect(withOrigin.headers.get('content-type')).toBe('image/png');
    expect(withOrigin.headers.get('access-control-allow-origin')).toBeNull();
    expect(Buffer.from(await withOrigin.arrayBuffer()).equals(png)).toBe(true);
    await fetch(`${base}/foto.png`);
    const lines = readFileSync(logFile, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/GET \/foto\.png origin=https:\/\/example\.test$/);
    expect(lines[1]).toMatch(/GET \/foto\.png origin=none$/);
  });

  it('any other path is 404 and /parar shuts the server down', async () => {
    const { base } = await start();
    expect((await fetch(`${base}/outra.png`)).status).toBe(404);
    expect(await (await fetch(`${base}/parar`)).text()).toBe('stopped');
    await expect(fetch(`${base}/foto.png`)).rejects.toThrow();
  });

  it('missing foto.png answers 404 with a message and the server stays up (item 60)', async () => {
    const { base, dir } = await start();
    rmSync(join(dir, 'foto.png'));
    const missing = await fetch(`${base}/foto.png`);
    expect(missing.status).toBe(404);
    expect(await missing.text()).toMatch(/foto\.png/);
    expect((await fetch(`${base}/outra.png`)).status).toBe(404);
  });
});
