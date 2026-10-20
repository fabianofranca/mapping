// Cliente MCP mínimo por stdio, para o agente testador fazer os pedidos ao servidor
// `mapping-mcp.js` sem o Claude Code (docs/TESTING.md, apêndice A, "Sem o Claude Code").
//
// Uso:
//   node scripts/testing/mcp-stdio-client.mjs <calls.json> [-- <argumentos do servidor>]
//
// Antes das chamadas, imprime as instruções do servidor, as mesmas que o Claude Code mostra ao agente.
//
// <calls.json> é uma lista: {"list":true} mostra as ferramentas e os esquemas; cada
// {"name":"<ferramenta>","args":{...}} chama uma ferramenta, na ordem.
//
// Ambiente:
//   WS                pasta do workspace onde o servidor roda (padrão: a pasta atual)
//   MAPPING_MCP_ARGS  argumentos do servidor, em JSON (ex.: ["tools/mapping-mcp.js","--root","x"])
//   IMGDIR            pasta onde gravar as imagens devolvidas (padrão: a pasta atual)
// Ordem dos argumentos do servidor (a fonte usada vai para o stderr):
//   1. depois do `--` na linha de comando; 2. MAPPING_MCP_ARGS;
//   3. `<WS>/.mcp.json`, se existir e for válido (`mcpServers.mapping.command` = `node`,
//      `mcpServers.mapping.args`), o mesmo arquivo que o cliente MCP do workspace lê;
//   4. o padrão de examples/workspace/: tools/mapping-mcp.js --root projetos --root especializacoes
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
const workspace = process.env.WS || process.cwd();

/** Argumentos de `mcpServers.mapping` do `.mcp.json` do workspace, ou null (ausente/inválido). */
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
      `[mcp-stdio-client] ${file} ignorado: mcpServers.mapping precisa de command "node" e args (lista de textos).`,
    );
  } catch (error) {
    console.error(`[mcp-stdio-client] ${file} ignorado: ${error.message}`);
  }
  return null;
}

let serverArgs;
let source;
if (sep >= 0 && argv.length > sep + 1) {
  serverArgs = argv.slice(sep + 1);
  source = 'linha de comando';
} else if (process.env.MAPPING_MCP_ARGS) {
  serverArgs = JSON.parse(process.env.MAPPING_MCP_ARGS);
  source = 'MAPPING_MCP_ARGS';
} else if ((serverArgs = argsFromMcpJson())) {
  source = path.join(workspace, '.mcp.json');
} else {
  serverArgs = DEFAULT_SERVER_ARGS;
  source = 'padrão de examples/workspace';
}
console.error(
  `[mcp-stdio-client] argumentos do servidor: ${source}: ${serverArgs.join(' ')}`,
);
const imgDir = process.env.IMGDIR || '.';
const calls = JSON.parse(fs.readFileSync(callsFile, 'utf8'));

const server = spawn('node', serverArgs, {
  cwd: workspace,
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

const init = await request('initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'agente-testador', version: '1' },
});
send({ jsonrpc: '2.0', method: 'notifications/initialized' });

console.log('=== instructions');
console.log(init.result?.instructions ?? '(sem instruções)');

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
