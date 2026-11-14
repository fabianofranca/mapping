import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import {
  addImage,
  applySpecialization,
  canvasPoint,
  createProject,
  drawMarking,
} from './helpers';

// Stage #679 (CF3): the `ref` picker with the whole annotation as target and the
// "Referenced by" row do not generate a horizontal bar at 900 px, even with long labels (like R11.12).

test.use({ viewport: { width: 900, height: 720 } });

const LONG = 'Component with an extremely long name to force the line to break';

const spec = {
  format: 'mapping-spec',
  formatVersion: 14,
  id: 'outside',
  name: 'Outside the image',
  version: 1,
  layers: [
    {
      id: 'components',
      name: 'Components',
      color: '#43A047',
      annotationTypes: [
        {
          id: 'item',
          name: 'List item',
          labelField: 'title',
          fields: [{ key: 'title', type: 'string' }],
        },
      ],
    },
    {
      id: 'events',
      name: 'Events',
      color: '#1E88E5',
      annotationTypes: [
        {
          id: 'event',
          name: 'Event',
          fields: [
            {
              key: 'main',
              type: 'ref',
              accepts: { annotations: [{ layer: 'components' }] },
            },
          ],
        },
      ],
    },
  ],
};

/** The containers that scroll (auto/scroll) and the root itself: text cut with an ellipsis does not count. */
async function overflow(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const found: string[] = [];
    for (const base of document.querySelectorAll<HTMLElement>(sel)) {
      for (const el of [base, ...base.querySelectorAll<HTMLElement>('*')]) {
        const overflowX = getComputedStyle(el).overflowX;
        const scrolls = overflowX === 'auto' || overflowX === 'scroll' || el === base;
        if (scrolls && (el.scrollWidth > el.clientWidth || el.scrollLeft !== 0)) {
          found.push(
            `${el.tagName.toLowerCase()}.${el.className} ${el.scrollWidth}x${el.clientWidth}`,
          );
        }
      }
    }
    return found;
  }, selector);
}

test('picker and Referenced by row without a horizontal bar at 900 px', async ({
  page,
}, info) => {
  const file = info.outputPath('outside.json');
  writeFileSync(file, JSON.stringify(spec));
  await createProject(page, 'Outside the image');
  await addImage(page);
  await drawMarking(page, await canvasPoint(page, 1 / 4));
  await applySpecialization(page, file);
  await page.getByRole('button', { name: 'Details', exact: true }).click();

  // The item: typed annotation of the Components layer, with the long title.
  await page
    .getByRole('button', { name: /Add annotation to layer Components/ })
    .first()
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /List item/ })
    .click();
  const title = page.getByRole('textbox', { name: 'title' });
  await title.fill(LONG);
  await title.press('Enter');

  // The event points to the item through the picker.
  await drawMarking(page, await canvasPoint(page, 2 / 3));
  await page
    .getByRole('button', { name: /Add annotation to layer Events/ })
    .first()
    .click();
  await page.getByRole('dialog').getByRole('button', { name: /Event/ }).click();
  await page.getByRole('button', { name: /^Choose: main/i }).click();
  const picker = page.getByRole('dialog');
  await expect(picker.getByRole('option')).toHaveCount(1);
  expect(await overflow(page, 'dialog[open]')).toEqual([]);
  await picker.getByRole('option').first().click();
  expect(await overflow(page, '.editor')).toEqual([]);

  // The item shows "Referenced by" with the event.
  await page.getByRole('button', { name: 'Go to target' }).click();
  await expect(page.getByRole('group', { name: 'Referenced by' })).toBeVisible();
  expect(await overflow(page, '.editor')).toEqual([]);
});

// CF13 (R24.15): in the narrow window the target name in the `ref` field of the Details cannot get
// squeezed ("→ Pl…", 24 of 50 px) by the buttons next to it: either it fits whole, or the buttons wrap
// to the next line. Holds at 900 px and at 1280 px.
async function measureRef(page: Page) {
  return page.evaluate(() => {
    const text = document.querySelector<HTMLElement>('.ref-field .ref-control-text')!;
    const field = text.closest<HTMLElement>('.ref-field')!;
    const box = (el: Element) => Math.round(el.getBoundingClientRect().width);
    // The drawn text (Range) against the box, in pixel fraction: 0.3 px less already puts an ellipsis.
    const range = document.createRange();
    range.selectNodeContents(text);
    return {
      shown: text.getBoundingClientRect().width,
      full: range.getBoundingClientRect().width,
      control: box(text.closest('.ref-control')!),
      field: box(field),
    };
  });
}

test('the target name of the ref field fits at 900 and 1280 px', async ({
  page,
}, info) => {
  const file = info.outputPath('outside.json');
  writeFileSync(file, JSON.stringify(spec));
  await createProject(page, 'Outside the image');
  await addImage(page);
  await drawMarking(page, await canvasPoint(page, 1 / 4));
  await applySpecialization(page, file);
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await page
    .getByRole('button', { name: /Add annotation to layer Components/ })
    .first()
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /List item/ })
    .click();
  const title = page.getByRole('textbox', { name: 'title' });
  await title.fill('Plugin B');
  await title.press('Enter');
  await drawMarking(page, await canvasPoint(page, 2 / 3));
  await page
    .getByRole('button', { name: /Add annotation to layer Events/ })
    .first()
    .click();
  await page.getByRole('dialog').getByRole('button', { name: /Event/ }).click();
  await page.getByRole('button', { name: /^Choose: main/i }).click();
  await page.getByRole('dialog').getByRole('option').first().click();

  for (const width of [900, 1280]) {
    await page.setViewportSize({ width, height: 720 });
    const m = await measureRef(page);
    expect(m.shown, `width ${width}`).toBeGreaterThanOrEqual(m.full - 0.05);
    // The Go to and Clear icons keep the button size (the Tooltip anchor does not stretch).
    const row = await page.evaluate(() => {
      const field = document.querySelector('.ref-field:not(.ref-cell)');
      return [...(field?.children ?? [])].map((c) => {
        const box = c.getBoundingClientRect();
        return { top: Math.round(box.top), width: Math.round(box.width) };
      });
    });
    for (const icon of row.slice(1))
      expect(icon.width, `icon at ${width}`).toBeLessThanOrEqual(40);
  }
});

// AF2 (#784, decision 4): at 900×720 with Tree, Layers and Details open (Details ~279 px), the
// target label has priority over the layer name: it shows whole and the full text
// (target and layer) is in the tooltip.
test('with 3 windows open the target label stays whole and the tooltip carries everything', async ({
  page,
}, info) => {
  const file = info.outputPath('outside.json');
  writeFileSync(file, JSON.stringify(spec));
  await createProject(page, 'Outside the image');
  await addImage(page);
  await drawMarking(page, await canvasPoint(page, 1 / 4));
  await applySpecialization(page, file);
  await page.keyboard.press('Control+Shift+1');
  await page.keyboard.press('Control+Shift+2');
  await page.keyboard.press('Control+Shift+3');
  await page
    .getByRole('button', { name: /Add annotation to layer Components/ })
    .first()
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /List item/ })
    .click();
  const title = page.getByRole('textbox', { name: 'title' });
  await title.fill('Plugin B');
  await title.press('Enter');
  await drawMarking(page, await canvasPoint(page, 2 / 3));
  await page
    .getByRole('button', { name: /Add annotation to layer Events/ })
    .first()
    .click();
  await page.getByRole('dialog').getByRole('button', { name: /Event/ }).click();
  await page.getByRole('button', { name: /^Choose: main/i }).click();
  await page.getByRole('dialog').getByRole('option').first().click();

  const m = await measureRef(page);
  expect(m.shown, 'label cut').toBeGreaterThanOrEqual(m.full - 0.05);

  // What stays cut (here, the layer name) shows the whole text in the tooltip.
  const control = page.locator('.ref-field .ref-control');
  await control.hover();
  const tip = page.locator('[data-tooltip]', { hasText: 'Plugin B' }).first();
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('Components');
});

// CL1 (#784, findings 1 and 2 of the #827 report): the `ref` control in a table cell does not leave the
// Clear ✕ over the label nor break the "(broken reference)" into several lines; and the label of the
// `any` field is not cut even by half a pixel. Measures the drawn text (Range), not the scrollWidth.
const tableSpec = {
  ...spec,
  layers: [
    spec.layers[0],
    {
      ...spec.layers[1],
      annotationTypes: [
        {
          id: 'event',
          name: 'Event',
          fields: [
            {
              key: 'plugins',
              type: 'table',
              columns: [
                { key: 'note', type: 'string' },
                {
                  key: 'item',
                  type: 'ref',
                  accepts: { annotations: ['item'] },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

// CL2 (#784, finding 1-R): the table does not scroll horizontally and the Clear ✕ and the cell stay inside
// the visible area of the table (`.data-grid`).
async function measureGrid(page: Page) {
  return page.evaluate(() => {
    const grid = document.querySelector<HTMLElement>('.data-grid')!;
    const g = grid.getBoundingClientRect();
    const out = { scroll: grid.scrollWidth - grid.clientWidth, outside: 0 };
    for (const cell of grid.querySelectorAll<HTMLElement>('.ref-cell')) {
      for (const el of [cell, ...cell.querySelectorAll<HTMLElement>('button')]) {
        const r = el.getBoundingClientRect();
        out.outside = Math.max(out.outside, g.left - r.left, r.right - g.right);
      }
    }
    return out;
  });
}

async function measureRefCells(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.ref-cell')].map((cell) => {
      const control = cell.querySelector<HTMLElement>('.ref-control')!;
      const text = control.querySelector<HTMLElement>('.ref-control-text')!;
      const clear = cell.querySelector<HTMLElement>('button:not(.ref-control)')!;
      const range = document.createRange();
      range.selectNodeContents(text);
      const c = control.getBoundingClientRect();
      const x = clear.getBoundingClientRect();
      return {
        text: text.textContent,
        // Only counts if the ✕ is in the same vertical band as the control (it may drop to the line below).
        overlap:
          x.top < c.bottom - 1 && x.bottom > c.top + 1
            ? Math.max(0, c.right - x.left)
            : 0,
        cut: Math.max(
          0,
          range.getBoundingClientRect().width - text.getBoundingClientRect().width,
        ),
        lines: Math.round(range.getBoundingClientRect().height / 14),
      };
    }),
  );
}

for (const width of [1280, 900]) {
  test(`ref table cells: Clear X outside the label and legible broken reference at ${width} px`, async ({
    page,
  }, info) => {
    const file = info.outputPath('outside.json');
    writeFileSync(file, JSON.stringify(tableSpec));
    await page.setViewportSize({ width, height: 720 });
    await createProject(page, 'Outside the image');
    await addImage(page);
    await page.keyboard.press('Control+Shift+1');
    await page.keyboard.press('Control+Shift+2');
    await page.keyboard.press('Control+Shift+3');
    await expect(page.getByRole('region', { name: 'Details' })).toBeVisible();
    await page.waitForTimeout(300); // the canvas readjusts its size after the windows open
    await drawMarking(page, await canvasPoint(page, 1 / 4));
    await applySpecialization(page, file);
    await page
      .getByRole('button', { name: /Add annotation to layer Components/ })
      .first()
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /List item/ })
      .click();
    const title = page.getByRole('textbox', { name: 'title' });
    await title.fill('Plugin A');
    await title.press('Enter');
    await drawMarking(page, await canvasPoint(page, 2 / 3));
    await page
      .getByRole('button', { name: /Add annotation to layer Events/ })
      .first()
      .click();
    await page.getByRole('dialog').getByRole('button', { name: /Event/ }).click();
    await page.getByRole('button', { name: '+ Row' }).click();
    await page.getByRole('button', { name: /^Choose: item/i }).click();
    await page.getByRole('dialog').getByRole('option').first().click();

    const ok = (await measureRefCells(page))[0]!;
    expect(ok.overlap, 'anchor and ✕ overlapping').toBe(0);
    expect(ok.cut, 'label cut').toBeLessThanOrEqual(0.5);
    // CD6 (R24.15, finding 1.1 of #1372): "Plugin A" fits on one line, without breaking into "Plu/gin/A".
    expect(ok.lines, 'target label on one line').toBe(1);
    for (const theme of ['light', 'dark'] as const) {
      await page.evaluate(
        (th) => document.documentElement.setAttribute('data-theme', th),
        theme,
      );
      const g = await measureGrid(page);
      expect(g.scroll, `horizontal scroll (${theme})`).toBeLessThanOrEqual(0);
      expect(g.outside, `outside the table (${theme})`).toBeLessThanOrEqual(0.5);
    }

    // Deletes the target (Plugin A) and goes back to the event: the cell becomes broken.
    const tree = page.getByRole('list', { name: 'Marking tree' });
    await tree.getByRole('button', { name: 'Unnamed marking' }).first().click();
    await page.getByRole('button', { name: 'Delete marking' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
    await tree.getByRole('button', { name: 'Unnamed marking' }).first().click();
    await expect(page.locator('.ref-cell .ref-control.is-broken')).toBeVisible();
    const broken = (await measureRefCells(page))[0]!;
    expect(broken.text).toContain('broken');
    expect(broken.lines, 'wraps in few lines').toBeLessThanOrEqual(8);
    expect(broken.overlap, 'anchor and ✕ overlapping').toBe(0);
    expect(broken.cut, 'label cut').toBeLessThanOrEqual(0.5);
    // TE1 (#1477): the break is between words; each word of "(broken reference)" stays on a
    // single line (a Range over the word has one rectangle per line it occupies).
    const split = await page.evaluate(() => {
      const text = document.querySelector<HTMLElement>(
        '.ref-cell .ref-control.is-broken .ref-control-text',
      )!;
      const node = text.firstChild!;
      const words = [...(node.textContent ?? '').matchAll(/\S+/g)];
      return words
        .map((m) => {
          const range = document.createRange();
          range.setStart(node, m.index);
          range.setEnd(node, m.index + m[0].length);
          return { word: m[0], lines: range.getClientRects().length };
        })
        .filter((w) => w.lines > 1);
    });
    expect(split, 'word split across lines').toEqual([]);
    for (const theme of ['light', 'dark'] as const) {
      await page.evaluate(
        (th) => document.documentElement.setAttribute('data-theme', th),
        theme,
      );
      const g = await measureGrid(page);
      expect(g.scroll, `horizontal scroll (${theme})`).toBeLessThanOrEqual(0);
      expect(g.outside, `outside the table (${theme})`).toBeLessThanOrEqual(0.5);
    }
    // Back with Ctrl+Z: the target reappears and the cell stops being broken.
    await page.keyboard.press('Control+Z');
    await expect(page.locator('.ref-cell .ref-control.is-broken')).toHaveCount(0);
  });
}
