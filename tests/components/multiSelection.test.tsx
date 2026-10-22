import { act, cleanup, render, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import { selectItems, selectedItems } from '../../src/store/ui';
import { CanvasContextMenu } from '../../src/ui/CanvasContextMenu';
import { EditorContext } from '../../src/ui/EditorContext';
import { MultiSelectionPanel } from '../../src/ui/MultiSelectionPanel';
import { sampleProject } from '../model/fixtures';
import { createHarness, renderLive } from './harness';

// Seleção múltipla (ME2): o painel de resumo e "Selecionar com o conteúdo" no menu do canvas.

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

const items = [
  { kind: 'marking', id: 'M1' },
  { kind: 'marking', id: 'M4' },
  { kind: 'image', id: 'I2' },
] as const;

function renderPanel(readOnly = false) {
  const harness = createHarness(sampleProject(), readOnly);
  const onDelete = vi.fn();
  renderLive(harness, (p) => (
    <MultiSelectionPanel
      project={p}
      items={items}
      readOnly={readOnly}
      onDelete={onDelete}
    />
  ));
  return { harness, onDelete, user: userEvent.setup() };
}

const markings = (h: ReturnType<typeof createHarness>) =>
  h.project().markings.map((m) => [m.id, m.locked]);

describe('painel com vários itens', () => {
  it('mostra a contagem total e por tipo', () => {
    renderPanel();
    expect(screen.getByText(t('multi.title', { count: 3 }))).toBeTruthy();
    expect(screen.getByText(t('multi.markings', { count: 2 }))).toBeTruthy();
    expect(screen.getByText(t('multi.containers', { count: 1 }))).toBeTruthy();
  });

  it('Trancar e Destrancar valem para todos, com uma entrada de desfazer cada', async () => {
    const { harness, user } = renderPanel();
    const unlock = screen.getByRole('button', { name: t('multi.unlock') });
    expect((unlock as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: t('multi.lock') }));
    expect(markings(harness)).toEqual([
      ['M1', true],
      ['M2', false],
      ['M3', false],
      ['M4', true],
    ]);
    expect(harness.project().containers.find((c) => c.id === 'I2')?.locked).toBe(true);
    expect(
      (screen.getByRole('button', { name: t('multi.lock') }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    await user.click(screen.getByRole('button', { name: t('multi.unlock') }));
    expect(markings(harness).every(([, locked]) => locked === false)).toBe(true);
    harness.store.undo();
    expect(harness.project().markings.find((m) => m.id === 'M1')?.locked).toBe(true);
    harness.store.undo();
    expect(harness.project().markings.find((m) => m.id === 'M1')?.locked).toBe(false);
  });

  it('Excluir pede a confirmação da seleção; desabilitado com item trancado', async () => {
    const { harness, onDelete, user } = renderPanel();
    await user.click(screen.getByRole('button', { name: t('multi.delete') }));
    expect(onDelete).toHaveBeenCalledWith(items);
    // M1 trancada e o container dela (I1) fora da seleção: não sai junto, então bloqueia.
    act(() => {
      harness.actions.setMarkingLocked('M1', true);
    });
    expect(
      (screen.getByRole('button', { name: t('multi.delete') }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('somente leitura: tudo desabilitado', () => {
    renderPanel(true);
    for (const name of ['multi.lock', 'multi.unlock', 'multi.delete'] as const) {
      expect(
        (screen.getByRole('button', { name: t(name) }) as HTMLButtonElement).disabled,
      ).toBe(true);
    }
  });
});

describe('menu de contexto do canvas: selecionar com o conteúdo', () => {
  it('seleciona a marcação com as descendentes e fecha o menu', async () => {
    const harness = createHarness(sampleProject());
    render(
      <EditorContext.Provider value={harness.context}>
        <CanvasContextMenu />
      </EditorContext.Provider>,
    );
    selectItems(harness.ui, [{ kind: 'marking', id: 'M1' }]);
    harness.ui.canvasMenu.value = { x: 5, y: 5, target: { kind: 'm', id: 'M1' } };
    await userEvent.click(
      await screen.findByRole('menuitem', { name: t('multi.selectWithContents') }),
    );
    expect(harness.ui.canvasMenu.value).toBeNull();
    expect(selectedItems(harness.ui).map((i) => i.id)).toEqual(['M2', 'M3', 'M1']);
  });
});
