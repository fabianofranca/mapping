import { resolve } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { USAGE, UsageError, parseArgs } from './args';
import { createServer } from './server';
import { SERVER_VERSION } from './version';

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
  const server = createServer({ roots: options.roots.map((root) => resolve(root)) });
  await server.connect(new StdioServerTransport());
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
