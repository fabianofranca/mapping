// Prévia de um grupo da v9:  node v9/preview.mjs <grupo> [só-esta-tela]
//  1. monta o pacote com o grupo (PKG=v9/<grupo>/out/pkg, GROUPS=<grupo>) e o valida (MCP 0.28.1, nível 3);
//  2. abre cada tela de v9/<grupo>/screens.mjs no app real 0.25.0 (app25), captura real-<tela>.png e mede
//     com as regras do extrator mais as de v9/<grupo>/rules.mjs → out/extracted.json;
//  3. monta um projeto de prévia com essas telas e o pacote, abre no app 0.28.1 (app) e captura cada tela
//     a 100% no modo Visualizar → out/preview-<tela>.png (compare com out/real-<tela>.png).
// Saída em v9/<grupo>/out/. Nada fora dessa pasta é alterado.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const BASE = 'C:/Pessoal/mapping/workspace/ferramentas/mapping-ds';
const WS = 'C:/Pessoal/mapping/workspace';
const [group, only] = process.argv.slice(2);
if (!group) throw new Error('uso: node v9/preview.mjs <grupo> [tela]');
const GDIR = `${BASE}/v9/${group}`;
const OUT = `${GDIR}/out`;
const PKG = `${OUT}/pkg`;
mkdirSync(OUT, { recursive: true });
const safe = (s) => s.replace(/[^\p{L}\p{N}]+/gu, '_');

// ---- 1. Pacote e validação
rmSync(PKG, { recursive: true, force: true });
const b = spawnSync('node', ['build-spec.mjs'], { cwd: BASE, env: { ...process.env, PKG, GROUPS: group }, encoding: 'utf8' });
if (b.status !== 0) {
  console.log(b.stdout, b.stderr);
  process.exit(1);
}
console.log(b.stdout.trim());

async function mcp(tool, args) {
  const server = spawn('node', [`${WS}/tools/mapping-mcp.js`, '--root', OUT, '--root', `${WS}/projetos`], { cwd: WS, stdio: ['pipe', 'pipe', 'inherit'] });
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
  const res = await call('tools/call', { name: tool, arguments: args });
  server.kill();
  return JSON.parse(res.result?.content?.map((c) => c.text).join('\n') ?? '{}');
}
const v = await mcp('validate_library', { path: PKG, previous: `${WS}/projetos/comentarios/specs/mapping-ds/mapping-ds.spec.json` });
writeFileSync(`${OUT}/validate.json`, JSON.stringify(v, null, 1));
console.log(`validate_library: valid=${v.valid} erros=${v.errors?.length} avisos=${v.warnings?.length}`);
for (const i of [...(v.errors ?? []), ...(v.warnings ?? [])].slice(0, 30)) console.log(`  ${i.severity} ${i.file} ${i.path}: ${i.message}`);

// ---- 2. Medição no app 0.25.0
process.env.SRC = `${BASE}/app25`;
const { extract, args, openApp, chromium, JSZip } = await import(pathToFileURL(`${BASE}/shots/extractor.mjs`).href);
const { screens } = await import(pathToFileURL(`${GDIR}/screens.mjs`).href);
const { rules = [] } = await import(pathToFileURL(`${GDIR}/rules.mjs`).href).catch(() => ({}));
const extracted = { containers: [] };
for (const s of screens) {
  if (only && s.name !== only) continue;
  const { browser, page, errors } = await openApp({ width: s.viewport?.width ?? 1440, height: s.viewport?.height ?? 900 });
  try {
    await s.open(page);
    await page.mouse.move(2, 2);
    await page.waitForTimeout(500);
    const root = page.locator(s.rootSel).last();
    await root.screenshot({ path: `${OUT}/real-${safe(s.name)}.png` });
    const c = await page.evaluate(extract, { ...args, rootSel: s.rootSel, rootIsItem: Boolean(s.rootIsItem), rules: rules.map(String) });
    extracted.containers.push({ name: s.name, background: s.background ?? '#ffffff', ...c });
    const by = {};
    for (const i of c.items) by[i.type] = (by[i.type] ?? 0) + 1;
    console.log(`medida: ${s.name} ${c.width}×${c.height} → ${c.items.length} itens ${JSON.stringify(by)}`);
  } catch (e) {
    await page.screenshot({ path: `${OUT}/falhou-${safe(s.name)}.png` });
    console.log(`falhou: ${s.name}: ${String(e).split('\n')[0]}`);
  }
  if (errors.length) console.log('erros da página:', errors.slice(0, 3).join(' | '));
  await browser.close();
}
writeFileSync(`${OUT}/extracted.json`, JSON.stringify(extracted, null, 1));

// ---- 3. Prévia no app 0.28.1
const spec = JSON.parse(readFileSync(`${PKG}/mapping-ds.spec.json`, 'utf8'));
const TYPES = Object.fromEntries(spec.layers[0].annotationTypes.map((t) => [t.id, t]));
const PREVIEW = Object.fromEntries(Object.values(TYPES).filter((t) => t.component).map((t) => [t.id, JSON.parse(readFileSync(`${PKG}/${t.component}`, 'utf8')).preview ?? {}]));
const fullValues = (type, values) => {
  const out = {};
  for (const f of TYPES[type]?.fields ?? []) {
    let x = values[f.key];
    if (x === undefined) x = PREVIEW[type]?.[f.key] ?? f.default ?? null;
    if (f.type === 'table' && Array.isArray(x)) x = x.map((row) => ({ _id: randomUUID(), ...Object.fromEntries(f.columns.map((c) => [c.key, row[c.key] ?? c.default ?? null])) }));
    out[f.key] = x === '' ? null : x;
  }
  return out;
};
const contains = (a, q) => q.x >= a.x && q.y >= a.y && q.x + q.width <= a.x + a.width && q.y + q.height <= a.y + a.height;
const parents = (items) =>
  items.map((it, i) => {
    let best = -1;
    let area = Infinity;
    items.forEach((p, j) => {
      if (j === i || !contains(p.rect, it.rect)) return;
      if (contains(it.rect, p.rect) && j > i) return;
      const a = p.rect.width * p.rect.height;
      if (a < area || (a === area && j > best)) {
        area = a;
        best = j;
      }
    });
    return best;
  });
const LABELED = new Set(['text', 'badge', 'avatar', 'icon', 'tab']);
const baseProject = JSON.parse(readFileSync(`${WS}/projetos/comentarios/mapping.json`, 'utf8'));
const layer = baseProject.layers.find((l) => l.spec?.specId === 'mapping-ds');
const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
const unknown = new Set();
for (const c of extracted.containers) {
  const p = { ...baseProject, revision: 0, containers: [], markings: [], annotations: [], arrows: [], perspectives: [] };
  p.drawingMode = process.env.DM ?? 'light';
  p.specializations = baseProject.specializations.map((s) => (s.id === 'mapping-ds' ? { ...s, version: spec.version } : s));
  const id = randomUUID();
  p.containers.push({ id, name: c.name, file: null, width: c.width, height: c.height, placement: { x: 0, y: 0, scale: 1 }, parentId: null, markingColor: null, locked: false, source: null, background: c.background.toUpperCase() });
  const ids = c.items.map(() => randomUUID());
  const par = parents(c.items);
  c.items.forEach((it, i) => {
    if (!TYPES[it.type]) unknown.add(it.type);
    p.markings.push({ id: ids[i], containerId: id, parentId: par[i] >= 0 ? ids[par[i]] : null, name: LABELED.has(it.type) ? null : it.name, rect: it.rect, needsReview: false, locked: false, floating: false, source: null });
    p.annotations.push({ id: randomUUID(), markingId: ids[i], layerId: layer.id, name: null, parentAnnotationId: null, parentRole: null, type: { specId: 'mapping-ds', typeId: it.type }, values: fullValues(it.type, it.values), entries: [] });
  });
  const zip = new JSZip();
  zip.file('mapping.json', JSON.stringify(p, null, 2));
  for (const f of walk(PKG)) zip.file(`specs/mapping-ds/${relative(PKG, f).split('\\').join('/')}`, readFileSync(f));
  for (const f of walk(`${WS}/projetos/comentarios/specs/notas`)) zip.file(`specs/notas/${relative(`${WS}/projetos/comentarios/specs/notas`, f).split('\\').join('/')}`, readFileSync(f));
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  writeFileSync(`${OUT}/preview-${safe(c.name)}.zip`, buffer);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: Math.max(1600, c.width + 900), height: Math.max(1000, c.height + 300) }, locale: 'pt-BR' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(pathToFileURL(`${BASE}/app/dist/index.html`).href);
  await page.locator('input[type=file][accept*=".zip"]').first().setInputFiles({ name: 'previa.zip', mimeType: 'application/zip', buffer });
  try {
    await page.getByRole('main', { name: 'Canvas do projeto' }).waitFor({ timeout: 20000 });
  } catch {
    await page.screenshot({ path: `${OUT}/preview-falhou-${safe(c.name)}.png` });
    console.log(`a prévia não abriu: ${c.name} (preview-falhou-${safe(c.name)}.png)`, errors.slice(0, 3).join(' | '));
    await browser.close();
    continue;
  }
  await page.waitForTimeout(1200);
  await page.keyboard.press('Alt+h');
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  const area = await page.locator('.canvas-area').boundingBox();
  const cx = area.x + area.width / 2;
  const cy = area.y + area.height / 2;
  const zoomNow = async () => Number((await page.locator('.statusbar').innerText()).match(/(\d+)%/)?.[1] ?? 0);
  await page.mouse.move(cx, cy);
  for (let i = 0; i < 300; i++) {
    const now = await zoomNow();
    if (now === 100) break;
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, (now < 100 ? -1 : 1) * (Math.abs(now - 100) > 15 ? 30 : 2));
    await page.keyboard.up('Control');
    await page.waitForTimeout(30);
  }
  await page.mouse.move(area.x + 2, area.y + 2);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/preview-${safe(c.name)}.png`, clip: area });
  console.log(`prévia: ${c.name} → zoom ${await zoomNow()}% · preview-${safe(c.name)}.png`);
  if (errors.length) console.log('erros da prévia:', errors.slice(0, 3).join(' | '));
  await browser.close();
}
if (unknown.size) console.log('tipos que a especialização não tem:', [...unknown].join(', '));
