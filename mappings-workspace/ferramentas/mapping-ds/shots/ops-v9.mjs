// Operações da v9 sobre os containers que o projeto comentarios já tem, a partir da medição nova
// (extract.mjs com as regras de v9/*/rules.mjs). Casa cada item medido com a marcação do projeto
// (mesmo container e tipo, retângulos que se cobrem, mesmo texto): valores diferentes viram
// update_annotation; item sem par vira create_marking; marcação sem par (de um tipo que a medição
// agora chama de outro jeito) vira delete_marking. Grava ops-v9-existentes.json e um relatório.
import { readFileSync, writeFileSync } from 'node:fs';
import { PATHS } from '../paths.mjs';

const SHOTS = `${PATHS.base}/shots`;
const PROJECT = `${PATHS.ws}/projetos/comentarios`;
const LIB = `${PATHS.ws}/especializacoes/mapping-ds`;
const extracted = JSON.parse(readFileSync(process.argv[2] ?? `${SHOTS}/extracted.json`, 'utf8'));
const p = JSON.parse(readFileSync(`${PROJECT}/mapping.json`, 'utf8'));
const spec = JSON.parse(readFileSync(`${LIB}/mapping-ds.spec.json`, 'utf8'));
const TYPES = Object.fromEntries(spec.layers[0].annotationTypes.map((t) => [t.id, t]));
const ann = new Map(p.annotations.map((a) => [a.markingId, a]));
const ref = (k, id) => `mapping://comentarios/${k}/${id.slice(0, 8)}`;
const LABELED = new Set(['text', 'badge', 'avatar', 'icon', 'tab']);
const LINE_H = { 't-display': 28, 't-title': 22, 't-heading': 20, 't-body': 20, 't-body-strong': 20, 't-small': 16, 't-label': 16, 't-micro': 16, 't-code': 18, 't-kbd': 16 };

const inter = (a, b) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
const iou = (a, b) => inter(a, b) / (a.width * a.height + b.width * b.height - inter(a, b));
const norm = (v) => (v === '' || v === undefined ? null : v);

// O retângulo final de um item novo: o parágrafo ganha a altura das linhas (como no gen.mjs); o texto
// cortado pelo app fica com a largura da caixa onde ele corta (como no ops-v8.mjs).
function finalRect(it, c) {
  const r = { ...it.rect };
  if (it.type === 'text' && it.values.quebra === 'sim') {
    const need = (it.lines ?? 2) * (LINE_H[it.values.estilo] ?? 20) + 2;
    if (r.height < need) r.height = Math.min(need, c.height - r.y);
  }
  if (it.type === 'text' && it.cw !== undefined && it.tw - it.cw > 0.01) r.width = Math.max(1, Math.min(r.width, Math.round(it.cw), Math.ceil(it.tw) - 1));
  return r;
}
function cleanValues(type, values) {
  const out = {};
  // Todos os campos (null quando vazio): campo omitido seria completado com o exemplo do componente.
  for (const f of TYPES[type].fields) out[f.key] = values[f.key] === undefined ? f.default ?? null : norm(values[f.key]);
  return out;
}
export function newItemOps(c, it, container) {
  const op = { op: 'create_marking', container, rect: finalRect(it, c), annotation: { type: it.type } };
  if (!LABELED.has(it.type)) op.name = it.name;
  const v = cleanValues(it.type, it.values);
  if (Object.keys(v).length) op.annotation.values = v;
  return op;
}

const ops = [];
const report = [];
for (const c of extracted.containers) {
  const pc = p.containers.find((x) => x.name === c.name);
  if (!pc) continue;
  const marks = p.markings.filter((m) => m.containerId === pc.id && ann.get(m.id)?.type.specId === 'mapping-ds').map((m) => ({ m, a: ann.get(m.id) }));
  const used = new Set();
  const created = [];
  for (const it of c.items) {
    const cand = marks
      .filter(({ m, a }) => !used.has(m.id) && a.type.typeId === it.type && (it.type !== 'text' || a.values.texto === it.values.texto))
      .map((x) => ({ ...x, s: it.type === 'text' ? 1 - Math.hypot(x.m.rect.x + x.m.rect.width / 2 - it.rect.x - it.rect.width / 2, x.m.rect.y + x.m.rect.height / 2 - it.rect.y - it.rect.height / 2) / 12 : iou(x.m.rect, it.rect) }))
      .sort((x, y) => y.s - x.s)[0];
    if (cand && cand.s > (it.type === 'text' ? 0 : 0.6)) {
      used.add(cand.m.id);
      const diff = {};
      for (const f of TYPES[it.type].fields) {
        if (!(f.key in it.values)) continue;
        if (JSON.stringify(norm(it.values[f.key])) !== JSON.stringify(norm(cand.a.values[f.key]))) diff[f.key] = norm(it.values[f.key]);
      }
      // A largura da caixa do texto cortado já foi gravada pela v8; a reticência também.
      if (Object.keys(diff).length) {
        ops.push({ op: 'update_annotation', annotation: ref('a', cand.a.id), values: diff });
        report.push(`${c.name.slice(0, 12)} | alterar ${it.type} "${it.name.slice(0, 30)}" ${JSON.stringify(diff)}`);
      }
    } else created.push(it);
  }
  // A data do build muda com o dia da medição: o texto do projeto fica.
  for (let k = created.length - 1; k >= 0; k--) if (created[k].type === 'text' && /^[0-9a-f]{7}\s*·\s*\d{4}-\d{2}-\d{2}$/.test(created[k].values.texto)) created.splice(k, 1);
  // O campo de zoom é átomo: o texto que estava no lugar dele sai, e o valor é o do projeto.
  for (const it of created.filter((x) => x.type === 'zoom-field')) {
    const inside = marks.filter(({ m, a }) => a.type.typeId === 'text' && m.rect.x >= it.rect.x && m.rect.y >= it.rect.y && m.rect.x + m.rect.width <= it.rect.x + it.rect.width && m.rect.y + m.rect.height <= it.rect.y + it.rect.height);
    for (const { m, a } of inside) {
      it.values = { ...it.values, valor: a.values.texto };
      used.add(m.id);
      ops.push({ op: 'delete_marking', marking: ref('m', m.id) });
      report.push(`${c.name.slice(0, 12)} | apagar text "${a.values.texto}" (dentro do zoom)`);
    }
  }
  // A marcação que um item medido de outro tipo substitui (mesmo lugar) fica, com as filhas: troca só a
  // anotação (delete_marking levaria as filhas junto) e, se preciso, o retângulo e o nome. O resto fica
  // (o conteúdo de exemplo do canvas, a data do build, o que a rolagem cortou na medição nova).
  for (const { m, a } of marks) {
    if (used.has(m.id)) continue;
    const k = created.findIndex((it) => it.type !== a.type.typeId && iou(it.rect, m.rect) > 0.6);
    if (k < 0) continue;
    const [it] = created.splice(k, 1);
    used.add(m.id);
    const rect = finalRect(it, c);
    const upd = { op: 'update_marking', marking: ref('m', m.id) };
    if (JSON.stringify(rect) !== JSON.stringify(m.rect)) upd.rect = rect;
    const name = LABELED.has(it.type) ? null : it.name;
    if (name !== m.name) upd.name = name;
    if (upd.rect || 'name' in upd) ops.push(upd);
    ops.push({ op: 'delete_annotation', annotation: ref('a', a.id) });
    ops.push({ op: 'create_annotation', marking: ref('m', m.id), type: it.type, values: cleanValues(it.type, it.values) });
    report.push(`${c.name.slice(0, 12)} | trocar ${a.type.typeId} → ${it.type} "${it.name.slice(0, 30)}" ${JSON.stringify(m.rect)}${upd.rect ? ' → ' + JSON.stringify(rect) : ''}`);
  }
  for (const it of created) {
    ops.push(newItemOps(c, it, ref('i', pc.id)));
    report.push(`${c.name.slice(0, 12)} | criar ${it.type} "${it.name.slice(0, 30)}" ${JSON.stringify(it.rect)}`);
  }
}
writeFileSync(`${SHOTS}/ops-v9-existentes.json`, JSON.stringify(ops, null, 1));
writeFileSync(`${SHOTS}/ops-v9-existentes.txt`, report.join('\n'));
const count = {};
for (const o of ops) count[o.op] = (count[o.op] ?? 0) + 1;
console.log(JSON.stringify(count));
