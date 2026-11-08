// Operações da v8 sobre o projeto comentarios, a partir de uma extração com as medidas de reticências
// (extract.mjs grava tw/cw nos textos dentro de um text-overflow: ellipsis):
//  - o texto que o app corta com "…" (tw > cw) ganha reticencias "sim" e, se a marcação for mais larga que
//    o conteúdo da caixa onde o app corta, a largura dele;
//  - o texto menor que 8 px (o mínimo antigo) volta ao tamanho medido, alinhado à esquerda.
// node ops-v8.mjs [extracted.json] → ops-min.json (começa com o update_specialization).
import { readFileSync, writeFileSync } from 'node:fs';
import { PATHS } from '../paths.mjs';

const SHOTS = `${PATHS.base}/shots`;
const PROJECT = `${PATHS.ws}/projetos/comentarios`;
const LIB = `${PATHS.ws}/especializacoes/mapping-ds`;
const extracted = JSON.parse(readFileSync(process.argv[2] ?? `${SHOTS}/extracted.json`, 'utf8'));
const p = JSON.parse(readFileSync(`${PROJECT}/mapping.json`, 'utf8'));
const ann = new Map(p.annotations.map((a) => [a.markingId, a]));
const ref = (k, id) => `mapping://comentarios/${k}/${id.slice(0, 8)}`;

const ops = [{ op: 'update_specialization', file: LIB }];
const log = [];
for (const c of extracted.containers) {
  const pc = p.containers.find((x) => x.name === c.name);
  if (!pc) throw new Error(`container sem par: ${c.name}`);
  const texts = p.markings
    .filter((m) => m.containerId === pc.id && ann.get(m.id)?.type.typeId === 'text')
    .map((m) => ({ m, a: ann.get(m.id) }));
  const used = new Set();
  for (const it of c.items) {
    if (it.type !== 'text') continue;
    const ellipsis = it.cw !== undefined && it.tw - it.cw > 0.01;
    const small = it.rect.width < 8 || it.rect.height < 8;
    if (!ellipsis && !small) continue;
    const cx = it.rect.x + it.rect.width / 2;
    const cy = it.rect.y + it.rect.height / 2;
    const near = texts
      .filter(({ m, a }) => !used.has(m.id) && a.values.texto === it.values.texto)
      .map((t) => ({ ...t, d: Math.hypot(t.m.rect.x + t.m.rect.width / 2 - cx, t.m.rect.y + t.m.rect.height / 2 - cy) }))
      .sort((x, y) => x.d - y.d)[0];
    if (!near || near.d > 6) throw new Error(`sem marcação para "${it.values.texto}" em ${c.name}`);
    used.add(near.m.id);
    const rect = { ...near.m.rect };
    const values = {};
    if (ellipsis) {
      values.reticencias = 'sim';
      // A largura do conteúdo da caixa, e sempre menor que o texto (senão o canvas não corta).
      const width = Math.min(Math.round(it.cw), Math.ceil(it.tw) - 1);
      if (width < rect.width) rect.width = Math.max(1, width);
    }
    if (small) {
      Object.assign(rect, it.rect);
      if (near.a.values.alinhamento !== it.values.alinhamento) values.alinhamento = it.values.alinhamento;
    }
    if (JSON.stringify(rect) !== JSON.stringify(near.m.rect)) ops.push({ op: 'update_marking', marking: ref('m', near.m.id), rect });
    if (Object.keys(values).length) ops.push({ op: 'update_annotation', annotation: ref('a', near.a.id), values });
    log.push(`${c.name.slice(0, 14)} | ${it.values.texto.slice(0, 40)} | ${JSON.stringify(near.m.rect)} → ${JSON.stringify(rect)} ${JSON.stringify(values)}`);
  }
}
writeFileSync(`${SHOTS}/ops-min.json`, JSON.stringify(ops, null, 1));
console.log(log.join('\n'));
console.log(ops.length, 'operações');
