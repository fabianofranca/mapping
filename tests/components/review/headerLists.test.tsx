import { act, cleanup, screen } from '@testing-library/preact';
import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addContainer, createMarking } from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { EditorContext } from '../../../src/ui/EditorContext';
import { ReviewHeader } from '../../../src/ui/review/ReviewHeader';
import { richScenario } from '../../store/proposalHarness';
import { sampleProject } from '../../model/fixtures';
import { changeOf, propose } from '../../model/proposalFixtures';
import { openReviewHarness, renderInEditor } from './reviewHarness';

// Stage #954, phase 4 (items 54 and 56): the `key` of the notices is unique and the lists of
// markings that go along say "and N more" when cut off.

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ReviewHeader › list of what goes along with the removed image (item 56)', () => {
  it('says "and N more" when the markings exceed the cut', async () => {
    const base = sampleProject();
    let withImage = addContainer(base, {
      id: 'I9',
      file: 'images/x.png',
      width: 1000,
      height: 1000,
    });
    for (let i = 0; i < 20; i++) {
      withImage = createMarking(withImage, {
        id: `Z${i}`,
        containerId: 'I9',
        rect: { x: i * 40, y: 0, width: 30, height: 30 },
      });
    }
    // The proposal removes image I9 and the 20 markings.
    const proposal = propose(withImage, base);
    const h = await openReviewHarness({ project: withImage, proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    const target = { level: 'image', id: 'I9' } as const;
    act(() => h.review.select(target));
    renderInEditor(
      h,
      <ReviewHeader target={target} whole={changeOf(proposal, 'image', 'I9')} />,
    );
    const items = document.querySelectorAll('.review-removal-list li');
    // 12 visible markings + the "and 8 more" line.
    expect(items).toHaveLength(13);
    expect(screen.getByText('and 8 more')).toBeTruthy();
  });
});

describe('ReviewHeader › key of the notices (item 54)', () => {
  it('notices that only differ in otherId keep their own element when the first one disappears', async () => {
    const { base, proposal, ids } = richScenario();
    const h = await openReviewHarness({ project: base, proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    const real = h.review.derived.validation.value;
    if (!real) throw new Error('no validation');
    const issue = (otherId: string) => ({
      code: 'missing-specialization' as const,
      id: 'M1',
      otherId,
      changeIds: [ids.name],
      related: [],
    });
    const spy = vi
      .spyOn(h.review.derived.validation, 'value', 'get')
      .mockReturnValue({ ...real, ok: false, issues: [issue('X1'), issue('X2')] });
    act(() => h.review.select({ level: 'proposal', id: null }));
    const header = () => <ReviewHeader target={{ level: 'proposal', id: null }} />;
    const view = renderInEditor(h, header());
    const before = document.querySelectorAll('.notice-box-error');
    expect(before).toHaveLength(2);
    const second = before[1];
    spy.mockReturnValue({ ...real, ok: false, issues: [issue('X2')] });
    act(() => {
      view.rerender(
        <EditorContext.Provider value={h.context}>{header()}</EditorContext.Provider>,
      );
    });
    const after = document.querySelectorAll('.notice-box-error');
    expect(after).toHaveLength(1);
    expect(after[0]).toBe(second);
  });
});
