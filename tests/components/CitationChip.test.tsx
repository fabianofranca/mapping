import { act, cleanup, render, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { citationUrl, type CitationTarget } from '../../src/model';
import { clearIdentity, setIdentity } from '../../src/store/identity';
import { locale } from '../../src/store/settings';
import { EditorContext } from '../../src/ui/EditorContext';
import { CitationChip } from '../../src/ui/comments/CitationChip';
import { ThreadView } from '../../src/ui/comments/ThreadView';
import { Markdown } from '../../src/ui/markdown/Markdown';
import { sampleProject } from '../model/fixtures';
import { AGENT, HUMAN, message, sampleThread } from '../model/threadFixtures';
import { createHarness, type Harness } from './harness';

// Chip vivo da citação nas mensagens (etapa Comentários, CM5, decisões 28 e 29).

beforeEach(() => {
  localStorage.clear();
  locale.value = 'pt-BR';
  setIdentity('Marina Alves', 'marina@exemplo.com');
});
afterEach(() => {
  cleanup();
  clearIdentity();
});

const urlOf = (h: Harness, target: CitationTarget): string => {
  const url = citationUrl(
    h.context.session.storage.folderName ?? 'projeto',
    h.project(),
    [],
    target,
  );
  if (url === null) throw new Error('alvo sem URL');
  return url;
};

function renderChip(h: Harness, url: string, label = 'reserva') {
  return render(
    <EditorContext.Provider value={h.context}>
      <CitationChip url={url} label={label} />
    </EditorContext.Provider>,
  );
}

describe('CitationChip', () => {
  it('mostra o nome vivo do alvo, com o nome acessível "<nome>, citação"', () => {
    const h = createHarness(sampleProject());
    renderChip(h, urlOf(h, { kind: 'marking', id: 'M1' }), 'nome antigo');
    const chip = screen.getByRole('button', {
      name: t('citation.chipLabel', { name: 'Porta' }),
    });
    expect(chip.textContent).toBe('Porta');
    expect(chip.classList.contains('citation-chip')).toBe(true);
    expect(chip.classList.contains('citation-chip-broken')).toBe(false);
    expect(chip.getAttribute('type')).toBe('button');
  });

  it('renomear o alvo muda o chip', () => {
    const h = createHarness(sampleProject());
    const view = renderChip(h, urlOf(h, { kind: 'marking', id: 'M1' }));
    act(() => {
      h.actions.renameMarking('M1', 'Porta traseira');
    });
    view.rerender(
      <EditorContext.Provider value={h.context}>
        <CitationChip url={urlOf(h, { kind: 'marking', id: 'M1' })} label="reserva" />
      </EditorContext.Provider>,
    );
    expect(screen.getByRole('button').textContent).toBe('Porta traseira');
  });

  it('alvo sem nome mostra o texto neutro traduzido', () => {
    const h = createHarness(sampleProject());
    renderChip(h, urlOf(h, { kind: 'marking', id: 'M4' }), '');
    expect(screen.getByRole('button').textContent).toBe(t('citation.unnamed'));
  });

  it('alvo apagado: chip riscado com o rótulo de reserva e a dica', () => {
    const h = createHarness(sampleProject());
    const url = urlOf(h, { kind: 'marking', id: 'M3' });
    act(() => {
      h.actions.removeMarking('M3');
    });
    renderChip(h, url, 'Fechadura antiga');
    const chip = screen.getByRole('button');
    expect(chip.textContent).toBe('Fechadura antiga');
    expect(chip.classList.contains('citation-chip-broken')).toBe(true);
    expect(chip.getAttribute('title')).toBe(t('citation.missing'));
  });

  it('o clique leva ao alvo; o chip quebrado não vai a lugar nenhum', async () => {
    const h = createHarness(sampleProject());
    renderChip(h, urlOf(h, { kind: 'marking', id: 'M2' }));
    await userEvent.click(screen.getByRole('button'));
    expect(h.ui.selection.value).toEqual({ kind: 'marking', id: 'M2' });
    cleanup();
    h.ui.selection.value = null;
    renderChip(h, 'mapping://projeto/m/zzzz', 'perdida');
    await userEvent.click(screen.getByRole('button'));
    expect(h.ui.selection.value).toBeNull();
  });
});

describe('chip nas mensagens', () => {
  function thread(h: Harness, text: string) {
    return sampleThread({
      id: 'v1',
      messages: [message('m0', '2026-09-01T10:00:00.000Z', HUMAN, text)],
    });
  }

  it('a citação [rótulo](mapping://…) vira chip dentro do texto da mensagem', async () => {
    const h = createHarness(sampleProject());
    const url = urlOf(h, { kind: 'marking', id: 'M1' });
    render(
      <EditorContext.Provider value={h.context}>
        <ThreadView thread={thread(h, `veja [velho](${url}) agora`)} />
      </EditorContext.Provider>,
    );
    const chip = screen.getByRole('button', { name: 'Porta, citação' });
    expect(chip.closest('p')?.textContent).toContain('veja Porta agora');
    await userEvent.click(chip);
    expect(h.ui.selection.value).toEqual({ kind: 'marking', id: 'M1' });
  });

  it('link do Catálogo (mapping://spec/tipo) continua como estava: texto, sem chip', () => {
    const h = createHarness(sampleProject());
    render(
      <EditorContext.Provider value={h.context}>
        <ThreadView thread={thread(h, 'veja [o botão](mapping://project/M1)')} />
      </EditorContext.Provider>,
    );
    expect(screen.queryByRole('button', { name: /citação/ })).toBeNull();
    expect(screen.getByText(/o botão/)).toBeTruthy();
  });

  it('mensagem de agente também tem chip', () => {
    const h = createHarness(sampleProject());
    const url = urlOf(h, { kind: 'container', id: 'I1' });
    render(
      <EditorContext.Provider value={h.context}>
        <ThreadView
          thread={sampleThread({
            messages: [message('m0', '2026-09-01T10:00:00.000Z', AGENT, `[x](${url})`)],
          })}
        />
      </EditorContext.Provider>,
    );
    expect(screen.getByRole('button', { name: /citação/ }).textContent).toBe(
      'lateral.jpg',
    );
  });
});

describe('Markdown › renderMapping', () => {
  it('chama o renderizador antes de onLink, só para links que não são da biblioteca', async () => {
    const calls: string[][] = [];
    const clicked: string[] = [];
    render(
      <Markdown
        text="[x](mapping://p/m/ab) e [y](mapping://spec/tipo) e [z](mapping://tipo)"
        onLink={(href) => clicked.push(href)}
        renderMapping={(href, label) => {
          calls.push([href, label]);
          return <b>chip:{label}</b>;
        }}
      />,
    );
    expect(calls).toEqual([['mapping://p/m/ab', 'x']]);
    expect(screen.getByText('chip:x')).toBeTruthy();
    await userEvent.click(screen.getByText('y'));
    expect(clicked).toEqual(['mapping://spec/tipo']);
  });

  it('se o renderizador devolve null, vale o link de sempre', async () => {
    const clicked: string[] = [];
    render(
      <Markdown
        text="[x](mapping://p/m/ab)"
        onLink={(href) => clicked.push(href)}
        renderMapping={() => null}
      />,
    );
    await userEvent.click(screen.getByText('x'));
    expect(clicked).toEqual(['mapping://p/m/ab']);
  });
});
