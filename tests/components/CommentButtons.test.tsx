import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CommentButton, PinsButton } from '../../src/app/EditorTools';
import { t } from '../../src/i18n';
import type { Thread } from '../../src/model';
import { clearIdentity, setIdentity } from '../../src/store/identity';
import { locale } from '../../src/store/settings';
import { composingAnchor } from '../../src/store/threadUi';
import { CanvasContextMenu } from '../../src/ui/CanvasContextMenu';
import { EditorContext } from '../../src/ui/EditorContext';
import { sampleProject } from '../model/fixtures';
import { AGENT, HUMAN, T0, T1, message, sampleThread } from '../model/threadFixtures';
import { createHarness, type Harness } from './harness';

// Botões Conversas e Comentar e os itens Comentar / Comentar aqui do menu (CM4, decisões 24 e 25).

const WAITING_HUMAN: Thread = sampleThread({
  id: 'h',
  anchor: { kind: 'marking', id: 'M1' },
  messages: [message('h1', T0, HUMAN, 'oi'), message('h2', T1, AGENT, 'e então?')],
});

async function setup(threads: readonly Thread[] = [], readOnly = false) {
  const h = createHarness(sampleProject(), readOnly);
  for (const th of threads) await h.context.session.threads.create(th);
  return h;
}

function mount(h: Harness, ui: preact.ComponentChildren) {
  return render(<EditorContext.Provider value={h.context}>{ui}</EditorContext.Provider>);
}

beforeEach(() => {
  localStorage.clear();
  clearIdentity();
  setIdentity('Marina Alves', 'marina@exemplo.com');
  locale.value = 'pt-BR';
});
afterEach(cleanup);

describe('botão Conversas', () => {
  it('liga e desliga os pinos, com aria-pressed', async () => {
    const h = await setup();
    mount(h, <PinsButton />);
    const button = screen.getByRole('button', { name: t('comments.pins') });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(button);
    expect(h.ui.commentPins.value).toBe(true);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(button);
    expect(h.ui.commentPins.value).toBe(false);
  });

  it('desligado, mostra a contagem das conversas que aguardam humano', async () => {
    const h = await setup([WAITING_HUMAN]);
    const { container } = mount(h, <PinsButton />);
    expect(container.querySelector('.icon-button-badge')?.textContent).toBe('1');
    // Ligado, a contagem some (os pinos já mostram).
    act(() => {
      h.ui.commentPins.value = true;
    });
    expect(container.querySelector('.icon-button-badge')).toBeNull();
  });

  it('sem conversa aguardando, não mostra contagem', async () => {
    const h = await setup();
    const { container } = mount(h, <PinsButton />);
    expect(container.querySelector('.icon-button-badge')).toBeNull();
  });
});

describe('botão Comentar', () => {
  it('liga os pinos e arma o clique; de novo, desarma', async () => {
    const h = await setup();
    mount(h, <CommentButton />);
    const button = screen.getByRole('button', { name: t('comments.add') });
    fireEvent.click(button);
    expect(h.ui.commentPins.value).toBe(true);
    expect(h.ui.commentArm.value).not.toBeNull();
    expect(button.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(button);
    expect(h.ui.commentArm.value).toBeNull();
  });

  it('fica desabilitado no somente leitura', async () => {
    const h = await setup([], true);
    mount(h, <CommentButton />);
    expect(
      screen.getByRole('button', { name: t('comments.add') }).hasAttribute('disabled'),
    ).toBe(true);
  });

  it('fica desabilitado no modo visualização', async () => {
    const h = await setup();
    h.ui.viewMode.value = true;
    mount(h, <CommentButton />);
    expect(
      screen.getByRole('button', { name: t('comments.add') }).hasAttribute('disabled'),
    ).toBe(true);
  });
});

describe('menu de contexto do canvas', () => {
  it('Comentar aqui, num lugar vazio, abre o rascunho no ponto sem gravar', async () => {
    const h = await setup();
    const here = { kind: 'point', containerId: null, x: 5, y: 6 } as const;
    h.ui.canvasMenu.value = { x: 10, y: 10, target: null, comment: null, here };
    mount(h, <CanvasContextMenu />);
    fireEvent.click(screen.getByRole('menuitem', { name: t('comments.here') }));
    expect(composingAnchor(h.ui)).toEqual(here);
    expect(h.ui.commentPins.value).toBe(true);
    expect(h.ui.canvasMenu.value).toBeNull();
    expect(h.context.session.threads.list.peek()).toHaveLength(0);
  });

  it('Comentar, sobre um item, abre o rascunho ancorado nele', async () => {
    const h = await setup();
    h.ui.canvasMenu.value = {
      x: 10,
      y: 10,
      target: { kind: 'm', id: 'M1' },
      comment: { kind: 'marking', id: 'M1' },
      here: null,
    };
    mount(h, <CanvasContextMenu />);
    expect(screen.queryByRole('menuitem', { name: t('comments.here') })).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: t('comments.comment') }));
    expect(composingAnchor(h.ui)).toEqual({ kind: 'marking', id: 'M1' });
  });

  it('os itens ficam desabilitados no somente leitura', async () => {
    const h = await setup([], true);
    h.ui.canvasMenu.value = {
      x: 10,
      y: 10,
      target: null,
      comment: null,
      here: { kind: 'point', containerId: null, x: 1, y: 2 },
    };
    mount(h, <CanvasContextMenu />);
    expect(
      screen.getByRole('menuitem', { name: t('comments.here') }).hasAttribute('disabled'),
    ).toBe(true);
  });
});
