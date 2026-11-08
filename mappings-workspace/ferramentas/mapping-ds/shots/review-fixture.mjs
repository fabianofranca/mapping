// Grava na fixture (shots/fixture) uma proposta ABERTA com mudanças variadas, para medir o modo revisão
// do app 0.25.0 (marcadores, decisões, valores antes/depois, outras mudanças, linha da lista de propostas).
// Usa o servidor MCP da mesma versão (mcp25/mapping-mcp.js). Rodar depois de fixture.mjs.
import { spawn } from 'node:child_process';
import { PATHS } from '../paths.mjs';
import { readdirSync, readFileSync, rmSync } from 'node:fs';

const BASE = PATHS.base;
const FIX = `${BASE}/shots/fixture`;
const TITLE = 'Revisão de teste: botões e pinos';

// Tira uma proposta de teste anterior (a fixture é descartável).
for (const id of readdirSync(`${FIX}/proposals`)) {
  const p = JSON.parse(readFileSync(`${FIX}/proposals/${id}/proposal.json`, 'utf8'));
  if (p.title === TITLE) rmSync(`${FIX}/proposals/${id}`, { recursive: true, force: true });
}

const server = spawn('node', [`${BASE}/mcp25/mapping-mcp.js`, '--root', `${BASE}/shots`], { cwd: `${BASE}/shots`, stdio: ['pipe', 'pipe', 'inherit'] });
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

const P = 'mapping://fixture';
const operations = [
  // Valores e nome do botão Salvar (marcadores de campo, valor antes/depois) e um deslocamento.
  { op: 'update_annotation', annotation: `${P}/a/5833b618`, values: { texto: 'Salvar alterações', variant: 'default' } },
  { op: 'update_marking', marking: `${P}/m/20875dee`, name: 'Salvar alterações', move: { dx: 12, dy: 0 } },
  // Trava do campo (outras mudanças) e um botão novo (criada).
  { op: 'update_marking', marking: `${P}/m/4411a58f`, locked: true },
  { op: 'create_marking', container: `${P}/i/d944ba69`, rect: { x: 500, y: 300, width: 96, height: 28 }, name: 'Cancelar', annotation: { type: 'button', values: { texto: 'Cancelar', variant: 'default', size: 'md', desabilitado: 'não' } } },
  // Remoção (removida) e envolver dois pinos (envolvida).
  { op: 'delete_marking', marking: `${P}/m/705d1a85` },
  { op: 'wrap_items', items: [`${P}/m/31507ef5`, `${P}/m/c7f06afe`], name: 'Pinos abertos' },
  // Camada renomeada (outras mudanças: camadas).
  { op: 'update_layer', layer: '0c4a1f3e-6b2d-4e8a-9c71-5d3f2a1b0e94', name: 'Rascunhos' },
];
const res = await call('tools/call', {
  name: 'propose_changes',
  arguments: { project: 'fixture', operations, title: TITLE, description: 'Mudanças de exemplo para medir o modo revisão.', origin: 'shots/review-fixture.mjs' },
});
const text = res.result?.content?.map((c) => c.text).join('\n') ?? JSON.stringify(res.error ?? res);
console.log(text.slice(0, 1500));
server.kill();
