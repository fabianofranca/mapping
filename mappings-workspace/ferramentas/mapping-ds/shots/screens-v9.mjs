// As telas novas da v9 (v9/<grupo>/screens.mjs), medidas no app 0.25.0 com as regras de todos os grupos,
// e as operações que as criam no projeto comentarios: add_container + create_marking de cada item.
// Rodar com a fixture com a proposta de teste (fixture.mjs e depois review-fixture.mjs).
// Saída: extracted-v9.json, real-v9-<tela>.png e ops-v9-novas.json.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { PATHS } from '../paths.mjs';
import { pathToFileURL } from 'node:url';

const BASE = PATHS.base;
const SHOTS = `${BASE}/shots`;
const LIB = `${PATHS.ws}/especializacoes/mapping-ds`;
process.env.SRC = `${BASE}/app25`;
const { extract, args, openApp } = await import(pathToFileURL(`${SHOTS}/extractor.mjs`).href);
const safe = (s) => s.replace(/[^\p{L}\p{N}]+/gu, '_');

const groups = readdirSync(`${BASE}/v9`, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
const rules = [];
const screens = [];
for (const g of groups) {
  if (existsSync(`${BASE}/v9/${g}/rules.mjs`)) rules.push(...(await import(pathToFileURL(`${BASE}/v9/${g}/rules.mjs`).href)).rules.map(String));
  if (existsSync(`${BASE}/v9/${g}/screens.mjs`)) for (const s of (await import(pathToFileURL(`${BASE}/v9/${g}/screens.mjs`).href)).screens) screens.push({ ...s, group: g });
}
const only = process.argv[2];
const extracted = { containers: [] };
for (const s of screens) {
  if (only && s.name !== only) continue;
  const { browser, page, errors } = await openApp({ width: s.viewport?.width ?? 1440, height: s.viewport?.height ?? 900 });
  try {
    await s.open(page);
    await page.mouse.move(2, 2);
    await page.waitForTimeout(500);
    await page.locator(s.rootSel).last().screenshot({ path: `${SHOTS}/real-v9-${safe(s.name)}.png` });
    const c = await page.evaluate(extract, { ...args, rootSel: s.rootSel, rootIsItem: Boolean(s.rootIsItem), rules });
    extracted.containers.push({ name: s.name, group: s.group, background: s.background ?? '#ffffff', ...c });
    console.log(`${s.group} | ${s.name} ${c.width}×${c.height} → ${c.items.length} itens`);
  } catch (e) {
    console.log(`FALHOU ${s.group} | ${s.name}: ${String(e).split('\n')[0]}`);
  }
  if (errors.length) console.log('  erros da página:', errors.slice(0, 2).join(' | '));
  await browser.close();
}
writeFileSync(`${SHOTS}/extracted-v9.json`, JSON.stringify(extracted, null, 1));

// ---- Operações: um container por tela, as marcações na ordem medida.
const spec = JSON.parse(readFileSync(`${LIB}/mapping-ds.spec.json`, 'utf8'));
const TYPES = Object.fromEntries(spec.layers[0].annotationTypes.map((t) => [t.id, t]));
const LABELED = new Set(['text', 'badge', 'avatar', 'icon', 'tab']);
const LINE_H = { 't-display': 28, 't-title': 22, 't-heading': 20, 't-body': 20, 't-body-strong': 20, 't-small': 16, 't-label': 16, 't-micro': 16, 't-code': 18, 't-kbd': 16 };
const ops = [];
const unknown = new Set();
extracted.containers.forEach((c, k) => {
  const as = `$v9c${k}`;
  ops.push({ op: 'add_container', as, name: c.name, width: c.width, height: c.height, background: c.background });
  for (const it of c.items) {
    if (!TYPES[it.type]) {
      unknown.add(it.type);
      continue;
    }
    const rect = { ...it.rect };
    if (it.type === 'text' && it.values.quebra === 'sim') {
      const need = (it.lines ?? 2) * (LINE_H[it.values.estilo] ?? 20) + 2;
      if (rect.height < need) rect.height = Math.min(need, c.height - rect.y);
    }
    if (it.type === 'text' && it.cw !== undefined && it.tw - it.cw > 0.01) rect.width = Math.max(1, Math.min(rect.width, Math.round(it.cw), Math.ceil(it.tw) - 1));
    const op = { op: 'create_marking', container: as, rect, annotation: { type: it.type } };
    if (!LABELED.has(it.type)) op.name = it.name;
    const values = {};
    // Todos os campos: o valor medido (null quando vazio) ou o padrão do campo. Campo omitido seria completado
    // com o exemplo do componente (MCP 0.25.1+), e um TextField sem rótulo ganharia o rótulo do exemplo.
    for (const f of TYPES[it.type].fields) values[f.key] = it.values[f.key] === undefined ? f.default ?? null : it.values[f.key] === '' ? null : it.values[f.key];
    if (Object.keys(values).length) op.annotation.values = values;
    ops.push(op);
  }
});
writeFileSync(`${SHOTS}/ops-v9-novas.json`, JSON.stringify(ops, null, 1));
console.log(`${extracted.containers.length} telas, ${ops.length} operações`);
if (unknown.size) console.log('tipos desconhecidos (ignorados):', [...unknown].join(', '));
