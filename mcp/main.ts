import { resolve } from 'node:path';
import { format } from 'node:util';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { USAGE, UsageError, parseArgs } from './args';
import { MAX_MESSAGE_BYTES } from './image/formats';
import { createServer } from './server';
import { SERVER_VERSION } from './version';

/** Erro sem tratamento: uma linha com o prefixo do servidor no stderr e, abaixo, a pilha. */
function report(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error && error.stack ? `${error.stack}\n` : '';
  process.stderr.write(`mapping-mcp: ${message}\n${stack}`);
}

/**
 * O stdout é do protocolo: `console.log/info/debug` passam a escrever no stderr (os codecs
 * Emscripten imprimem avisos com `Module.print || console.log`, capturado ao instanciar o
 * codec, sob demanda, depois daqui). `console.error/warn` já escrevem no stderr.
 */
function keepStdoutForProtocol(): void {
  const toStderr = (...args: unknown[]) => {
    process.stderr.write(`${format(...args)}\n`);
  };
  console.log = toStderr;
  console.info = toStderr;
  console.debug = toStderr;
}

// O protocolo usa o stdout: qualquer mensagem humana vai para o stderr.
async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }
  if (options.version) {
    process.stdout.write(`${SERVER_VERSION}\n`);
    return;
  }
  keepStdoutForProtocol();
  process.on('unhandledRejection', (reason) => {
    report(reason);
    process.exit(1);
  });
  process.on('uncaughtException', (error) => {
    report(error);
    process.exit(1);
  });
  const server = createServer({ roots: options.roots.map((root) => resolve(root)) });
  // O teto de leitura acompanha o do `base64` no schema. Acima dele, o transporte do SDK avisa
  // por `onerror` e fecha sem responder (o processo sairia com 0, em silêncio): sai com erro.
  const transport = new StdioServerTransport(process.stdin, process.stdout, {
    maxBufferSize: MAX_MESSAGE_BYTES,
  });
  let failure: string | null = null;
  transport.onerror = (error) => {
    if (/exceeded maximum size/i.test(error.message)) {
      failure = `mensagem maior que ${MAX_MESSAGE_BYTES} bytes (imagens grandes vão por \`file\`, não por \`base64\`)`;
    } else {
      report(error);
    }
  };
  // O servidor nunca fecha o transporte por conta própria: fechar é sempre falha.
  transport.onclose = () => {
    process.stderr.write(`mapping-mcp: ${failure ?? 'transporte stdio fechado'}\n`);
    process.exit(1);
  };
  await server.connect(transport);
}

main().catch((error: unknown) => {
  if (error instanceof UsageError) {
    process.stderr.write(`mapping-mcp: ${error.message}\n\n${USAGE}`);
    process.exit(2);
  }
  process.stderr.write(
    `mapping-mcp: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
