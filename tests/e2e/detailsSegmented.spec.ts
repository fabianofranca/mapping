import { expect, test } from '@playwright/test';

// Option selector (`Segmented`) in a narrow Details column: no option is
// cut off or outside the click. jsdom has no layout; the measurement is in Chromium. The value
// column is ~122 px with Details at 280 px (900 px window) and ~202 px at 360 px.

for (const column of [122, 202]) {
  test(`the style selector fits whole and clickable in a ${column} px column`, async ({
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
            // Whole text: no ellipsis or cut.
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
