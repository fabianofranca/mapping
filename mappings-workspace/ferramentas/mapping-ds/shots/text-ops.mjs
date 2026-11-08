// Atualização pontual: compara os itens finais de duas extrações (FINAL do gen.mjs, antes e depois) e, para cada
// TEXTO cujo retângulo mudou, acha a marcação do projeto com o retângulo antigo e o mesmo texto e gera update_marking.
// node text-ops.mjs <final-antes.json> <final-depois.json>  →  ops-min.json (para mcp-propose.mjs)
import { readFileSync, writeFileSync } from 'node:fs';
import { PATHS } from '../paths.mjs';

const SCRATCH = PATHS.base;
const PROJECT = `${PATHS.ws}/projetos/comentarios`;
const LIB = `${PATHS.ws}/especializacoes/mapping-ds`;
const [beforeFile, afterFile] = process.argv.slice(2);
const before = JSON.parse(readFileSync(beforeFile, 'utf8'));
const after = JSON.parse(readFileSync(afterFile, 'utf8'));
const p = JSON.parse(readFileSync(`${PROJECT}/mapping.json`, 'utf8'));
const annByMarking = new Map(p.annotations.map((a) => [a.markingId, a]));
const same = (a, b) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

const ops = [{ op: 'update_specialization', file: LIB.split('/').join('\\') }];
const report = [];
const missing = [];
before.forEach((c, k) => {
  const c2 = after[k];
  if (c2.name !== c.name || c2.items.length !== c.items.length) throw new Error(`extrações não batem em ${c.name}`);
  const container = p.containers.find((x) => x.name === c.name);
  c.items.forEach((it, i) => {
    const nu = c2.items[i];
    if (it.type !== 'text') return;
    const rectChanged = !same(it.rect, nu.rect);
    const textChanged = nu.values.texto !== it.values.texto;
    if (!rectChanged && !textChanged) return;
    // Só a mudança do word joiner (U+2060) antes do lugar de um chip é desta correção; outro texto que mudou
    // (o zoom do canvas da fixture: 11% × 12%) fica como está.
    if (textChanged && nu.values.texto.replace(/⁠/g, '') !== it.values.texto) return console.log(`  ignorado (texto mudou): ${it.values.texto} → ${nu.values.texto}`);
    const m = p.markings.find((m) => m.containerId === container.id && same(m.rect, it.rect) && annByMarking.get(m.id)?.type.typeId === 'text' && annByMarking.get(m.id)?.values.texto === it.values.texto);
    if (!m) return missing.push(`${c.name}: ${it.values.texto.slice(0, 50)}`);
    if (rectChanged) ops.push({ op: 'update_marking', marking: `mapping://comentarios/m/${m.id.slice(0, 8)}`, rect: nu.rect });
    if (textChanged) ops.push({ op: 'update_annotation', annotation: `mapping://comentarios/a/${annByMarking.get(m.id).id.slice(0, 8)}`, values: { texto: nu.values.texto } });
    report.push(`${c.name} · ${it.values.texto.slice(0, 40)}: ${rectChanged ? `${it.rect.x},${it.rect.y} ${it.rect.width}×${it.rect.height} → ${nu.rect.x},${nu.rect.y} ${nu.rect.width}×${nu.rect.height}` : ''}${textChanged ? ' + texto com word joiner' : ''}`);
  });
});
writeFileSync(`${SCRATCH}/shots/ops-min.json`, JSON.stringify(ops));
console.log(report.join('\n'));
console.log(`\n${report.length} textos, ${ops.length - 1} operações; sem marcação correspondente: ${missing.length}`);
for (const s of missing) console.log('  falta:', s);
