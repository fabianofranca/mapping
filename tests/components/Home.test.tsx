import { cleanup, render, screen, waitFor, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';

const controller = vi.hoisted(() => ({
  createFolderProject: vi.fn(),
  createLocalProject: vi.fn(),
  deleteLocalProject: vi.fn(),
  importZip: vi.fn(),
  openFolder: vi.fn(),
  openLocalProject: vi.fn(),
}));

vi.mock('../../src/app/controller', async () => {
  const { signal } = await import('@preact/signals');
  return {
    ...controller,
    features: signal<unknown>(null),
    localProjects: signal<unknown[]>([]),
  };
});

import * as app from '../../src/app/controller';
import { Home } from '../../src/app/Home';

const features = app.features as unknown as { value: unknown };
const localProjects = app.localProjects as unknown as { value: unknown[] };

const ok = (value?: unknown) => Promise.resolve({ ok: true, value });
const fail = (error: string) => Promise.resolve({ ok: false, error });

beforeEach(() => {
  for (const fn of Object.values(controller)) fn.mockReset();
  features.value = { folder: true, local: true, fileProtocol: false };
  localProjects.value = [
    {
      id: 'p1',
      name: 'Carro',
      updatedAt: '2026-09-20T18:30:00.000Z',
      unexported: true,
    },
  ];
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** O jsdom não tem `matchMedia`: sem ele a tela inicial é a do celular. */
function stubDesktop(): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('min-width'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

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
    localProjects.value = [];
    render(<Home />);
    expect(screen.getByText(t('home.noLocalProjects'))).toBeTruthy();
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

describe('Home no desktop (B10)', () => {
  beforeEach(stubDesktop);

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
      t('home.colUpdated'),
    ]);
    const row = within(table).getByRole('row', { name: /Carro/ });
    expect(within(row).getByText(t('status.targetLocal'))).toBeTruthy();
    expect(within(row).getByText(t('status.unexported'))).toBeTruthy();
    await userEvent.click(within(row).getByRole('button', { name: t('common.open') }));
    expect(controller.openLocalProject).toHaveBeenCalledWith('p1');
  });

  it('busca filtra os projetos (sem acento nem maiúsculas)', async () => {
    localProjects.value = [
      ...localProjects.value,
      {
        id: 'p2',
        name: 'Avião',
        updatedAt: '2026-09-21T10:00:00.000Z',
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
    localProjects.value = [];
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

describe('Home no celular (B10)', () => {
  it('três botões grandes, com Abrir pasta desabilitado e o motivo', () => {
    features.value = { folder: false, local: true, fileProtocol: false };
    render(<Home />);
    const cards = [...document.querySelectorAll<HTMLButtonElement>('.action-card')];
    expect(cards).toHaveLength(3);
    const folder = screen.getByRole('button', { name: new RegExp(t('home.openFolder')) });
    expect(folder.hasAttribute('disabled')).toBe(true);
    expect(folder.textContent).toContain(t('home.folderUnavailable'));
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('button', { name: t('help.open') })).toBeTruthy();
    expect(screen.getByRole('button', { name: t('settings.title') })).toBeTruthy();
  });

  it('com a pasta disponível, o texto sobre git aparece também no celular', () => {
    render(<Home />);
    expect(screen.getByText(t('home.gitHint'))).toBeTruthy();
  });

  it('com a pasta disponível o botão abre normalmente', () => {
    render(<Home />);
    const folder = screen.getByRole('button', { name: new RegExp(t('home.openFolder')) });
    expect(folder.hasAttribute('disabled')).toBe(false);
    expect(folder.textContent).toContain(t('home.openFolderHint'));
  });
});
