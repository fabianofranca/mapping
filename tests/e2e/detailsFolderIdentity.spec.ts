import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';

// Detalhes a 900 px com o projeto aberto por pasta: o cabeçalho do item tem o botão
// "Copiar referência" (só existe com pasta de origem) e nenhum filho passa da largura do
// painel, sem barra horizontal.

test.use({ viewport: { width: 900, height: 700 } });

const FOLDER = 'exemplo-pasta-e2e';

/** Descompacta o exemplo numa pasta do OPFS e faz dela a pasta escolhida em "Abrir pasta". */
async function openExampleFolder(page: Page): Promise<void> {
  const zip = await JSZip.loadAsync(readFileSync('examples/exemplo-completo.zip'));
  const files: { path: string; data: number[] }[] = [];
  for (const [path, entry] of Object.entries(zip.files)) {
    if (!entry.dir) files.push({ path, data: [...(await entry.async('uint8array'))] });
  }
  await page.addInitScript(
    ([name, list]) => {
      Reflect.set(window, 'showDirectoryPicker', async () => {
        const root = await navigator.storage.getDirectory();
        const dir = await root.getDirectoryHandle(name, { create: true });
        for (const f of list) {
          const parts = f.path.split('/');
          let d = dir;
          for (const part of parts.slice(0, -1))
            d = await d.getDirectoryHandle(part, { create: true });
          const h = await d.getFileHandle(parts[parts.length - 1]!, { create: true });
          const w = await h.createWritable();
          await w.write(new Uint8Array(f.data));
          await w.close();
        }
        return dir;
      });
    },
    [FOLDER, files] as const,
  );
  await page.goto('/');
  await page.getByRole('button', { name: /Abrir pasta/ }).click();
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
}

test('Detalhes na revisão a 900 px sem barra horizontal com o projeto aberto por pasta', async ({
  page,
}) => {
  await openExampleFolder(page);
  await page.keyboard.press('Control+Shift+Digit3');
  await page.keyboard.press('Control+Shift+Digit7');
  await page.keyboard.press('Control+Shift+Digit2');
  await page.keyboard.press('Control+Shift+Digit1');
  await page
    .getByRole('button', { name: 'Revisar: Tela de Perfil e ajuste no Cadastro' })
    .click();
  await expect(page.getByText('Somente leitura').first()).toBeVisible();
  for (const box of await page
    .getByRole('checkbox', { name: /^Mostrar a camada / })
    .all()) {
    if ((await box.isChecked()) && (await box.isEnabled()))
      await box.uncheck({ force: true });
  }
  await page
    .getByRole('group', { name: 'Visão do canvas' })
    .getByRole('button', { name: 'Proposto', exact: true })
    .click();
  await page.locator('.tree-row', { hasText: 'Dados da conta' }).first().click();
  await page.getByRole('button', { name: 'Mostrar aqui' }).first().click();
  await expect(
    page.getByRole('button', { name: 'Copiar referência' }).first(),
  ).toBeVisible();

  // Nada do painel passa da borda direita dele, e o campo do nome da anotação não é
  // espremido (o botão Copiar referência só existe com pasta de origem).
  const m = await page.evaluate(() => {
    const b = document.querySelector('[data-window="details"] .tool-window-body')!;
    const p = document.querySelector('.panel-details')!;
    const pr = p.getBoundingClientRect();
    const over = [...p.querySelectorAll<HTMLElement>('*')]
      .filter((e) => e.getBoundingClientRect().right > pr.right + 0.5)
      .map((e) => `${e.tagName}.${e.getAttribute('class')}`);
    const name = document.querySelector<HTMLElement>(
      '.annotation-header .annotation-name',
    );
    return {
      over,
      body: [b.scrollWidth, b.clientWidth],
      panel: [p.scrollWidth, p.clientWidth],
      nameWidth: name?.getBoundingClientRect().width ?? 0,
    };
  });
  expect(m.over).toEqual([]);
  expect(m.body[0]).toBeLessThanOrEqual(m.body[1]!);
  expect(m.panel[0]).toBeLessThanOrEqual(m.panel[1]!);
  expect(m.nameWidth).toBeGreaterThanOrEqual(90);
});
