import { cleanup, render, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEditorDialogs } from '../../src/app/useEditorDialogs';
import { markingDeletionImpact } from '../../src/model';
import { useEditor } from '../../src/ui/EditorContext';
import { sampleProject } from '../model/fixtures';
import { createHarness, renderLive } from './harness';

afterEach(cleanup);

/** Shows the open dialog and exposes the delete requests as buttons. */
function Probe({ markingId }: { readonly markingId: string }) {
  const { store } = useEditor();
  const dialogs = useEditorDialogs();
  const marking = store.project.value?.markings.find((m) => m.id === markingId);
  return (
    <>
      <output>{dialogs.current?.kind ?? 'none'}</output>
      <button
        type="button"
        onClick={() => marking && dialogs.requestDeleteMarking(marking)}
      >
        delete
      </button>
    </>
  );
}

describe('EditorContext', () => {
  it('useEditor outside the provider fails with a clear message', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Probe markingId="M1" />)).toThrow(/EditorProvider/);
  });

  it('exposes store, actions and ui of the open session', () => {
    const harness = createHarness(sampleProject());
    const { context } = harness;
    expect(context.store).toBe(context.session.store);
    expect(context.actions).toBe(context.session.actions);
    expect(context.canvas.current).toBeNull();
  });

  it('cascading deletion asks for confirmation; a simple one deletes directly', async () => {
    const harness = createHarness(sampleProject());
    const project = harness.project();
    const withImpact = project.markings.find((m) => {
      const impact = markingDeletionImpact(project, m.id);
      return impact.descendants > 0 || impact.annotations > 0;
    });
    const simple = project.markings.find((m) => {
      const impact = markingDeletionImpact(project, m.id);
      return impact.descendants === 0 && impact.annotations === 0;
    });
    if (!withImpact || !simple) throw new Error('fixture without both cases');
    const user = userEvent.setup();

    const view = renderLive(harness, () => <Probe markingId={withImpact.id} />);
    await user.click(screen.getByRole('button', { name: 'delete' }));
    expect(screen.getByRole('status').textContent).toBe('deleteMarking');
    expect(harness.project().markings.some((m) => m.id === withImpact.id)).toBe(true);
    view.unmount();

    renderLive(harness, () => <Probe markingId={simple.id} />);
    harness.ui.selection.value = { kind: 'marking', id: simple.id };
    await user.click(screen.getByRole('button', { name: 'delete' }));
    expect(screen.getByRole('status').textContent).toBe('none');
    expect(harness.project().markings.some((m) => m.id === simple.id)).toBe(false);
    expect(harness.ui.selection.value).toBeNull();
  });
});
