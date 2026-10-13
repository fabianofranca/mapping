import { cleanup, render, waitFor, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';
import { locale, theme } from '../../src/store/settings';
import { useRef, useState } from 'preact/hooks';
import { Dialog } from '../../src/ui/Dialog';
import { HELP_PROPOSALS, HELP_SHORTCUTS, HelpDialog } from '../../src/ui/HelpDialog';
import { SettingsDialog } from '../../src/ui/SettingsDialog';

afterEach(() => {
  cleanup();
  locale.value = 'pt-BR';
  theme.value = 'system';
  vi.restoreAllMocks();
});

/** O `<dialog>` aberto (o jsdom o deixa fora da árvore de acessibilidade). */
const dialogEl = () => document.querySelector('dialog') as HTMLElement;

describe('Dialog', () => {
  // Etapa 8 (8.3), F10: só a confirmação (`alert`) é descrita pelo corpo; num diálogo
  // comprido (Ajuda) o leitor de tela leria o corpo inteiro ao abrir.
  it('diálogo comum: role dialog, sem aria-describedby', () => {
    render(<HelpDialog onClose={() => undefined} />);
    expect(dialogEl().getAttribute('role')).toBeNull();
    expect(dialogEl().hasAttribute('aria-describedby')).toBe(false);
  });

  it('cabeçalho com título e fechar, corpo e rodapé', async () => {
    const onCancel = vi.fn();
    render(
      <Dialog title="Título" onCancel={onCancel} actions={<button>Ação</button>}>
        <p>Conteúdo</p>
      </Dialog>,
    );
    const dialog = within(dialogEl());
    expect(dialog.getByRole('heading', { name: 'Título', hidden: true })).toBeTruthy();
    expect(dialogEl().querySelector('.dialog-header')).not.toBeNull();
    expect(dialogEl().querySelector('.dialog-body')?.textContent).toBe('Conteúdo');
    expect(dialogEl().querySelector('.dialog-actions')?.textContent).toBe('Ação');

    await userEvent.click(
      dialog.getByRole('button', { name: t('dialog.close'), hidden: true }),
    );
    expect(onCancel).toHaveBeenCalledOnce();
  });

  // Etapa 6 (6.2), achado 9: um diálogo de escolha obrigatória não mostra um X que não faz nada.
  it('closable={false}: sem o fechar do cabeçalho; Esc e o fundo não fazem nada', async () => {
    const onClick = vi.fn();
    render(
      <Dialog
        title="Escolha"
        closable={false}
        actions={<button onClick={onClick}>Ok</button>}
      >
        <p>Conteúdo</p>
      </Dialog>,
    );
    const dialog = within(dialogEl());
    expect(
      dialog.queryByRole('button', { name: t('dialog.close'), hidden: true }),
    ).toBeNull();
    expect(dialog.getAllByRole('button', { hidden: true })).toHaveLength(1);
    expect(document.activeElement?.textContent).toBe('Ok');
    const esc = new Event('cancel', { cancelable: true });
    dialogEl().dispatchEvent(esc);
    expect(esc.defaultPrevented).toBe(true);
    await userEvent.click(dialogEl());
    expect(dialogEl()).not.toBeNull();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('closable={false}: se o navegador fechar o <dialog> mesmo assim, ele volta a abrir', () => {
    render(<Dialog title="Escolha" closable={false} actions={<button>Ok</button>} />);
    const dialog = dialogEl() as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    // O jsdom não tem `close()`: tira o `open` como o navegador faria ao fechar.
    dialog.removeAttribute('open');
    dialog.dispatchEvent(new Event('close'));
    expect(dialog.open).toBe(true);
  });

  it('o botão do cabeçalho não repete o nome do "Fechar" do rodapé', () => {
    expect(t('dialog.close')).not.toBe(t('common.close'));
  });

  it('o foco inicial vai para o corpo, ou para o rodapé, e não para o fechar', () => {
    const { unmount } = render(
      <Dialog title="a" onCancel={vi.fn()} actions={<button>Ok</button>}>
        <input aria-label="campo" hidden />
        <input aria-label="nome" />
      </Dialog>,
    );
    expect(document.activeElement?.getAttribute('aria-label')).toBe('nome');
    unmount();
    render(
      <Dialog title="a" onCancel={vi.fn()} actions={<button>Cancelar</button>}>
        <p>Só texto</p>
      </Dialog>,
    );
    expect(document.activeElement?.textContent).toBe('Cancelar');
  });

  it('tamanhos: 480px (padrão), 560px e 820px', () => {
    const { rerender } = render(<Dialog title="a" onCancel={vi.fn()} actions={null} />);
    expect(dialogEl().className).toBe('dialog');
    rerender(<Dialog title="a" size="md" onCancel={vi.fn()} actions={null} />);
    expect(dialogEl().classList.contains('dialog-md')).toBe(true);
    rerender(<Dialog title="a" size="lg" flush onCancel={vi.fn()} actions={null} />);
    expect(dialogEl().classList.contains('dialog-lg')).toBe(true);
    expect(dialogEl().querySelector('.dialog-body-flush')).not.toBeNull();
  });

  // Etapa 6 (6.4), achado 4: ao fechar, o foco volta para quem abriu (e não ao `body`).
  function Opener() {
    const [outer, setOuter] = useState(false);
    const [inner, setInner] = useState(false);
    return (
      <>
        <button onClick={() => setOuter(true)}>Abrir</button>
        {outer && (
          <Dialog
            title="Externo"
            onCancel={() => setOuter(false)}
            actions={<button onClick={() => setInner(true)}>Detalhar</button>}
          />
        )}
        {inner && (
          <Dialog
            title="Interno"
            onCancel={() => setInner(false)}
            actions={<button onClick={() => setInner(false)}>Ok</button>}
          />
        )}
      </>
    );
  }

  it('ao fechar, devolve o foco a quem abriu (inclusive diálogo sobre diálogo)', async () => {
    const user = userEvent.setup();
    const { getByRole } = render(<Opener />);
    const opener = getByRole('button', { name: 'Abrir' });
    opener.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(document.activeElement?.textContent).toBe('Detalhar'));
    const detail = document.activeElement as HTMLElement;
    await user.keyboard('{Enter}');
    await waitFor(() => expect(document.activeElement?.textContent).toBe('Ok'));
    await user.keyboard('{Enter}');
    // O interno fechou: o foco volta ao botão do externo que o abriu.
    await waitFor(() => expect(document.querySelectorAll('dialog')).toHaveLength(1));
    expect(document.activeElement).toBe(detail);
    await user.click(
      within(dialogEl()).getByRole('button', { name: t('dialog.close'), hidden: true }),
    );
    await waitFor(() => expect(document.querySelector('dialog')).toBeNull());
    expect(document.activeElement).toBe(opener);
  });
});

// Etapa 7 (7.1), achado A1: quem abriu saiu do DOM ao fechar (item de menu, linha removida…).
describe('Dialog: foco quando quem abriu não existe mais', () => {
  /** "Abrir" some ao confirmar com "Ok", como a linha excluída pelo próprio diálogo. */
  function Vanishing({ explicit }: { readonly explicit: boolean }) {
    const [open, setOpen] = useState(false);
    const [gone, setGone] = useState(false);
    const target = useRef<HTMLButtonElement>(null);
    return (
      <div>
        <button ref={target}>Alvo</button>
        <div>
          {!gone && <button onClick={() => setOpen(true)}>Abrir</button>}
          <button>Vizinho</button>
        </div>
        {open && (
          <Dialog
            title="Confirmar"
            onCancel={() => setOpen(false)}
            returnFocus={explicit ? () => target.current : undefined}
            actions={
              <button
                onClick={() => {
                  setGone(true);
                  setOpen(false);
                }}
              >
                Ok
              </button>
            }
          />
        )}
      </div>
    );
  }

  async function openAndConfirm() {
    const user = userEvent.setup();
    const opener = [...document.querySelectorAll('button')].find(
      (b) => b.textContent === 'Abrir',
    );
    if (!opener) throw new Error('sem o botão Abrir');
    opener.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(document.activeElement?.textContent).toBe('Ok'));
    await user.keyboard('{Enter}');
    await waitFor(() => expect(document.querySelector('dialog')).toBeNull());
  }

  it('vai ao alvo de retorno explícito, e não ao body', async () => {
    render(<Vanishing explicit />);
    await openAndConfirm();
    expect(document.activeElement?.textContent).toBe('Alvo');
  });

  it('sem alvo explícito, vai ao contêiner mais próximo de quem abriu', async () => {
    render(<Vanishing explicit={false} />);
    await openAndConfirm();
    expect(document.activeElement?.textContent).toBe('Vizinho');
  });

  /** Aberto sem botão (atalho com o foco no body): não há quem abriu nem contêiner. */
  function Orphan() {
    const [open, setOpen] = useState(true);
    return (
      <div data-focus-root>
        <button>Primeiro</button>
        {open && (
          <Dialog
            title="Atalho"
            onCancel={() => setOpen(false)}
            actions={<button onClick={() => setOpen(false)}>Ok</button>}
          />
        )}
      </div>
    );
  }

  it('sem quem abriu nem contêiner, vai ao primeiro controle da app (data-focus-root), e não ao body', async () => {
    (document.activeElement as HTMLElement | null)?.blur();
    render(<Orphan />);
    await waitFor(() => expect(document.activeElement?.textContent).toBe('Ok'));
    dialogEl().dispatchEvent(new Event('cancel', { cancelable: true }));
    await waitFor(() => expect(document.querySelector('dialog')).toBeNull());
    expect(document.activeElement?.textContent).toBe('Primeiro');
  });

  it('quem abriu continua no DOM: o foco volta para ele (o alvo explícito fica de reserva)', async () => {
    const user = userEvent.setup();
    render(<Vanishing explicit />);
    const opener = [...document.querySelectorAll('button')].find(
      (b) => b.textContent === 'Abrir',
    ) as HTMLElement;
    opener.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(document.activeElement?.textContent).toBe('Ok'));
    // Esc (o jsdom não dispara o `cancel` sozinho).
    dialogEl().dispatchEvent(new Event('cancel', { cancelable: true }));
    await waitFor(() => expect(document.querySelector('dialog')).toBeNull());
    expect(document.activeElement).toBe(opener);
  });
});

describe('HelpDialog', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  const toc = () => within(dialogEl()).getByRole('navigation', { hidden: true });

  it('índice lateral com as seções, os downloads e os atalhos', () => {
    render(<HelpDialog onClose={vi.fn()} />);
    const links = within(toc())
      .getAllByRole('link', { hidden: true })
      .map((a) => a.textContent);
    expect(links).toContain(t('help.specs.downloads'));
    expect(links.at(-1)).toBe(t('help.shortcuts.title'));
    expect(links.length).toBeGreaterThan(5);
  });

  it('tocar num item do índice rola até a seção', async () => {
    render(<HelpDialog onClose={vi.fn()} />);
    await userEvent.click(
      within(toc()).getByRole('link', { name: t('help.shortcuts.title'), hidden: true }),
    );
    const scroll = vi.mocked(Element.prototype.scrollIntoView);
    expect(scroll).toHaveBeenCalledOnce();
    expect(scroll.mock.contexts[0]).toBe(document.getElementById('help-shortcuts'));
  });

  it('abre direto na seção pedida', () => {
    render(<HelpDialog onClose={vi.fn()} section={HELP_SHORTCUTS} />);
    const scroll = vi.mocked(Element.prototype.scrollIntoView);
    expect(scroll.mock.contexts.at(-1)).toBe(document.getElementById('help-shortcuts'));
  });

  it('seção Propostas: abre direto nela e tem os atalhos da revisão em Atalhos', () => {
    render(<HelpDialog onClose={vi.fn()} section={HELP_PROPOSALS} />);
    const scroll = vi.mocked(Element.prototype.scrollIntoView);
    const section = document.getElementById('help-proposals') as HTMLElement;
    expect(scroll.mock.contexts.at(-1)).toBe(section);
    expect(within(section).getByText(t('help.proposals.intro'))).toBeTruthy();
    const shortcuts = document.getElementById('help-shortcuts') as HTMLElement;
    expect(
      within(shortcuts).getByRole('rowheader', {
        name: t('shortcuts.review.apply'),
        hidden: true,
      }),
    ).toBeTruthy();
  });

  it('seção Atalhos: mostra Ctrl+Shift+1 para a Árvore e F1', () => {
    render(<HelpDialog onClose={vi.fn()} />);
    const section = document.getElementById('help-shortcuts') as HTMLElement;
    const tree = within(section).getByRole('rowheader', {
      name: t('shortcuts.toggleWindow', { window: t('panel.treeTitle') }),
      hidden: true,
    });
    const keys = [...(tree.nextElementSibling?.querySelectorAll('kbd') ?? [])].map(
      (k) => k.textContent,
    );
    expect(keys).toEqual(['Ctrl', 'Shift', '1', 'Alt', '1']);
    expect(section.textContent).toContain('F1');
  });

  it('a busca filtra as seções e ignora acentos', async () => {
    render(<HelpDialog onClose={vi.fn()} />);
    await userEvent.type(
      within(dialogEl()).getByRole('searchbox', { name: t('help.search'), hidden: true }),
      'atalhos',
    );
    const links = within(toc()).getAllByRole('link', { hidden: true });
    expect(links.map((a) => a.textContent)).toEqual([t('help.shortcuts.title')]);
    expect(document.getElementById('help-downloads')).toBeNull();
  });

  it('achar pelo texto da tecla', async () => {
    render(<HelpDialog onClose={vi.fn()} />);
    await userEvent.type(
      within(dialogEl()).getByRole('searchbox', { hidden: true }),
      'ctrl shift 1',
    );
    expect(document.getElementById('help-shortcuts')).not.toBeNull();
  });

  it('sem resultado diz o que foi buscado', async () => {
    render(<HelpDialog onClose={vi.fn()} />);
    await userEvent.type(
      within(dialogEl()).getByRole('searchbox', { hidden: true }),
      'zzzxyz',
    );
    expect(
      within(dialogEl()).getByText(t('help.noResults', { query: 'zzzxyz' })),
    ).toBeTruthy();
  });

  it('segue o idioma', () => {
    locale.value = 'en-US';
    render(<HelpDialog onClose={vi.fn()} />);
    expect(
      within(toc()).getByRole('link', { name: 'Keyboard shortcuts', hidden: true }),
    ).toBeTruthy();
  });
});

describe('SettingsDialog', () => {
  it('tema em segmentado: escolher muda o tema', async () => {
    render(<SettingsDialog onClose={vi.fn()} onShowShortcuts={vi.fn()} />);
    const group = within(dialogEl()).getByRole('group', {
      name: t('settings.theme'),
      hidden: true,
    });
    const dark = within(group).getByRole('button', {
      name: t('theme.dark'),
      hidden: true,
    });
    expect(dark.getAttribute('aria-pressed')).toBe('false');
    await userEvent.click(dark);
    expect(theme.value).toBe('dark');
    expect(dark.getAttribute('aria-pressed')).toBe('true');
  });

  it('idioma troca na hora', async () => {
    render(<SettingsDialog onClose={vi.fn()} onShowShortcuts={vi.fn()} />);
    await userEvent.selectOptions(
      within(dialogEl()).getByLabelText(t('settings.language'), { selector: 'select' }),
      'en-US',
    );
    expect(locale.value).toBe('en-US');
  });

  it('link para os atalhos', async () => {
    const onShowShortcuts = vi.fn();
    render(<SettingsDialog onClose={vi.fn()} onShowShortcuts={onShowShortcuts} />);
    await userEvent.click(
      within(dialogEl()).getByRole('button', {
        name: t('settings.shortcuts'),
        hidden: true,
      }),
    );
    expect(onShowShortcuts).toHaveBeenCalledOnce();
  });
});
