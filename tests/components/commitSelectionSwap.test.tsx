import { act, cleanup, fireEvent, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorPanel } from '../../src/app/EditorPanel';
import type { EditorDialogs } from '../../src/app/useEditorDialogs';
import { locale } from '../../src/store/settings';
import { sampleProject } from '../model/fixtures';
import { createHarness, renderLive } from './harness';

// Stage "Frame the selection" (EQ1), hypothesis H2: the selection changes between typing and
// confirming the Position (or the size). The Details recreates the `MarkingPanel` per marking
// (`key`), so the typed text cannot go to the other marking nor move it.

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

function setup() {
  const harness = createHarness(sampleProject());
  const dialogs = { show: vi.fn(), close: vi.fn() } as unknown as EditorDialogs;
  renderLive(harness, () => (
    <EditorPanel
      busy={false}
      dialogs={dialogs}
      onReplace={() => undefined}
      onGoToAnnotation={() => undefined}
    />
  ));
  const rects = () =>
    Object.fromEntries(harness.project().markings.map((m) => [m.id, { ...m.rect }]));
  return { harness, rects, user: userEvent.setup() };
}

describe('H2: selection swapped between the edit and the commit of the Position', () => {
  it('the text typed in X does not go to the marking selected afterwards (blur or Enter)', async () => {
    const { harness, rects, user } = setup();
    act(() => {
      harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    });
    const before = rects();
    const x = screen.getByLabelText('X');
    await user.clear(x);
    await user.type(x, '1234');
    // The selection changes without going through the field (click on the canvas, the Tree, the Palette...).
    act(() => {
      harness.ui.selection.value = { kind: 'marking', id: 'M2' };
    });
    expect((screen.getByLabelText('X') as HTMLInputElement).value).toBe(
      String(before.M2?.x),
    );
    fireEvent.blur(screen.getByLabelText('X'));
    await user.type(screen.getByLabelText('X'), '{Enter}');
    expect(rects()).toEqual(before);
  });

  it('the same holds for the size and when the base value of both markings is equal', async () => {
    const { harness, rects, user } = setup();
    // M1 and M2 come to have the same width: the draft of one cannot apply to the other.
    act(() => {
      harness.ui.selection.value = { kind: 'marking', id: 'M2' };
    });
    const same = Number((screen.getByLabelText('Width') as HTMLInputElement).value);
    act(() => {
      harness.actions.adjustMarkingRect('M1', 'width', same);
      harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    });
    const before = rects();
    const width = screen.getByLabelText('Width');
    await user.clear(width);
    await user.type(width, '777');
    act(() => {
      harness.ui.selection.value = { kind: 'marking', id: 'M2' };
    });
    await user.type(screen.getByLabelText('Width'), '{Enter}');
    expect(rects()).toEqual(before);
  });
});
