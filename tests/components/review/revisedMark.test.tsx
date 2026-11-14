import { act, cleanup, fireEvent, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { locale } from '../../../src/store/settings';
import { ProposalsWindow } from '../../../src/ui/review/ProposalsWindow';
import { NEW_IMAGE_PATH, richScenario } from '../../store/proposalHarness';
import { openReviewHarness, renderInEditor } from './reviewHarness';
import { revisedScenario } from './revisedFixture';

// "Revised" mark in the Proposals window (stage #644, CP3): the badge on the change row and
// on the item, the "Revised only" filter and the header reading.

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(cleanup);

async function openRevised() {
  const s = revisedScenario();
  const h = await openReviewHarness({
    proposals: [s.proposal],
    files: { [NEW_IMAGE_PATH]: 'image' },
  });
  expect(h.review.open('P1').ok).toBe(true);
  return { h, ...s };
}

const rowOf = (key: string) =>
  document.querySelector(`[data-row="${key}"]`) as HTMLElement;

describe('Revised badge on the row', () => {
  it('the replaced change and the new one get the badge, with the hint and the accessible name', async () => {
    const { h, changedId, addedId } = await openRevised();
    renderInEditor(h, <ProposalsWindow onHelp={() => {}} />);
    act(() => h.review.select({ level: 'change', id: changedId }));
    act(() => h.review.select({ level: 'change', id: addedId }));
    const changed = rowOf(`change:${changedId}`);
    expect(within(changed).getByText('Revised')).toBeTruthy();
    // The Tooltip hint and the text for the screen reader.
    expect(within(changed).getAllByText(/The agent replaced this change on /)).toHaveLength(
      2,
    );
    expect(changed.getAttribute('aria-label')).toBe('Name, Revised');
    const added = rowOf(`change:${addedId}`);
    expect(within(added).getByText('New in the revision')).toBeTruthy();
    expect(
      within(added).getAllByText(/The agent added this change on /),
    ).toHaveLength(2);
    expect(added.getAttribute('aria-label')).toMatch(/, New in the revision$/);
    // A change the revision did not touch does not get the badge.
    const other = [
      ...document.querySelectorAll<HTMLElement>('[data-row^="change:"]'),
    ].find(
      (el) =>
        ![`change:${changedId}`, `change:${addedId}`].includes(el.dataset.row ?? ''),
    );
    if (!other) throw new Error('no other change in the list');
    expect(within(other).queryByText('Revised')).toBeNull();
  });

  it('the item that contains the revised change gets the badge; deciding the change removes the mark', async () => {
    const { h, changedId, addedId } = await openRevised();
    renderInEditor(h, <ProposalsWindow onHelp={() => {}} />);
    act(() => h.review.select({ level: 'change', id: changedId }));
    const item = rowOf('item:M1');
    expect(within(item).getByText('Revised')).toBeTruthy();
    // The agent left the hint for the screen reader inside the badge itself.
    expect(
      within(item).getAllByText(
        'The agent revised this change. Check it before deciding.',
      ),
    ).toHaveLength(2);
    let result: unknown;
    await act(async () => {
      result = await h.review.decide({ level: 'change', id: changedId }, 'accepted');
    });
    expect(result).toMatchObject({ ok: true });
    expect([...h.review.derived.revisedIds.value]).toEqual([addedId]);
    // The change new in the revision is still on the item; once it is decided too, the badge goes away.
    expect(within(rowOf('item:M1')).queryByText('Revised')).toBeTruthy();
    await act(async () => {
      await h.review.decide({ level: 'change', id: addedId }, 'accepted');
    });
    expect(within(rowOf('item:M1')).queryByText('Revised')).toBeNull();
    expect(within(rowOf(`change:${changedId}`)).queryByText('Revised')).toBeNull();
  });
});

describe('Revised only filter', () => {
  const trigger = () => screen.getByRole('button', { name: /^Filters/ });

  it('appears next to Conflicts only with the count and turns the filter on', async () => {
    const { h, changedId, addedId } = await openRevised();
    renderInEditor(h, <ProposalsWindow onHelp={() => {}} />);
    fireEvent.click(trigger());
    const box = screen.getByRole('checkbox', { name: 'Revised only (2)' });
    fireEvent.click(box);
    expect(h.review.filters.value.onlyRevised).toBe(true);
    expect(h.review.derived.visibleIds.value).toEqual([changedId, addedId]);
    expect(trigger().textContent).toBe('Filters · 1');
  });

  it('without a revised change and with the filter off, the option does not exist', async () => {
    const s = revisedScenario();
    const h = await openReviewHarness({ proposals: [richScenario().proposal] });
    h.review.open('P1');
    renderInEditor(h, <ProposalsWindow onHelp={() => {}} />);
    fireEvent.click(trigger());
    expect(screen.queryByRole('checkbox', { name: /^Revised only/ })).toBeNull();
    expect(s.proposal.revisions).toHaveLength(1);
  });

  it('with the filter on and none revised, the option stays so it can be turned off', async () => {
    const { h, changedId } = await openRevised();
    renderInEditor(h, <ProposalsWindow onHelp={() => {}} />);
    act(() => h.review.setFilters({ onlyRevised: true }));
    await act(async () => {
      await h.review.decide({ level: 'change', id: changedId }, 'accepted');
    });
    await act(async () => {
      const added = h.review.derived.revisedIds.value;
      for (const id of added) await h.review.decide({ level: 'change', id }, 'accepted');
    });
    expect(h.review.derived.counts.value.revised).toBe(0);
    fireEvent.click(trigger());
    const box = screen.getByRole('checkbox', { name: 'Revised only (0)' });
    fireEvent.click(box);
    expect(h.review.filters.value.onlyRevised).toBe(false);
  });
});
