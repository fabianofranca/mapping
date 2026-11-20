import { cleanup, screen, waitFor } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { locale } from '../../../src/store/settings';
import { NoteField } from '../../../src/ui/review/NoteField';
import { firstImport, openReviewHarness, renderInEditor } from './reviewHarness';

// Defect R4.6 (stage #2160): after typing a note in a field that was opened with focus (the
// suggested note of a rejection), the first `Tab` must leave the field. Saving the note turns
// the empty field into the saved one; that swap must not take the focus back.

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe('note field opened with focus', () => {
  it('the first Tab after typing leaves the field and saves the note once', async () => {
    const { base, proposal } = firstImport();
    const h = await openReviewHarness({ project: base, proposals: [proposal] });
    expect(h.review.open('P1')).toMatchObject({ ok: true });
    const target = { level: 'item', id: 'M1' } as const;
    renderInEditor(
      h,
      <div>
        <NoteField target={target} show focusSeq={1} onHide={() => {}} />
        <button type="button">Next</button>
      </div>,
    );
    const box = await screen.findByRole('textbox', { name: 'Note for the agent' });
    await waitFor(() => expect(document.activeElement).toBe(box));
    const addNote = vi.spyOn(h.review, 'addNote');
    const user = userEvent.setup();
    await user.keyboard('Because it is wrong');
    await user.tab();
    await waitFor(() =>
      expect(h.review.derived.notes.value.get('item:M1')?.[0]?.text).toBe(
        'Because it is wrong',
      ),
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(addNote).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Next' }));
  });
});
