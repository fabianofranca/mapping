import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addAnnotation,
  addLayer,
  applySpecialization,
  removeAnnotation,
  removeEntry,
  removeLayer,
  removeMarking,
  renameLayer,
  renameMarking,
  setMarkingLocked,
  updateEntry,
  type Project,
  type Proposal,
} from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { ReviewDetails } from '../../../src/ui/review/ReviewDetails';
import { MarkingPanel } from '../../../src/ui/MarkingPanel';
import { ReviewPanel } from '../../../src/ui/review/ReviewPanel';
import { sampleProject } from '../../model/fixtures';
import { propose } from '../../model/proposalFixtures';
import { idGen, loadExample } from '../../model/specFixtures';
import { richScenario } from '../../store/proposalHarness';
import {
  firstImport,
  openReviewHarness,
  renderInEditor,
  type ReviewHarness,
} from './reviewHarness';

// Details in the review (phases 9.5 and 9.6, HANDOFF-REVIEW-DETAILS): image and item show
// the normal panel, read-only, over the project on view, with a marker on each changed field
// and the popover with the values and the field's decision; the item header decides the item.
// The decisions, creation, removal, notes, "Other changes" and navigation have their own
// files in this folder; here live the panel, the values and the marker keyboard.
// pt-BR kept: shared fixture data asserted by tests/model and tests/store (names from sampleProject, richScenario and firstImport: Porta, Fechadura, Lataria, Vidros, Amassado, gravidade, Formulário, Importação, Eventos)

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Opens the proposal, selects the level and mounts the review Details. */
async function showLevel(
  options: Parameters<typeof openReviewHarness>[0],
  target: Parameters<ReviewHarness['review']['select']>[0],
) {
  const h = await openReviewHarness(options);
  expect(h.review.open('P1').ok).toBe(true);
  act(() => h.review.select(target));
  renderInEditor(h, <ReviewPanel onGoToAnnotation={() => {}} />);
  return h;
}

/** The (disabled) text field with the label. */
const field = (name: string) => screen.getByRole('textbox', { name }) as HTMLInputElement;

describe('Details in the review: the normal panel with the markers', () => {
  it('change: the field shows the proposed value, the marker says current and proposed, and the popover opens', async () => {
    const { proposal } = richScenario();
    const h = await showLevel({ proposals: [proposal] }, { level: 'item', id: 'M1' });
    // The normal panel, read-only, with the value of the Proposed view.
    expect(field('Name').value).toBe('Porta dianteira');
    expect(field('Name').disabled).toBe(true);
    const mark = screen.getByRole('button', {
      name: 'Name: changed, pending. Current: Porta. Proposed: Porta dianteira',
    });
    expect(mark.getAttribute('aria-expanded')).toBe('false');
    // Only the changed field has a marker; the popover content only exists when open.
    expect(screen.queryAllByRole('button', { name: /: changed, / })).toHaveLength(1);
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(mark);
    const pop = screen.getByRole('dialog', { name: 'Name · changed' });
    expect(mark.getAttribute('aria-expanded')).toBe('true');
    expect(mark.getAttribute('aria-controls')).toBe(pop.id);
    // In the Proposed view, the other side (Current) first.
    expect([...pop.querySelectorAll('dt')].map((dt) => dt.textContent)).toEqual([
      'Current',
      'Proposed',
    ]);
    expect(within(pop).getByText('Porta')).toBeTruthy();
    expect(within(pop).getByText('Decision: Undecided')).toBeTruthy();

    // Current view: the panel follows and the popover puts the proposed value first.
    act(() => h.review.setView('current'));
    expect(field('Name').value).toBe('Porta');
    expect(
      [...screen.getByRole('dialog').querySelectorAll('dt')].map((dt) => dt.textContent),
    ).toEqual(['Proposed', 'Current']);
  });

  it('every HelpTip of the review Details has a name with the subject (Position / Size included)', async () => {
    const { proposal } = richScenario();
    await showLevel({ proposals: [proposal] }, { level: 'item', id: 'M4' });
    const tips = screen
      .getAllByRole('button')
      .filter((b) => (b.getAttribute('aria-label') ?? '').startsWith('About'));
    expect(tips.length).toBeGreaterThan(0);
    for (const tip of tips) {
      expect((tip.getAttribute('aria-label') ?? '').replace('About', '').trim()).not.toBe(
        '',
      );
    }
    expect(screen.getByRole('button', { name: 'About Position / Size' })).toBeTruthy();
  });

  it('the item header decides the item and the marker shows the decision', async () => {
    const { proposal } = richScenario();
    const h = await showLevel({ proposals: [proposal] }, { level: 'item', id: 'M4' });
    // Position and size: a single marker, with the help and only the number that changes in bold.
    const mark = screen.getByRole('button', { name: /^Position: moved, pending\./ });
    fireEvent.click(mark);
    const pop = screen.getByRole('dialog', { name: 'Position · moved' });
    expect([...pop.querySelectorAll('b')].map((b) => b.textContent)).toEqual([
      'x 0',
      'y 0',
      'x 10',
      'y 10',
    ]);
    expect(within(pop).getByText('Position and size are decided together.')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: /^Accept marking: Unnamed marking$/ }),
    );
    await waitFor(() =>
      expect(h.review.derived.levels.value.get('item:M4')?.state).toBe('accepted'),
    );
    expect(
      screen.getByRole('button', { name: /^Position: moved, accepted\./ }),
    ).toBeTruthy();
  });

  it('all new: in the Proposed view, the fields with the "new" marker; in the Current one, the notice', async () => {
    const { base, proposal } = firstImport();
    const h = await showLevel(
      { project: base, proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    expect(field('Name').value).toBe('Formulário');
    expect(screen.getByText('Created by the proposal')).toBeTruthy();
    // Part of the creation: the type only, with no decision of its own; the popover says where to decide.
    const name = screen.getByRole('button', {
      name: 'Name: new, part of creating Formulário. Proposed: Formulário',
    });
    expect(name.querySelector('.decision-mark')).toBeNull();
    expect(
      screen.getByRole('button', { name: /^Position: new, part of creating/ }),
    ).toBeTruthy();
    fireEvent.click(name);
    const pop = screen.getByRole('dialog');
    expect(within(pop).getByText("(doesn't exist)")).toBeTruthy();
    expect(
      within(pop).getByText('Part of creating the marking: decide in the header above.'),
    ).toBeTruthy();
    // The created annotation, in the created layer, with the creation marker in the header.
    expect(
      screen.getByRole('button', { name: /^Annotation onClick created: new, pending\./ }),
    ).toBeTruthy();

    // In the Current view the item does not exist yet: the panel shows how it would look, with the notice.
    act(() => h.review.setView('current'));
    expect(
      screen.getByText('Not in the current project yet. Showing how it would look.'),
    ).toBeTruthy();
    expect(field('Name').value).toBe('Formulário');
    fireEvent.click(screen.getByRole('button', { name: 'See in Proposed' }));
    expect(h.review.view.value).toBe('proposed');
  });

  it('creation rejected: the panel still shows what the proposal would create', async () => {
    const { base, proposal } = firstImport();
    const h = await showLevel(
      { project: base, proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    await act(async () => {
      await h.review.decide({ level: 'item', id: 'M1' }, 'rejected');
    });
    expect(
      screen.getByText(
        'The creation was rejected: showing what the proposal would create.',
      ),
    ).toBeTruthy();
    expect(field('Name').value).toBe('Formulário');
  });

  it('removal: in the Proposed view, the current project with "Will be removed"; in the Current one, no notice', async () => {
    const base = sampleProject();
    const proposal = propose(base, removeMarking(base, 'M3'));
    const h = await showLevel(
      { project: base, proposals: [proposal] },
      { level: 'item', id: 'M3' },
    );
    expect(
      screen.getByText(
        "This item doesn't exist in the Proposed view. Showing the current project.",
      ),
    ).toBeTruthy();
    expect(screen.getAllByText('Will be removed').length).toBeGreaterThan(0);
    expect(document.querySelector('del.identity-name')?.textContent).toBe('Fechadura');
    expect(field('Name').value).toBe('Fechadura');
    expect(
      screen.getByRole('button', {
        name: 'Name: removed with Fechadura. Current: Fechadura',
      }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'See in the Current view' }));
    expect(h.review.view.value).toBe('current');
    expect(
      screen.queryByText(
        "This item doesn't exist in the Proposed view. Showing the current project.",
      ),
    ).toBeNull();
  });

  it('ghosts: removed pair and annotation show struck through in place, in the Proposed view', async () => {
    const base = sampleProject();
    let after = removeEntry(base, 'A1', 'E2');
    after = updateEntry(after, 'A1', 'E1', { key: 'tipo', value: 'scratch' });
    after = removeAnnotation(after, 'A2');
    const h = await showLevel(
      { project: base, proposals: [propose(base, after)] },
      { level: 'item', id: 'M1' },
    );
    // The pair that goes away: struck through, with the marker in the actions column.
    const pairs = screen.getByRole('table', { name: 'Annotation pairs' });
    const rows = within(pairs).getAllByRole('row');
    expect(rows.map((r) => r.classList.contains('is-removed'))).toEqual([
      false,
      false,
      true,
    ]);
    expect(rows[2]?.querySelector('del')?.textContent).toBe('gravidade');
    expect(
      within(rows[2] as HTMLElement).getByRole('button', {
        name: /^gravidade · Amassado: removed, pending\. Current: gravidade: média\. Proposed: \(doesn't exist\)$/,
      }),
    ).toBeTruthy();
    // The changed pair shows the proposed value, with the marker in place of the ⋯ menu.
    expect(
      within(rows[1] as HTMLElement).getByRole('button', {
        name: /^tipo · Amassado: changed/,
      }),
    ).toBeTruthy();
    expect(within(pairs).queryByRole('button', { name: /Actions/ })).toBeNull();
    // The annotation that goes away: struck-through header, "Will be removed" and "See in the Current view".
    const ghost = document.querySelector('[data-annotation="A2"]') as HTMLElement;
    expect(ghost.classList.contains('annotation-removed')).toBe(true);
    expect(within(ghost).getByText('Will be removed')).toBeTruthy();

    // In the Current view, the pair and the annotation exist: no ghost, with the "removed" marker.
    act(() => h.review.setView('current'));
    expect(document.querySelector('.is-removed')).toBeNull();
    expect(document.querySelector('.annotation-removed')).toBeNull();
    expect(
      screen.getByRole('button', { name: /^Annotation .* removed: removed, pending\./ }),
    ).toBeTruthy();
  });

  it('conflict: the amber marker and the popover with Current, Before and After', async () => {
    const { proposal, ids } = richScenario();
    const edited = renameMarking(sampleProject(), 'M1', 'Rear door');
    await showLevel(
      { project: edited, proposals: [proposal] },
      { level: 'change', id: ids.name },
    );
    const mark = screen.getByRole('button', {
      name: /^Name: changed, pending, in conflict\./,
    });
    expect(mark.classList.contains('is-conflict')).toBe(true);
    fireEvent.click(mark);
    const pop = screen.getByRole('dialog');
    expect([...pop.querySelectorAll('dt')].map((dt) => dt.textContent)).toEqual([
      'Current',
      'Before',
      'After',
    ]);
    expect(within(pop).getByText('Conflict')).toBeTruthy();
    expect(
      within(pop).getByText(/Accepting replaces Rear door with Porta dianteira/),
    ).toBeTruthy();
    // The field decision is in the popover, and the buttons state the effect.
    const describedBy = (el: HTMLElement) =>
      document.getElementById(el.getAttribute('aria-describedby') ?? '')?.textContent;
    const overwrite = within(pop).getByRole('button', { name: 'Overwrite: Name' });
    expect(describedBy(overwrite)).toBe(
      'Accept: overwrites Rear door with Porta dianteira',
    );
    const keep = within(pop).getByRole('button', { name: 'Keep current: Name' });
    expect(describedBy(keep)).toBe('Reject: keeps Rear door');
  });

  it('keyboard: Tab reaches the marker and opens it; Esc closes and returns focus to the marker', async () => {
    const base = sampleProject();
    const long = 'Doors '.repeat(60).trim();
    const user = userEvent.setup();
    await showLevel(
      { project: base, proposals: [propose(base, renameMarking(base, 'M1', long))] },
      { level: 'item', id: 'M1' },
    );
    const mark = screen.getByRole('button', { name: /^Name: changed, pending\./ });
    for (let i = 0; i < 60 && document.activeElement !== mark; i++) await user.tab();
    expect(document.activeElement).toBe(mark);
    // Focus opens it at once; the long value comes through "Show all", inside the popover.
    const pop = screen.getByRole('dialog', { name: 'Name · changed' });
    await user.tab();
    const showAll = within(pop).getByRole('button', { name: 'Show all' });
    expect(document.activeElement).toBe(showAll);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(mark);
    // Enter pins it open; Tab goes through Show all, Accept, Reject and Note, and after the
    // last one the popover closes and focus moves on to the next control.
    await user.keyboard('{Enter}');
    expect(screen.getByRole('dialog')).toBeTruthy();
    for (const name of ['Show all', /^Accept: /, /^Reject: /, 'Add note']) {
      await user.tab();
      expect(document.activeElement).toBe(
        within(screen.getByRole('dialog')).getByRole('button', { name }),
      );
    }
    await user.tab();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
  });

  it('hover: opens after the intent delay and closes on leaving; one open at a time', async () => {
    const { proposal } = richScenario();
    await showLevel({ proposals: [proposal] }, { level: 'item', id: 'M4' });
    vi.useFakeTimers();
    const mark = screen.getByRole('button', { name: /^Position: moved/ });
    const host = mark.closest('.change-mark-host') as HTMLElement;
    fireEvent.mouseEnter(host);
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.mouseLeave(host);
    act(() => {
      vi.advanceTimersByTime(160);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('sections with changes open; collapsed, the section says how many changes it has', async () => {
    const { proposal } = richScenario();
    const h = await openReviewHarness({ proposals: [proposal] });
    h.ui.collapsed.value = new Set(['marking', 'annotations']);
    expect(h.review.open('P1').ok).toBe(true);
    act(() => h.review.select({ level: 'item', id: 'M1' }));
    renderInEditor(h, <ReviewPanel onGoToAnnotation={() => {}} />);
    // The Marking section (with the change) opened; the Annotations (without changes) stayed.
    expect(h.ui.collapsed.value.has('marking')).toBe(false);
    expect(h.ui.collapsed.value.has('annotations')).toBe(true);
    act(() => {
      h.ui.collapsed.value = new Set(['marking']);
    });
    const head = screen.getByRole('button', { name: /^Marking/ });
    expect(within(head).getByText('1 change(s)')).toBeTruthy();
  });

  it('hidden layer: the notice counts the changes and "Show here" shows the layer only in the panel', async () => {
    const base = sampleProject();
    const after = updateEntry(base, 'A2', 'E3', { key: 'tipo', value: 'break' });
    const h = await openReviewHarness({
      project: base,
      proposals: [propose(base, after)],
    });
    h.ui.hiddenLayers.value = new Set(['L2']);
    expect(h.review.open('P1').ok).toBe(true);
    act(() => h.review.select({ level: 'item', id: 'M1' }));
    renderInEditor(h, <ReviewPanel onGoToAnnotation={() => {}} />);
    expect(screen.getByText('1 change(s) in a hidden layer: Vidros')).toBeTruthy();
    expect(document.querySelector('[data-layer="L2"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show here' }));
    const group = document.querySelector('[data-layer="L2"]') as HTMLElement;
    expect(within(group).getByText('hidden')).toBeTruthy();
    // Only in the panel: the layer stays hidden in the editor.
    expect(h.ui.hiddenLayers.value.has('L2')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Hide again' }));
    expect(document.querySelector('[data-layer="L2"]')).toBeNull();
  });

  it('hidden layer with no exception: hiding L1 (the first) also counts in the notice', async () => {
    const base = sampleProject();
    const after = updateEntry(base, 'A1', 'E1', { key: 'tipo', value: 'break' });
    const h = await openReviewHarness({
      project: base,
      proposals: [propose(base, after)],
    });
    h.ui.hiddenLayers.value = new Set(['L1', 'L2']);
    expect(h.review.open('P1').ok).toBe(true);
    act(() => h.review.select({ level: 'item', id: 'M1' }));
    renderInEditor(h, <ReviewPanel onGoToAnnotation={() => {}} />);
    expect(screen.getByText(/in a hidden layer: Lataria/)).toBeTruthy();
    expect(document.querySelector('[data-layer="L1"]')).toBeNull();
  });

  it('large item: a layer with more than 8 annotations starts collapsed, with the counts', async () => {
    const base = sampleProject();
    let after = base;
    for (let i = 1; i <= 9; i++) {
      after = addAnnotation(after, {
        id: `N${i}`,
        markingId: 'M4',
        layerId: 'L1',
        name: `n${i}`,
      });
    }
    const h = await showLevel(
      { project: base, proposals: [propose(base, after)] },
      { level: 'item', id: 'M4' },
    );
    expect(h.ui.collapsed.value.has('layer:L1')).toBe(true);
    expect(h.ui.collapsed.value.has('annotation:N1')).toBe(true);
    const group = document.querySelector('[data-layer="L1"]') as HTMLElement;
    expect(within(group).getByText('9 change(s)')).toBeTruthy();
  });

  it('what has no field in the panel is still decidable in "Other changes", through the marker', async () => {
    const base = sampleProject();
    const proposal = propose(base, setMarkingLocked(base, 'M4', true));
    const h = await showLevel(
      { project: base, proposals: [proposal] },
      { level: 'item', id: 'M4' },
    );
    const others = screen.getByRole('region', { name: 'Other changes' });
    fireEvent.click(
      within(others).getByRole('button', { name: /^Lock: changed, pending\./ }),
    );
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: /^Accept: Lock$/,
      }),
    );
    await waitFor(() =>
      expect(h.review.derived.levels.value.get('item:M4')?.state).toBe('accepted'),
    );
  });

  it('locked item: notice above the panel; accepting is still allowed', async () => {
    const base = setMarkingLocked(sampleProject(), 'M4', true);
    const { proposal } = richScenario();
    await showLevel(
      { project: base, proposals: [proposal] },
      { level: 'item', id: 'M4' },
    );
    expect(screen.getByText('Locked item')).toBeTruthy();
    const accept = screen.getByRole('button', {
      name: /^Accept marking: Unnamed marking$/,
    });
    expect((accept as HTMLButtonElement).disabled).toBe(false);
  });

  it('item note: the header button opens the field, which saves when leaving it', async () => {
    const { proposal } = richScenario();
    const h = await showLevel({ proposals: [proposal] }, { level: 'item', id: 'M1' });
    expect(screen.queryByRole('textbox', { name: 'Note for the agent' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
    const box = screen.getByRole('textbox', { name: 'Note for the agent' });
    expect(document.activeElement).toBe(box);
    fireEvent.input(box, { target: { value: 'The old name was right.' } });
    fireEvent.blur(box);
    await waitFor(() =>
      expect(h.review.derived.notes.value.get('item:M1')?.[0]?.text).toBe(
        'The old name was right.',
      ),
    );
    // Empty text deletes the note.
    const saved = await screen.findByRole('textbox', { name: 'Note for the agent' });
    fireEvent.input(saved, { target: { value: '  ' } });
    fireEvent.blur(saved);
    await waitFor(() => expect(h.review.derived.notes.value.has('item:M1')).toBe(false));
  });

  // Phase 8.2 (P8, O9 of round 4): "suggested on a rejection" only with a rejection in the
  // level; "partial" from accepted and pending is not a rejection.
  it('the note is only "suggested on a rejection" when the level has a rejected change', async () => {
    const { proposal, ids } = richScenario();
    const h = await openReviewHarness({ proposals: [proposal] });
    h.review.open('P1');
    // Image I3 becomes partial: the marking (and, with it, the image) accepted, the annotation pending.
    await h.review.decide({ level: 'change', id: ids.marking }, 'accepted');
    act(() => h.review.select({ level: 'image', id: 'I3' }));
    renderInEditor(h, <ReviewPanel onGoToAnnotation={() => {}} />);
    expect(h.review.derived.levels.value.get('image:I3')?.state).toBe('partial');
    // The panel of the new image, with the file marked as part of the creation.
    expect(
      screen.getByRole('button', { name: /^Image file: new, part of creating/ }),
    ).toBeTruthy();
    expect(screen.queryByText(/suggested on a rejection/)).toBeNull();
    // A rejection in the level: the note becomes suggested.
    await act(async () => {
      await h.review.decide({ level: 'change', id: ids.annotation }, 'rejected');
    });
    expect(
      screen.getByText('suggested on a rejection: the agent reads it next round'),
    ).toBeTruthy();
  });

  it('outside the review the panel is the usual one: no markers, with the pairs menu', async () => {
    const { proposal } = richScenario();
    const h = await openReviewHarness({ proposals: [proposal] });
    const project = h.session.store.committed.value as Project;
    const marking = project.markings.find((m) => m.id === 'M1');
    const image = project.containers.find((i) => i.id === 'I1');
    if (!marking || !image) throw new Error('fixture');
    renderInEditor(
      h,
      <MarkingPanel
        project={project}
        marking={marking}
        image={image}
        readOnly={false}
        onDelete={() => {}}
        onGoToAnnotation={() => {}}
      />,
    );
    // The label cell also exists with the help icon: only the review marker does not.
    expect(document.querySelector('.change-mark, .change-mark-host')).toBeNull();
    expect(field('Name').disabled).toBe(false);
    expect(screen.getAllByRole('button', { name: /^Actions for pair/ }).length).toBe(3);
  });

  it('the proposal has identity, Accept all, "Other changes" of the Project group and the images with Open', async () => {
    const { base, proposal } = firstImport();
    const h = await showLevel(
      { project: base, proposals: [proposal] },
      { level: 'proposal', id: null },
    );
    expect(screen.getByText('Importação', { selector: 'strong' })).toBeTruthy();
    expect(screen.getByText('Proposal')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Accept all: Importação' }).textContent,
    ).toBe('Accept all');
    // The Project group: the layer creation, with marker and popover.
    const others = screen.getByRole('region', { name: 'Other changes' });
    expect(within(others).getAllByRole('listitem')).toHaveLength(1);
    expect(
      within(others).getByRole('button', {
        name: /^Layer Eventos created: new, pending/,
      }),
    ).toBeTruthy();
    // The images: one row per image with changes and Open.
    const images = screen.getByRole('region', { name: 'Images' });
    fireEvent.click(within(images).getByRole('button', { name: /^Open / }));
    expect(h.review.selected.value).toEqual({ level: 'image', id: 'I1' });
  });

  it('the Project group is the same panel, only with "Other changes"', async () => {
    const { base, proposal } = firstImport();
    await showLevel(
      { project: base, proposals: [proposal] },
      { level: 'project', id: null },
    );
    expect(screen.getByText('Project group')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Other changes' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Images' })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Accept the Project group: Project' })
        .textContent,
    ).toBe('Accept the Project group');
  });
});

// Return from the 8.2 gate: "Apply blocked" names the layer, specialization and annotation
// (before, only marking and image; the rest came out with the raw id), and says when the
// target of the change no longer exists.
describe('Apply blocked: the name of the target, never the id', () => {
  /** Opens the proposal, accepts everything and shows the proposal level (all the problems). */
  async function blocked(project: Project, proposal: Proposal) {
    const h = await openReviewHarness({ project, proposals: [proposal] });
    expect(h.review.open(proposal.id).ok).toBe(true);
    await h.review.decide({ level: 'proposal', id: null }, 'accepted');
    expect(h.review.derived.validation.value?.ok).toBe(false);
    act(() => h.review.select({ level: 'proposal', id: null }));
    renderInEditor(h, <ReviewDetails />);
    return h;
  }

  it('layer: creating a layer that already exists cites its name', async () => {
    const { base, proposal } = firstImport();
    await blocked(
      addLayer(base, { id: 'L2', name: 'Eventos', color: '#1E88E5' }),
      proposal,
    );
    expect(
      screen.getByText('The change to Eventos no longer fits the current project.'),
    ).toBeTruthy();
    expect(screen.queryByText(/The change to L2 /)).toBeNull();
  });

  it('specialization: applying a specialization that is already in the project cites its name', async () => {
    const base = sampleProject();
    const sdui = loadExample('sdui');
    const proposal = propose(
      base,
      applySpecialization(base, sdui, { newId: idGen('LS') }),
    );
    await blocked(applySpecialization(base, sdui, { newId: idGen('LX') }), proposal);
    expect(
      screen.getByText('The change to SDUI no longer fits the current project.'),
    ).toBeTruthy();
    expect(screen.queryByText(/The change to sdui /)).toBeNull();
  });

  it('annotation: creating an annotation that already exists cites its title', async () => {
    const base = sampleProject();
    const proposal = propose(
      base,
      addAnnotation(base, { id: 'A9', markingId: 'M1', layerId: 'L1', name: 'onClick' }),
    );
    await blocked(
      addAnnotation(base, { id: 'A9', markingId: 'M1', layerId: 'L1', name: 'onClick' }),
      proposal,
    );
    expect(
      screen.getByText('The change to onClick no longer fits the current project.'),
    ).toBeTruthy();
    expect(screen.queryByText(/The change to A9 /)).toBeNull();
  });

  it('target that no longer exists: says the target (layer) left the project, without the id', async () => {
    const base = sampleProject();
    const proposal = propose(base, renameLayer(base, 'L2', 'Windows'));
    await blocked(removeLayer(base, 'L2'), proposal);
    expect(
      screen.getByText(
        'The target of this change (layer) no longer exists in the current project.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/L2/)).toBeNull();
  });
});
