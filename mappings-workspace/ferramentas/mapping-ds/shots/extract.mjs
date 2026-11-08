// Mede o app real (dist/index.html) e converte cada elemento visível num item da biblioteca Mapping DS.
// Saída: extracted.json (containers com itens) e capturas real-*.png para comparar. SRC=<build> (use app25).
import { writeFileSync } from 'node:fs';
import { extract, args, openApp, SCRATCH } from './extractor.mjs';
import { existsSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
// As regras dos grupos da v9 (v9/<grupo>/rules.mjs), as mesmas das telas novas.
const V9 = `${SCRATCH}/v9`;
const rules = [];
for (const g of readdirSync(V9, { withFileTypes: true }).filter((d) => d.isDirectory()))
  if (existsSync(`${V9}/${g.name}/rules.mjs`)) rules.push(...(await import(pathToFileURL(`${V9}/${g.name}/rules.mjs`).href)).rules.map(String));

const { browser, page, errors } = await openApp();
await page.keyboard.press('Control+Shift+0');
await page.locator('.tool-window[data-window=comments]').waitFor();
await page.locator('.comments-row').first().waitFor();
// Abre a conversa do botão Salvar (seleciona o item e leva aos Detalhes).
await page.locator('.comments-row', { hasText: 'Salvar' }).first().click();
await page.locator('.thread-row', { hasText: 'especialização' }).first().click();
await page.locator('.thread-message').first().waitFor({ timeout: 10000 });
await page.locator('.details-section', { hasText: 'Conversas' }).last().evaluate((el) => el.scrollIntoView({ block: 'start' }));
await page.mouse.move(700, 600);
await page.waitForTimeout(600);
await page.screenshot({ path: `${SCRATCH}/shots/real-editor.png` });
const out = { containers: [] };
out.containers.push({ name: 'Editor — 1440 × 900', background: '#ffffff', ...(await page.evaluate(extract, { ...args, rules, rootSel: '.editor-desktop' })) });

const dialog = async (name, open) => {
  try {
    await open();
    await page.locator('.dialog[open]').last().waitFor({ timeout: 5000 });
  } catch (e) {
    await page.screenshot({ path: `${SCRATCH}/shots/fail-${name.replace(/\W+/g, '_')}.png` });
    console.log('falhou:', name, String(e).split('\n')[0]);
    await page.keyboard.press('Escape');
    return;
  }
  const d = page.locator('.dialog[open]').last();
  await page.mouse.move(2, 2);
  await page.waitForTimeout(400);
  await d.screenshot({ path: `${SCRATCH}/shots/real-${name}.png` });
  out.containers.push({ name, background: '#ffffff', ...(await page.evaluate(extract, { ...args, rules, rootSel: '.dialog[open]' })) });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
};
await dialog('Configurações › Identidade', async () => {
  await page.getByRole('button', { name: 'Configurações' }).first().click();
  await page.locator('.dialog[open]').waitFor();
  await page.locator('.dialog[open]').getByText('Identidade', { exact: true }).first().evaluate((h) => h.parentElement.scrollIntoView({ block: 'start' }));
});
await dialog('Apagar a conversa', async () => {
  await page.locator('.comments-row', { hasText: 'Salvar' }).first().getByRole('button', { name: /Ações da conversa/ }).click();
  await page.getByRole('menuitem', { name: 'Apagar', exact: true }).first().click();
});
await dialog('Apagar conversas em lote', async () => {
  await page.getByRole('button', { name: 'Ações da janela Comentários' }).click();
  await page.getByRole('menuitem', { name: /Apagar conversas/ }).first().click();
});
writeFileSync(`${SCRATCH}/shots/extracted.json`, JSON.stringify(out, null, 1));
for (const c of out.containers) console.log(c.name, c.width, 'x', c.height, '→', c.items.length, 'itens');
const byType = {};
for (const c of out.containers) for (const i of c.items) byType[i.type] = (byType[i.type] ?? 0) + 1;
console.log(JSON.stringify(byType));
if (errors.length) console.log('erros:', errors.join('\n'));
await browser.close();
