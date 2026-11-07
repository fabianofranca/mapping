import { act, cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { shortcutFor } from '../../src/app/shortcuts';
import { t } from '../../src/i18n';
import type { Thread } from '../../src/model';
import { clearIdentity, setIdentity } from '../../src/store/identity';
import { locale } from '../../src/store/settings';
import { composingAnchor } from '../../src/store/threadUi';
import {
  hideToolWindow,
  isToolWindowOpen,
  showToolWindow,
} from '../../src/store/toolWindows';
import { EditorContext } from '../../src/ui/EditorContext';
import { LayersPanel } from '../../src/ui/LayersPanel';
import { StatusBar } from '../../src/ui/StatusBar';
import { ToolStrip } from '../../src/ui/ToolStrip';
import { ToolWindow } from '../../src/ui/ToolWindow';
import { sampleProject } from '../model/fixtures';
import { AGENT, HUMAN, T0, T1, message, sampleThread } from '../model/threadFixtures';
import { createHarness, renderLive, type Harness } from './harness';

// Janela Comentários na faixa, nas abas, na barra de status e no menu da camada (CM3).

const OPEN_A = sampleThread({
  id: 'oa',
  messages: [message('a1', T0, HUMAN, 'oi'), message('a2', T1, AGENT, 'olá')],
});
// A última é da pessoa: aguarda o agente.
const OPEN_B = sampleThread({
  id: 'ob',
  anchor: { kind: 'marking', id: 'M2' },
  messages: [message('b1', T0, HUMAN, 'e agora?')],
});

async function harnessWith(threads: readonly Thread[], readOnly = false) {
  const harness = createHarness(sampleProject(), readOnly);
  for (const th of threads) await harness.context.session.threads.create(th);
  return harness;
}

function withContext(harness: Harness, ui: preact.ComponentChildren) {
  return render(
    <EditorContext.Provider value={harness.context}>{ui}</EditorContext.Provider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  clearIdentity();
  setIdentity('Marina Alves', 'marina@exemplo.com');
  locale.value = 'pt-BR';
  hideToolWindow('comments');
});
afterEach(cleanup);

describe('atalhos da janela Comentários', () => {
  it('Ctrl+Shift+0 e Alt+0 alternam a janela Comentários', () => {
    const key = (k: string, mods: Partial<KeyboardEvent>) =>
      shortcutFor({
        key: k,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        altKey: false,
        ...mods,
      });
    expect(key('0', { ctrlKey: true, shiftKey: true })).toEqual({
      kind: 'toggle-window',
      window: 'comments',
    });
    expect(key('0', { altKey: true })).toEqual({
      kind: 'toggle-window',
      window: 'comments',
    });
  });
});

describe.each(['pt-BR', 'en-US'] as const)(
  'faixa, aba e barra de status (%s)',
  (lang) => {
    beforeEach(() => {
      locale.value = lang;
    });

    it('a faixa e a aba mostram a contagem das abertas', async () => {
      const harness = await harnessWith([OPEN_A, OPEN_B]);
      showToolWindow('comments');
      withContext(
        harness,
        <>
          <ToolStrip side="left" />
          <ToolWindow id="comments">
            <span>corpo</span>
          </ToolWindow>
        </>,
      );
      const strip = document.querySelector<HTMLElement>('[data-strip-window="comments"]');
      expect(strip?.textContent).toContain('2');
      expect(strip?.getAttribute('aria-label')).toContain(
        t('comments.openCount', { count: 2 }),
      );
      const tab = screen
        .getAllByRole('tab')
        .find((el) => el.getAttribute('aria-label') === t('comments.title'));
      expect(tab?.textContent).toContain('2');
    });

    it('sem conversas abertas não há selo', async () => {
      const harness = await harnessWith([]);
      withContext(harness, <ToolStrip side="left" />);
      const strip = document.querySelector<HTMLElement>('[data-strip-window="comments"]');
      expect(strip?.getAttribute('aria-label') ?? '').not.toContain('(');
    });

    it('a barra de status diz quantas abertas e aguardando o agente, e abre a janela', async () => {
      const user = userEvent.setup();
      const harness = await harnessWith([OPEN_A, OPEN_B]);
      renderLive(harness, () => (
        <EditorContext.Provider value={harness.context}>
          <StatusBar />
        </EditorContext.Provider>
      ));
      const item = screen.getByRole('button', {
        name: new RegExp(t('comments.statusBar.open', { count: 2 })),
      });
      expect(item.textContent).toContain(
        t('comments.statusBar.awaiting', {
          open: t('comments.statusBar.open', { count: 2 }),
          count: 1,
        }),
      );
      await user.click(item);
      expect(isToolWindowOpen('comments')).toBe(true);
    });

    it('singular e some com zero abertas', async () => {
      const harness = await harnessWith([OPEN_B]);
      renderLive(harness, () => (
        <EditorContext.Provider value={harness.context}>
          <StatusBar />
        </EditorContext.Provider>
      ));
      expect(screen.getByText(new RegExp(t('comments.statusBar.openOne')))).toBeTruthy();
      await act(async () => {
        await harness.context.session.threads.remove('ob');
      });
      expect(screen.queryByText(new RegExp(t('comments.statusBar.openOne')))).toBeNull();
      expect(
        screen.queryByRole('button', { name: new RegExp(t('comments.statusBar.tip')) }),
      ).toBeNull();
    });
  },
);

describe('Comentar no menu da camada', () => {
  it('abre uma conversa em rascunho ancorada na camada e leva aos Detalhes', async () => {
    const user = userEvent.setup();
    hideToolWindow('details');
    const harness = await harnessWith([]);
    renderLive(harness, (p) => <LayersPanel project={p} readOnly={false} />);
    const layer = harness.project().layers[0];
    if (!layer) throw new Error('sem camada');
    await user.click(
      screen.getByRole('button', { name: t('layer.more', { name: layer.name }) }),
    );
    const menu = screen.getByRole('menu', {
      name: t('layer.more', { name: layer.name }),
    });
    await user.click(within(menu).getByRole('menuitem', { name: t('comments.layer') }));
    expect(composingAnchor(harness.ui)).toEqual({ kind: 'layer', id: layer.id });
    expect(isToolWindowOpen('details')).toBe(true);
  });

  it('fica desabilitado em somente leitura e na revisão', async () => {
    const user = userEvent.setup();
    const harness = await harnessWith([], true);
    renderLive(harness, (p) => <LayersPanel project={p} readOnly={true} />);
    const layer = harness.project().layers[0];
    if (!layer) throw new Error('sem camada');
    await user.click(
      screen.getByRole('button', { name: t('layer.more', { name: layer.name }) }),
    );
    expect(
      (screen.getByRole('menuitem', { name: t('comments.layer') }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    cleanup();
    const h2 = await harnessWith([]);
    renderLive(h2, (p) => <LayersPanel project={p} readOnly={false} />);
    act(() => h2.store.setReviewing(true));
    await user.click(
      screen.getByRole('button', { name: t('layer.more', { name: layer.name }) }),
    );
    expect(
      (screen.getByRole('menuitem', { name: t('comments.layer') }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});

describe('foco ao fechar a janela Comentários', () => {
  it('fechar com o foco dentro devolve o foco ao botão da faixa', async () => {
    const user = userEvent.setup();
    const harness = await harnessWith([OPEN_A]);
    withContext(
      harness,
      <>
        <ToolStrip side="left" />
        <ToolWindow id="comments">
          <button type="button">dentro</button>
        </ToolWindow>
      </>,
    );
    showToolWindow('comments');
    await user.click(screen.getByRole('button', { name: 'dentro' }));
    await user.click(
      screen.getByRole('button', {
        name: t('window.closeWindow', { name: t('comments.title') }),
      }),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(document.activeElement).toBe(
      document.querySelector('[data-strip-window="comments"]'),
    );
  });
});
