import { createHash, randomBytes } from 'node:crypto';
import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

// Este módulo só escuta em 127.0.0.1 para entregar ao chat do cliente as imagens das tools
// (por URL); guarda tudo em memória, não lê arquivo e não faz requisição de saída.

export const MAX_ENTRIES = 64;
export const MAX_BYTES = 64 * 1024 * 1024;

interface Entry {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
}

export interface ImageServerOptions {
  readonly maxEntries?: number;
  readonly maxBytes?: number;
}

/** Servidor HTTP local (127.0.0.1, porta efêmera) que entrega imagens guardadas em memória. */
export class ImageServer {
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private readonly token = randomBytes(16).toString('hex');
  /** Em ordem de uso: a primeira é a menos recente. */
  private readonly entries = new Map<string, Entry>();
  private total = 0;
  private starting: Promise<Server> | null = null;
  private server: Server | null = null;

  constructor(options: ImageServerOptions = {}) {
    this.maxEntries = options.maxEntries ?? MAX_ENTRIES;
    this.maxBytes = options.maxBytes ?? MAX_BYTES;
  }

  /** `http://127.0.0.1:<porta>/<token>/<chave>.<ext>`; rejeita se a porta não abrir. */
  async publish(bytes: Uint8Array, mimeType: string, extension: string): Promise<string> {
    const server = await this.start();
    const key = createHash('sha256').update(bytes).digest('hex').slice(0, 32);
    const previous = this.entries.get(key);
    if (previous) {
      this.entries.delete(key);
      this.total -= previous.bytes.byteLength;
    }
    this.entries.set(key, { bytes, mimeType });
    this.total += bytes.byteLength;
    this.evict();
    const { port } = server.address() as AddressInfo;
    return `http://127.0.0.1:${port}/${this.token}/${key}.${extension}`;
  }

  /** Endereço de escuta (ou `null` antes da primeira publicação). */
  address(): AddressInfo | null {
    return (this.server?.address() as AddressInfo | null | undefined) ?? null;
  }

  async close(): Promise<void> {
    const starting = this.starting;
    this.starting = null;
    this.entries.clear();
    this.total = 0;
    if (!starting) return;
    const server = await starting.catch(() => null);
    this.server = null;
    if (!server?.listening) return;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  }

  private start(): Promise<Server> {
    if (!this.starting) {
      const starting = new Promise<Server>((resolve, reject) => {
        const server = createServer((req, res) => this.handle(req.method, req.url, res));
        // Antes de escutar, o erro é da porta (rejeita); depois, só vai para o stderr.
        server.on('error', (error) => {
          if (this.server === server) {
            process.stderr.write(`mapping-mcp: servidor de imagens: ${error.message}\n`);
            return;
          }
          if (this.starting === starting) this.starting = null;
          reject(error);
        });
        server.listen(0, '127.0.0.1', () => {
          server.unref();
          this.server = server;
          resolve(server);
        });
      });
      this.starting = starting;
    }
    return this.starting;
  }

  /** Descarta as menos recentes até caber; o item mais novo nunca sai, mesmo sozinho acima do teto. */
  private evict(): void {
    for (const [key, entry] of this.entries) {
      if (this.entries.size <= 1) break;
      if (this.entries.size <= this.maxEntries && this.total <= this.maxBytes) break;
      this.entries.delete(key);
      this.total -= entry.bytes.byteLength;
    }
  }

  private handle(
    method: string | undefined,
    url: string | undefined,
    res: ServerResponse,
  ): void {
    if (method !== 'GET' && method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Length': 0 }).end();
      return;
    }
    const match = /^\/([0-9a-f]+)\/([0-9a-f]{32})\.[a-z0-9]+$/.exec(url ?? '');
    const entry =
      match && match[1] === this.token ? this.entries.get(match[2]!) : undefined;
    if (!match || !entry) {
      res.writeHead(404, { 'Content-Length': 0 }).end();
      return;
    }
    if (method === 'GET') {
      // Renova a posição no LRU.
      this.entries.delete(match[2]!);
      this.entries.set(match[2]!, entry);
    }
    res.writeHead(200, {
      'Content-Type': entry.mimeType,
      'Content-Length': entry.bytes.byteLength,
      'Cache-Control': 'private, max-age=3600',
    });
    if (method === 'HEAD') res.end();
    else res.end(entry.bytes);
  }
}
