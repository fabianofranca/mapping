// Servidor de imagens do roteiro R15 (docs/TESTING.md): serve o `foto.png` da própria pasta em
// http://127.0.0.1:8765, SEM nenhum cabeçalho de CORS (é o ponto do teste), e anota cada pedido
// em `servidor.log` (uma linha: hora, método, caminho e o cabeçalho `Origin`, ou `none`).
// Precisa rodar no MESMO computador do Chrome. Só Node, sem dependências:
//   node servidor-imagens.mjs        (ou o `iniciar-servidor.cmd` que o roteiro manda criar)
// `GET /parar` (só do próprio computador) encerra o servidor.
import { createServer } from 'node:http';
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Cria o servidor (sem ouvir). `dir` tem o `foto.png`; `logFile` recebe uma linha por pedido. */
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
      response.end('parado');
      server.close();
      server.closeAllConnections();
      return;
    }
    if (path !== '/foto.png') {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('não há');
      return;
    }
    // Sem `Access-Control-Allow-Origin` de propósito, e sem cache (cada pedido aparece no log).
    response.writeHead(200, {
      'content-type': 'image/png',
      'cache-control': 'no-store',
    });
    response.end(readFileSync(join(dir, 'foto.png')));
  });
  return server;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const dir = dirname(fileURLToPath(import.meta.url));
  const server = createImageServer({ dir, logFile: join(dir, 'servidor.log') });
  server.listen(8765, '127.0.0.1', () => {
    process.stdout.write(
      'Servidor de imagens em http://127.0.0.1:8765 (GET /parar encerra)\n',
    );
  });
}
