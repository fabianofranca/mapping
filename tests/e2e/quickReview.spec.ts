import { expect, test, type Page } from '@playwright/test';
import {
  addAnnotation,
  citationUrl,
  createMarking,
  buildProposal,
  proposalFilePath,
  serializeProposal,
  setMarkingRect,
  serializeThread,
  threadFilePath,
  type Thread,
} from '../../src/model';
import { fixtureFiles, fixtureProject } from './proposalFixture';

// Stage #1932, phase QR3: the quick review bar under the ghost of a small proposal of the open
// conversation: hover and focus show the real look, Esc rejects and focuses the composer, Accept
// applies in one undo entry. FOLDER project (an OPFS folder plays the chosen one).

test.use({ viewport: { width: 1280, height: 860 } });

const FOLDER = 'quick-review-e2e';
const PROPOSAL_ID = 'quick-button';
const THREAD_ID = 'qr3-thread';
const NOW = '2026-11-18T09:00:00.000Z';

function quickFiles(
  rect = { x: 24, y: 620, width: 120, height: 48 },
  changed = false,
): Map<string, string | Buffer> {
  const project = fixtureProject();
  // `changed`: the proposal moves an existing marking instead of creating one (the taller bar).
  let after = changed
    ? setMarkingRect(project, 'M5', { x: 30, y: 420, width: 300, height: 56 })
    : createMarking(project, {
        id: 'M20',
        containerId: 'I1',
        name: 'Help button',
        rect,
      });
  if (!changed) {
    after = addAnnotation(after, {
      id: 'A20',
      markingId: 'M20',
      layerId: 'L1',
      name: 'Button',
    });
  }
  const proposal = buildProposal(project, after, {
    id: PROPOSAL_ID,
    title: 'Add a help button',
    createdAt: NOW,
  });
  const url =
    citationUrl('Store', project, [], { kind: 'proposal', id: PROPOSAL_ID }) ?? '';
  const thread: Thread = {
    format: 'mapping-thread',
    formatVersion: 1,
    id: THREAD_ID,
    anchor: { kind: 'marking', id: 'M1' },
    createdAt: NOW,
    revision: 1,
    resolved: null,
    messages: [
      {
        id: 'm1',
        author: { kind: 'agent', name: 'Claude Code', email: null },
        at: NOW,
        text: `Here is a help button [Add a help button](${url}).`,
        proposal: PROPOSAL_ID,
      },
    ],
  };
  const files = fixtureFiles();
  files.set(proposalFilePath(PROPOSAL_ID), serializeProposal(proposal));
  files.set(threadFilePath(THREAD_ID, false), serializeThread(thread));
  return files;
}

async function openFolder(
  page: Page,
  rect?: { x: number; y: number; width: number; height: number },
  changed = false,
): Promise<void> {
  const files = [...quickFiles(rect, changed)].map(([path, data]) => ({
    path,
    data: [...(typeof data === 'string' ? Buffer.from(data) : data)],
  }));
  await page.addInitScript(
    ([name, list]) => {
      localStorage.setItem(
        'mapping.identity',
        JSON.stringify({ name: 'Marina Alves', email: 'marina@example.com' }),
      );
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
  await page.getByRole('button', { name: /Open folder/ }).click();
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
}

const host = (page: Page) => page.locator('.canvas-host');
const bar = (page: Page) => page.getByRole('group', { name: /^Quick review/ });
const mode = (m: string) => `${PROPOSAL_ID}:${m}:1`;

async function openConversation(page: Page): Promise<void> {
  await page.keyboard.press('Control+Shift+7');
  await page
    .getByRole('button', { name: /, citation$/ })
    .first()
    .click();
  await expect(page.locator('[data-window="conversation"]')).toBeVisible();
}

test('ghost, peek on hover and focus, Esc rejects, Accept and undo/redo', async ({
  page,
}) => {
  await openFolder(page);
  await openConversation(page);

  // The ghost and its bar.
  await expect(host(page)).toHaveAttribute('data-quick-review', mode('ghost'));
  await expect(bar(page)).toBeVisible();

  // Hover shows the real look; leaving goes back to the ghost.
  await bar(page).hover();
  await expect(host(page)).toHaveAttribute('data-quick-review', mode('peek'));
  await page.mouse.move(5, 5);
  await expect(host(page)).toHaveAttribute('data-quick-review', mode('ghost'));

  // Focus inside the bar shows it too.
  await bar(page).getByRole('button', { name: 'Accept' }).focus();
  await expect(host(page)).toHaveAttribute('data-quick-review', mode('peek'));

  // Esc rejects: the ghost goes away and the focus is in the composer.
  await page.keyboard.press('Escape');
  await expect(host(page)).not.toHaveAttribute('data-quick-review', /.+/);
  await expect
    .poll(() =>
      page.evaluate(() => document.activeElement?.hasAttribute('data-composer-field')),
    )
    .toBe(true);

  // The card brings it back.
  await page
    .locator('[data-proposal-card]')
    .getByRole('button', { name: /^Show on the canvas/ })
    .click();
  await expect(host(page)).toHaveAttribute('data-quick-review', mode('ghost'));
  // The button that was clicked is gone: the focus does not fall to the body (CL1.6).
  await expect
    .poll(() => page.evaluate(() => document.activeElement === document.body))
    .toBe(false);

  // Accept applies, with the toast; Ctrl+Z brings the ghost back and Ctrl+Y applies again.
  await bar(page).getByRole('button', { name: 'Accept' }).click();
  await expect(host(page)).not.toHaveAttribute('data-quick-review', /.+/);
  await expect(
    page.getByText('Proposal applied: “Add a help button”. Undo with Ctrl+Z.'),
  ).toBeVisible();
  await page.locator('[data-canvas-area]').focus();
  // The pointer is not over where the bar comes back (it would show the real look).
  await page.mouse.move(5, 5);
  await page.keyboard.press('Control+z');
  await expect(host(page)).toHaveAttribute('data-quick-review', mode('ghost'));
  await page.keyboard.press('Control+y');
  await expect(host(page)).not.toHaveAttribute('data-quick-review', /.+/);
});

// Findings CL1.2 to CL1.5 of the tester's round (sub-issue #2743): at the smallest window the bar
// must stay whole (nothing over its buttons or header, one line for the title) and the rejected card
// must keep its text readable and its button inside it.
for (const size of [
  { width: 1280, height: 720 },
  { width: 900, height: 720 },
]) {
  test.describe(`bar and card at ${size.width}×${size.height}`, () => {
    test.use({ viewport: size });

    test('nothing covers the bar and its header stays on one line', async ({ page }) => {
      await openFolder(page);
      await openConversation(page);
      await expect(bar(page)).toBeVisible();
      const report = await page.evaluate(() => {
        const el = document.querySelector<HTMLElement>('.quick-bar');
        if (!el) return null;
        const covered = [...el.querySelectorAll<HTMLElement>('button, b')]
          .filter((c) => {
            const r = c.getBoundingClientRect();
            const hit = document.elementFromPoint(
              r.left + r.width / 2,
              r.top + r.height / 2,
            );
            return !hit || !(c === hit || c.contains(hit) || hit.contains(c));
          })
          .map((c) => c.textContent || c.getAttribute('aria-label'));
        const title = el.querySelector<HTMLElement>('.quick-bar-head b');
        return {
          covered,
          width: el.getBoundingClientRect().width,
          title: title?.getBoundingClientRect().toJSON(),
          counts: el
            .querySelector('.quick-bar-head > .muted')
            ?.getBoundingClientRect()
            .toJSON(),
        };
      });
      expect(report?.covered).toEqual([]);
      // The title shares its line with the counts (they overlap vertically), never alone above them.
      const { title, counts } = report ?? {};
      expect(
        title && counts && title.top < counts.bottom && counts.top < title.bottom,
      ).toBe(true);
      expect(report?.width).toBeGreaterThan(320);
    });

    test('the minimap never covers Accept when the ghost is at the lower right', async ({
      page,
    }) => {
      await openFolder(page, { x: 250, y: 780, width: 120, height: 48 });
      await openConversation(page);
      await expect(bar(page)).toBeVisible();
      const hit = await page.evaluate(() => {
        const accept = [
          ...document.querySelectorAll<HTMLElement>('.quick-bar button'),
        ].find((b) => b.textContent === 'Accept');
        if (!accept) return 'no accept';
        const r = accept.getBoundingClientRect();
        const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return el === accept || accept.contains(el)
          ? 'accept'
          : (el?.className ?? 'none');
      });
      expect(hit).toBe('accept');
      await bar(page).getByRole('button', { name: 'Accept' }).click();
      await expect(host(page)).not.toHaveAttribute('data-quick-review', /.+/);
    });

    test('the rejected card keeps its text and its button inside', async ({ page }) => {
      await openFolder(page);
      await openConversation(page);
      await bar(page).getByRole('button', { name: 'Accept' }).focus();
      await page.keyboard.press('Escape');
      const card = page.locator('[data-proposal-card]');
      await expect(card.getByText(/Rejected on the canvas/)).toBeVisible();
      const report = await page.evaluate(() => {
        const c = document.querySelector<HTMLElement>('[data-proposal-card]');
        if (!c) return null;
        const box = c.getBoundingClientRect();
        const text = [
          ...c.querySelectorAll<HTMLElement>('.proposal-card-text span'),
        ].find((s) => s.textContent?.includes('Rejected'));
        const btn = [...c.querySelectorAll<HTMLElement>('button')].find((b) =>
          b.getAttribute('aria-label')?.startsWith('Show on the canvas'),
        );
        const tr = text?.getBoundingClientRect();
        const br = btn?.getBoundingClientRect();
        return {
          textWidth: tr?.width ?? 0,
          textLines:
            tr && text
              ? Math.round(tr.height / parseFloat(getComputedStyle(text).lineHeight))
              : 0,
          inside:
            !!br &&
            br.top >= box.top &&
            br.bottom <= box.bottom &&
            !!tr &&
            tr.top >= box.top,
        };
      });
      expect(report?.inside).toBe(true);
      expect(report?.textWidth).toBeGreaterThan(120);
      expect(report?.textLines).toBeLessThanOrEqual(3);
    });
  });
}

// Findings CL2.1 and CL2.2 (sub-issue #2746, retest of CL1): at 900×720 the corner notices covered the
// whole bar, and the rejected card's first line was clipped at the end of the conversation's scroll.
async function addProposals(page: Page, count: number): Promise<void> {
  const project = fixtureProject();
  const files = [];
  for (let i = 0; i < count; i++) {
    const id = `extra-${i}`;
    const after = createMarking(project, {
      id: `M3${i}`,
      containerId: 'I1',
      name: `Extra ${i}`,
      rect: { x: 40 + i * 30, y: 40, width: 40, height: 40 },
    });
    const proposal = buildProposal(project, after, {
      id,
      title: `Extra proposal ${i}`,
      createdAt: NOW,
    });
    files.push({ path: proposalFilePath(id), data: serializeProposal(proposal) });
  }
  await page.evaluate(
    async ([name, list]) => {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle(name);
      for (const f of list) {
        let d = dir;
        const parts = f.path.split('/');
        for (const part of parts.slice(0, -1))
          d = await d.getDirectoryHandle(part, { create: true });
        const h = await d.getFileHandle(parts[parts.length - 1]!, { create: true });
        const w = await h.createWritable();
        await w.write(f.data);
        await w.close();
      }
      window.dispatchEvent(new Event('focus'));
    },
    [FOLDER, files] as const,
  );
}

for (const size of [
  { width: 1280, height: 720 },
  { width: 900, height: 720 },
]) {
  test.describe(`CL2 at ${size.width}×${size.height}`, () => {
    test.use({ viewport: size });

    test('the corner notices never cover the bar, also when they appear later', async ({
      page,
    }) => {
      await openFolder(page, undefined, true);
      await openConversation(page);
      await expect(bar(page)).toBeVisible();
      await addProposals(page, 4);
      await expect(
        page.locator('[data-canvas-obstacle] .notice-box').first(),
      ).toBeVisible();
      await expect(page.getByText(/more proposal notice/)).toBeVisible();
      await expect
        .poll(async () =>
          page.evaluate(() => {
            const el = document.querySelector<HTMLElement>('.quick-bar');
            if (!el) return ['no bar'];
            return [...el.querySelectorAll<HTMLElement>('button, b')]
              .filter((c) => {
                const r = c.getBoundingClientRect();
                const hit = document.elementFromPoint(
                  r.left + r.width / 2,
                  r.top + r.height / 2,
                );
                return !hit || !(c === hit || c.contains(hit) || hit.contains(c));
              })
              .map((c) => c.textContent || c.getAttribute('aria-label'));
          }),
        )
        .toEqual([]);
    });

    // CL3.2: the ghost sits at the bottom of the canvas (no room below the bar) with the notice stack up.
    test('the bar with the ghost at the bottom is clear of the notices and every button is hit', async ({
      page,
    }) => {
      await openFolder(page);
      await openConversation(page);
      await expect(bar(page)).toBeVisible();
      await addProposals(page, 4);
      await expect(page.getByText(/more proposal notice/)).toBeVisible();
      await page.mouse.move(5, 5);
      const check = () =>
        page.evaluate(() => {
          const el = document.querySelector<HTMLElement>('.quick-bar');
          const box = document.querySelector<HTMLElement>(
            '[data-canvas-obstacle] .notice-box',
          );
          if (!el || !box)
            return { bar: null, miss: ['no bar or notices'], overlap: true };
          const b = el.getBoundingClientRect();
          const n = box.getBoundingClientRect();
          const overlap = !(
            b.right <= n.left ||
            n.right <= b.left ||
            b.bottom <= n.top ||
            n.bottom <= b.top
          );
          const miss = [...el.querySelectorAll<HTMLElement>('button')]
            .filter((c) => {
              const r = c.getBoundingClientRect();
              const hit = document.elementFromPoint(
                r.left + r.width / 2,
                r.top + r.height / 2,
              );
              return !hit || !(c === hit || c.contains(hit));
            })
            .map((c) => c.textContent);
          return {
            bar: [b.left, b.top, b.right, b.bottom].map(Math.round),
            miss,
            overlap,
          };
        });
      await expect.poll(async () => (await check()).miss).toEqual([]);
      expect((await check()).overlap).toBe(false);
      await page.keyboard.press('Alt+l');
      await expect.poll(async () => (await check()).miss).toEqual([]);
      expect((await check()).overlap).toBe(false);
    });

    // CL3.1: later messages follow the card, so at the end of the scroll the card sits above the scroll
    // area (the notice measured 42 px). The card itself is not clipped: its text is whole and fully
    // visible once it is scrolled into view.
    test('a card followed by replies is whole and reachable by scrolling', async ({
      page,
    }) => {
      await openFolder(page, undefined, true);
      await page.keyboard.press('Control+Shift+3');
      await openConversation(page);
      await bar(page).getByRole('button', { name: 'Accept' }).focus();
      await page.keyboard.press('Escape');
      const card = page.locator('[data-proposal-card]');
      await expect(card.getByText(/Rejected on the canvas/)).toBeVisible();
      for (const msg of [
        'Please make it a little larger.',
        'And move it up a bit, thanks.',
      ]) {
        const field = page.locator('[data-composer-field]');
        await field.focus();
        await field.pressSequentially(msg);
        await expect(field).toHaveText(msg);
        await page.keyboard.press('Control+Enter');
        await expect(page.getByText(msg)).toBeAttached();
        await expect(field).toHaveText('');
      }
      const r = await page.evaluate(() => {
        const body = document.querySelector<HTMLElement>(
          '[data-window="conversation"] .tool-window-body',
        )!;
        const c = document.querySelector<HTMLElement>('[data-proposal-card]')!;
        const text = c.querySelector<HTMLElement>('.proposal-card-text')!;
        const area = body.getBoundingClientRect();
        body.scrollTop = 0;
        const topMax = Math.max(0, c.getBoundingClientRect().top - area.top - 8);
        body.scrollTop = topMax;
        const t = text.getBoundingClientRect();
        return {
          cardHeight: Math.round(c.getBoundingClientRect().height),
          textWhole: text.scrollHeight <= text.clientHeight + 1,
          visible: t.top >= area.top && t.bottom <= area.bottom,
        };
      });
      expect(r.cardHeight).toBeLessThan(150);
      expect(r.textWhole).toBe(true);
      expect(r.visible).toBe(true);
    });

    test('the rejected card is never clipped at the end of the scroll', async ({
      page,
    }) => {
      await openFolder(page, undefined, true);
      // Details and Conversation share the right column: the conversation's scroll area is the short one.
      await page.keyboard.press('Control+Shift+3');
      await openConversation(page);
      await bar(page).getByRole('button', { name: 'Accept' }).focus();
      await page.keyboard.press('Escape');
      const card = page.locator('[data-proposal-card]');
      await expect(card.getByText(/Rejected on the canvas/)).toBeVisible();
      const gaps = await page.evaluate(() => {
        const body = document.querySelector<HTMLElement>(
          '[data-window="conversation"] .tool-window-body',
        );
        const c = document.querySelector<HTMLElement>('[data-proposal-card]');
        if (!body || !c) return null;
        const out: { top: number; clip: number }[] = [];
        for (const top of [body.scrollHeight, 0]) {
          body.scrollTop = top;
          const area = body.getBoundingClientRect().top;
          const text = [
            ...c.querySelectorAll<HTMLElement>('.proposal-card-text span'),
          ].find((s) => s.textContent?.includes('Rejected'));
          out.push({
            top: body.scrollTop,
            clip: Math.round(area - (text?.getBoundingClientRect().top ?? 0)),
          });
        }
        return out;
      });
      for (const g of gaps ?? []) expect(g.clip).toBeLessThanOrEqual(0);
      // The cause of the clip: the card stacked the icon, the text and each button on its own row
      // (166 px here, more on the CI fonts; 110 and 138 after), leaving no room for it above the composer. It stays compact.
      const box = await card.boundingBox();
      expect(box?.height).toBeLessThan(150);
    });
  });
}
