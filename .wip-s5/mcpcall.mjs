// Cliente MCP stdio mínimo: node mcpcall.mjs <root> <calls.json>  (calls: [{name,args}]) → imprime JSON de cada resposta, uma por linha
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const [root, callsFile, outFile] = process.argv.slice(2);
const calls = JSON.parse(fs.readFileSync(callsFile, 'utf8'));
const child = spawn('node', ['/home/user/mapping/dist-mcp/mapping-mcp.js', '--root', root], { stdio: ['pipe', 'pipe', 'inherit'] });
child.stdout.setEncoding('utf8');
let buf = '';
const pending = new Map();
child.stdout.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    const msg = JSON.parse(line);
    if (msg.id !== undefined && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  }
});
let id = 0;
const rpc = (method, params) => new Promise((res) => { const i = ++id; pending.set(i, res); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: i, method, params }) + '\n'); });
await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } });
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
const out = [];
for (const c of calls) {
  const r = await rpc('tools/call', { name: c.name, arguments: c.args });
  const text = r.result?.content?.find((x) => x.type === 'text')?.text ?? JSON.stringify(r);
  out.push({ isError: r.result?.isError === true, text });
}
child.kill();
fs.writeFileSync(outFile, JSON.stringify(out));
