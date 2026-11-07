import 'fake-indexeddb/auto';
import { act, cleanup, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { locale } from '../../src/store/settings';
import { StatusBar } from '../../src/ui/StatusBar';
import { PerspectiveNotices } from '../../src/ui/PerspectiveNotices';
import { cadastroProject } from '../model/specFixtures';
import { renderLive } from './harness';
import { createLocalHarness } from './perspectiveUiHarness';

// Barra de status e avisos das perspectivas (etapa #659, PE3).

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function setup() {
  const harness = await createLocalHarness(cadastroProject());
  const { session } = harness.context;
  const created = session.perspectiveActions.createPerspective({
    name: 'Fluxo A',
    startFrom: 'empty',
    local: false,
  });
  if (!created.ok) throw new Error('perspectiva não criada');
  renderLive(harness, () => (
    <>
      <StatusBar />
      <PerspectiveNotices />
    </>
  ));
  return { harness, session, id: created.value };
}

const addArrivals = (h: Awaited<ReturnType<typeof setup>>['harness'], count: number) =>
  act(() => {
    h.store.apply((p) => ({
      ...p,
      arrivals: Array.from({ length: count }, (_, i) => ({
        root: `R${i}`,
        from: 'X',
        fromName: 'Fluxo A',
      })),
    }));
  });

describe('barra de status: perspectiva', () => {
  it('mostra a Principal e, ao abrir outra, o nome dela', async () => {
    const { session, id } = await setup();
    expect(screen.getByText('Perspectiva Principal')).toBeTruthy();
    act(() => void session.perspective.open(id));
    expect(await screen.findByText('Perspectiva Fluxo A')).toBeTruthy();
  });

  it('na Principal com chegadas, conta quantos itens vieram', async () => {
    const { harness } = await setup();
    expect(screen.queryByText(/Chegadas/)).toBeNull();
    addArrivals(harness, 1);
    // Texto curto na barra (não trunca a 900 px); a frase inteira vai no title.
    const one = await screen.findByText('Chegadas: 1');
    expect(one.closest('.status-item')?.getAttribute('title')).toBe(
      '1 item veio de outra perspectiva',
    );
    addArrivals(harness, 3);
    const many = await screen.findByText('Chegadas: 3');
    expect(many.closest('.status-item')?.getAttribute('title')).toBe(
      '3 itens vieram de outras perspectivas',
    );
  });

  it('fora da Principal não mostra a contagem de chegadas', async () => {
    const { harness, session, id } = await setup();
    addArrivals(harness, 2);
    act(() => void session.perspective.open(id));
    await screen.findByText('Perspectiva Fluxo A');
    expect(screen.queryByText(/Chegadas/)).toBeNull();
  });
});

describe('avisos de troca forçada', () => {
  it('"removed" mostra o texto com o nome e limpa o signal', async () => {
    const { harness, session } = await setup();
    act(() => {
      session.perspective.notice.value = { kind: 'removed', name: 'Fluxo A' };
    });
    await waitFor(() =>
      expect(harness.ui.toast.value).toBe('A perspectiva Fluxo A foi apagada.'),
    );
    expect(session.perspective.notice.value).toBeNull();
  });

  it('"review" mostra o texto e limpa o signal', async () => {
    const { harness, session } = await setup();
    act(() => {
      session.perspective.notice.value = { kind: 'review' };
    });
    await waitFor(() =>
      expect(harness.ui.toast.value).toBe('A revisão mostra a Principal.'),
    );
    expect(session.perspective.notice.value).toBeNull();
  });
});
