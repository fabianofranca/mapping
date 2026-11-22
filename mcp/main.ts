import { resolve } from 'node:path';
import { format } from 'node:util';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { USAGE, UsageError, parseArgs } from './args';
import { MAX_MESSAGE_BYTES } from './image/formats';
import { initShaper } from './image/harfbuzz';
import { ImageServer } from './imageServer';
import { scratchOverlap } from './paths';
import { runPlugin } from './pluginRunner';
import { createServer } from './server';
import { BUILD_VERSION } from './version';

/** Unhandled error: one line with the server prefix on stderr and, below it, the stack. */
function report(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error && error.stack ? `${error.stack}\n` : '';
  process.stderr.write(`mapping-mcp: ${message}\n${stack}`);
}

/**
 * Stdout belongs to the protocol: `console.log/info/debug` now write to stderr (the Emscripten
 * codecs print warnings with `Module.print || console.log`, captured when the codec is
 * instantiated, on demand, after this point). `console.error/warn` already write to stderr.
 */
function keepStdoutForProtocol(): void {
  const toStderr = (...args: unknown[]) => {
    process.stderr.write(`${format(...args)}\n`);
  };
  console.log = toStderr;
  console.info = toStderr;
  console.debug = toStderr;
}

/** The plugin of the self-check: answers with the text it gets, so the output proves the round trip. */
const SELF_CHECK_PLUGIN =
  'function generate(input) { return "self-check:" + input.word; }';

/** `--check-plugin-runner`: runs a built-in plugin in QuickJS (the `.wasm` embedded in this file). */
async function checkPluginRunner(): Promise<number> {
  const started = Date.now();
  const run = await runPlugin(SELF_CHECK_PLUGIN, 'generate', [{ word: 'ok' }]);
  const ms = Date.now() - started;
  if (run.ok && run.value === 'self-check:ok') {
    process.stdout.write(`plugin runner: ok (QuickJS, ${ms} ms)\n`);
    return 0;
  }
  const why = run.ok
    ? `unexpected value ${JSON.stringify(run.value)}`
    : run.failure.message;
  process.stderr.write(`mapping-mcp: plugin runner: ${why}\n`);
  return 1;
}

// The protocol uses stdout: any human-readable message goes to stderr.
async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }
  if (options.version) {
    process.stdout.write(`${BUILD_VERSION}\n`);
    return;
  }
  if (options.checkPluginRunner) {
    process.exitCode = await checkPluginRunner();
    return;
  }
  const roots = options.roots.map((root) => resolve(root));
  const scratch = options.scratch.map((folder) => resolve(folder));
  const overlap = scratchOverlap(roots, scratch);
  if (overlap !== null) {
    throw new UsageError(
      `the scratch folder ${overlap.scratch} overlaps the root ${overlap.root}: keep the scratch folder outside the roots`,
    );
  }
  keepStdoutForProtocol();
  // HarfBuzz is instantiated once, before any tool runs: the measurer and the rasterizer are synchronous.
  await initShaper();
  process.on('unhandledRejection', (reason) => {
    report(reason);
    process.exit(1);
  });
  process.on('uncaughtException', (error) => {
    report(error);
    process.exit(1);
  });
  const server = createServer({
    roots,
    scratch,
    images: options.http ? new ImageServer() : null,
  });
  // The read ceiling follows the `base64` one in the schema. Above it, the SDK transport warns
  // through `onerror` and closes without responding (the process would exit with 0, silently): exit with an error.
  const transport = new StdioServerTransport(process.stdin, process.stdout, {
    maxBufferSize: MAX_MESSAGE_BYTES,
  });
  let failure: string | null = null;
  transport.onerror = (error) => {
    if (/exceeded maximum size/i.test(error.message)) {
      failure = `message larger than ${MAX_MESSAGE_BYTES} bytes (large images go through \`file\`, not \`base64\`)`;
    } else {
      report(error);
    }
  };
  // The server never closes the transport on its own: closing is always a failure.
  transport.onclose = () => {
    process.stderr.write(`mapping-mcp: ${failure ?? 'stdio transport closed'}\n`);
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
