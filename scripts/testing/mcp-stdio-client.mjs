// Minimal MCP client over stdio, so the tester agent can make requests to the `mapping-mcp.js`
// server without Claude Code (docs/TESTING.md, appendix A, "Without Claude Code").
//
// Usage:
//   node scripts/testing/mcp-stdio-client.mjs <calls.json> [-- <server arguments>]
//
// Before the calls, it prints the server's instructions, the same ones Claude Code shows the agent.
//
// What it prints per call (`=== <tool>` and the response JSON):
//   - text: the response text, as it came;
//   - image: writes the file in IMGDIR with the extension by type (image/png -> .png,
//     image/jpeg -> .jpg, image/webp -> .webp, other -> .bin) and prints
//     {"saved": <file>, "mimeType": <type>};
//   - `url`: if the response's JSON text carries `url` (http://127.0.0.1:...), the client checks it
//     right there, with the server alive (HEAD and GET with fetch; the url is only valid while the
//     server runs, and it is shut down at the end of the calls), and appends a last item
//     {"urlCheck": {url, head, get, sameAsImage}} (sameAsImage compares the bytes of the GET with those of the
//     response's image; null if there is no image; on a fetch failure, {url, error}).
//
// <calls.json> is a list: {"list":true} shows the tools and the schemas; each
// {"name":"<tool>","args":{...}} calls a tool, in order.
//
// Environment:
//   WS                workspace folder where the server runs (default: the current folder)
//   MAPPING_MCP_ARGS  server arguments, as JSON (e.g. ["tools/mapping-mcp.js","--root","x"])
//   IMGDIR            folder where to write the returned images (default: the current folder)
// Order of the server arguments (the source used goes to stderr):
//   1. after the `--` on the command line; 2. MAPPING_MCP_ARGS;
//   3. `<WS>/.mcp.json`, if it exists and is valid (`mcpServers.mapping.command` = `node`,
//      `mcpServers.mapping.args`), the same file the workspace's MCP client reads;
//   4. the default of examples/workspace/: tools/mapping-mcp.js --root projetos --root especializacoes
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_SERVER_ARGS = [
  'tools/mapping-mcp.js',
  '--root',
  'projetos',
  '--root',
  'especializacoes',
];

const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
const callsFile = argv[0];
if (!callsFile || callsFile === '--') {
  console.error('Usage: node mcp-stdio-client.mjs <calls.json> [-- <server arguments>]');
  process.exit(2);
}
const workspace = process.env.WS || process.cwd();

/** Arguments of `mcpServers.mapping` in the workspace's `.mcp.json`, or null (absent/invalid). */
function argsFromMcpJson() {
  const file = path.join(workspace, '.mcp.json');
  if (!fs.existsSync(file)) return null;
  try {
    const entry = JSON.parse(fs.readFileSync(file, 'utf8'))?.mcpServers?.mapping;
    if (
      entry?.command === 'node' &&
      Array.isArray(entry.args) &&
      entry.args.every((a) => typeof a === 'string')
    )
      return entry.args;
    console.error(
      `[mcp-stdio-client] ${file} ignored: mcpServers.mapping needs command "node" and args (a list of strings).`,
    );
  } catch (error) {
    console.error(`[mcp-stdio-client] ${file} ignored: ${error.message}`);
  }
  return null;
}

let serverArgs;
let source;
if (sep >= 0 && argv.length > sep + 1) {
  serverArgs = argv.slice(sep + 1);
  source = 'command line';
} else if (process.env.MAPPING_MCP_ARGS) {
  serverArgs = JSON.parse(process.env.MAPPING_MCP_ARGS);
  source = 'MAPPING_MCP_ARGS';
} else if ((serverArgs = argsFromMcpJson())) {
  source = path.join(workspace, '.mcp.json');
} else {
  serverArgs = DEFAULT_SERVER_ARGS;
  source = 'default of examples/workspace';
}
console.error(`[mcp-stdio-client] server arguments: ${source}: ${serverArgs.join(' ')}`);
const imgDir = process.env.IMGDIR || '.';
const calls = JSON.parse(fs.readFileSync(callsFile, 'utf8'));

const MIME_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };

/** Local `url` of the server in the response's JSON text, or null (text that is not JSON is ignored). */
function urlFromText(text) {
  try {
    const url = JSON.parse(text)?.url;
    return typeof url === 'string' && url.startsWith('http://127.0.0.1:') ? url : null;
  } catch {
    return null;
  }
}

/** HEAD and GET of the url with the server alive; compares the bytes of the GET with those of the image. */
async function checkUrl(url, imageBytes) {
  try {
    const head = await fetch(url, { method: 'HEAD' });
    const get = await fetch(url);
    const bytes = Buffer.from(await get.arrayBuffer());
    return {
      url,
      head: {
        status: head.status,
        contentType: head.headers.get('content-type'),
        contentLength: head.headers.get('content-length'),
      },
      get: {
        status: get.status,
        contentType: get.headers.get('content-type'),
        bytes: bytes.length,
      },
      sameAsImage: imageBytes ? bytes.equals(imageBytes) : null,
    };
  } catch (error) {
    return { url, error: error instanceof Error ? error.message : String(error) };
  }
}

const server = spawn('node', serverArgs, {
  cwd: workspace,
  stdio: ['pipe', 'pipe', 'inherit'],
});

server.stdout.setEncoding('utf8');
let buffer = '';
let lastId = 0;
let exited = null;
const pending = new Map();

/** Ends with a short message, no stack. */
function fail(message) {
  console.error(`[mcp-stdio-client] ${message}`);
  process.exit(1);
}

server.on('error', (error) => {
  fail(
    `could not start the server (${error.code ?? error.message}): node ${serverArgs.join(' ')}`,
  );
});
server.on('exit', (code) => {
  exited = `The server ended (code ${code}).`;
  for (const { reject } of pending.values()) reject(new Error(exited));
  pending.clear();
});
server.stdout.on('data', (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    const waiter = message.id && pending.get(message.id);
    if (waiter) {
      pending.delete(message.id);
      waiter.resolve(message);
    }
  }
});

const send = (message) => server.stdin.write(JSON.stringify(message) + '\n');
const request = (method, params) =>
  new Promise((resolve, reject) => {
    if (exited) {
      reject(new Error(exited));
      return;
    }
    const id = ++lastId;
    pending.set(id, { resolve, reject });
    send({ jsonrpc: '2.0', id, method, params });
  });

process.on('uncaughtException', (error) => {
  fail(error instanceof Error ? error.message : String(error));
});

const init = await request('initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'tester-agent', version: '1' },
});
send({ jsonrpc: '2.0', method: 'notifications/initialized' });

console.log('=== instructions');
console.log(init.result?.instructions ?? '(no instructions)');

for (const call of calls) {
  const response = call.list
    ? await request('tools/list', {})
    : await request('tools/call', { name: call.name, arguments: call.args ?? {} });
  let out;
  if (response.error) {
    out = response.error;
  } else if (call.list) {
    out = response.result.tools.map((t) => ({
      name: t.name,
      inputSchema: t.inputSchema,
    }));
  } else {
    let url = null;
    let imageBytes = null;
    out = response.result.content.map((item) => {
      if (item.type === 'text') {
        url ??= urlFromText(item.text);
        return item.text;
      }
      // Image (e.g. get_marking_image): writes a file for the agent to open.
      const ext = MIME_EXT[item.mimeType] ?? '.bin';
      const file = path.join(imgDir, `${call.name}-${lastId}${ext}`);
      imageBytes = Buffer.from(item.data, 'base64');
      fs.writeFileSync(file, imageBytes);
      return { saved: file, mimeType: item.mimeType };
    });
    if (url) out.push({ urlCheck: await checkUrl(url, imageBytes) });
  }
  console.log(`=== ${call.list ? 'tools/list' : call.name}`);
  console.log(JSON.stringify(out, null, 1));
}
server.kill();
