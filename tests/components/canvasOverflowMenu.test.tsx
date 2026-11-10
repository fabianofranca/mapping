import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { OverflowMenu, PinsButton, ViewModeButton } from '../../src/app/EditorTools';
import { t } from '../../src/i18n';
import { EditorContext } from '../../src/ui/EditorContext';
import { ViewModePanel } from '../../src/ui/ViewModePanel';
import type { Thread } from '../../src/model';
import { sampleProject } from '../model/fixtures';
import { AGENT, HUMAN, T0, T1, message, sampleThread } from '../model/threadFixtures';
import { createHarness, renderLive } from './harness';

afterEach(cleanup);

const WAITING_HUMAN: Thread = sampleThread({
  id: 'h',
  anchor: { kind: 'marking', id: 'M1' },
  messages: [message('h1', T0, HUMAN, 'oi'), message('h2', T1, AGENT, 'e então?')],
});

function setup() {
  const h = createHarness(sampleProject());
  renderLive(h, () => (
    <EditorContext.Provider value={h.context}>
      <OverflowMenu />
      <PinsButton />
      <ViewModeButton />
      <ViewModePanel />
    </EditorContext.Provider>
  ));
  return h;
}

const more = () => screen.getByRole('button', { name: t('editor.moreControls') });
const open = () => {
  fireEvent.click(more());
  return screen.getByRole('menu', { name: t('editor.moreControls') });
};
const items = () => [...document.querySelectorAll<HTMLElement>('[role^="menuitem"]')];
const item = (name: string) =>
  items().find((el) => el.textContent?.includes(name)) as HTMLElement;

describe('O "⋯" dos controles escondidos da barra do canvas', () => {
  it('abre com Conversas, Visualizar, Mostrar no canvas, Enquadrar tudo e Enquadrar seleção, nessa ordem', () => {
    setup();
    open();
    const names = items().map((el) => el.textContent ?? '');
    expect(names).toHaveLength(5);
    expect(names[0]).toContain(t('comments.pins'));
    expect(names[1]).toContain(t('view.viewMode'));
    expect(names[1]).toContain('Alt+H');
    expect(names[2]).toContain(t('view.panelOpen'));
    expect(names[3]).toContain(t('editor.fitAll'));
    expect(names[4]).toContain(t('editor.fitSelection'));
  });

  it('Conversas e Visualizar mostram o estado marcado e o item de Conversas liga e desliga os pinos', () => {
    const h = setup();
    open();
    const pins = item(t('comments.pins'));
    expect(pins.getAttribute('role')).toBe('menuitemcheckbox');
    expect(pins.getAttribute('aria-checked')).toBe(String(h.ui.commentPins.value));
    const before = h.ui.commentPins.value;
    fireEvent.click(pins);
    expect(h.ui.commentPins.value).toBe(!before);
    open();
    expect(item(t('comments.pins')).getAttribute('aria-checked')).toBe(String(!before));
  });

  it('Visualizar liga o modo e abre o painel; Mostrar no canvas fica desabilitado fora do modo', () => {
    const h = setup();
    open();
    expect(item(t('view.viewMode')).getAttribute('aria-checked')).toBe('false');
    expect(item(t('view.panelOpen')).hasAttribute('disabled')).toBe(true);
    fireEvent.click(item(t('view.viewMode')));
    expect(h.ui.viewMode.value).toBe(true);
    expect(screen.getByRole('dialog', { name: t('view.panelTitle') })).toBeTruthy();
    open();
    expect(item(t('view.viewMode')).getAttribute('aria-checked')).toBe('true');
    expect(item(t('view.panelOpen')).hasAttribute('disabled')).toBe(false);
  });

  it('Mostrar no canvas, no modo, reabre o painel', () => {
    const h = setup();
    fireEvent.click(screen.getByRole('button', { name: t('view.viewMode') }));
    fireEvent.keyDown(screen.getByRole('dialog', { name: t('view.panelTitle') }), {
      key: 'Escape',
    });
    expect(h.ui.viewPanel.value).toBe(false);
    open();
    fireEvent.click(item(t('view.panelOpen')));
    expect(h.ui.viewPanel.value).toBe(true);
    expect(screen.getByRole('dialog', { name: t('view.panelTitle') })).toBeTruthy();
  });

  it('Enquadrar tudo faz o que o botão faz', () => {
    const h = setup();
    let fitted = 0;
    h.context.canvas.current = { fitAll: () => fitted++ } as never;
    open();
    fireEvent.click(item(t('editor.fitAll')));
    expect(fitted).toBe(1);
  });

  it('o selo da contagem e o ponto de não lida aparecem no "⋯" com as conversas desligadas', async () => {
    const h = createHarness(sampleProject());
    await h.context.session.threads.create(WAITING_HUMAN);
    const { container } = render(
      <EditorContext.Provider value={h.context}>
        <OverflowMenu />
      </EditorContext.Provider>,
    );
    expect(container.querySelector('.icon-button-badge')?.textContent).toBe('1');
    expect(container.querySelector('.icon-button-alert')).toBeTruthy();
    // Ligadas, os pinos já mostram: o "⋯" não repete o selo.
    act(() => {
      h.ui.commentPins.value = true;
    });
    expect(container.querySelector('.icon-button-badge')).toBeNull();
    expect(container.querySelector('.icon-button-alert')).toBeNull();
  });
});
