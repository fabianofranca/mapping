// Abre um container do projeto comentarios (estado atual) sozinho no app e captura em vários zooms.
// node zooms.mjs <id-ou-prefixo-do-container> <saída-base> 50 100 200 400
import { createRequire } from 'node:module';
import { PATHS } from '../paths.mjs';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
const SCRATCH = PATHS.base;
const PROJECT = `${PATHS.ws}/projetos/comentarios`;
const require = createRequire(`${SCRATCH}/app/package.json`);
const { chromium } = require('@playwright/test');
const JSZip = require('jszip');
const [prefix, outBase, ...zooms] = process.argv.slice(2);

const p = JSON.parse(readFileSync(`${PROJECT}/mapping.json`, 'utf8'));
// OPS=<ops-min.json>: aplica os rect de update_marking (prévia de uma proposta de retângulos).
if (process.env.OPS)
  for (const o of JSON.parse(readFileSync(process.env.OPS, 'utf8')))
    if (o.op === 'update_marking' && o.rect) p.markings.find((m) => m.id.startsWith(o.marking.split('/').pop())).rect = o.rect;
    else if (o.op === 'update_annotation' && o.values) Object.assign(p.annotations.find((a) => a.id.startsWith(o.annotation.split('/').pop())).values, o.values);
// create_marking do OPS (com o container por referência): marcação e anotação novas, sem pai (o app assenta).
if (process.env.OPS)
  for (const o of JSON.parse(readFileSync(process.env.OPS, 'utf8')).filter((o) => o.op === 'create_marking')) {
    const cont = p.containers.find((x) => x.id.startsWith(o.container.split('/').pop()));
    const id = crypto.randomUUID();
    p.markings.push({ id, containerId: cont.id, parentId: null, name: o.name ?? null, rect: o.rect, needsReview: false, locked: false, floating: false, source: null });
    const layer = p.layers.find((l) => l.spec?.specId === 'mapping-ds');
    p.annotations.push({ id: crypto.randomUUID(), markingId: id, layerId: layer.id, name: null, parentAnnotationId: null, parentRole: null, type: { specId: 'mapping-ds', typeId: o.annotation.type }, values: o.annotation.values ?? {}, entries: [] });
  }
// delete_marking, delete_annotation e create_annotation do OPS (as trocas de tipo da v9).
if (process.env.OPS)
  for (const o of JSON.parse(readFileSync(process.env.OPS, 'utf8'))) {
    const byPrefix = (list, r) => list.find((x) => x.id.startsWith(r.split('/').pop()));
    if (o.op === 'delete_marking') {
      const m = byPrefix(p.markings, o.marking);
      p.markings = p.markings.filter((x) => x !== m);
      p.annotations = p.annotations.filter((x) => x.markingId !== m.id);
    } else if (o.op === 'delete_annotation') {
      const an = byPrefix(p.annotations, o.annotation);
      p.annotations = p.annotations.filter((x) => x !== an);
    } else if (o.op === 'create_annotation') {
      const m = byPrefix(p.markings, o.marking);
      const layer = p.layers.find((l) => l.spec?.specId === 'mapping-ds');
      p.annotations.push({ id: crypto.randomUUID(), markingId: m.id, layerId: layer.id, name: null, parentAnnotationId: null, parentRole: null, type: { specId: 'mapping-ds', typeId: o.type }, values: o.values ?? {}, entries: [] });
    } else if (o.op === 'update_marking' && o.name !== undefined) byPrefix(p.markings, o.marking).name = o.name;
  }
const c = p.containers.find((x) => x.id.startsWith(prefix));
const one = { ...p, containers: [{ ...c, placement: { ...c.placement, x: 0, y: 0 } }], arrows: [], perspectives: [] };
one.markings = p.markings.filter((m) => m.containerId === c.id);
one.annotations = p.annotations.filter((a) => one.markings.some((m) => m.id === a.markingId));
// DM=<modo>: o modo do desenho do projeto (tokens claro/escuro da biblioteca).
if (process.env.DM) one.drawingMode = process.env.DM;
const zip = new JSZip();
zip.file('mapping.json', JSON.stringify(one, null, 2));
const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
for (const f of walk(`${PROJECT}/specs`)) zip.file(`specs/${relative(`${PROJECT}/specs`, f).split('\\').join('/')}`, readFileSync(f));
// LIB=<pasta do pacote>: usa a biblioteca da pasta de trabalho em vez da cópia do projeto (prévia).
if (process.env.LIB) {
  for (const f of walk(process.env.LIB)) zip.file(`specs/mapping-ds/${relative(process.env.LIB, f).split('\\').join('/')}`, readFileSync(f));
  const v = JSON.parse(readFileSync(`${process.env.LIB}/mapping-ds.spec.json`, 'utf8')).version;
  one.specializations = one.specializations.map((s) => (s.id === 'mapping-ds' ? { ...s, version: v } : s));
  zip.file('mapping.json', JSON.stringify(one, null, 2));
}
console.log('container:', c.name, `${c.width}×${c.height}`, 'escala', c.placement.scale.toFixed(3), '·', one.markings.length, 'marcações · mapping-ds v' + p.specializations.find((s) => s.id === 'mapping-ds').version);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(process.env.VW ?? 1600), height: Number(process.env.VH ?? 1000) }, deviceScaleFactor: Number(process.env.DSF ?? 1), locale: 'pt-BR' });
await page.goto(pathToFileURL(`${SCRATCH}/app/dist/index.html`).href);
await page.locator('input[type=file][accept*=".zip"]').first().setInputFiles({ name: 'c.zip', mimeType: 'application/zip', buffer: await zip.generateAsync({ type: 'nodebuffer' }) });
await page.getByRole('main', { name: 'Canvas do projeto' }).waitFor({ timeout: 15000 });
await page.waitForTimeout(1200);
if (process.env.KEYS) { await page.keyboard.press(process.env.KEYS); await page.waitForTimeout(600); await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
const area = await page.locator('.canvas-area').boundingBox();
const cx = area.x + area.width / 2;
const cy = area.y + area.height / 2;
const zoomNow = async () => Number((await page.locator('.statusbar').innerText()).match(/(\d+)%/)?.[1] ?? 0);
await page.mouse.move(cx, cy);
for (const z of zooms.map(Number)) {
  for (let i = 0; i < 300; i++) {
    const now = await zoomNow();
    if (Math.abs(now - z) <= 1) break;
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, (now < z ? -1 : 1) * (Math.abs(now - z) > 15 ? 30 : 4));
    await page.keyboard.up('Control');
    await page.waitForTimeout(30);
  }
  await page.mouse.move(area.x + 5, area.y + 5);
  await page.waitForTimeout(500);
  const out = `${outBase}-${z}.png`;
  const rel = process.env[`CLIP${z}`]?.split(",").map(Number);
  await page.screenshot({ path: out, clip: rel ? { x: area.x + rel[0], y: area.y + rel[1], width: rel[2], height: rel[3] } : area });
  console.log(z, '→ zoom real', await zoomNow(), out);
  await page.mouse.move(cx, cy);
}
await browser.close();
