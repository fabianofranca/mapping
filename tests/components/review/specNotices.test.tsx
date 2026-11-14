import { act, cleanup, fireEvent, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addTypedAnnotation,
  setFieldValue,
  specFiles,
  type Project,
} from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { propose } from '../../model/proposalFixtures';
import { layerOf } from '../../model/specFixtures';
import { noticeProject } from '../noticeFixtures';
import { openReviewHarness, renderInEditor } from './reviewHarness';
import { ReviewPanel } from '../../../src/ui/review/ReviewPanel';

// Specialization notices in proposal review (stage #486, AV3, decision 10): the change
// that creates an annotation of a type with a notice, swaps the type or writes a value in a
// field with a notice shows the notice in its popover, without removing Accept or Apply.

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(cleanup);

async function openPanel(base: Project, after: Project) {
  const proposal = propose(base, after, { id: 'P1' });
  // The `specs/` copies go along: without them the folder opens without the specialization.
  const files = Object.fromEntries(specFiles(base));
  const h = await openReviewHarness({ project: base, proposals: [proposal], files });
  expect(h.review.open('P1').ok).toBe(true);
  act(() => h.review.select({ level: 'item', id: 'M1' }));
  renderInEditor(h, <ReviewPanel onGoToAnnotation={() => {}} />);
  return h;
}

function openMark(name: RegExp) {
  fireEvent.click(screen.getByRole('button', { name }));
  return screen.getByRole('dialog');
}

describe('notice in the change popover', () => {
  it('writing a value in a field with a notice shows the notice and keeps Accept enabled', async () => {
    const base = noticeProject();
    await openPanel(base, setFieldValue(base, 'AA', 'legacyStyle', 'new'));
    const pop = openMark(/^legacyStyle · Alert: changed/);
    expect(
      within(pop).getByRole('note', { name: 'Notice Deprecated: Use variant.' }),
    ).toBeTruthy();
    const accept = within(pop).getByRole('button', { name: /^Accept/ });
    expect((accept as HTMLButtonElement).disabled).toBe(false);
  });

  it('creating an annotation of a type with a notice shows the notice', async () => {
    const base = noticeProject();
    const after = addTypedAnnotation(base, {
      id: 'AN',
      markingId: 'M1',
      layerId: layerOf(base, 'avisos', 'componentes'),
      type: { specId: 'avisos', typeId: 'gone' },
      parentAnnotationId: null,
    });
    await openPanel(base, after);
    const pop = openMark(/^Annotation Gone created/);
    // pt-BR kept: shared fixture data (notice messages of noticeFixtures) asserted by tests/components and tests/model
    expect(
      within(pop).getByRole('note', { name: 'Notice Removed: Saiu do contrato.' }),
    ).toBeTruthy();
  });

  it('swapping the type to one with a notice shows the notice', async () => {
    const base = noticeProject();
    const after: Project = {
      ...base,
      annotations: base.annotations.map((a) =>
        a.id === 'AP' ? { ...a, type: { specId: 'avisos', typeId: 'gone' } } : a,
      ),
    };
    await openPanel(base, after);
    const pop = openMark(/^Type · Gone: changed/);
    expect(
      within(pop).getByRole('note', { name: 'Notice Removed: Saiu do contrato.' }),
    ).toBeTruthy();
  });

  it('without a notice on the type or field, the popover carries no notice', async () => {
    const base = noticeProject();
    await openPanel(base, setFieldValue(base, 'AP', 'name', 'new'));
    const pop = openMark(/^name · Plain: changed/);
    expect(within(pop).queryByRole('note')).toBeNull();
  });
});
