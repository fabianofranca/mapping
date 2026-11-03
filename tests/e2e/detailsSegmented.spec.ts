import { expect, test } from '@playwright/test';

// Seletor de opções (`Segmented`) numa coluna estreita dos Detalhes: nenhuma opção fica
// cortada nem fora do clique. jsdom não tem layout; a medição é no Chromium. A coluna
// de valor tem ~122 px com os Detalhes em 280 px (janela de 900 px) e ~202 px em 360 px.

for (const column of [122, 202]) {
  test(`o seletor estilo cabe inteiro e clicável numa coluna de ${column} px`, async ({
    page,
  }) => {
    await page.goto('/');
    const result = await page.evaluate((width) => {
      const wrap = document.createElement('div');
      wrap.style.cssText = `position:fixed;top:40px;left:40px;width:${width}px;z-index:99999;background:#fff`;
      const value = document.createElement('div');
      value.className = 'props-value';
      const group = document.createElement('div');
      group.className = 'segmented';
      group.setAttribute('role', 'group');
      for (const id of ['primary', 'secondary', 'text']) {
        const cell = document.createElement('span');
        cell.className = 'segmented-cell';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'segmented-item';
        button.setAttribute('aria-pressed', String(id === 'primary'));
        const text = document.createElement('span');
        text.className = 'segmented-text';
        text.textContent = id;
        button.append(text);
        cell.append(button);
        group.append(cell);
      }
      value.append(group);
      wrap.append(value);
      document.body.append(wrap);
      const box = wrap.getBoundingClientRect();
      const items = [...group.querySelectorAll<HTMLElement>('.segmented-item')].map(
        (el) => {
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          const text = el.querySelector('.segmented-text')!;
          return {
            hit: hit !== null && el.contains(hit),
            inside: r.left >= box.left && r.right <= box.right + 0.5,
            // Texto inteiro: sem reticências nem corte.
            textCut: text.scrollWidth > text.clientWidth,
          };
        },
      );
      return {
        items,
        groupFits: group.getBoundingClientRect().right <= box.right + 0.5,
        clipped: group.scrollWidth > group.clientWidth,
        clippedY: group.scrollHeight > group.clientHeight,
      };
    }, column);
    expect(result.groupFits).toBe(true);
    expect(result.clipped).toBe(false);
    expect(result.clippedY).toBe(false);
    for (const item of result.items) {
      expect(item).toEqual({ hit: true, inside: true, textCut: false });
    }
  });
}
