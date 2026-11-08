import { act, cleanup, fireEvent, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorPanel } from '../../src/app/EditorPanel';
import type { EditorDialogs } from '../../src/app/useEditorDialogs';
import { locale } from '../../src/store/settings';
import { sampleProject } from '../model/fixtures';
import { createHarness, renderLive } from './harness';

// Etapa "Enquadrar a seleção" (EQ1), hipótese H2: a seleção muda entre digitar e confirmar a
// Posição (ou o tamanho). O Detalhes recria o `MarkingPanel` por marcação (`key`), então o
// texto digitado não pode ir para a outra marcação nem deslocá-la.

beforeEach(() => {
  locale.value = 'pt-BR';
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

describe('H2: seleção trocada entre a edição e o commit da Posição', () => {
  it('o texto digitado em X não vai para a marcação selecionada depois (blur ou Enter)', async () => {
    const { harness, rects, user } = setup();
    act(() => {
      harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    });
    const before = rects();
    const x = screen.getByLabelText('X');
    await user.clear(x);
    await user.type(x, '1234');
    // A seleção muda sem passar pelo campo (clique no canvas, na Árvore, na Paleta...).
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

  it('o mesmo vale para o tamanho e quando o valor base das duas marcações é igual', async () => {
    const { harness, rects, user } = setup();
    // M1 e M2 passam a ter a mesma largura: o rascunho de uma não pode valer na outra.
    act(() => {
      harness.ui.selection.value = { kind: 'marking', id: 'M2' };
    });
    const same = Number((screen.getByLabelText('Largura') as HTMLInputElement).value);
    act(() => {
      harness.actions.adjustMarkingRect('M1', 'width', same);
      harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    });
    const before = rects();
    const width = screen.getByLabelText('Largura');
    await user.clear(width);
    await user.type(width, '777');
    act(() => {
      harness.ui.selection.value = { kind: 'marking', id: 'M2' };
    });
    await user.type(screen.getByLabelText('Largura'), '{Enter}');
    expect(rects()).toEqual(before);
  });
});
