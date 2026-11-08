// Divide a v9 em dois lotes de até 1000 operações (o limite do MCP por proposta): A = biblioteca, ajustes
// das telas existentes e as primeiras telas novas; B = as telas que sobram (propor depois de A aplicada).
import { readFileSync, writeFileSync } from 'node:fs';
import { PATHS } from '../paths.mjs';
const a = JSON.parse(readFileSync('ops-v9-existentes.json', 'utf8'));
const b = JSON.parse(readFileSync('ops-v9-novas.json', 'utf8'));
const screens = [];
for (const o of b) {
  if (o.op === 'add_container') screens.push([]);
  screens[screens.length - 1].push(o);
}
const A = [{ op: 'update_specialization', file: `${PATHS.ws}/especializacoes/mapping-ds` }, ...a];
const B = [];
for (const s of screens) (B.length === 0 && A.length + s.length <= 1000 ? A : B).push(...s);
writeFileSync('ops-v9-A.json', JSON.stringify(A));
writeFileSync('ops-v9-B.json', JSON.stringify(B));
writeFileSync('ops-min.json', JSON.stringify(process.argv[2] === 'B' ? B : A));
console.log('A', A.length, '· B', B.length, '· ops-min =', process.argv[2] === 'B' ? 'B' : 'A');
