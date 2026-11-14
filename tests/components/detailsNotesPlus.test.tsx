import { cleanup, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';
import { createMarking } from '../../src/model';
import { locale } from '../../src/store/settings';
import { AnnotationsPanel } from '../../src/ui/AnnotationsPanel';
import { emptyProject } from '../model/fixtures';
import { notesProject, withNoteInstance } from '../model/notesFixtures';
import { createHarness, renderLive, type Harness } from './harness';

// The + of the Notes layer in the Details (stage #1280, decisions 4 to 6).
// pt-BR kept: names of the bundled notes library (layer 'Notas', types 'Nota' and 'Tabela'), asserted by the test

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

const emptyMessage = () => t('typed.empty.floating');

function renderPanel(harness: Harness, markingId: string, ownerKind?: 'arrow') {
  renderLive(harness, (p) => {
    const marking = p.markings.find((m) => m.id === markingId);
    if (!marking) throw new Error('no marking');
    return (
      <AnnotationsPanel
        project={p}
        marking={marking}
        {...(ownerKind ? { ownerKind } : {})}
        layers={p.layers}
        readOnly={false}
        onShowLayer={vi.fn()}
        onGoToAnnotation={vi.fn()}
        focusAnnotation={null}
        onFocusDone={vi.fn()}
      />
    );
  });
  return userEvent.setup();
}

function plainMarking() {
  return createMarking(notesProject(), {
    id: 'M1',
    containerId: 'I1',
    rect: { x: 10, y: 10, width: 100, height: 100 },
  });
}

const plusOfNotes = () =>
  screen.getByRole('button', { name: t('annotation.addIn', { layer: 'Notas' }) });

describe('+ of the Notes layer', () => {
  it('on a plain marking it offers neither Note nor Table and says the note comes from the Palette', async () => {
    const harness = createHarness(plainMarking());
    const user = renderPanel(harness, 'M1');
    await user.click(plusOfNotes());
    expect(screen.getByText(emptyMessage())).toBeTruthy();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: /^Nota/ })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: /^Tabela/ })).toBeNull();
  });

  it('on an arrow, the same message', async () => {
    const harness = createHarness(plainMarking());
    const user = renderPanel(harness, 'M1', 'arrow');
    await user.click(plusOfNotes());
    expect(screen.getByText(emptyMessage())).toBeTruthy();
  });

  it('on a floating marking (the Note), it still offers the types', async () => {
    const harness = createHarness(withNoteInstance(emptyProject()));
    const user = renderPanel(harness, 'N1');
    await user.click(plusOfNotes());
    expect(screen.queryByText(emptyMessage())).toBeNull();
    expect(screen.getByRole('button', { name: /Tabela/ })).toBeTruthy();
  });
});
