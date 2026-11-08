// A partir de extracted.json: (1) preview.zip, um projeto de prévia para abrir no app e comparar;
// (2) ops.json, as operações da proposta para o projeto comentarios.
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const SCRATCH = 'C:/Pessoal/mapping/workspace/ferramentas/mapping-ds';
const PROJECT = 'C:/Pessoal/mapping/workspace/projetos/comentarios';
const LIB = 'C:/Pessoal/mapping/workspace/especializacoes/mapping-ds';
const require = createRequire(`${SCRATCH}/app/package.json`);
const JSZip = require('jszip');

// IN=<extracted.json> lê outra extração; FINAL=<arquivo> grava os itens como ficam no projeto (depois dos ajustes).
const extracted = JSON.parse(readFileSync(process.env.IN ?? `${SCRATCH}/shots/extracted.json`, 'utf8'));
const spec = JSON.parse(readFileSync(`${LIB}/mapping-ds.spec.json`, 'utf8'));
const TYPES = Object.fromEntries(spec.layers[0].annotationTypes.map((t) => [t.id, t]));
const PREVIEW = Object.fromEntries(
  Object.values(TYPES)
    .filter((t) => t.component)
    .map((t) => [t.id, JSON.parse(readFileSync(`${LIB}/${t.component}`, 'utf8')).preview ?? {}]),
);

// ---- Conteúdo de exemplo no canvas do editor (o canvas real mostra o projeto aberto).
const editor = extracted.containers[0];
const canvas = editor.items.find((i) => i.type === 'canvas-marking');
const cx = canvas.rect.x;
const cy = canvas.rect.y;
const sample = [
  { type: 'canvas-marking', name: 'Tela de login', rect: { x: cx + 160, y: cy + 140, width: 380, height: 260 }, values: { nome: 'Tela de login', fundo: 'nenhum' } },
  { type: 'text-field', name: 'Campo E-mail', rect: { x: cx + 200, y: cy + 200, width: 220, height: 48 }, values: { rotulo: 'E-mail', valor: 'marina@exemplo.com', size: 'md', invalido: 'não', linhas: 'uma' } },
  { type: 'button', name: 'Salvar', rect: { x: cx + 200, y: cy + 290, width: 96, height: 28 }, values: { texto: 'Salvar', variant: 'primary', size: 'md', desabilitado: 'não', alinhamento: 'center' } },
  { type: 'comment-pin', name: 'Pino — 2 conversas', as: 'pin', rect: { x: cx + 296, y: cy + 270, width: 23, height: 20 }, values: { estado: 'humano', rotulo: '2', selecionado: 'sim', naoLida: 'sim', rascunho: 'não' } },
];
editor.items.splice(editor.items.indexOf(canvas) + 1, 0, ...sample);

// O app recusa marcação com menos de 8 px (MIN_MARKING_SIZE em src/model/geometry.ts): os itens menores
// crescem até 8, centralizados; a divisória cresce para o lado oposto ao da linha. O conteúdo do
// minimapa (dinâmico) sai.
const MIN = 8;
for (const c of extracted.containers) {
  c.items = c.items.filter((it) => !/minimap-(image|view)/.test(it.name));
  for (const it of c.items) {
    const r = it.rect;
    if (r.width < MIN) {
      if (it.type === 'box' && it.values.lados === 'direita') r.x -= MIN - r.width;
      else if (it.type !== 'box' || it.values.lados !== 'esquerda') r.x -= Math.floor((MIN - r.width) / 2);
      r.width = MIN;
      if (it.type === 'text') it.values.alinhamento = 'center';
    }
    if (r.height < MIN) {
      if (it.type === 'box' && it.values.lados === 'baixo') r.y -= MIN - r.height;
      else if (it.type !== 'box' || it.values.lados !== 'cima') r.y -= Math.floor((MIN - r.height) / 2);
      r.height = MIN;
    }
    r.x = Math.max(0, Math.min(r.x, c.width - r.width));
    r.y = Math.max(0, Math.min(r.y, c.height - r.height));
  }
}

// Parágrafo: altura de linhas × altura de linha do estilo (o DOM mede menos e o canvas esconde a linha que não cabe).
const LINE_H = { 't-display': 28, 't-title': 22, 't-heading': 20, 't-body': 20, 't-body-strong': 20, 't-small': 16, 't-label': 16, 't-micro': 16, 't-code': 18, 't-kbd': 16 };
for (const c of extracted.containers)
  for (const it of c.items)
    if (it.type === 'text' && it.values.quebra === 'sim') {
      const need = (it.lines ?? 2) * (LINE_H[it.values.estilo] ?? 20) + 2;
      if (it.rect.height < need) it.rect.height = Math.min(need, c.height - it.rect.y);
    }

if (process.env.FINAL) writeFileSync(process.env.FINAL, JSON.stringify(extracted.containers.map((c) => ({ name: c.name, items: c.items }))));

// Pais pela geometria: a menor marcação que contém o retângulo (no empate, a que vem antes).
const contains = (a, b) => b.x >= a.x && b.y >= a.y && b.x + b.width <= a.x + a.width && b.y + b.height <= a.y + a.height;
function parents(items) {
  return items.map((it, i) => {
    let best = -1;
    let area = Infinity;
    items.forEach((p, j) => {
      if (j === i || !contains(p.rect, it.rect)) return;
      const same = contains(it.rect, p.rect);
      if (same && j > i) return;
      const a = p.rect.width * p.rect.height;
      if (a < area || (a === area && j > best)) {
        area = a;
        best = j;
      }
    });
    return best;
  });
}

const fullValues = (type, values) => {
  const out = {};
  for (const f of TYPES[type].fields) {
    let v = values[f.key];
    if (v === undefined) v = PREVIEW[type]?.[f.key] ?? f.default ?? null;
    if (f.type === 'table' && Array.isArray(v)) v = v.map((row) => ({ _id: randomUUID(), ...Object.fromEntries(f.columns.map((c) => [c.key, row[c.key] ?? c.default ?? null])) }));
    out[f.key] = v === '' ? null : v;
  }
  return out;
};
const diffValues = (type, values) => {
  const prev = PREVIEW[type] ?? {};
  const out = {};
  for (const f of TYPES[type].fields) {
    const v = values[f.key] === '' ? null : values[f.key];
    if (v === undefined) continue;
    const p = prev[f.key] ?? null;
    if (JSON.stringify(v) === JSON.stringify(p)) continue;
    if (v === null && p === null) continue;
    out[f.key] = v;
  }
  return out;
};
const LABELED = new Set(['text', 'badge', 'avatar', 'icon', 'tab']);

// ---- (1) Projeto de prévia
const base = JSON.parse(readFileSync(`${PROJECT}/mapping.json`, 'utf8'));
const layer = base.layers.find((l) => l.spec?.specId === 'mapping-ds');
const pins = base.containers.find((c) => c.name.startsWith('Pinos'));
const preview = { ...base, revision: 0, containers: [], markings: [], annotations: [], arrows: [] };
preview.specializations = base.specializations.map((s) => (s.id === 'mapping-ds' ? { ...s, version: spec.version } : s));
let x = 0;
for (const c of extracted.containers) {
  const id = randomUUID();
  preview.containers.push({ id, name: c.name, file: null, width: c.width, height: c.height, placement: { x, y: 0, scale: 1 }, parentId: null, markingColor: null, locked: false, source: null, background: c.background.toUpperCase() });
  x += c.width + 200;
  const ids = c.items.map(() => randomUUID());
  const par = parents(c.items);
  c.items.forEach((it, i) => {
    preview.markings.push({ id: ids[i], containerId: id, parentId: par[i] >= 0 ? ids[par[i]] : null, name: LABELED.has(it.type) ? null : it.name, rect: it.rect, needsReview: false, locked: false, floating: false, source: null });
    preview.annotations.push({ id: randomUUID(), markingId: ids[i], layerId: layer.id, name: null, parentAnnotationId: null, parentRole: null, type: { specId: 'mapping-ds', typeId: it.type }, values: fullValues(it.type, it.values), entries: [] });
  });
}
preview.containers.push({ ...pins, placement: { x, y: 0, scale: 1 } });
for (const m of base.markings.filter((m) => m.containerId === pins.id)) preview.markings.push(m);
for (const a of base.annotations.filter((a) => preview.markings.some((m) => m.id === a.markingId))) preview.annotations.push(a);
const zip = new JSZip();
zip.file('mapping.json', JSON.stringify(preview, null, 2));
const walk = (dir) => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
for (const f of walk(LIB)) zip.file(`specs/mapping-ds/${relative(LIB, f).split('\\').join('/')}`, readFileSync(f));
for (const f of walk(`${PROJECT}/specs/notas`)) zip.file(`specs/notas/${relative(`${PROJECT}/specs/notas`, f).split('\\').join('/')}`, readFileSync(f));
writeFileSync(`${SCRATCH}/shots/preview.zip`, await zip.generateAsync({ type: 'nodebuffer' }));

// ---- (2) Operações da proposta
const ops = [{ op: 'update_specialization', file: LIB.split('/').join('\\') }];
for (const a of ['dd63df03', 'bd0b9234', '70338b37', 'a66c32b5']) ops.push({ op: 'delete_arrow', arrow: `mapping://comentarios/m/${a}` });
for (const c of ['d944ba69', 'e9cd2275', '9fdebee7', 'ca5b14d9']) ops.push({ op: 'delete_container', container: `mapping://comentarios/i/${c}` });
const alias = {};
extracted.containers.forEach((c, k) => {
  const cAlias = `$c${k}`;
  ops.push({ op: 'add_container', as: cAlias, name: c.name, width: c.width, height: c.height, background: c.background });
  c.items.forEach((it, i) => {
    const op = { op: 'create_marking', container: cAlias, rect: it.rect, annotation: { type: it.type } };
    if (!LABELED.has(it.type)) op.name = it.name;
    const values = Object.fromEntries(Object.entries(fullValues(it.type, it.values)).filter(([, v]) => v !== null));
    if (Object.keys(values).length) op.annotation.values = values;
    const key = it.as ?? (k === 0 && ['comments-window', 'composer'].includes(it.type) ? it.type : null);
    if (key && !alias[key]) {
      alias[key] = `$m${k}_${i}`;
      op.as = alias[key];
    }
    ops.push(op);
  });
});
const arrows = [
  ['83561ea1', 'comments-window', 'arquivos → tabela de conversas'],
  ['7cbfbbe3', 'pin', 'âncora → pino'],
  ['b42ddac2', 'comments-window', 'estados → tabela de conversas'],
  ['3a90a0b3', 'composer', 'quem grava → compositor'],
];
for (const [from, to, name] of arrows) if (alias[to]) ops.push({ op: 'create_arrow', from: `mapping://comentarios/m/${from}`, to: alias[to], name });
writeFileSync(`${SCRATCH}/shots/ops.json`, JSON.stringify(ops));
console.log('prévia:', preview.markings.length, 'marcações; proposta:', ops.length, 'operações,', JSON.stringify(ops).length, 'bytes');

// Um zip por container (o app enquadra o único container ao abrir).
for (const c of preview.containers) {
  const one = { ...preview, containers: [{ ...c, placement: { x: 0, y: 0, scale: 1 } }] };
  one.markings = preview.markings.filter((m) => m.containerId === c.id);
  one.annotations = preview.annotations.filter((a) => one.markings.some((m) => m.id === a.markingId));
  const z = new JSZip();
  z.file('mapping.json', JSON.stringify(one, null, 2));
  for (const f of walk(LIB)) z.file(`specs/mapping-ds/${relative(LIB, f).split('\\').join('/')}`, readFileSync(f));
  for (const f of walk(`${PROJECT}/specs/notas`)) z.file(`specs/notas/${relative(`${PROJECT}/specs/notas`, f).split('\\').join('/')}`, readFileSync(f));
  writeFileSync(`${SCRATCH}/shots/preview-${preview.containers.indexOf(c)}.zip`, await z.generateAsync({ type: 'nodebuffer' }));
}
