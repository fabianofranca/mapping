import { cleanup, render, screen, waitFor, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';
import { clearReportedErrors, reportedErrors } from '../../src/utils/report';

const controller = vi.hoisted(() => ({
  createFolderProject: vi.fn(),
  createLocalProject: vi.fn(),
  deleteLocalProject: vi.fn(),
  forgetFolder: vi.fn(),
  importZip: vi.fn(),
  openFolder: vi.fn(),
  openLibraryPackage: vi.fn(),
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
import { ProjectNoticeBanner } from '../../src/ui/ProjectNoticeBanner';
import { projectNotice } from '../../src/store/banners';
import { signal } from '@preact/signals';

const features = app.features as unknown as { value: unknown };
const recentProjects = app.recentProjects as unknown as { value: unknown[] };

/** A row's Open button: the visible text followed by the project name (NE1). */
const OPEN_NAMED = new RegExp(`^${t('common.open')} `);
const DELETE_NAMED = new RegExp(`^${t('common.delete')} `);
const FORGET_NAMED = new RegExp(`^${t('home.forgetFolder')}: `);
const ok = (value?: unknown) => Promise.resolve({ ok: true, value });
const fail = (error: string) => Promise.resolve({ ok: false, error });

beforeEach(() => {
  for (const fn of Object.values(controller)) fn.mockReset();
  features.value = { folder: true, local: true, fileProtocol: false };
  recentProjects.value = [
    {
      kind: 'local',
      id: 'p1',
      name: 'Car',
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
  it('before detecting the features it shows "loading"', () => {
    features.value = null;
    render(<Home />);
    expect(screen.getByText(t('app.loading'))).toBeTruthy();
  });

  it('with no feature at all it warns that the browser is not supported', () => {
    features.value = { folder: false, local: false, fileProtocol: false };
    render(<Home />);
    expect(screen.getByText(t('home.unsupported'))).toBeTruthy();
    expect(screen.queryByText(t('home.newProject'))).toBeNull();
  });

  it('on file:// it warns about storage', () => {
    features.value = { folder: false, local: true, fileProtocol: true };
    render(<Home />);
    expect(screen.getByText(t('home.fileProtocolWarning'))).toBeTruthy();
  });

  it('lists the local projects with the not-exported indicator', () => {
    render(<Home />);
    expect(screen.getByText('Car')).toBeTruthy();
    expect(screen.getByText(t('status.unexported'))).toBeTruthy();
  });

  it('with no local projects it shows the empty text', () => {
    recentProjects.value = [];
    render(<Home />);
    expect(screen.getByText(t('home.noRecentProjects'))).toBeTruthy();
  });

  it('create project: asks for the name and calls the controller', async () => {
    controller.createLocalProject.mockReturnValue(ok());
    render(<Home />);
    const user = userEvent.setup();
    await user.click(screen.getByText(t('home.newProject')));
    await user.type(await screen.findByLabelText(t('project.name')), 'New');
    await user.click(screen.getByRole('button', { name: t('common.create') }));
    await waitFor(() =>
      expect(controller.createLocalProject).toHaveBeenCalledWith('New'),
    );
  });

  // Stage 8 (8.3), F9: the name field focused itself on mount, besides the dialog's initial focus
  // (the first control of the body): two owners of the same focus.
  it('New project focuses the name only once', async () => {
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

  // Stage 8 (8.3), F10: the destructive confirmation is an alertdialog, described by the body.
  it('Delete is an alertdialog described by the body', async () => {
    render(<Home />);
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: t('home.deleteNamed', { name: 'Car' }) }),
    );
    await screen.findByText(t('home.deleteMessage', { name: 'Car' }));
    const dialog = document.querySelector('dialog') as HTMLElement;
    expect(dialog.getAttribute('role')).toBe('alertdialog');
    const body = document.getElementById(dialog.getAttribute('aria-describedby') ?? '');
    expect(body?.textContent).toContain(t('home.deleteMessage', { name: 'Car' }));
  });

  it('open local project; error appears translated', async () => {
    controller.openLocalProject.mockReturnValue(fail('not-found'));
    render(<Home />);
    await userEvent.click(
      screen.getByRole('button', { name: t('home.openNamed', { name: 'Car' }) }),
    );
    expect((await screen.findByRole('alert')).textContent).toBe(t('error.not-found'));
    expect(controller.openLocalProject).toHaveBeenCalledWith('p1');
  });

  it('delete asks for confirmation', async () => {
    controller.deleteLocalProject.mockReturnValue(ok());
    render(<Home />);
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: t('home.deleteNamed', { name: 'Car' }) }),
    );
    expect(controller.deleteLocalProject).not.toHaveBeenCalled();
    await screen.findByText(t('home.deleteMessage', { name: 'Car' }));
    const dialog = document.querySelector('dialog') as HTMLElement;
    await user.click(
      within(dialog).getByRole('button', { name: t('common.delete'), hidden: true }),
    );
    await waitFor(() => expect(controller.deleteLocalProject).toHaveBeenCalledWith('p1'));
  });

  it('open folder without mapping.json asks for the name and creates the project', async () => {
    const handle = { name: 'my-folder' };
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

  it('folder that gained a project: the notice survives leaving the home screen (opens the editor)', async () => {
    const handle = { name: 'my-folder' };
    const editorOpen = signal(false);
    controller.openFolder.mockReturnValue(
      ok({ kind: 'needs-setup', handle, images: [] }),
    );
    controller.createFolderProject.mockImplementation(() => {
      editorOpen.value = true; // the home screen is unmounted, as in the App
      return ok({ skipped: [], existing: true });
    });
    projectNotice.value = null;
    function Shell() {
      return (
        <>
          <ProjectNoticeBanner />
          {editorOpen.value ? <p>editor</p> : <Home />}
        </>
      );
    }
    render(<Shell />);
    const user = userEvent.setup();
    await user.click(screen.getByText(t('home.openFolder')));
    await user.click(await screen.findByRole('button', { name: t('common.create') }));
    await screen.findByText('editor');
    expect((await screen.findByRole('status')).textContent).toContain(
      t('home.folderHasProject'),
    );
    await user.click(screen.getByRole('button', { name: t('editor.dismiss') }));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('open zip calls importZip with the chosen file', async () => {
    controller.importZip.mockReturnValue(ok());
    const { container } = render(<Home />);
    const file = new File(['z'], 'p.zip', { type: 'application/zip' });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);
    await waitFor(() => expect(controller.importZip).toHaveBeenCalledWith(file));
  });
});

describe('Home (B10)', () => {
  it('side column with Projects, Help and Settings', async () => {
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

  it('side column has the Interactive guide link, in another tab and without referrer', () => {
    render(<Home />);
    const side = screen.getByRole('complementary', { name: t('home.sideLabel') });
    const link = within(side).getByRole('link', { name: t('home.guide') });
    expect(link.getAttribute('href')).toBe('guia/index.html');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('Settings → shortcuts opens Help at the Shortcuts section', async () => {
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

  it('recents table with origin and date, and Open on the row', async () => {
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
    const row = within(table).getByRole('row', { name: /Car/ });
    expect(within(row).getByText(t('status.targetLocal'))).toBeTruthy();
    expect(within(row).getByText(t('status.unexported'))).toBeTruthy();
    await userEvent.click(within(row).getByRole('button', { name: OPEN_NAMED }));
    expect(controller.openLocalProject).toHaveBeenCalledWith('p1');
  });

  // pt-BR kept: the object of the test is accent- and case-insensitive search of Portuguese text
  it('search filters the projects (accent- and case-insensitive)', async () => {
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
    expect(screen.queryByText('Car')).toBeNull();
    expect(screen.getByText('Avião')).toBeTruthy();
    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'zzz');
    expect(screen.getByText(t('home.noResults', { query: 'zzz' }))).toBeTruthy();
  });

  it('without projects it shows neither search nor table', () => {
    recentProjects.value = [];
    render(<Home />);
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('with the folder available, it recommends the folder format for those who use git', () => {
    render(<Home />);
    expect(screen.getByText(t('home.gitHint'))).toBeTruthy();
    expect(screen.getByText(t('home.gitHint')).textContent).toContain('.gitignore');
    expect(screen.queryByText(t('home.folderUnavailable'))).toBeNull();
  });

  it('without folder support, it shows the reason in place of the recommendation', () => {
    features.value = { folder: false, local: true, fileProtocol: false };
    render(<Home />);
    expect(screen.queryByText(t('home.gitHint'))).toBeNull();
  });

  it('disabled Open folder states the reason on screen', () => {
    features.value = { folder: false, local: true, fileProtocol: false };
    render(<Home />);
    expect(
      screen.getByRole('button', { name: t('home.openFolder') }).hasAttribute('disabled'),
    ).toBe(true);
    expect(screen.getByText(t('home.folderUnavailable'))).toBeTruthy();
  });
});

describe('Home: folder recents (phase 6.6)', () => {
  const folder = {
    kind: 'folder',
    id: 'f1',
    name: 'Main',
    folderName: 'main-folder',
    showFolderName: true,
    usedAt: '2026-10-01T10:00:00.000Z',
  };

  beforeEach(() => {
    recentProjects.value = [folder, ...recentProjects.value];
  });

  it('folder in the same list, with the Folder badge, the folder name and Remove from list', async () => {
    controller.forgetFolder.mockReturnValue(ok());
    render(<Home />);
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.map((r) => r.querySelector('.project-name')?.textContent)).toEqual([
      'Main',
      'Car',
    ]);
    const row = rows[0] as HTMLElement;
    expect(within(row).getByText(t('status.targetFolder'))).toBeTruthy();
    expect(within(row).getByText('main-folder')).toBeTruthy();
    expect(within(row).queryByRole('button', { name: DELETE_NAMED })).toBeNull();
    await userEvent.click(within(row).getByRole('button', { name: FORGET_NAMED }));
    expect(controller.forgetFolder).toHaveBeenCalledWith('f1');
  });

  // NE1 (#538, item 2): rows with the same name are told apart by the name and the description of the buttons.
  it('two "Shop" rows (local and folder) have buttons with the project name and different descriptions', async () => {
    controller.openLocalProject.mockReturnValue(ok());
    controller.forgetFolder.mockReturnValue(ok());
    recentProjects.value = [
      {
        kind: 'folder',
        id: 'f9',
        name: 'Shop',
        folderName: 'shop',
        showFolderName: true,
        usedAt: '2026-09-21T10:00:00.000Z',
      },
      {
        kind: 'local',
        id: 'p9',
        name: 'Shop',
        usedAt: '2026-09-20T18:30:00.000Z',
        unexported: false,
      },
    ];
    render(<Home />);
    const [folderRow, localRow] = within(screen.getByRole('table'))
      .getAllByRole('row')
      .slice(1) as [HTMLElement, HTMLElement];
    const open = (row: HTMLElement) =>
      within(row).getByRole('button', { name: t('home.openNamed', { name: 'Shop' }) });
    const description = (button: HTMLElement) =>
      (button.getAttribute('aria-describedby') ?? '')
        .split(' ')
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' ');
    expect(
      within(folderRow).getByRole('button', {
        name: t('home.forgetNamed', { name: 'Shop' }),
      }),
    ).toBeTruthy();
    expect(
      within(localRow).getByRole('button', {
        name: t('home.deleteNamed', { name: 'Shop' }),
      }),
    ).toBeTruthy();
    const folderText = description(open(folderRow));
    const localText = description(open(localRow));
    expect(folderText).toContain(t('status.targetFolder'));
    expect(folderText).toContain('shop');
    expect(localText).toContain(t('status.targetLocal'));
    expect(localText).not.toBe(folderText);
    // The three buttons of the row point to the same description, and the ids are unique across rows.
    const forget = within(folderRow).getByRole('button', {
      name: t('home.forgetNamed', { name: 'Shop' }),
    });
    expect(description(forget)).toBe(folderText);
    const ids = [...document.querySelectorAll('[aria-describedby]')]
      .flatMap((el) => (el.getAttribute('aria-describedby') ?? '').split(' '))
      .filter((id) => id !== '');
    for (const id of ids) {
      expect(document.querySelectorAll(`[id="${id}"]`)).toHaveLength(1);
      expect(id).toMatch(/^[A-Za-z][\w-]*$/);
    }
    await userEvent.click(open(localRow));
    expect(controller.openLocalProject).toHaveBeenCalledWith('p9');
  });

  // TE1 (#1151): same name, same origin and same minute, different seconds: the description carries
  // the time with seconds; the visible cell goes only down to the minute.
  it('two Local rows with the same name and minute have different descriptions (seconds)', () => {
    const twin = (id: string, usedAt: string) => ({
      kind: 'local' as const,
      id,
      name: 'Draft',
      usedAt,
      unexported: false,
    });
    recentProjects.value = [
      twin('t1', '2026-10-01T10:00:05.000Z'),
      twin('t2', '2026-10-01T10:00:40.000Z'),
    ];
    render(<Home />);
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    const description = (row: HTMLElement) =>
      (within(row).getAllByRole('button')[0]?.getAttribute('aria-describedby') ?? '')
        .split(' ')
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' ');
    const [a, b] = rows as [HTMLElement, HTMLElement];
    expect(description(a)).not.toBe(description(b));
    const visible = (row: HTMLElement) =>
      row.querySelectorAll('td')[1]?.firstChild?.textContent;
    expect(visible(a)).toBe(visible(b));
    expect(visible(a)).not.toMatch(/\d:\d\d:\d\d/);
  });

  // Stage 8 (8.4), R7: two folders with the same name (of the project and of the folder) show the
  // folder name on both rows; the list decides (`showFolderName`), the table just obeys. With both
  // names equal, the rows remain equal (`['shop', 'shop']` on both): that is the limit of R7,
  // because the browser does not give the folder path; the Last used column tells them apart
  // (`docs/ARCHITECTURE.md`, recents; 8.7).
  it('repeated name: both rows show the folder name', () => {
    const twin = (id: string, usedAt: string) => ({
      kind: 'folder',
      id,
      name: 'shop',
      folderName: 'shop',
      showFolderName: true,
      usedAt,
    });
    recentProjects.value = [
      twin('l1', '2026-10-02T10:00:00.000Z'),
      twin('l2', '2026-10-01T10:00:00.000Z'),
      { ...folder, id: 'f2', showFolderName: false },
    ];
    render(<Home />);
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    const names = rows.map((r) =>
      [...r.querySelectorAll('.project-name')].map((n) => n.textContent),
    );
    expect(names).toEqual([['shop', 'shop'], ['shop', 'shop'], ['Main']]);
  });

  // Stage 7 (7.1), G4 regression: the row leaves the list and the focus used to fall on the body.
  describe('focus after Remove from list', () => {
    /** `forgetFolder` takes the folder off the list, as the controller does. */
    const forgetting = () =>
      controller.forgetFolder.mockImplementation((id: string) => {
        recentProjects.value = recentProjects.value.filter(
          (p) => (p as { id: string }).id !== id,
        );
        return ok();
      });
    const openOf = (name: RegExp) =>
      within(screen.getByRole('row', { name })).getByRole('button', {
        name: OPEN_NAMED,
      });

    it('goes to the Open of the next row', async () => {
      forgetting();
      render(<Home />);
      const row = screen.getByRole('row', { name: /Main/ });
      await userEvent.click(within(row).getByRole('button', { name: FORGET_NAMED }));
      await waitFor(() => expect(screen.queryByText('Main')).toBeNull());
      await waitFor(() => expect(document.activeElement).toBe(openOf(/Car/)));
    });

    it('on the last row, goes to the Open of the previous one', async () => {
      forgetting();
      recentProjects.value = [...recentProjects.value].reverse();
      render(<Home />);
      const row = screen.getByRole('row', { name: /Main/ });
      await userEvent.click(within(row).getByRole('button', { name: FORGET_NAMED }));
      await waitFor(() => expect(screen.queryByText('Main')).toBeNull());
      await waitFor(() => expect(document.activeElement).toBe(openOf(/Car/)));
    });

    it('with no rows, goes to the list title', async () => {
      forgetting();
      recentProjects.value = [folder];
      render(<Home />);
      await userEvent.click(screen.getByRole('button', { name: FORGET_NAMED }));
      await waitFor(() => expect(screen.queryByText('Main')).toBeNull());
      await waitFor(() =>
        expect(document.activeElement).toBe(
          screen.getByRole('heading', { name: t('home.recentProjects') }),
        ),
      );
    });

    // Stage 8 (8.3), F1/F2: the two through the dialog run 20 times per round (`repeats`).
    it('Deleting a project of this device does the same', { repeats: 19 }, async () => {
      controller.deleteLocalProject.mockImplementation((id: string) => {
        recentProjects.value = recentProjects.value.filter(
          (p) => (p as { id: string }).id !== id,
        );
        return ok();
      });
      render(<Home />);
      const user = userEvent.setup();
      const row = screen.getByRole('row', { name: /Car/ });
      await user.click(within(row).getByRole('button', { name: DELETE_NAMED }));
      const dialog = document.querySelector('dialog') as HTMLElement;
      await user.click(
        within(dialog).getByRole('button', { name: t('common.delete'), hidden: true }),
      );
      await waitFor(() => expect(screen.queryByText('Car')).toBeNull());
      await waitFor(() => expect(document.activeElement).toBe(openOf(/Main/)));
    });

    it('through the "Folder unavailable" notice too', { repeats: 19 }, async () => {
      forgetting();
      controller.openRecentFolder.mockReturnValue(
        ok({ kind: 'unavailable', reason: 'missing' }),
      );
      render(<Home />);
      const user = userEvent.setup();
      const row = screen.getByRole('row', { name: /Main/ });
      await user.click(within(row).getByRole('button', { name: OPEN_NAMED }));
      await screen.findByText(t('home.folderMissing', { folder: 'main-folder' }));
      const dialog = document.querySelector('dialog') as HTMLElement;
      await user.click(
        within(dialog).getByRole('button', {
          name: t('home.forgetFolder'),
          hidden: true,
        }),
      );
      await waitFor(() => expect(document.querySelector('dialog')).toBeNull());
      await waitFor(() => expect(screen.queryByText('Main')).toBeNull());
      await waitFor(() => expect(document.activeElement).toBe(openOf(/Car/)));
    });

    // Stage AC2: closing the notice without removing returns the focus to the Open of the row of origin,
    // not to the first row's.
    describe.each([
      [
        'Esc',
        async () => {
          // jsdom does not translate the key into `cancel`: it dispatches the event the browser sends.
          document
            .querySelector('dialog')
            ?.dispatchEvent(new Event('cancel', { cancelable: true }));
        },
      ],
      [
        'Cancel',
        async (u: ReturnType<typeof userEvent.setup>) =>
          u.click(
            within(document.querySelector('dialog') as HTMLElement).getByRole('button', {
              name: t('common.cancel'),
              hidden: true,
            }),
          ),
      ],
    ])('closing "Folder unavailable" with %s', (_name, close) => {
      it('returns the focus to the Open of the row that is not the first', async () => {
        recentProjects.value = [...recentProjects.value.slice(1), folder];
        // In the browser, Open is disabled while the folder opens and loses focus
        // (jsdom does not do that): when the notice opens, whoever opened it is already the `body`.
        controller.openRecentFolder.mockImplementation(async () => {
          (document.activeElement as HTMLElement | null)?.blur();
          return ok({ kind: 'unavailable', reason: 'missing' });
        });
        render(<Home />);
        const user = userEvent.setup();
        const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
        expect(rows[rows.length - 1]?.textContent).toContain('Main');
        await user.click(openOf(/Main/));
        await screen.findByText(t('home.folderMissing', { folder: 'main-folder' }));
        await close(user);
        await waitFor(() => expect(document.querySelector('dialog')).toBeNull());
        await waitFor(() => expect(document.activeElement).toBe(openOf(/Main/)));
      });
    });

    // Stage 8 (8.3), finding F2: with the deletion still in progress, the dialog's return put the
    // focus on a container (the search) and then the Home's `refocusRow` took it to the row: two
    // owners. Now the dialog closes after the action and the focus goes straight to the row that remained.
    it(
      'Deleting through the dialog takes the focus straight to the row that remained (one owner only)',
      { repeats: 19 },
      async () => {
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
        const row = screen.getByRole('row', { name: /Car/ });
        await user.click(within(row).getByRole('button', { name: DELETE_NAMED }));
        const dialog = await waitFor(() => {
          const el = document.querySelector('dialog');
          if (!el?.contains(document.activeElement)) throw new Error('did not open');
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
          await waitFor(() => expect(screen.queryByText('Car')).toBeNull());
          await waitFor(() => expect(document.activeElement).toBe(openOf(/Main/)));
          await new Promise((resolve) => setTimeout(resolve, 30));
        } finally {
          document.removeEventListener('focusin', track);
        }
        expect(focused.filter((el) => !dialog.contains(el))).toEqual([openOf(/Main/)]);
      },
    );
  });

  it('the search also finds by the folder name', async () => {
    render(<Home />);
    await userEvent.type(screen.getByRole('searchbox'), 'folder');
    expect(screen.getByText('Main')).toBeTruthy();
    expect(screen.queryByText('Car')).toBeNull();
  });

  it('Open calls openRecentFolder on the click itself', async () => {
    controller.openRecentFolder.mockReturnValue(ok({ kind: 'opened' }));
    render(<Home />);
    const row = screen.getByRole('row', { name: /Main/ });
    await userEvent.click(within(row).getByRole('button', { name: OPEN_NAMED }));
    // With the Open trace (return of the 8.4 gate), which goes along on the same click.
    expect(controller.openRecentFolder).toHaveBeenCalledWith(
      'f1',
      expect.objectContaining({ step: expect.any(Function) }),
    );
    expect(document.querySelector('dialog')).toBeNull();
  });

  it('unavailable folder: notice with Locate folder… and Remove from list', async () => {
    controller.openRecentFolder.mockReturnValue(
      ok({ kind: 'unavailable', reason: 'missing' }),
    );
    controller.relocateFolder.mockReturnValue(ok({ kind: 'no-project' }));
    controller.forgetFolder.mockReturnValue(ok());
    render(<Home />);
    const user = userEvent.setup();
    const row = screen.getByRole('row', { name: /Main/ });
    await user.click(within(row).getByRole('button', { name: OPEN_NAMED }));
    await screen.findByText(t('home.folderMissing', { folder: 'main-folder' }));
    const dialog = document.querySelector('dialog') as HTMLElement;

    // The chosen folder has no mapping.json: the notice stays, with the reason.
    await user.click(
      within(dialog).getByRole('button', {
        name: t('home.relocateFolder'),
        hidden: true,
      }),
    );
    expect(controller.relocateFolder).toHaveBeenCalledWith('f1');
    await within(dialog).findByText(t('home.folderNoProject', { name: 'Main' }));

    await user.click(
      within(dialog).getByRole('button', { name: t('home.forgetFolder'), hidden: true }),
    );
    expect(controller.forgetFolder).toHaveBeenCalledWith('f1');
    await waitFor(() => expect(document.querySelector('dialog')).toBeNull());
  });

  it('permission denied: the notice says the browser did not grant access', async () => {
    controller.openRecentFolder.mockReturnValue(
      ok({ kind: 'unavailable', reason: 'denied' }),
    );
    render(<Home />);
    const row = screen.getByRole('row', { name: /Main/ });
    await userEvent.click(within(row).getByRole('button', { name: OPEN_NAMED }));
    expect(
      await screen.findByText(t('home.folderDenied', { folder: 'main-folder' })),
    ).toBeTruthy();
  });
});

// Stage 8 (8.3), finding F3: Settings › View shortcuts swaps the dialog in the same slot; the
// new one kept the body as "who opened" and Esc did not return to the Settings button.
describe('Home: dialog swap (F3)', () => {
  it('Settings › View shortcuts › Esc returns to the Settings button', async () => {
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
      if (!el?.querySelector('.help')) throw new Error('Help has not opened yet');
      return el;
    });
    help.dispatchEvent(new Event('cancel', { cancelable: true }));
    await waitFor(() => expect(document.querySelector('dialog')).toBeNull());
    expect(document.activeElement).toBe(settings);
  });
});

// Return of the 8.4 gate (finding 1): folder renamed after the permission request. The
// Open carries a trace to `openRecentFolder` (the mocked controller writes to it as the real one does)
// and the Home records in the Diagnostics what it did with the result and how the notice closed.
describe('Home: trace of the folder Open (folders.reopen)', () => {
  const folder = {
    kind: 'folder',
    id: 'f1',
    name: 'Main',
    folderName: 'main-folder',
    showFolderName: true,
    usedAt: '2026-10-01T10:00:00.000Z',
  };
  type Steps = { step(label: string): void } | undefined;
  const lines = () =>
    reportedErrors.value
      .filter((e) => e.context === 'folders.reopen')
      .map((e) => e.message);
  /** The mocked controller: writes the steps to the trace and returns the result. */
  const answers = (steps: readonly string[], result: Promise<unknown>) =>
    controller.openRecentFolder.mockImplementation((_id: string, trace: Steps) => {
      for (const s of steps) trace?.step(s);
      return result;
    });
  const PROMPTED = ['handle=idb', 'query=prompt', 'request=granted', 'branch=no-mapping'];
  const missing = () => ok({ kind: 'unavailable', reason: 'missing' });

  const openAndWaitDialog = async () => {
    const user = userEvent.setup();
    const row = screen.getByRole('row', { name: /Main/ });
    await user.click(within(row).getByRole('button', { name: OPEN_NAMED }));
    await screen.findByText(t('home.folderMissing', { folder: 'main-folder' }));
    return { user, dialog: document.querySelector('dialog') as HTMLDialogElement };
  };

  beforeEach(() => {
    clearReportedErrors();
    recentProjects.value = [folder, ...recentProjects.value];
  });

  it('the reported case records the path, the notice on screen and the closing by Cancel', async () => {
    answers(PROMPTED, missing());
    render(<Home />);
    const { user, dialog } = await openAndWaitDialog();
    expect(controller.openRecentFolder).toHaveBeenCalledWith(
      'f1',
      expect.objectContaining({ step: expect.any(Function) }),
    );
    await waitFor(() => expect(lines()).toHaveLength(1));
    expect(lines()[0]).toMatch(
      /^handle=idb@\d+ query=prompt@\d+ request=granted@\d+ branch=no-mapping@\d+ home=dialog:missing@\d+ shown=open,/,
    );
    await user.click(
      within(dialog).getByRole('button', { name: t('common.cancel'), hidden: true }),
    );
    await waitFor(() => expect(lines()).toHaveLength(2));
    expect(lines()[1]).toMatch(/^notice closed: cancel-button after \d+ms$/);
  });

  it('Esc and the click on the backdrop record the origin of the closing', async () => {
    answers(PROMPTED, missing());
    render(<Home />);
    const first = await openAndWaitDialog();
    first.dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    await waitFor(() => expect(lines()[1]).toMatch(/^notice closed: cancel after/));
    const second = await openAndWaitDialog();
    await second.user.click(second.dialog);
    await waitFor(() => expect(lines()[3]).toMatch(/^notice closed: backdrop after/));
  });

  it('Remove from list through the notice records forget', async () => {
    answers(PROMPTED, missing());
    controller.forgetFolder.mockReturnValue(ok());
    render(<Home />);
    const { user, dialog } = await openAndWaitDialog();
    await user.click(
      within(dialog).getByRole('button', { name: t('home.forgetFolder'), hidden: true }),
    );
    await waitFor(() => expect(lines()[1]).toMatch(/^notice closed: forget after/));
  });

  it('notice without a request (the path that works) does not record', async () => {
    answers(['handle=memory', 'query=granted', 'branch=no-mapping'], missing());
    render(<Home />);
    const { user, dialog } = await openAndWaitDialog();
    await user.click(
      within(dialog).getByRole('button', { name: t('common.cancel'), hidden: true }),
    );
    await waitFor(() => expect(document.querySelector('dialog')).toBeNull());
    expect(lines()).toEqual([]);
  });

  it('Open that opens the project, even with a request, does not record', async () => {
    answers(
      ['handle=idb', 'query=prompt', 'request=granted', 'branch=opened'],
      ok({ kind: 'opened' }),
    );
    render(<Home />);
    const row = screen.getByRole('row', { name: /Main/ });
    await userEvent.click(within(row).getByRole('button', { name: OPEN_NAMED }));
    await waitFor(() => expect(controller.openRecentFolder).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(lines()).toEqual([]);
  });

  it('error shown as a message records the code', async () => {
    answers(['handle=memory', 'query=granted'], fail('storage-failed'));
    render(<Home />);
    const row = screen.getByRole('row', { name: /Main/ });
    await userEvent.click(within(row).getByRole('button', { name: OPEN_NAMED }));
    await screen.findByText(t('error.storage-failed'));
    expect(lines()).toHaveLength(1);
    expect(lines()[0]).toContain('home=message:storage-failed');
  });
});

describe('Home: Abrir biblioteca (B5)', () => {
  const openButton = () => screen.getByRole('button', { name: t('catalog.home.open') });
  const zipField = () => {
    const input = document.querySelector<HTMLInputElement>('input[data-library-zip]');
    if (!input) throw new Error('no library zip input');
    return input;
  };

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'showDirectoryPicker');
  });

  it('with showDirectoryPicker it opens the folder, without a project', async () => {
    Object.defineProperty(globalThis, 'showDirectoryPicker', {
      value: vi.fn(),
      configurable: true,
      writable: true,
    });
    controller.openLibraryPackage.mockResolvedValue({ kind: 'opened' });
    render(<Home />);
    await userEvent.click(openButton());
    await waitFor(() =>
      expect(controller.openLibraryPackage).toHaveBeenCalledWith({ kind: 'folder' }),
    );
    expect(controller.openFolder).not.toHaveBeenCalled();
  });

  it('without showDirectoryPicker it picks the package zip', async () => {
    controller.openLibraryPackage.mockResolvedValue({ kind: 'opened' });
    render(<Home />);
    const click = vi.spyOn(zipField(), 'click');
    await userEvent.click(openButton());
    expect(click).toHaveBeenCalledOnce();
    expect(controller.openLibraryPackage).not.toHaveBeenCalled();

    const file = new File(['x'], 'package.zip', { type: 'application/zip' });
    await userEvent.upload(zipField(), file);
    await waitFor(() =>
      expect(controller.openLibraryPackage).toHaveBeenCalledWith({ kind: 'zip', file }),
    );
  });

  it('cancelling the picker shows no message', async () => {
    Object.defineProperty(globalThis, 'showDirectoryPicker', {
      value: vi.fn(),
      configurable: true,
      writable: true,
    });
    controller.openLibraryPackage.mockResolvedValue({ kind: 'cancelled' });
    render(<Home />);
    await userEvent.click(openButton());
    await waitFor(() => expect(controller.openLibraryPackage).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each([
    ['too-big', t('spec.packageTooBig', { files: 500, mb: 64 })],
    ['empty', t('spec.packageEmpty')],
    ['unreadable', t('spec.packageReadFailed')],
  ] as const)(
    'package that could not be read (%s) warns on screen',
    async (reason, text) => {
      Object.defineProperty(globalThis, 'showDirectoryPicker', {
        value: vi.fn(),
        configurable: true,
        writable: true,
      });
      controller.openLibraryPackage.mockResolvedValue({ kind: 'failed', reason });
      render(<Home />);
      await userEvent.click(openButton());
      expect((await screen.findByRole('alert')).textContent).toBe(text);
    },
  );
});
