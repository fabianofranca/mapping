import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { locale } from '../../src/store/settings';
import { PerspectivePicker } from '../../src/ui/PerspectivePicker';
import type { EditorDialogs } from '../../src/app/useEditorDialogs';
import { cadastroProject } from '../model/specFixtures';
import { renderLive } from './harness';
import { createLocalHarness } from './perspectiveUiHarness';

// Seletor de perspectivas da barra principal (etapa #659, PE3).

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

async function setup() {
  const harness = await createLocalHarness(cadastroProject());
  const { session } = harness.context;
  const shared = session.perspectiveActions.createPerspective({
    name: 'Fluxo A',
    startFrom: 'empty',
    local: false,
  });
  const mine = session.perspectiveActions.createPerspective({
    name: 'Rascunho',
    startFrom: 'empty',
    local: true,
  });
  if (!shared.ok || !mine.ok) throw new Error('perspectivas não criadas');
  const show = vi.fn();
  const dialogs = { show } as unknown as EditorDialogs;
  renderLive(harness, () => <PerspectivePicker dialogs={dialogs} />);
  return { harness, session, shared: shared.value, mine: mine.value, show };
}

const trigger = (name: string, who: string) =>
  screen.getByRole('button', { name: `Perspectiva: ${name}, ${who}` });

function openList(user: ReturnType<typeof userEvent.setup>) {
  return user.click(trigger('Principal', 'tudo'));
}

describe('PerspectivePicker', () => {
  it('o botão mostra a Principal ("tudo") por padrão', async () => {
    await setup();
    expect(trigger('Principal', 'tudo')).toBeTruthy();
  });

  it('lista Principal primeiro, Para todos e Só minhas, com a aberta marcada', async () => {
    const { session } = await setup();
    const user = userEvent.setup();
    await openList(user);
    const list = screen.getByRole('listbox', { name: 'Perspectivas' });
    const options = within(list).getAllByRole('option');
    expect(options.map((o) => o.getAttribute('data-name'))).toEqual([
      'Principal',
      'Fluxo A',
      'Rascunho',
    ]);
    expect(options[0]?.getAttribute('aria-selected')).toBe('true');
    expect(options[1]?.getAttribute('aria-selected')).toBe('false');
    expect(
      within(options[2] as HTMLElement).getByText(/só você vê · vazia/),
    ).toBeTruthy();
    expect(within(options[1] as HTMLElement).getByText('vazia')).toBeTruthy();
    expect(session.perspective.id.value).toBeNull();
  });

  it('escolher uma linha abre a perspectiva e fecha a lista', async () => {
    const { session, shared } = await setup();
    const user = userEvent.setup();
    await openList(user);
    await user.click(screen.getByRole('option', { name: /Fluxo A/ }));
    expect(session.perspective.id.value).toBe(shared);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(trigger('Fluxo A', 'para todos')).toBeTruthy();
  });

  it('o botão da "Só eu" diz "só eu"', async () => {
    const { session, mine } = await setup();
    session.perspective.open(mine);
    await Promise.resolve();
    expect(
      await screen.findByRole('button', { name: 'Perspectiva: Rascunho, só eu' }),
    ).toBeTruthy();
  });

  it('Nova e Gerenciar abrem os diálogos', async () => {
    const { show } = await setup();
    const user = userEvent.setup();
    await openList(user);
    await user.click(screen.getByRole('button', { name: 'Nova perspectiva…' }));
    expect(show).toHaveBeenLastCalledWith({ kind: 'newPerspective' });
    await openList(user);
    await user.click(screen.getByRole('button', { name: 'Gerenciar perspectivas…' }));
    expect(show).toHaveBeenLastCalledWith({ kind: 'managePerspectives' });
  });

  it('travado na revisão: botão desabilitado', async () => {
    const { session } = await setup();
    session.perspective.setLocked(true);
    await waitFor(() =>
      expect((trigger('Principal', 'tudo') as HTMLButtonElement).disabled).toBe(true),
    );
    expect(
      screen.getByText('A revisão mostra a Principal. Saia dela para trocar.'),
    ).toBeTruthy();
  });

  it('Esc fecha e devolve o foco ao botão; setas movem', async () => {
    await setup();
    const user = userEvent.setup();
    await openList(user);
    const options = screen.getAllByRole('option');
    expect(document.activeElement).toBe(options[0]);
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(options[1]);
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(document.activeElement?.textContent).toContain('Gerenciar');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(trigger('Principal', 'tudo'));
  });
});
