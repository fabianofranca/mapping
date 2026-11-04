import { cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import {
  hideToolWindow,
  isToolWindowOpen,
  showToolWindow,
  toolWindowByNumber,
} from '../../src/store/toolWindows';
import { BottomTabs } from '../../src/ui/BottomTabs';
import { EditorContext } from '../../src/ui/EditorContext';
import { NoticesView } from '../../src/ui/NoticesView';
import { StatusBar } from '../../src/ui/StatusBar';
import { sampleProject } from '../model/fixtures';
import { createHarness, type Harness } from './harness';
import { noticeProject } from './noticeFixtures';

// Janela Avisos (etapa #486, AV3): grupos por aviso, filtros, ir à anotação, aba e status.

beforeEach(() => {
  locale.value = 'pt-BR';
  hideToolWindow('notices');
});
afterEach(cleanup);

function withContext(harness: Harness, ui: preact.ComponentChildren) {
  return render(
    <EditorContext.Provider value={harness.context}>{ui}</EditorContext.Provider>,
  );
}

describe('janela Avisos', () => {
  it('lista um grupo por aviso, do mais grave ao menos, com selo, lugar, mensagem e contagem', () => {
    const harness = createHarness(noticeProject());
    withContext(harness, <NoticesView onGoToAnnotation={vi.fn()} />);
    const table = screen.getByRole('table', { name: t('notices.title') });
    const groups = within(table).getAllByRole('rowgroup').slice(1); // sem o thead
    expect(groups).toHaveLength(4);
    const head = (i: number) =>
      groups[i]!.querySelector('.notices-group-row')!.textContent ?? '';
    expect(head(0)).toContain('Removido');
    expect(head(0)).toContain('Gone');
    expect(head(0)).toContain('Saiu do contrato.');
    expect(head(1)).toContain('Obsoleto');
    expect(head(1)).toContain('Alert › legacyStyle');
    expect(head(2)).toContain('Alert › events › handler');
    expect(head(3)).toContain('Pendente');
    expect(head(3)).toContain('2026-11-04');
    // 1 anotação afetada por aviso
    expect(head(0)).toContain(t('notices.count', { count: 1 }));
  });

  it('cada linha traz marcação, camada, anotação e o valor no campo', () => {
    const harness = createHarness(noticeProject());
    withContext(harness, <NoticesView onGoToAnnotation={vi.fn()} />);
    const rows = screen
      .getAllByRole('row')
      .filter((r) => r.classList.contains('list-row'));
    expect(rows).toHaveLength(4);
    const deprecated = rows[1]!;
    expect(deprecated.textContent).toContain('Alvo');
    expect(deprecated.textContent).toContain('Componentes');
    expect(deprecated.textContent).toContain('x');
  });

  it('o Segmented por kind traz "Todos" e um botão por kind com a contagem', async () => {
    const harness = createHarness(noticeProject());
    withContext(harness, <NoticesView onGoToAnnotation={vi.fn()} />);
    const group = screen.getByRole('group', { name: t('notices.kindFilter') });
    const names = within(group)
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(names).toEqual([
      'Todos 2',
      'Removido 1',
      'Obsoleto 1',
      'Diverge 1',
      'Pendente 1',
    ]);
    await userEvent.click(within(group).getByRole('button', { name: /Obsoleto/ }));
    expect(harness.ui.noticeKind.value).toBe('deprecated');
    expect(
      screen.getAllByRole('row').filter((r) => r.classList.contains('list-row')),
    ).toHaveLength(1);
  });

  it('escolher a linha leva à anotação', async () => {
    const harness = createHarness(noticeProject());
    const onGo = vi.fn();
    withContext(harness, <NoticesView onGoToAnnotation={onGo} />);
    const rows = screen
      .getAllByRole('row')
      .filter((r) => r.classList.contains('list-row'));
    await userEvent.click(within(rows[1]!).getByRole('button'));
    expect(onGo).toHaveBeenCalledWith(expect.objectContaining({ id: 'AA' }));
  });

  it('"Só avisos em uso" desmarcado mostra o aviso sem anotação', async () => {
    const harness = createHarness({
      ...noticeProject(),
      annotations: noticeProject().annotations.filter((a) => a.id !== 'AG'),
    });
    withContext(harness, <NoticesView onGoToAnnotation={vi.fn()} />);
    expect(screen.queryByText(t('notices.unused'))).toBeNull();
    await userEvent.click(screen.getByRole('checkbox', { name: t('notices.inUseOnly') }));
    expect(harness.ui.noticesInUseOnly.value).toBe(false);
    expect(screen.getByText(t('notices.unused'))).toBeTruthy();
  });

  it('"Só camadas visíveis" e os estados vazios', async () => {
    const harness = createHarness(noticeProject());
    withContext(harness, <NoticesView onGoToAnnotation={vi.fn()} />);
    harness.ui.noticesVisibleOnly.value = true;
    harness.ui.noticeKind.value = null;
    // a camada está visível: a lista continua
    expect(
      screen.getAllByRole('row').filter((r) => r.classList.contains('list-row')),
    ).toHaveLength(4);
    cleanup();

    const empty = createHarness(sampleProject());
    withContext(empty, <NoticesView onGoToAnnotation={vi.fn()} />);
    expect(screen.getByText(t('notices.empty'))).toBeTruthy();
  });

  it('mostra o vazio com filtro quando nada passa por ele', () => {
    const harness = createHarness(noticeProject());
    harness.ui.noticesVisibleOnly.value = true;
    harness.ui.hiddenLayers.value = new Set(harness.project().layers.map((l) => l.id));
    withContext(harness, <NoticesView onGoToAnnotation={vi.fn()} />);
    expect(screen.getByText(t('notices.emptyFiltered'))).toBeTruthy();
  });
});

describe('aba, atalho e barra de status', () => {
  it('Ctrl+Shift+8 é a janela Avisos, na janela inferior', () => {
    expect(toolWindowByNumber(8)).toBe('notices');
    showToolWindow('notices');
    expect(isToolWindowOpen('notices')).toBe(true);
    hideToolWindow('notices');
    expect(isToolWindowOpen('notices')).toBe(false);
  });

  it('a aba fica entre Incompletas e Diagnóstico e mostra a contagem', () => {
    const harness = createHarness(noticeProject());
    withContext(harness, <BottomTabs active="list" />);
    const tabs = screen.getAllByRole('tab');
    const names = tabs.map((tab) => tab.textContent ?? '');
    const i = names.findIndex((n) => n.startsWith(t('notices.title')));
    expect(i).toBeGreaterThan(0);
    expect(names[i - 1]).toContain(t('incomplete.title'));
    expect(names[i + 1]).toContain(t('diagnostics.title'));
    expect(names[i]).toContain('2');
  });

  it('"Avisos: N" só com N > 0 e o clique abre a janela', async () => {
    const harness = createHarness(noticeProject());
    withContext(harness, <StatusBar />);
    const item = screen.getByRole('button', { name: t('notices.status', { count: 2 }) });
    expect(item.textContent).toContain('2');
    await userEvent.click(item);
    expect(isToolWindowOpen('notices')).toBe(true);
    cleanup();

    const without = createHarness(sampleProject());
    withContext(without, <StatusBar />);
    expect(screen.queryByRole('button', { name: /Avisos/ })).toBeNull();
  });

  it('a contagem de Incompletas não muda por causa de aviso', () => {
    const harness = createHarness(noticeProject());
    expect(harness.context.derived.noticedCount.value).toBe(2);
    expect(harness.context.derived.incompleteCount.value).toBe(0);
  });
});
