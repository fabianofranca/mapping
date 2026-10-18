// Cliente MCP mínimo por stdio, para o agente testador fazer os pedidos ao servidor
// `mapping-mcp.js` sem o Claude Code (docs/TESTING.md, apêndice A, "Sem o Claude Code").
//
// Uso:
//   node scripts/testing/mcp-stdio-client.mjs <calls.json> [-- <argumentos do servidor>]
//
// <calls.json> é uma lista: {"list":true} mostra as ferramentas e os esquemas; cada
// {"name":"<ferramenta>","args":{...}} chama uma ferramenta, na ordem.
//
// Ambiente:
//   WS                pasta do workspace onde o servidor roda (padrão: a pasta atual)
//   MAPPING_MCP_ARGS  argumentos do servidor, em JSON (ex.: ["tools/mapping-mcp.js","--root","x"])
//   IMGDIR            pasta onde gravar as imagens devolvidas (padrão: a pasta atual)
// Sem argumentos do servidor, vale o padrão de examples/workspace/ (o mesmo do .mcp.json):
//   tools/mapping-mcp.js --root projetos --root especializacoes
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
  console.error(
    'Uso: node mcp-stdio-client.mjs <calls.json> [-- <argumentos do servidor>]',
  );
  process.exit(2);
}
const serverArgs =
  sep >= 0 && argv.length > sep + 1
    ? argv.slice(sep + 1)
    : process.env.MAPPING_MCP_ARGS
      ? JSON.parse(process.env.MAPPING_MCP_ARGS)
      : DEFAULT_SERVER_ARGS;
const imgDir = process.env.IMGDIR || '.';
const calls = JSON.parse(fs.readFileSync(callsFile, 'utf8'));

const server = spawn('node', serverArgs, {
  cwd: process.env.WS || process.cwd(),
  stdio: ['pipe', 'pipe', 'inherit'],
});

let buffer = '';
let lastId = 0;
const pending = new Map();
server.on('exit', (code) => {
  for (const resolve of pending.values()) {
    resolve({ error: { message: `O servidor terminou (código ${code}).` } });
  }
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
    const resolve = message.id && pending.get(message.id);
    if (resolve) {
      pending.delete(message.id);
      resolve(message);
    }
  }
});

const send = (message) => server.stdin.write(JSON.stringify(message) + '\n');
const request = (method, params) =>
  new Promise((resolve) => {
    const id = ++lastId;
    pending.set(id, resolve);
    send({ jsonrpc: '2.0', id, method, params });
  });

await request('initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'agente-testador', version: '1' },
});
send({ jsonrpc: '2.0', method: 'notifications/initialized' });

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
    out = response.result.content.map((item) => {
      if (item.type === 'text') return item.text;
      // Imagem (ex.: get_marking_image): grava um arquivo para o agente abrir.
      const file = path.join(imgDir, `${call.name}-${lastId}.png`);
      fs.writeFileSync(file, Buffer.from(item.data, 'base64'));
      return { saved: file };
    });
  }
  console.log(`=== ${call.list ? 'tools/list' : call.name}`);
  console.log(JSON.stringify(out, null, 1));
}
server.kill();
