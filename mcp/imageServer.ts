import { createHash, randomBytes } from 'node:crypto';
import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

// This module only listens on 127.0.0.1 to hand the tools' images to the client's chat
// (by URL); it keeps everything in memory, reads no file and makes no outgoing request.

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

/** Local HTTP server (127.0.0.1, ephemeral port) that serves images kept in memory. */
export class ImageServer {
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private readonly token = randomBytes(16).toString('hex');
  /** In order of use: the first is the least recent. */
  private readonly entries = new Map<string, Entry>();
  private total = 0;
  private starting: Promise<Server> | null = null;
  private server: Server | null = null;

  constructor(options: ImageServerOptions = {}) {
    this.maxEntries = options.maxEntries ?? MAX_ENTRIES;
    this.maxBytes = options.maxBytes ?? MAX_BYTES;
  }

  /** `http://127.0.0.1:<port>/<token>/<key>.<ext>`; rejects if the port does not open. */
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

  /** Listening address (or `null` before the first publication). */
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
        // Before listening, the error is the port's (rejects); afterwards, it only goes to stderr.
        server.on('error', (error) => {
          if (this.server === server) {
            process.stderr.write(`mapping-mcp: image server: ${error.message}\n`);
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

  /** Discards the least recent ones until it fits; the newest item never leaves, even if alone above the cap. */
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
      // Renews the position in the LRU.
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
