// Named slots (#1080, SL6, decision 7): the Details, the summary and the field read `derived.issues`
// through the editor context, so the drawing's pending items (`slot-not-accepted`, `slot-full`,
// `component-overflow`) reach them, not only the Incomplete window and the list.
import { cleanup, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { markingComponent } from '../../src/model';
import { locale } from '../../src/store/settings';
import { goToAnnotation } from '../../src/store/ui';
import { IssueBadge } from '../../src/ui/AnnotationSummary';
import { MarkingPanel } from '../../src/ui/MarkingPanel';
import { annotationOf, renderLive } from './harness';
import { slotsHarness, type SlotsHarness } from './slotsHarness';

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

function place(harness: SlotsHarness, typeId: string, parentId: string | null): string {
  const added = harness.actions.addComponent({
    containerId: 'I1',
    parentId,
    specId: 'slots',
    typeId,
  });
  if (!added.ok) throw new Error(`${typeId}: ${added.error}`);
  return added.value.markingId;
}

function renderMarking(harness: SlotsHarness, markingId: string) {
  renderLive(harness, (p) => {
    const marking = p.markings.find((m) => m.id === markingId);
    const image = p.containers.find((i) => i.id === marking?.containerId);
    if (!marking || !image) return null;
    return (
      <MarkingPanel
        project={p}
        marking={marking}
        image={image}
        readOnly={false}
        onDelete={() => undefined}
        onGoToAnnotation={(a) => goToAnnotation(harness.ui, a)}
      />
    );
  });
}

/** The pending-items block of the Details (`.issues`), not the other status regions. */
const pendingNotice = (): HTMLElement => {
  const notice = document.querySelector<HTMLElement>('.issues');
  if (!notice) throw new Error('the Details show no pending items');
  return notice;
};

describe('Details: the drawing’s pending items', () => {
  it('a child the slot does not accept shows slot-not-accepted in the Details of the child', async () => {
    const harness = await slotsHarness();
    const bar = place(harness, 'bar', null);
    const child = place(harness, 'rounded-bar', bar);
    renderMarking(harness, child);
    const notice = pendingNotice();
    expect(within(notice).getByText(/does not accept Rounded bar/)).toBeTruthy();
    expect(notice.textContent).toContain('Navigation icon');
    expect(notice.textContent).toContain('Bar');
  });

  it('the component that does not fit shows component-overflow in its Details', async () => {
    const harness = await slotsHarness();
    const bar = place(harness, 'bar', null);
    // A bar too small for its own title (the pins inside the hug slot no longer overflow it: CL1, 2.1).
    const shrunk = harness.actions.setMarkingRect(bar, {
      x: 10,
      y: 10,
      width: 60,
      height: 20,
    });
    if (!shrunk.ok) throw new Error(`rect: ${shrunk.error}`);
    const annotationId = markingComponent(
      harness.project(),
      harness.context.derived.catalog.value,
      bar,
    )!.annotation.id;
    expect(harness.context.derived.issues.value.get(annotationId)).toEqual([
      { code: 'component-overflow' },
    ]);
    renderMarking(harness, bar);
    expect(
      within(pendingNotice()).getByText(new RegExp(t('issue.component-overflow'))),
    ).toBeTruthy();
  });

  it('the issue goes away from the Details when the child leaves the slot', async () => {
    const harness = await slotsHarness();
    const bar = place(harness, 'bar', null);
    const child = place(harness, 'rounded-bar', bar);
    renderMarking(harness, child);
    expect(screen.queryByText(/does not accept/)).not.toBeNull();
    harness.actions.removeMarking(child);
    await waitFor(() => expect(screen.queryByText(/does not accept/)).toBeNull());
  });

  it('the summary badge of the annotation lists the same reason', async () => {
    const harness = await slotsHarness();
    const bar = place(harness, 'bar', null);
    const child = place(harness, 'rounded-bar', bar);
    const annotation = markingComponent(
      harness.project(),
      harness.context.derived.catalog.value,
      child,
    )!.annotation;
    renderLive(harness, (p) => (
      <IssueBadge project={p} annotation={annotationOf(p, annotation.id)} />
    ));
    expect(screen.getByRole('img', { name: /does not accept Rounded bar/ })).toBeTruthy();
  });
});
