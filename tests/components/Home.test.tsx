import { cleanup, render, screen, waitFor, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';
import { restoreModalFocus, simulateModalFocus } from './modalFocus';

const controller = vi.hoisted(() => ({
  createFolderProject: vi.fn(),
  createLocalProject: vi.fn(),
  deleteLocalProject: vi.fn(),
  forgetFolder: vi.fn(),
  importZip: vi.fn(),
  openFolder: vi.fn(),
  openLocalProject: vi.fn(),
  openRecentFolder: vi.fn(),
  relocateFolder: vi.fn(),
}));

vi.mock('../../src/app/controller', async () => {
  const { signal } = await import('@preact/signals');
  return {
    ...controller,
    features: signal<unknown>(null),
    recentProjects: signal<unknown[]>([]),
  };
});

import * as app from '../../src/app/controller';
import { Home } from '../../src/app/Home';

const features = app.features as unknown as { value: unknown };
const recentProjects = app.recentProjects as unknown as { value: unknown[] };

const ok = (value?: unknown) => Promise.resolve({ ok: true, value });
const fail = (error: string) => Promise.resolve({ ok: false, error });

beforeEach(() => {
  for (const fn of Object.values(controller)) fn.mockReset();
  features.value = { folder: true, local: true, fileProtocol: false };
  recentProjects.value = [
    {
      kind: 'local',
      id: 'p1',
      name: 'Carro',
      usedAt: '2026-09-20T18:30:00.000Z',
      unexported: true,
    },
  ];
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Home', () => {
  it('antes de detectar os recursos mostra "carregando"', () => {
    features.value = null;
    render(<Home />);
    expect(screen.getByText(t('app.loading'))).toBeTruthy();
  });

  it('sem nenhum recurso avisa que o navegador não é suportado', () => {
    features.value = { folder: false, local: false, fileProtocol: false };
    render(<Home />);
    expect(screen.getByText(t('home.unsupported'))).toBeTruthy();
    expect(screen.queryByText(t('home.newProject'))).toBeNull();
  });

  it('em file:// avisa sobre o armazenamento', () => {
    features.value = { folder: false, local: true, fileProtocol: true };
    render(<Home />);
    expect(screen.getByText(t('home.fileProtocolWarning'))).toBeTruthy();
  });

  it('lista os projetos locais com o indicador de não exportado', () => {
    render(<Home />);
    expect(screen.getByText('Carro')).toBeTruthy();
    expect(screen.getByText(t('status.unexported'))).toBeTruthy();
  });

  it('sem projetos locais mostra o texto vazio', () => {
    recentProjects.value = [];
    render(<Home />);
    expect(screen.getByText(t('home.noRecentProjects'))).toBeTruthy();
  });

  it('criar projeto: pede o nome e chama o controller', async () => {
    controller.createLocalProject.mockReturnValue(ok());
    render(<Home />);
    const user = userEvent.setup();
    await user.click(screen.getByText(t('home.newProject')));
    await user.type(await screen.findByLabelText(t('project.name')), 'Novo');
    await user.click(screen.getByRole('button', { name: t('common.create') }));
    await waitFor(() =>
      expect(controller.createLocalProject).toHaveBeenCalledWith('Novo'),
    );
  });

  // Etapa 8 (8.3), F9: o campo do nome focava sozinho na montagem, além do foco inicial do
  // diálogo (o primeiro controle do corpo): dois donos do mesmo foco.
  it('Novo projeto foca o nome uma vez só', async () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    render(<Home />);
    const user = userEvent.setup();
    await user.click(screen.getByText(t('home.newProject')));
    const name = await screen.findByLabelText(t('project.name'));
    await waitFor(() => expect(document.activeElement).toBe(name));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(focus.mock.contexts.filter((el) => el === name)).toHaveLength(1);
    focus.mockRestore();
  });

  // Etapa 8 (8.3), F10: a confirmação destrutiva é um alertdialog, descrito pelo corpo.
  it('Excluir é um alertdialog descrito pelo corpo', async () => {
    render(<Home />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: t('common.delete') }));
    await screen.findByText(t('home.deleteMessage', { name: 'Carro' }));
    const dialog = document.querySelector('dialog') as HTMLElement;
    expect(dialog.getAttribute('role')).toBe('alertdialog');
    const body = document.getElementById(dialog.getAttribute('aria-describedby') ?? '');
    expect(body?.textContent).toContain(t('home.deleteMessage', { name: 'Carro' }));
  });

  it('abrir projeto local; erro aparece traduzido', async () => {
    controller.openLocalProject.mockReturnValue(fail('not-found'));
    render(<Home />);
    await userEvent.click(screen.getByRole('button', { name: t('common.open') }));
    expect((await screen.findByRole('alert')).textContent).toBe(t('error.not-found'));
    expect(controller.openLocalProject).toHaveBeenCalledWith('p1');
  });

  it('excluir pede confirmação', async () => {
    controller.deleteLocalProject.mockReturnValue(ok());
    render(<Home />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: t('common.delete') }));
    expect(controller.deleteLocalProject).not.toHaveBeenCalled();
    await screen.findByText(t('home.deleteMessage', { name: 'Carro' }));
    const dialog = document.querySelector('dialog') as HTMLElement;
    await user.click(
      within(dialog).getByRole('button', { name: t('common.delete'), hidden: true }),
    );
    await waitFor(() => expect(controller.deleteLocalProject).toHaveBeenCalledWith('p1'));
  });

  it('abrir pasta sem mapping.json pede o nome e cria o projeto', async () => {
    const handle = { name: 'minha-pasta' };
    controller.openFolder.mockReturnValue(
      ok({ kind: 'needs-setup', handle, images: [{ name: 'a.jpg' }] }),
    );
    controller.createFolderProject.mockReturnValue(ok({ skipped: ['b.jpg'] }));
    render(<Home />);
    const user = userEvent.setup();
    await user.click(screen.getByText(t('home.openFolder')));
    await user.click(await screen.findByRole('button', { name: t('common.create') }));
    await waitFor(() =>
      expect(controller.createFolderProject).toHaveBeenCalledWith(handle, '', [
        { name: 'a.jpg' },
      ]),
    );
    expect((await screen.findByRole('alert')).textContent).toBe(
      t('home.folderSkipped', { count: 1 }),
    );
  });

  it('abrir zip chama importZip com o arquivo escolhido', async () => {
    controller.importZip.mockReturnValue(ok());
    const { container } = render(<Home />);
    const file = new File(['z'], 'p.zip', { type: 'application/zip' });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);
    await waitFor(() => expect(controller.importZip).toHaveBeenCalledWith(file));
  });
});

describe('Home (B10)', () => {
  it('coluna lateral com Projetos, Ajuda e Configurações', async () => {
    render(<Home />);
    const side = screen.getByRole('complementary', { name: t('home.sideLabel') });
    expect(within(side).getByRole('button', { name: t('home.projects') })).toBeTruthy();
    const user = userEvent.setup();
    await user.click(within(side).getByRole('button', { name: t('help.open') }));
    expect(document.querySelector('.help')).not.toBeNull();
    await user.click(
      screen.getByRole('button', { name: t('dialog.close'), hidden: true }),
    );
    await user.click(within(side).getByRole('button', { name: t('settings.title') }));
    expect(
      screen.getByRole('button', { name: t('settings.shortcuts'), hidden: true }),
    ).toBeTruthy();
  });

  it('Configurações → atalhos abre a Ajuda na seção Atalhos', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    render(<Home />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: t('settings.title') }));
    await user.click(
      screen.getByRole('button', { name: t('settings.shortcuts'), hidden: true }),
    );
    const scroll = vi.mocked(Element.prototype.scrollIntoView);
    await waitFor(() => expect(scroll).toHaveBeenCalled());
    expect(scroll.mock.contexts.at(-1)).toBe(document.getElementById('help-shortcuts'));
  });

  it('tabela de recentes com origem e data, e Abrir na linha', async () => {
    controller.openLocalProject.mockReturnValue(ok());
    render(<Home />);
    const table = screen.getByRole('table');
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(headers.slice(0, 3)).toEqual([
      t('home.colName'),
      t('home.colOrigin'),
      t('home.colUsed'),
    ]);
    const row = within(table).getByRole('row', { name: /Carro/ });
    expect(within(row).getByText(t('status.targetLocal'))).toBeTruthy();
    expect(within(row).getByText(t('status.unexported'))).toBeTruthy();
    await userEvent.click(within(row).getByRole('button', { name: t('common.open') }));
    expect(controller.openLocalProject).toHaveBeenCalledWith('p1');
  });

  it('busca filtra os projetos (sem acento nem maiúsculas)', async () => {
    recentProjects.value = [
      ...recentProjects.value,
      {
        kind: 'local',
        id: 'p2',
        name: 'Avião',
        usedAt: '2026-09-21T10:00:00.000Z',
        unexported: false,
      },
    ];
    render(<Home />);
    const user = userEvent.setup();
    await user.type(screen.getByRole('searchbox', { name: t('home.search') }), 'AVIAO');
    expect(screen.queryByText('Carro')).toBeNull();
    expect(screen.getByText('Avião')).toBeTruthy();
    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'zzz');
    expect(screen.getByText(t('home.noResults', { query: 'zzz' }))).toBeTruthy();
  });

  it('sem projetos não mostra busca nem tabela', () => {
    recentProjects.value = [];
    render(<Home />);
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('com a pasta disponível, recomenda o formato pasta para quem usa git', () => {
    render(<Home />);
    expect(screen.getByText(t('home.gitHint'))).toBeTruthy();
    expect(screen.getByText(t('home.gitHint')).textContent).toContain('.gitignore');
    expect(screen.queryByText(t('home.folderUnavailable'))).toBeNull();
  });

  it('sem suporte a pasta, mostra o motivo no lugar da recomendação', () => {
    features.value = { folder: false, local: true, fileProtocol: false };
    render(<Home />);
    expect(screen.queryByText(t('home.gitHint'))).toBeNull();
  });

  it('Abrir pasta desabilitado diz o motivo na tela', () => {
    features.value = { folder: false, local: true, fileProtocol: false };
    render(<Home />);
    expect(
      screen.getByRole('button', { name: t('home.openFolder') }).hasAttribute('disabled'),
    ).toBe(true);
    expect(screen.getByText(t('home.folderUnavailable'))).toBeTruthy();
  });
});

describe('Home: recentes de pasta (fase 6.6)', () => {
  const folder = {
    kind: 'folder',
    id: 'f1',
    name: 'Principal',
    folderName: 'principal-pasta',
    usedAt: '2026-10-01T10:00:00.000Z',
  };

  beforeEach(() => {
    recentProjects.value = [folder, ...recentProjects.value];
  });

  it('pasta na mesma lista, com o selo Pasta, o nome da pasta e Remover da lista', async () => {
    controller.forgetFolder.mockReturnValue(ok());
    render(<Home />);
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.map((r) => r.querySelector('.project-name')?.textContent)).toEqual([
      'Principal',
      'Carro',
    ]);
    const row = rows[0] as HTMLElement;
    expect(within(row).getByText(t('status.targetFolder'))).toBeTruthy();
    expect(within(row).getByText('principal-pasta')).toBeTruthy();
    expect(within(row).queryByRole('button', { name: t('common.delete') })).toBeNull();
    await userEvent.click(
      within(row).getByRole('button', { name: t('home.forgetFolder') }),
    );
    expect(controller.forgetFolder).toHaveBeenCalledWith('f1');
  });

  // Etapa 7 (7.1), regressão G4: a linha sai da lista e o foco caía no body.
  describe('foco depois de Remover da lista', () => {
    /** `forgetFolder` tira a pasta da lista, como o controller faz. */
    const forgetting = () =>
      controller.forgetFolder.mockImplementation((id: string) => {
        recentProjects.value = recentProjects.value.filter(
          (p) => (p as { id: string }).id !== id,
        );
        return ok();
      });
    const openOf = (name: RegExp) =>
      within(screen.getByRole('row', { name })).getByRole('button', {
        name: t('common.open'),
      });

    it('vai ao Abrir da linha seguinte', async () => {
      forgetting();
      render(<Home />);
      const row = screen.getByRole('row', { name: /Principal/ });
      await userEvent.click(
        within(row).getByRole('button', { name: t('home.forgetFolder') }),
      );
      await waitFor(() => expect(screen.queryByText('Principal')).toBeNull());
      await waitFor(() => expect(document.activeElement).toBe(openOf(/Carro/)));
    });

    it('na última linha, vai ao Abrir da anterior', async () => {
      forgetting();
      recentProjects.value = [...recentProjects.value].reverse();
      render(<Home />);
      const row = screen.getByRole('row', { name: /Principal/ });
      await userEvent.click(
        within(row).getByRole('button', { name: t('home.forgetFolder') }),
      );
      await waitFor(() => expect(screen.queryByText('Principal')).toBeNull());
      await waitFor(() => expect(document.activeElement).toBe(openOf(/Carro/)));
    });

    it('sem linhas, vai ao título da lista', async () => {
      forgetting();
      recentProjects.value = [folder];
      render(<Home />);
      await userEvent.click(screen.getByRole('button', { name: t('home.forgetFolder') }));
      await waitFor(() => expect(screen.queryByText('Principal')).toBeNull());
      await waitFor(() =>
        expect(document.activeElement).toBe(
          screen.getByRole('heading', { name: t('home.recentProjects') }),
        ),
      );
    });

    it('Excluir um projeto deste dispositivo faz o mesmo', async () => {
      controller.deleteLocalProject.mockImplementation((id: string) => {
        recentProjects.value = recentProjects.value.filter(
          (p) => (p as { id: string }).id !== id,
        );
        return ok();
      });
      render(<Home />);
      const user = userEvent.setup();
      const row = screen.getByRole('row', { name: /Carro/ });
      await user.click(within(row).getByRole('button', { name: t('common.delete') }));
      const dialog = document.querySelector('dialog') as HTMLElement;
      await user.click(
        within(dialog).getByRole('button', { name: t('common.delete'), hidden: true }),
      );
      await waitFor(() => expect(screen.queryByText('Carro')).toBeNull());
      await waitFor(() => expect(document.activeElement).toBe(openOf(/Principal/)));
    });

    it('pelo aviso "Pasta indisponível" também', async () => {
      forgetting();
      controller.openRecentFolder.mockReturnValue(
        ok({ kind: 'unavailable', reason: 'missing' }),
      );
      render(<Home />);
      const user = userEvent.setup();
      const row = screen.getByRole('row', { name: /Principal/ });
      await user.click(within(row).getByRole('button', { name: t('common.open') }));
      await screen.findByText(t('home.folderMissing', { folder: 'principal-pasta' }));
      const dialog = document.querySelector('dialog') as HTMLElement;
      await user.click(
        within(dialog).getByRole('button', {
          name: t('home.forgetFolder'),
          hidden: true,
        }),
      );
      await waitFor(() => expect(document.querySelector('dialog')).toBeNull());
      await waitFor(() => expect(screen.queryByText('Principal')).toBeNull());
      await waitFor(() => expect(document.activeElement).toBe(openOf(/Carro/)));
    });

    // Etapa 8 (8.3), achado F2: com a exclusão ainda em curso, o retorno do diálogo punha o
    // foco num contêiner (a busca) e depois o `refocusRow` da Home o levava à linha: dois
    // donos. Agora o diálogo fecha depois da ação e o foco vai direto à linha que ficou.
    it(
      'Excluir pelo diálogo leva o foco direto à linha que ficou (um dono só)',
      { repeats: 19 },
      async () => {
        simulateModalFocus();
        try {
          let finish: () => void = () => undefined;
          controller.deleteLocalProject.mockImplementation(
            (id: string) =>
              new Promise((resolve) => {
                finish = () => {
                  recentProjects.value = recentProjects.value.filter(
                    (p) => (p as { id: string }).id !== id,
                  );
                  resolve({ ok: true });
                };
              }),
          );
          render(<Home />);
          const user = userEvent.setup();
          const row = screen.getByRole('row', { name: /Carro/ });
          await user.click(within(row).getByRole('button', { name: t('common.delete') }));
          const dialog = await waitFor(() => {
            const el = document.querySelector('dialog');
            if (!el?.contains(document.activeElement)) throw new Error('não abriu');
            return el;
          });
          const focused: Element[] = [];
          const track = (e: FocusEvent) => focused.push(e.target as Element);
          document.addEventListener('focusin', track);
          try {
            await user.click(
              within(dialog).getByRole('button', {
                name: t('common.delete'),
                hidden: true,
              }),
            );
            await new Promise((resolve) => setTimeout(resolve, 30));
            finish();
            await waitFor(() => expect(screen.queryByText('Carro')).toBeNull());
            await waitFor(() => expect(document.activeElement).toBe(openOf(/Principal/)));
            await new Promise((resolve) => setTimeout(resolve, 30));
          } finally {
            document.removeEventListener('focusin', track);
          }
          expect(focused.filter((el) => !dialog.contains(el))).toEqual([
            openOf(/Principal/),
          ]);
        } finally {
          restoreModalFocus();
        }
      },
    );
  });

  it('a busca também acha pelo nome da pasta', async () => {
    render(<Home />);
    await userEvent.type(screen.getByRole('searchbox'), 'pasta');
    expect(screen.getByText('Principal')).toBeTruthy();
    expect(screen.queryByText('Carro')).toBeNull();
  });

  it('Abrir chama openRecentFolder no próprio clique', async () => {
    controller.openRecentFolder.mockReturnValue(ok({ kind: 'opened' }));
    render(<Home />);
    const row = screen.getByRole('row', { name: /Principal/ });
    await userEvent.click(within(row).getByRole('button', { name: t('common.open') }));
    expect(controller.openRecentFolder).toHaveBeenCalledWith('f1');
    expect(document.querySelector('dialog')).toBeNull();
  });

  it('pasta indisponível: aviso com Localizar pasta… e Remover da lista', async () => {
    controller.openRecentFolder.mockReturnValue(
      ok({ kind: 'unavailable', reason: 'missing' }),
    );
    controller.relocateFolder.mockReturnValue(ok({ kind: 'no-project' }));
    controller.forgetFolder.mockReturnValue(ok());
    render(<Home />);
    const user = userEvent.setup();
    const row = screen.getByRole('row', { name: /Principal/ });
    await user.click(within(row).getByRole('button', { name: t('common.open') }));
    await screen.findByText(t('home.folderMissing', { folder: 'principal-pasta' }));
    const dialog = document.querySelector('dialog') as HTMLElement;

    // A pasta escolhida não tem mapping.json: o aviso continua, com o motivo.
    await user.click(
      within(dialog).getByRole('button', {
        name: t('home.relocateFolder'),
        hidden: true,
      }),
    );
    expect(controller.relocateFolder).toHaveBeenCalledWith('f1');
    await within(dialog).findByText(t('home.folderNoProject', { name: 'Principal' }));

    await user.click(
      within(dialog).getByRole('button', { name: t('home.forgetFolder'), hidden: true }),
    );
    expect(controller.forgetFolder).toHaveBeenCalledWith('f1');
    await waitFor(() => expect(document.querySelector('dialog')).toBeNull());
  });

  it('permissão negada: o aviso diz que o navegador não deu acesso', async () => {
    controller.openRecentFolder.mockReturnValue(
      ok({ kind: 'unavailable', reason: 'denied' }),
    );
    render(<Home />);
    const row = screen.getByRole('row', { name: /Principal/ });
    await userEvent.click(within(row).getByRole('button', { name: t('common.open') }));
    expect(
      await screen.findByText(t('home.folderDenied', { folder: 'principal-pasta' })),
    ).toBeTruthy();
  });
});

// Etapa 8 (8.3), achado F3: Configurações › Ver atalhos troca o diálogo no mesmo slot; o
// novo guardava o body como "quem abriu" e o Esc não voltava ao botão Configurações.
describe('Home: troca de diálogo (F3)', () => {
  beforeEach(simulateModalFocus);
  afterEach(restoreModalFocus);

  it('Configurações › Ver atalhos › Esc volta ao botão Configurações', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    render(<Home />);
    const user = userEvent.setup();
    const settings = screen.getByRole('button', { name: t('settings.title') });
    await user.click(settings);
    await user.click(
      await screen.findByRole('button', { name: t('settings.shortcuts'), hidden: true }),
    );
    const help = await waitFor(() => {
      const el = document.querySelector('dialog');
      if (!el?.querySelector('.help')) throw new Error('a Ajuda ainda não abriu');
      return el;
    });
    help.dispatchEvent(new Event('cancel', { cancelable: true }));
    await waitFor(() => expect(document.querySelector('dialog')).toBeNull());
    expect(document.activeElement).toBe(settings);
  });
});
