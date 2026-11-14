import { cleanup, fireEvent, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renameMarking, replaceContainer } from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { sampleProject } from '../../model/fixtures';
import { propose } from '../../model/proposalFixtures';
import { richScenario } from '../../store/proposalHarness';
import { showReviewPanel } from './reviewHarness';

// SA1 (stage #347, decision 3): every button with visible text has an accessible name that
// starts with that text ("<visible>: <target>"), for voice control (WCAG 2.5.3). The state
// stays only in `aria-pressed`; the conflict goes into the description.

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(cleanup);

const header = () => screen.getByRole('region', { name: 'Decision' });
const describedText = (el: HTMLElement) =>
  (el.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');

describe('accessible names in the review', () => {
  it('image: "Accept image: <name>" even when pressed; the state is in aria-pressed', async () => {
    const base = sampleProject();
    const after = replaceContainer(base, 'I2', {
      file: 'images/front-2.jpg',
      width: 2000,
      height: 2000,
    });
    const h = await showReviewPanel(
      { project: base, proposals: [propose(base, after)] },
      { level: 'image', id: 'I2' },
    );
    const accept = within(header()).getByRole('button', { name: /^Accept image/ });
    expect(accept.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(accept);
    await vi_waitPressed(accept);
    expect(
      within(header())
        .getByRole('button', { name: /^Accept image/ })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(h.review.selected.value).toEqual({ level: 'image', id: 'I2' });
  });

  it('marking: "Reject marking: <name>"', async () => {
    const { proposal } = richScenario();
    await showReviewPanel({ proposals: [proposal] }, { level: 'item', id: 'M1' });
    const reject = within(header()).getByRole('button', { name: /^Reject marking/ });
    expect(reject.getAttribute('aria-label')).toBe('Reject marking: Porta');
  });

  it('conflict: "Overwrite" starts the name and the effect goes into the description', async () => {
    const { proposal } = richScenario();
    const edited = renameMarking(sampleProject(), 'M1', 'Topo');
    await showReviewPanel(
      { project: edited, proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    fireEvent.click(
      screen.getByRole('button', { name: /^Name: changed, pending, in conflict/ }),
    );
    const pop = screen.getByRole('dialog');
    const overwrite = within(pop).getByRole('button', { name: /^Overwrite/ });
    expect(describedText(overwrite)).toContain('overwrites Topo with Porta dianteira');
    const keep = within(pop).getByRole('button', { name: /^Keep current/ });
    expect(describedText(keep)).toContain('keeps Topo');
  });
});

async function vi_waitPressed(el: HTMLElement) {
  const { waitFor } = await import('@testing-library/preact');
  await waitFor(() => expect(el.getAttribute('aria-pressed')).toBe('true'));
}
