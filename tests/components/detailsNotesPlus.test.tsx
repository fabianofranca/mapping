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

// O + da camada Notas nos Detalhes (etapa #1280, decisões 4 a 6).

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

const emptyMessage = () => t('typed.empty.floating');

function renderPanel(harness: Harness, markingId: string, ownerKind?: 'arrow') {
  renderLive(harness, (p) => {
    const marking = p.markings.find((m) => m.id === markingId);
    if (!marking) throw new Error('sem marcação');
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

describe('+ da camada Notas', () => {
  it('numa marcação comum não oferece Nota nem Tabela e diz que a nota nasce pela Paleta', async () => {
    const harness = createHarness(plainMarking());
    const user = renderPanel(harness, 'M1');
    await user.click(plusOfNotes());
    expect(screen.getByText(emptyMessage())).toBeTruthy();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: /^Nota/ })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: /^Tabela/ })).toBeNull();
  });

  it('numa seta, a mesma mensagem', async () => {
    const harness = createHarness(plainMarking());
    const user = renderPanel(harness, 'M1', 'arrow');
    await user.click(plusOfNotes());
    expect(screen.getByText(emptyMessage())).toBeTruthy();
  });

  it('numa marcação flutuante (a Nota), continua oferecendo os tipos', async () => {
    const harness = createHarness(withNoteInstance(emptyProject()));
    const user = renderPanel(harness, 'N1');
    await user.click(plusOfNotes());
    expect(screen.queryByText(emptyMessage())).toBeNull();
    expect(screen.getByRole('button', { name: /Tabela/ })).toBeTruthy();
  });
});
