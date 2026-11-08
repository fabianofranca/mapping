// Chama propose_changes no servidor MCP do workspace (tools/mapping-mcp.js, stdio JSON-RPC),
// com as operações de ops-min.json. Mesmo servidor e mesma validação do cliente.
import { spawn } from 'node:child_process';
import { PATHS } from '../paths.mjs';
import { readFileSync, writeFileSync } from 'node:fs';

const WS = PATHS.ws;
const SCRATCH = PATHS.base;
const tool = process.argv[2] ?? 'plan_changes';
const operations = JSON.parse(readFileSync(`${SCRATCH}/shots/ops-min.json`, 'utf8'));
writeFileSync(`${SCRATCH}/shots/lote/operacoes.json`, JSON.stringify(operations));

// Lote com mais de 1000 operações: vai por operationsFile, num .json dentro de uma raiz (shots/lote).
const LOTE = `${SCRATCH}/shots/lote`;
const server = spawn('node', ['tools/mapping-mcp.js', '--root', 'projetos', '--root', 'especializacoes', '--root', LOTE], { cwd: WS, stdio: ['pipe', 'pipe', 'inherit'] });
let buf = '';
const pending = new Map();
server.stdout.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.id !== undefined && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});
let next = 1;
const call = (method, params) =>
  new Promise((resolve) => {
    const id = next++;
    pending.set(id, resolve);
    server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });

await call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-code', version: '1' } });
server.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
const args = {
  project: 'comentarios',
  ...(operations.length > 1000 ? { operationsFile: `${LOTE}/operacoes.json` } : { operations }),
  // Título, descrição e origem da proposta: shots/ops-meta.json ({ title, description, origin }).
  ...(tool === 'propose_changes' ? JSON.parse(readFileSync(`${SCRATCH}/shots/ops-meta.json`, 'utf8')) : {}),
};
const res = await call('tools/call', { name: tool, arguments: args });
const text = res.result?.content?.map((c) => c.text).join('\n') ?? JSON.stringify(res.error ?? res);
writeFileSync(`${SCRATCH}/shots/mcp-${tool}.json`, text);
let parsed = null;
try {
  parsed = JSON.parse(text);
} catch {}
if (parsed) {
  console.log(JSON.stringify({ valid: parsed.valid, isError: res.result?.isError, operations: parsed.operations, issues: parsed.issues, changes: parsed.changes, proposal: parsed.proposal, errors: parsed.errors?.slice?.(0, 10), warnings: parsed.warnings?.slice?.(0, 10) }, null, 1));
} else console.log(text.slice(0, 3000));
server.kill();
