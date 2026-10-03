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

afterEach(cleanup);

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
