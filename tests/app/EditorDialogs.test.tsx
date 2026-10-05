import { cleanup, render, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorDialogs } from '../../src/app/EditorDialogs';
import type {
  EditorDialog,
  EditorDialogs as Dialogs,
} from '../../src/app/useEditorDialogs';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import { EditorContext } from '../../src/ui/EditorContext';
import { createHarness, type Harness } from '../components/harness';
import { sampleProject } from '../model/fixtures';

// Confirmação de exclusão: quando há itens trancados dentro, ela diz quantos serão
// excluídos junto (a trava protege o item, não impede excluir o pai).

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

function open(harness: Harness, current: EditorDialog) {
  // Como no editor, fechar tira o diálogo da tela (ele não é redesenhado com o item já excluído).
  const close = vi.fn(() => cleanup());
  const dialogs = {
    current,
    show: vi.fn(),
    close,
    requestDeleteImage: vi.fn(),
    requestDeleteMarking: vi.fn(),
  } as unknown as Dialogs;
  render(
    <EditorContext.Provider value={harness.context}>
      <EditorDialogs
        dialogs={dialogs}
        busy={false}
        intake={{} as never}
        commands={{ exportProject: vi.fn(), closeProject: vi.fn() } as never}
      />
    </EditorContext.Provider>,
  );
  const dialog = within(document.querySelector('dialog') as HTMLElement);
  return { dialog, close };
}

const marking = (h: Harness, id: string) => {
  const found = h.project().markings.find((m) => m.id === id);
  if (!found) throw new Error(id);
  return found;
};

describe('confirmar exclusão da marcação', () => {
  it('sem itens trancados dentro, não há aviso', () => {
    const harness = createHarness(sampleProject());
    const { dialog } = open(harness, {
      kind: 'deleteMarking',
      marking: marking(harness, 'M1'),
    });
    expect(dialog.getByText(/será excluída com 2 marcação/)).toBeTruthy();
    expect(dialog.queryByRole('alert', { hidden: true })).toBeNull();
  });

  it('com descendentes trancados, avisa quantos serão excluídos junto', () => {
    const harness = createHarness(sampleProject());
    harness.actions.setMarkingLocked('M2', true);
    harness.actions.setMarkingLocked('M3', true);
    const { dialog } = open(harness, {
      kind: 'deleteMarking',
      marking: marking(harness, 'M1'),
    });
    const warning = dialog.getByRole('alert', { hidden: true });
    expect(warning.textContent).toBe(t('lock.deleteWarning', { locked: 2 }));
    expect(warning.textContent).toContain('2');
  });

  it('só conta os descendentes trancados do item, não de outras marcações', () => {
    const harness = createHarness(sampleProject());
    harness.actions.setMarkingLocked('M3', true);
    const { dialog } = open(harness, {
      kind: 'deleteMarking',
      marking: marking(harness, 'M2'),
    });
    expect(dialog.getByRole('alert', { hidden: true }).textContent).toBe(
      t('lock.deleteWarning', { locked: 1 }),
    );
  });

  it('confirmar exclui o pai com os trancados e limpa a seleção', async () => {
    const harness = createHarness(sampleProject());
    harness.actions.setMarkingLocked('M3', true);
    harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    const { dialog, close } = open(harness, {
      kind: 'deleteMarking',
      marking: marking(harness, 'M1'),
    });
    await userEvent.click(
      dialog.getByRole('button', { name: t('common.delete'), hidden: true }),
    );
    expect(close).toHaveBeenCalled();
    expect(harness.project().markings.map((m) => m.id)).toEqual(['M4']);
    expect(harness.ui.selection.value).toBeNull();
  });
});

describe('confirmar exclusão da imagem', () => {
  it('sem marcações trancadas, não há aviso', () => {
    const harness = createHarness(sampleProject());
    const { dialog } = open(harness, {
      kind: 'deleteImage',
      image: harness.project().images[0]!,
    });
    expect(dialog.queryByRole('alert', { hidden: true })).toBeNull();
  });

  it('com marcações trancadas, avisa quantas serão excluídas junto', () => {
    const harness = createHarness(sampleProject());
    harness.actions.setImageMarkingsLocked('I1', true);
    const { dialog } = open(harness, {
      kind: 'deleteImage',
      image: harness.project().images[0]!,
    });
    expect(dialog.getByRole('alert', { hidden: true }).textContent).toBe(
      t('lock.deleteWarning', { locked: 3 }),
    );
  });

  it('a imagem trancada em si não chega a pedir confirmação, mas a ação seguiria recusada', async () => {
    const harness = createHarness(sampleProject());
    harness.actions.setImageLocked('I2', true);
    expect(harness.actions.removeImage('I2')).toEqual({ ok: false, error: 'locked' });
  });
});
