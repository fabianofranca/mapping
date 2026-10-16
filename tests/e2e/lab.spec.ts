import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// Laboratório "Figma somente leitura" (lab/figma): a página autocontida publicada em
// dist/lab/figma/index.html desenha um SVG colado com o Konva, sem nenhuma requisição de rede.

const LAB = '/lab/figma/index.html';

test('o exemplo SVG é desenhado no canvas, com árvore de nós e sem violação de CSP', async ({
  page,
}) => {
  const violations: string[] = [];
  page.on('console', (msg) => {
    if (/Content Security Policy/i.test(msg.text())) violations.push(msg.text());
  });
  await page.goto(LAB);
  await expect(
    page.getByRole('heading', { name: /Figma somente leitura/ }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Exemplo SVG' }).click();
  await expect(page.getByTestId('status')).toContainText('origem svg');
  await expect(page.getByTestId('status')).toContainText('360 × 220 px');
  // A árvore mostra os nós pelo id do SVG (nomes das camadas do Figma).
  await expect(page.locator('[data-node-id="Button/label"]')).toBeVisible();

  // O Konva desenhou algo: o canvas tem pixels não transparentes.
  const painted = await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="stage"] canvas');
    if (!(canvas instanceof HTMLCanvasElement)) return -1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return -1;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let count = 0;
    for (let i = 3; i < data.length; i += 4) if ((data[i] ?? 0) > 0) count++;
    return count;
  });
  expect(painted).toBeGreaterThan(1000);

  // Seleção pela árvore mostra os detalhes do nó.
  await page.locator('[data-node-id="Avatar"]').click();
  await expect(page.getByText('Seleção')).toBeVisible();
  await expect(page.locator('.lab-details')).toContainText('ellipse');
  expect(violations).toEqual([]);
});

test('o exemplo JSON (API REST) é desenhado e lista os avisos', async ({ page }) => {
  await page.goto(LAB);
  await page.getByRole('button', { name: 'Exemplo JSON' }).click();
  await expect(page.getByTestId('status')).toContainText('origem figma-json');
  await expect(page.locator('.lab-warnings')).toContainText('imageRef');
  await expect(page.locator('[data-node-id="1:7"]')).toContainText('Button');
});

test('colar a cópia nativa do Figma explica o formato e sugere Copy as SVG', async ({
  page,
}) => {
  await page.goto(LAB);
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData('text/plain', 'Seguir');
    data.setData(
      'text/html',
      '<span data-metadata="<!--(figmeta)eyJ…(/figmeta)-->"></span><span data-buffer="<!--(figma)Zm…(/figma)-->"></span>',
    );
    document.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true }),
    );
  });
  await expect(page.getByTestId('status')).toContainText('Copy as SVG');
});

test('a página do laboratório leva a CSP gerada no build', async () => {
  const html = await readFile(
    join(process.cwd(), 'dist', 'lab', 'figma', 'index.html'),
    'utf8',
  );
  expect(html).toMatch(
    /<meta http-equiv="Content-Security-Policy" content="default-src 'none';/,
  );
  expect(html).toContain("connect-src 'none'");
});
