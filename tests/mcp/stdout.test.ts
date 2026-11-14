import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MAX_MESSAGE_BYTES } from '../../mcp/image/formats';
import { IDS, IMAGE_FILES, codeOf, createImageWorkspace } from './imageFixtures';

// The server's stdout is the protocol channel: nothing but JSON-RPC messages may come out of
// it. The Emscripten codecs write with `Module.print || console.log.bind(console)`
// (captured when the codec is instantiated, on demand, in the middle of a call). The tests
// read the raw stdout of the bundle, without the SDK client (which would ignore the lines that are not
// JSON). A script loaded with `--import` plays the role of a dependency that writes to the
// console during the call, or that lets an error escape.

const bundle = resolve('dist-mcp/mapping-mcp.js');

interface Run {
  readonly lines: string[];
  readonly stderr: string;
  readonly code: number | null;
}

/**
 * Script loaded before the server; `onCall` runs when the tool call arrives, after the
 * handshake (the server is already connected).
 */
function preload(onCall: string): string {
  const file = join(mkdtempSync(join(tmpdir(), 'mapping-mcp-preload-')), 'preload.mjs');
  writeFileSync(
    file,
    // Only listens to stdin after the server transport does (does not steal messages).
    `const wait = setInterval(() => {
  if (process.stdin.listenerCount('data') === 0) return;
  clearInterval(wait);
  process.stdin.on('data', function onData(chunk) {
    if (!String(chunk).includes('tools/call')) return;
    process.stdin.off('data', onData);
    ${onCall}
  });
}, 5);
`,
  );
  return pathToFileURL(file).href;
}

interface Call {
  readonly name: string;
  readonly args: Record<string, unknown>;
}

/**
 * Starts the bundle, does the handshake and calls the tools in sequence (ids 2, 3…), each one after the
 * previous one's response; returns the stdout as lines, the stderr and the exit code.
 */
function callTools(
  root: string,
  calls: readonly Call[],
  importUrl?: string,
): Promise<Run> {
  return new Promise((done, fail) => {
    const child = spawn(
      process.execPath,
      [...(importUrl ? ['--import', importUrl] : []), bundle, '--root', root],
      { stdio: 'pipe' },
    );
    let stdout = '';
    let stderr = '';
    // No response (the process may have crashed): ends it and lets the test check what came out.
    const timer = setTimeout(() => child.kill(), 50_000);
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    let next = 0;
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      if (!stdout.endsWith('\n')) return;
      // After the previous response (the handshake is id 1), the next call.
      if (!new RegExp(`"id":${next + 1}[,}]`).test(stdout)) return;
      if (next === 0) send({ method: 'notifications/initialized' });
      const call = calls[next];
      next += 1;
      if (call) {
        send({
          id: next + 1,
          method: 'tools/call',
          params: { name: call.name, arguments: call.args },
        });
      } else {
        child.stdin.end();
      }
    });
    child.on('error', fail);
    child.on('close', (code) => {
      clearTimeout(timer);
      done({ lines: stdout.split('\n').filter((line) => line !== ''), stderr, code });
    });
    child.stdin.on('error', () => {});
    const send = (message: Record<string, unknown>) =>
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
    send({
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test', version: '0' },
      },
    });
  });
}

const callTool = (
  root: string,
  name: string,
  args: Record<string, unknown>,
  importUrl?: string,
): Promise<Run> => callTools(root, [{ name, args }], importUrl);

const isJsonRpc = (line: string): boolean => {
  try {
    return (JSON.parse(line) as { jsonrpc?: unknown }).jsonrpc === '2.0';
  } catch {
    return false;
  }
};

const answered = (run: Run, id = 2) =>
  run.lines.some((line) => new RegExp(`"id":${id}[,}]`).test(line));

describe('bundle stdout (JSON-RPC only)', () => {
  it('get_image_file on a truncated JPEG writes nothing but JSON-RPC to stdout', async () => {
    const { root, dir } = await createImageWorkspace();
    const file = join(dir, IMAGE_FILES.jpeg);
    // Keeps the header (the dimensions are read before decoding) and cuts the rest: libjpeg
    // warns "Premature end of JPEG file".
    const bytes = readFileSync(file);
    writeFileSync(file, bytes.subarray(0, Math.floor(bytes.length / 2)));

    const run = await callTool(root, 'get_image_file', {
      ref: `i:${codeOf(IDS.jpeg)}`,
      project: 'imagens',
    });

    expect(run.lines.filter((line) => !isJsonRpc(line))).toEqual([]);
    expect(answered(run)).toBe(true);
  }, 30_000);

  it('what a codec writes with console.log during the call goes to stderr', async () => {
    const { root } = await createImageWorkspace();
    // Like Emscripten: captures `console.log` when instantiating the module, after startup.
    const run = await callTool(
      root,
      'list_projects',
      {},
      preload(
        "const out = console.log.bind(console); out('codec warning'); console.info('info'); console.debug('debug');",
      ),
    );

    expect(run.lines.filter((line) => !isJsonRpc(line))).toEqual([]);
    expect(answered(run)).toBe(true);
    expect(run.stderr).toContain('codec warning');
  }, 30_000);

  it('unhandled rejection: one line with the prefix on stderr and exit 1', async () => {
    const { root } = await createImageWorkspace();
    const run = await callTool(
      root,
      'list_projects',
      {},
      preload("Promise.reject(new Error('loose failure'));"),
    );

    expect(run.lines.filter((line) => !isJsonRpc(line))).toEqual([]);
    expect(run.stderr).toContain('mapping-mcp: loose failure');
    expect(run.code).toBe(1);
  }, 30_000);

  it('unhandled exception: one line with the prefix on stderr and exit 1', async () => {
    const { root } = await createImageWorkspace();
    const run = await callTool(
      root,
      'list_projects',
      {},
      preload("setImmediate(() => { throw new Error('loose exception'); });"),
    );

    expect(run.lines.filter((line) => !isJsonRpc(line))).toEqual([]);
    expect(run.stderr).toContain('mapping-mcp: loose exception');
    expect(run.code).toBe(1);
  }, 30_000);
});

describe('large messages on stdin', () => {
  it('plan_changes with 20 MB of base64 answers the id and the server stays alive', async () => {
    const { root } = await createImageWorkspace();
    const base64 = randomBytes(15 * 1024 * 1024).toString('base64');
    expect(base64.length).toBeGreaterThan(20_000_000);

    const run = await callTools(root, [
      {
        name: 'plan_changes',
        args: { project: 'imagens', operations: [{ op: 'add_image', base64 }] },
      },
      { name: 'list_projects', args: {} },
    ]);

    expect(run.lines.filter((line) => !isJsonRpc(line))).toEqual([]);
    const reply = run.lines.find((line) => /"id":2[,}]/.test(line));
    // Structured error from the operation (the bytes are not an image), not a dropped connection.
    expect(reply).toContain('unsupported-image');
    expect(answered(run, 3)).toBe(true);
  }, 60_000);

  it('above the transport ceiling: line with the prefix on stderr and exit 1, never a silent 0', async () => {
    const { root } = await createImageWorkspace();
    const run = await callTool(root, 'plan_changes', {
      project: 'imagens',
      operations: [{ op: 'add_image', base64: 'A'.repeat(MAX_MESSAGE_BYTES) }],
    });

    expect(run.lines.filter((line) => !isJsonRpc(line))).toEqual([]);
    expect(run.stderr).toMatch(/mapping-mcp: message larger than \d+ bytes/);
    expect(run.code).toBe(1);
  }, 60_000);
});
