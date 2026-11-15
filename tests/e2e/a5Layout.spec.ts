import { expect, test } from '@playwright/test';
import JSZip from 'jszip';
import {
  addContainer,
  addTypedAnnotation,
  applySpecialization,
  createMarking,
  createProject,
  parseSpec,
  serialize,
} from '../../src/model';
import { blocksPng } from './png';

const NOW = '2026-11-05T12:00:00.000Z';
async function zip(): Promise<Buffer> {
  const specRaw = {
    format: 'mapping-spec',
    formatVersion: 18,
    id: 'lib',
    name: 'Lib',
    version: 1,
    layers: [
      {
        id: 'ui',
        name: 'UI',
        color: '#112233',
        annotationTypes: [
          {
            id: 'bar',
            name: 'Bar',
            fields: [
              {
                key: 'navigationIconDescription',
                label: 'Navigation icon description',
                type: 'string',
                description: 'Help text',
              },
              {
                key: 'subtitle',
                label: 'Subtitle',
                type: 'string',
                description: 'Help text',
              },
              {
                key: 'expandedHeight',
                label: 'Expanded height',
                type: 'number',
                description: 'Help text',
              },
              { key: 'title', label: 'Title', type: 'string', description: 'Help text' },
            ],
          },
        ],
      },
    ],
  };
  const parsed = parseSpec(specRaw);
  if (!parsed.ok) throw new Error(parsed.errors.join());
  let p = createProject({
    name: 'P',
    now: NOW,
    firstLayer: { id: 'L1', name: 'Components', color: '#1e88e5' },
  });
  p = applySpecialization(p, parsed.spec, {
    newId: (() => {
      let n = 0;
      return () => `SL${++n}`;
    })(),
  });
  p = addContainer(p, { id: 'I1', file: 'images/g.png', width: 800, height: 600 });
  p = createMarking(p, {
    id: 'M1',
    containerId: 'I1',
    name: 'Strip',
    rect: { x: 10, y: 10, width: 300, height: 80 },
  });
  const layer = p.layers.find((l) => l.name === 'UI')!.id;
  p = addTypedAnnotation(p, {
    id: 'A1',
    markingId: 'M1',
    layerId: layer,
    type: { specId: 'lib', typeId: 'bar' },
  });
  const z = new JSZip();
  const opts = { date: new Date(NOW), compression: 'DEFLATE' as const };
  z.file('mapping.json', serialize(p), opts);
  z.file('specs/lib.json', JSON.stringify(specRaw), opts);
  z.file('images/g.png', blocksPng(800, 600, [240, 240, 240], []), opts);
  return z.generateAsync({ type: 'nodebuffer', platform: 'UNIX' });
}

// Phase A5 (fix round of #1081), F7 and F8: a field label with the help icon and the menu breaks between
// words, never inside one; the bottom window tabs have space between them.

async function open(page: import('@playwright/test').Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({ name: 'p.zip', mimeType: 'application/zip', buffer: await zip() });
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
}

test('F7: a label next to the help icon and the menu keeps whole words', async ({
  page,
}) => {
  await open(page);
  await page.keyboard.press('Control+Shift+3');
  await page.keyboard.press('Control+Shift+1');
  await page.getByText('Strip').first().click();
  const labels = page.locator('.props-label-cell > .props-label', {
    hasText: /Navigation icon description|Expanded height/,
  });
  await expect(labels).toHaveCount(2);
  const rows = await labels.evaluateAll((els) =>
    els.map((el) => {
      const probe = document.createElement('span');
      probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap';
      probe.style.font = getComputedStyle(el).font;
      let widest = 0;
      for (const word of (el.textContent ?? '').split(/\s+/)) {
        probe.textContent = word;
        document.body.append(probe);
        widest = Math.max(widest, probe.getBoundingClientRect().width);
        probe.remove();
      }
      return { text: el.textContent, width: el.getBoundingClientRect().width, widest };
    }),
  );
  for (const row of rows)
    expect(row.width, row.text ?? '').toBeGreaterThanOrEqual(row.widest);
});

test('F8: the bottom window tabs do not touch each other', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Control+Shift+6');
  const tablist = page
    .getByRole('tablist')
    .filter({ has: page.getByRole('tab', { name: 'Diagnostics' }) });
  const gaps = await tablist.evaluate((list) => {
    const range = document.createRange();
    const edges = [...list.querySelectorAll<HTMLElement>('[role=tab]')].map((tab) => {
      // The content of a tab: its label text and counter, without the tab's own padding.
      range.selectNodeContents(tab);
      const r = range.getBoundingClientRect();
      return { left: r.left, right: r.right };
    });
    return edges.slice(1).map((edge, i) => edge.left - edges[i]!.right);
  });
  for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(4);
});
