// Details › Decorative (stage #2826 DM4): the checkbox under Floating, the mutual exclusion with
// it, the lock error and the review mark.
import { act, cleanup, fireEvent, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setMarkingDecorative, type Project } from '../../src/model';
import { locale } from '../../src/store/settings';
import { MarkingPanel } from '../../src/ui/MarkingPanel';
import { ReviewPanel } from '../../src/ui/review/ReviewPanel';
import { sampleProject } from '../model/fixtures';
import { propose } from '../model/proposalFixtures';
import { createHarness, renderLive, type Harness } from './harness';
import { openReviewHarness, renderInEditor } from './review/reviewHarness';

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

function renderPanel(harness: Harness, markingId: string) {
  renderLive(harness, (p) => {
    const marking = p.markings.find((m) => m.id === markingId);
    const image =
      p.containers.find((i) => i.id === marking?.containerId) ?? p.containers[0];
    if (!marking || !image) return null;
    return (
      <MarkingPanel
        project={p}
        marking={marking}
        image={image}
        readOnly={false}
        onDelete={() => undefined}
        onGoToAnnotation={() => undefined}
      />
    );
  });
}

const box = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement;

describe('Details: Decorative', () => {
  it('shows the checkbox unchecked, toggles it and shows it checked for a decorative marking', () => {
    const h = createHarness(sampleProject());
    renderPanel(h, 'M4');
    expect(box('Decorative').checked).toBe(false);
    fireEvent.click(box('Decorative'));
    expect(h.project().markings.find((m) => m.id === 'M4')?.decorative).toBe(true);
    expect(box('Decorative').checked).toBe(true);
  });

  it('the two checkboxes disable each other and say why', () => {
    const h = createHarness(sampleProject());
    renderPanel(h, 'M4');
    fireEvent.click(box('Decorative'));
    expect(box('Floating').disabled).toBe(true);
    expect(box('Decorative').disabled).toBe(false);
    cleanup();
    const f = createHarness(sampleProject());
    f.actions.setMarkingFloating('M4', true);
    renderPanel(f, 'M4');
    expect(box('Decorative').disabled).toBe(true);
    expect(box('Floating').disabled).toBe(false);
  });

  it('toggling a locked marking reports the lock error', () => {
    const h = createHarness(sampleProject());
    h.actions.setMarkingLocked('M4', true);
    renderPanel(h, 'M4');
    fireEvent.click(box('Decorative'));
    expect(h.project().markings.find((m) => m.id === 'M4')?.decorative).toBe(false);
    expect(
      screen.getByText('The marking is locked. Unlock it to change it.'),
    ).toBeTruthy();
  });

  it('the review mark shows a proposal’s decorative change', async () => {
    const base: Project = sampleProject();
    const proposal = propose(base, setMarkingDecorative(base, 'M4', true));
    const h = await openReviewHarness({ proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    act(() => h.review.select({ level: 'item', id: 'M4' }));
    renderInEditor(h, <ReviewPanel onGoToAnnotation={() => {}} />);
    expect(
      screen.getAllByRole('button', { name: /^Decorative: changed, / }).length,
    ).toBeTruthy();
  });
});
