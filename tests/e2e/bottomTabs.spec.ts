import { expect, test, type Page } from '@playwright/test';
import { fixtureZip } from './proposalFixture';

// Janela inferior: as seis abas ficam visíveis e clicáveis em 900 e 1280 px, com
// qualquer uma ativa; as ações do cabeçalho nunca cobrem outra aba.

const SHOTS = process.env.LAYOUT_SHOTS ?? '';
const TABS = ['Lista', 'Incompletas', 'Diagnóstico', 'Propostas', 'Comentários'] as const;
// Atalho de cada aba (Ctrl+Shift+N).
const KEYS: Record<(typeof TABS)[number], string> = {
  Lista: '4',
  Incompletas: '5',
  Diagnóstico: '6',
  Propostas: '7',
  Comentários: '0',
};

async function open(page: Page): Promise<void> {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'loja.zip',
      mimeType: 'application/zip',
      buffer: await fixtureZip(),
    });
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
  // Árvore, Camadas e Detalhes abertos: o centro fica o mais estreito possível.
  for (const key of ['1', '2', '3']) await page.keyboard.press(`Control+Shift+${key}`);
}

for (const width of [900, 1280]) {
  test(`as seis abas da janela inferior ficam à vista em ${width} px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 860 });
    await open(page);
    for (const active of TABS) {
      await page.keyboard.press(`Control+Shift+${KEYS[active]}`);
      const tablist = page
        .getByRole('tablist')
        .filter({ has: page.getByRole('tab', { name: 'Diagnóstico' }) });
      await expect(tablist).toBeVisible();
      await expect(
        tablist.getByRole('tab', { name: active, exact: false }),
      ).toHaveAttribute('aria-selected', 'true');
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/tabs-${width}-${active}.png` });
      // Cabem sem rolagem horizontal interna.
      expect(await tablist.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(false);
      // Nada cobre nenhuma aba: o elemento no centro dela é ela mesma (ou um filho).
      for (const name of TABS) {
        const tab = tablist.getByRole('tab', { name, exact: false });
        const box = await tab.boundingBox();
        expect(box, `${name} com ${active} ativa`).not.toBeNull();
        const covered = await tab.evaluate(
          (el, pt) => {
            const hit = document.elementFromPoint(pt.x, pt.y);
            return hit === null || !el.contains(hit);
          },
          { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 },
        );
        expect(covered, `${name} coberta com ${active} ativa`).toBe(false);
      }
    }
  });
}

// CL1 (1.1): o contador não fica colado ao rótulo (vão de 4px, `--space-1`) e, no pior caso (contador
// nas seis abas, o do Avisos com 2 dígitos), as seis abas continuam inteiras em 900 e 1280 px.
const MIN_GAP = 4;

for (const width of [900, 1280]) {
  test(`abas da janela inferior com espaço entre rótulo e contador em ${width} px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 860 });
    await open(page);
    await page.keyboard.press('Control+Shift+6');
    const tablist = page
      .getByRole('tablist')
      .filter({ has: page.getByRole('tab', { name: 'Diagnóstico' }) });
    await expect(tablist).toBeVisible();
    const metrics = await tablist.evaluate((list) => {
      const tabs = [...list.querySelectorAll<HTMLElement>('[role=tab]')];
      // O pior caso: contador em todas as abas (o do Avisos com 2 dígitos).
      for (const tab of tabs) {
        if (tab.querySelector('.tab-badge, .tab-alert')) continue;
        const badge = document.createElement('span');
        badge.className = 'tab-badge';
        badge.textContent = (tab.textContent ?? '').startsWith('Avisos') ? '12' : '9';
        tab.append(badge);
      }
      const range = document.createRange();
      const rows = tabs.map((tab) => {
        const label = [...tab.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
        const badge = tab.querySelector<HTMLElement>('.tab-badge, .tab-alert');
        if (!label || !badge) return { name: tab.textContent ?? '', gap: null };
        range.selectNodeContents(label);
        return {
          name: tab.textContent ?? '',
          gap: badge.getBoundingClientRect().left - range.getBoundingClientRect().right,
        };
      });
      return { rows, overflow: list.scrollWidth > list.clientWidth };
    });
    // Sem rolagem horizontal: nem a primeira aba nem a última ficam cortadas.
    expect(metrics.overflow).toBe(false);
    const withText = metrics.rows.filter((r) => r.gap !== null);
    expect(withText.length).toBeGreaterThanOrEqual(5);
    for (const row of withText)
      expect(row.gap, `rótulo e contador: ${row.name}`).toBeGreaterThanOrEqual(MIN_GAP);
  });
}
