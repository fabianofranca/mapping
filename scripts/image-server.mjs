// Image server of test script R15 (docs/TESTING.md): serves the `foto.png` in its own folder at
// http://127.0.0.1:8765, WITHOUT any CORS header (that is the point of the test), and logs each request
// in `servidor.log` (one line: time, method, path and the `Origin` header, or `none`).
// It must run on the SAME computer as Chrome. Node only, no dependencies:
//   node image-server.mjs        (or the `iniciar-servidor.cmd` that the test script has you create)
// `GET /parar` (from the computer itself only) shuts the server down.
import { createServer } from 'node:http';
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Creates the server (without listening). `dir` has the `foto.png`; `logFile` gets one line per request. */
export function createImageServer({ dir, logFile }) {
  const server = createServer((request, response) => {
    const path = (request.url ?? '/').split('?')[0];
    const origin = request.headers.origin ?? 'none';
    appendFileSync(
      logFile,
      `${new Date().toISOString()} ${request.method} ${path} origin=${origin}\n`,
    );
    if (path === '/parar') {
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end('stopped');
      server.close();
      server.closeAllConnections();
      return;
    }
    if (path !== '/foto.png') {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('not found');
      return;
    }
    let photo;
    try {
      photo = readFileSync(join(dir, 'foto.png'));
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('foto.png is not in the server folder');
      return;
    }
    // No `Access-Control-Allow-Origin` on purpose, and no cache (each request shows up in the log).
    response.writeHead(200, {
      'content-type': 'image/png',
      'cache-control': 'no-store',
    });
    response.end(photo);
  });
  return server;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const dir = dirname(fileURLToPath(import.meta.url));
  const server = createImageServer({ dir, logFile: join(dir, 'servidor.log') });
  server.listen(8765, '127.0.0.1', () => {
    process.stdout.write(
      'Image server at http://127.0.0.1:8765 (GET /parar shuts it down)\n',
    );
  });
}
