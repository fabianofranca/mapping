// Named slots in the app (#1080, SL6, decision 14): Add inside puts the child in the slot that takes the
// type, the default-content fields say when they stopped counting, and the Details read the drawing's issues.
import { cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';
import { markingComponent, typeOfAnnotation, type Project } from '../../src/model';
import { locale } from '../../src/store/settings';
import { EditorContext } from '../../src/ui/EditorContext';
import { LibraryPalette } from '../../src/ui/LibraryPalette';
import { TypedField } from '../../src/ui/TypedFields';
import { annotationOf, renderLive } from './harness';
import { slotsHarness, type SlotsHarness } from './slotsHarness';

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

const SPEC = 'slots';
const BAR_RECT = { x: 100, y: 100, width: 360, height: 56 };

/** A bar on the screen, selected. Returns its marking id. */
function placeBar(harness: SlotsHarness): string {
  const bar = harness.actions.addComponent({
    containerId: 'I1',
    parentId: null,
    specId: SPEC,
    typeId: 'bar',
  });
  if (!bar.ok) throw new Error(`bar: ${bar.error}`);
  const moved = harness.actions.setMarkingRect(bar.value.markingId, BAR_RECT);
  if (!moved.ok) throw new Error(`rect: ${moved.error}`);
  harness.ui.selection.value = { kind: 'marking', id: bar.value.markingId };
  return bar.value.markingId;
}

const slotOf = (harness: SlotsHarness, barId: string, childId: string) =>
  harness.context.derived.drawingsOf(harness.project()).get(barId)?.slotOf.get(childId);

function renderPalette(harness: SlotsHarness) {
  render(
    <EditorContext.Provider value={harness.context}>
      <LibraryPalette onOpenSpecs={() => undefined} />
    </EditorContext.Provider>,
  );
  return userEvent.setup();
}

const addButton = (name: string) =>
  screen.getByRole<HTMLButtonElement>('button', {
    name: new RegExp(`^${t('library.add')}.*: ${name}$`),
  });

describe('Add inside a component with named slots', () => {
  it('a pin goes to the first slot that takes it; the next one to the next free slot, after the last child', async () => {
    const harness = await slotsHarness();
    const barId = placeBar(harness);
    const user = renderPalette(harness);

    await user.click(addButton('Pin'));
    const first = harness.ui.selection.value;
    expect(first?.kind).toBe('marking');
    const firstId = (first as { id: string }).id;
    expect(slotOf(harness, barId, firstId)).toBe('navigationIcon');

    // `navigationIcon` takes one: the second goes to `actions`, without a `slot-full` on either.
    harness.ui.selection.value = { kind: 'marking', id: barId };
    await user.click(addButton('Pin'));
    const secondId = (harness.ui.selection.value as { id: string }).id;
    expect(slotOf(harness, barId, secondId)).toBe('actions');

    harness.ui.selection.value = { kind: 'marking', id: barId };
    await user.click(addButton('Pin'));
    const thirdId = (harness.ui.selection.value as { id: string }).id;
    expect(slotOf(harness, barId, thirdId)).toBe('actions');
    const rect = (id: string) =>
      harness.project().markings.find((m) => m.id === id)!.rect;
    expect(rect(thirdId).x).toBeGreaterThan(rect(secondId).x);
    // No pin is refused or over a `max`: the slots took them by their `accepts` and `max`.
    const codes = [...harness.context.derived.issues.value.values()]
      .flat()
      .map((issue) => issue.code);
    expect(codes).not.toContain('slot-not-accepted');
    expect(codes).not.toContain('slot-full');
  });

  it('hands the app’s drawings to the action: the assignment has one source', async () => {
    const harness = await slotsHarness();
    placeBar(harness);
    const spy = vi.spyOn(harness.actions, 'addComponent');
    const user = renderPalette(harness);
    const drawn = harness.context.derived.drawingsOf(harness.project());
    await user.click(addButton('Pin'));
    expect(spy.mock.calls[0]?.[0].drawings).toBe(drawn);
  });

  it('is one undo entry', async () => {
    const harness = await slotsHarness();
    const barId = placeBar(harness);
    const user = renderPalette(harness);
    const before = harness.project().markings.length;
    await user.click(addButton('Pin'));
    expect(harness.project().markings).toHaveLength(before + 1);
    harness.store.undo();
    expect(harness.project().markings).toHaveLength(before);
    expect(harness.project().markings.some((m) => m.parentId === barId)).toBe(false);
  });
});

/** Renders one field of a typed annotation. */
function renderField(harness: SlotsHarness, annotationId: string, key: string) {
  renderLive(harness, (p: Project) => {
    const annotation = annotationOf(p, annotationId);
    const field = typeOfAnnotation(p, annotation)?.type.fields.find((f) => f.key === key);
    if (!field) throw new Error(`field ${key} does not exist`);
    return (
      <TypedField
        field={field}
        project={p}
        annotation={annotation}
        readOnly={false}
        onGoToAnnotation={() => undefined}
      />
    );
  });
}

const barAnnotationId = (harness: SlotsHarness, barId: string) =>
  markingComponent(harness.project(), harness.context.derived.catalog.value, barId)!
    .annotation.id;

describe('the default-content fields of a slot that has content', () => {
  const note = (slot: string) => t('typed.slotFilledNote', { slot });

  it('say the slot has content only while a child is in it, and only on that slot’s fields', async () => {
    const harness = await slotsHarness();
    const barId = placeBar(harness);
    const user = renderPalette(harness);
    await user.click(addButton('Pin')); // goes to navigationIcon
    cleanup();
    const annotationId = barAnnotationId(harness, barId);

    renderField(harness, annotationId, 'navLabel');
    expect(screen.getByText(note('Navigation icon'))).toBeTruthy();
    cleanup();

    // `actionLabel` belongs to `actions`, still empty; `title` belongs to no slot.
    renderField(harness, annotationId, 'actionLabel');
    expect(screen.queryByText(/has content/)).toBeNull();
    cleanup();
    renderField(harness, annotationId, 'title');
    expect(screen.queryByText(/has content/)).toBeNull();
  });

  it('goes away with Ctrl+Z', async () => {
    const harness = await slotsHarness();
    const barId = placeBar(harness);
    const user = renderPalette(harness);
    await user.click(addButton('Pin'));
    cleanup();
    const annotationId = barAnnotationId(harness, barId);
    renderField(harness, annotationId, 'navLabel');
    expect(screen.queryByText(note('Navigation icon'))).not.toBeNull();
    harness.store.undo();
    // The signal-driven field re-renders by itself.
    await Promise.resolve();
    expect(screen.queryByText(note('Navigation icon'))).toBeNull();
  });

  it('the hint stays the field description and the note is a separate status', async () => {
    const harness = await slotsHarness();
    const barId = placeBar(harness);
    const user = renderPalette(harness);
    await user.click(addButton('Pin'));
    cleanup();
    renderField(harness, barAnnotationId(harness, barId), 'navLabel');
    const status = screen.getByText(note('Navigation icon'));
    expect(status.tagName).toBe('SMALL');
    expect(
      within(status.parentElement as HTMLElement).queryByRole('textbox'),
    ).toBeTruthy();
  });
});
