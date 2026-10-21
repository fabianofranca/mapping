import { request } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { ImageServer, MAX_BYTES, MAX_ENTRIES } from '../../mcp/imageServer';

interface Reply {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

function send(method: string, url: string): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request(url, { method, agent: false }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () =>
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks),
        }),
      );
    });
    req.on('error', reject);
    req.end();
  });
}

const bytesOf = (n: number, size = 8) => new Uint8Array(size).fill(n);

let server: ImageServer | null = null;
const make = (options?: ConstructorParameters<typeof ImageServer>[0]) =>
  (server = new ImageServer(options));

afterEach(async () => {
  await server?.close();
  server = null;
});

describe('ImageServer', () => {
  it('padrões exportados', () => {
    expect(MAX_ENTRIES).toBe(64);
    expect(MAX_BYTES).toBe(64 * 1024 * 1024);
  });

  it('publica em 127.0.0.1 com token e chave de 32 hex', async () => {
    const url = await make().publish(bytesOf(1), 'image/png', 'png');
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{32}\/[0-9a-f]{32}\.png$/);
    expect(server!.address()?.address).toBe('127.0.0.1');
  });

  it('mesmos bytes, mesma URL; bytes diferentes, outra', async () => {
    const s = make();
    const a = await s.publish(bytesOf(1), 'image/png', 'png');
    expect(await s.publish(bytesOf(1), 'image/png', 'png')).toBe(a);
    expect(await s.publish(bytesOf(2), 'image/png', 'png')).not.toBe(a);
  });

  it('GET devolve os bytes e o Content-Type', async () => {
    const data = Uint8Array.from([1, 2, 3, 4, 5]);
    const url = await make().publish(data, 'image/webp', 'webp');
    const r = await send('GET', url);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('image/webp');
    expect(r.headers['content-length']).toBe('5');
    expect(r.headers['cache-control']).toBe('private, max-age=3600');
    expect(r.body.equals(Buffer.from(data))).toBe(true);
  });

  it('HEAD não tem corpo e traz Content-Length', async () => {
    const url = await make().publish(bytesOf(7, 10), 'image/png', 'png');
    const r = await send('HEAD', url);
    expect(r.status).toBe(200);
    expect(r.headers['content-length']).toBe('10');
    expect(r.body.length).toBe(0);
  });

  it('token errado ou caminho desconhecido: 404 vazio', async () => {
    const url = await make().publish(bytesOf(1), 'image/png', 'png');
    const wrongToken = url.replace(/\/[0-9a-f]{32}\//, `/${'0'.repeat(32)}/`);
    for (const bad of [wrongToken, url.replace(/\/[0-9a-f]{32}\.png$/, '/x.png')]) {
      const r = await send('GET', bad);
      expect(r.status).toBe(404);
      expect(r.body.length).toBe(0);
    }
    const origin = new URL(url).origin;
    expect((await send('GET', `${origin}/`)).status).toBe(404);
  });

  it('outro método: 405', async () => {
    const url = await make().publish(bytesOf(1), 'image/png', 'png');
    expect((await send('POST', url)).status).toBe(405);
  });

  it('LRU por quantidade: descarta a mais antiga e o GET renova', async () => {
    const s = make({ maxEntries: 2 });
    const a = await s.publish(bytesOf(1), 'image/png', 'png');
    const b = await s.publish(bytesOf(2), 'image/png', 'png');
    await s.publish(bytesOf(3), 'image/png', 'png');
    expect((await send('GET', a)).status).toBe(404);
    expect((await send('GET', b)).status).toBe(200);
    // b foi renovada: a próxima publicação descarta c, não b.
    const d = await s.publish(bytesOf(4), 'image/png', 'png');
    expect((await send('GET', b)).status).toBe(200);
    expect((await send('GET', d)).status).toBe(200);
  });

  it('LRU por tamanho; item maior que o teto fica sozinho', async () => {
    const s = make({ maxBytes: 20 });
    const a = await s.publish(bytesOf(1, 10), 'image/png', 'png');
    const b = await s.publish(bytesOf(2, 10), 'image/png', 'png');
    expect((await send('GET', a)).status).toBe(200);
    const c = await s.publish(bytesOf(3, 10), 'image/png', 'png');
    expect((await send('GET', b)).status).toBe(404);
    const big = await s.publish(bytesOf(4, 100), 'image/png', 'png');
    expect((await send('GET', a)).status).toBe(404);
    expect((await send('GET', c)).status).toBe(404);
    expect((await send('GET', big)).status).toBe(200);
  });

  it('close() encerra o servidor', async () => {
    const s = make();
    const url = await s.publish(bytesOf(1), 'image/png', 'png');
    await s.close();
    await expect(send('GET', url)).rejects.toThrow();
  });
});
