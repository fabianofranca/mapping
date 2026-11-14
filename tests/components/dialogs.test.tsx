import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';
import {
  locale,
  setShowComponentsOnPhotos,
  showComponentsOnPhotos,
  theme,
} from '../../src/store/settings';
import { useRef, useState } from 'preact/hooks';
import { Dialog } from '../../src/ui/Dialog';
import { HELP_PROPOSALS, HELP_SHORTCUTS, HelpDialog } from '../../src/ui/HelpDialog';
import { SettingsDialog } from '../../src/ui/SettingsDialog';

// `window.location` is not redefinable in the `vmThreads` context: the `file:` protocol comes in
// through `guideUrl` itself, which reads `globalThis.location.protocol` only when the caller passes none.
const protocolOverride = vi.hoisted(() => ({ value: null as string | null }));
vi.mock('../../src/utils/guideLink', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/utils/guideLink')>();
  return {
    ...original,
    guideUrl: (protocol?: string) =>
      original.guideUrl(protocol ?? protocolOverride.value ?? undefined),
  };
});

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(() => {
  protocolOverride.value = null;
  cleanup();
  locale.value = 'en-US';
  theme.value = 'system';
  vi.restoreAllMocks();
});

/** The open `<dialog>` (jsdom leaves it out of the accessibility tree). */
const dialogEl = () => document.querySelector('dialog') as HTMLElement;

describe('Dialog', () => {
  // Stage 8 (8.3), F10: only the confirmation (`alert`) is described by the body; in a long
  // dialog (Help) the screen reader would read the whole body on opening.
  it('plain dialog: role dialog, no aria-describedby', () => {
    render(<HelpDialog onClose={() => undefined} />);
    expect(dialogEl().getAttribute('role')).toBeNull();
    expect(dialogEl().hasAttribute('aria-describedby')).toBe(false);
  });

  it('header with title and close, body and footer', async () => {
    const onCancel = vi.fn();
    render(
      <Dialog title="Title" onCancel={onCancel} actions={<button>Action</button>}>
        <p>Content</p>
      </Dialog>,
    );
    const dialog = within(dialogEl());
    expect(dialog.getByRole('heading', { name: 'Title', hidden: true })).toBeTruthy();
    expect(dialogEl().querySelector('.dialog-header')).not.toBeNull();
    expect(dialogEl().querySelector('.dialog-body')?.textContent).toBe('Content');
    expect(dialogEl().querySelector('.dialog-actions')?.textContent).toBe('Action');

    await userEvent.click(
      dialog.getByRole('button', { name: t('dialog.close'), hidden: true }),
    );
    expect(onCancel).toHaveBeenCalledOnce();
  });

  // Return from the 8.4 gate: the trace of Open (`folders.reopen`) records how the notice
  // closed; `onCancel` says where it came from, as an optional parameter.
  it('onCancel receives the origin: cancel (Esc), backdrop and close-button', async () => {
    const onCancel = vi.fn();
    render(
      <Dialog title="Title" onCancel={onCancel} actions={<button>Action</button>}>
        <p>Content</p>
      </Dialog>,
    );
    dialogEl().dispatchEvent(new Event('cancel', { cancelable: true }));
    await userEvent.click(dialogEl());
    await userEvent.click(
      within(dialogEl()).getByRole('button', { name: t('dialog.close'), hidden: true }),
    );
    await userEvent.click(within(dialogEl()).getByText('Content'));
    expect(onCancel.mock.calls).toEqual([['cancel'], ['backdrop'], ['close-button']]);
  });

  // #957: only a whole click on the backdrop closes; a drag that starts on the content does not.
  it('backdrop: pointerdown on the content + click on the <dialog> does not close; pointerdown and click on the <dialog> close', () => {
    const onCancel = vi.fn();
    render(
      <Dialog title="Title" onCancel={onCancel} actions={<button>Action</button>}>
        <p>Content</p>
      </Dialog>,
    );
    const content = within(dialogEl()).getByText('Content');
    fireEvent.pointerDown(content);
    fireEvent.click(dialogEl());
    expect(onCancel).not.toHaveBeenCalled();

    fireEvent.pointerDown(dialogEl());
    fireEvent.click(dialogEl());
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledWith('backdrop');
  });

  // Stage 6 (6.2), finding 9: a mandatory-choice dialog does not show an X that does nothing.
  it('closable={false}: no header close; Esc and the backdrop do nothing', async () => {
    const onClick = vi.fn();
    render(
      <Dialog
        title="Choice"
        closable={false}
        actions={<button onClick={onClick}>Ok</button>}
      >
        <p>Content</p>
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

  it('closable={false}: if the browser closes the <dialog> anyway, it reopens', () => {
    render(<Dialog title="Choice" closable={false} actions={<button>Ok</button>} />);
    const dialog = dialogEl() as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    // jsdom has no `close()`: it removes `open` as the browser would on closing.
    dialog.removeAttribute('open');
    dialog.dispatchEvent(new Event('close'));
    expect(dialog.open).toBe(true);
  });

  it('the header button does not repeat the name of the footer "Close"', () => {
    expect(t('dialog.close')).not.toBe(t('common.close'));
  });

  it('the initial focus goes to the body, or to the footer, and not to the close', () => {
    const { unmount } = render(
      <Dialog title="a" onCancel={vi.fn()} actions={<button>Ok</button>}>
        <input aria-label="field" hidden />
        <input aria-label="name" />
      </Dialog>,
    );
    expect(document.activeElement?.getAttribute('aria-label')).toBe('name');
    unmount();
    render(
      <Dialog title="a" onCancel={vi.fn()} actions={<button>Cancel</button>}>
        <p>Text only</p>
      </Dialog>,
    );
    expect(document.activeElement?.textContent).toBe('Cancel');
  });

  it('sizes: 480px (default), 560px and 820px', () => {
    const { rerender } = render(<Dialog title="a" onCancel={vi.fn()} actions={null} />);
    expect(dialogEl().className).toBe('dialog');
    rerender(<Dialog title="a" size="md" onCancel={vi.fn()} actions={null} />);
    expect(dialogEl().classList.contains('dialog-md')).toBe(true);
    rerender(<Dialog title="a" size="lg" flush onCancel={vi.fn()} actions={null} />);
    expect(dialogEl().classList.contains('dialog-lg')).toBe(true);
    expect(dialogEl().querySelector('.dialog-body-flush')).not.toBeNull();
  });

  // Stage 6 (6.4), finding 4: on closing, the focus returns to whoever opened it (not to `body`).
  function Opener() {
    const [outer, setOuter] = useState(false);
    const [inner, setInner] = useState(false);
    return (
      <>
        <button onClick={() => setOuter(true)}>Open</button>
        {outer && (
          <Dialog
            title="Outer"
            onCancel={() => setOuter(false)}
            actions={<button onClick={() => setInner(true)}>Detail</button>}
          />
        )}
        {inner && (
          <Dialog
            title="Inner"
            onCancel={() => setInner(false)}
            actions={<button onClick={() => setInner(false)}>Ok</button>}
          />
        )}
      </>
    );
  }

  it('on closing, returns the focus to whoever opened it (including dialog over dialog)', async () => {
    const user = userEvent.setup();
    const { getByRole } = render(<Opener />);
    const opener = getByRole('button', { name: 'Open' });
    opener.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(document.activeElement?.textContent).toBe('Detail'));
    const detail = document.activeElement as HTMLElement;
    await user.keyboard('{Enter}');
    await waitFor(() => expect(document.activeElement?.textContent).toBe('Ok'));
    await user.keyboard('{Enter}');
    // The inner one closed: the focus returns to the outer button that opened it.
    await waitFor(() => expect(document.querySelectorAll('dialog')).toHaveLength(1));
    expect(document.activeElement).toBe(detail);
    await user.click(
      within(dialogEl()).getByRole('button', { name: t('dialog.close'), hidden: true }),
    );
    await waitFor(() => expect(document.querySelector('dialog')).toBeNull());
    expect(document.activeElement).toBe(opener);
  });
});

// Stage 7 (7.1), finding A1: whoever opened it left the DOM on closing (menu item, removed row…).
describe('Dialog: focus when whoever opened it no longer exists', () => {
  /** "Open" vanishes on confirming with "Ok", like a row deleted by the dialog itself. */
  function Vanishing({ explicit }: { readonly explicit: boolean }) {
    const [open, setOpen] = useState(false);
    const [gone, setGone] = useState(false);
    const target = useRef<HTMLButtonElement>(null);
    return (
      <div>
        <button ref={target}>Target</button>
        <div>
          {!gone && <button onClick={() => setOpen(true)}>Open</button>}
          <button>Neighbor</button>
        </div>
        {open && (
          <Dialog
            title="Confirm"
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
      (b) => b.textContent === 'Open',
    );
    if (!opener) throw new Error('no Open button');
    opener.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(document.activeElement?.textContent).toBe('Ok'));
    await user.keyboard('{Enter}');
    await waitFor(() => expect(document.querySelector('dialog')).toBeNull());
  }

  it('goes to the explicit return target, and not to the body', async () => {
    render(<Vanishing explicit />);
    await openAndConfirm();
    expect(document.activeElement?.textContent).toBe('Target');
  });

  it('with no explicit target, goes to the nearest container of whoever opened it', async () => {
    render(<Vanishing explicit={false} />);
    await openAndConfirm();
    expect(document.activeElement?.textContent).toBe('Neighbor');
  });

  /** Opened without a button (shortcut with the focus on the body): there is no opener nor container. */
  function Orphan() {
    const [open, setOpen] = useState(true);
    return (
      <div data-focus-root>
        <button>First</button>
        {open && (
          <Dialog
            title="Shortcut"
            onCancel={() => setOpen(false)}
            actions={<button onClick={() => setOpen(false)}>Ok</button>}
          />
        )}
      </div>
    );
  }

  it('with no opener nor container, goes to the first control of the app (data-focus-root), and not to the body', async () => {
    (document.activeElement as HTMLElement | null)?.blur();
    render(<Orphan />);
    await waitFor(() => expect(document.activeElement?.textContent).toBe('Ok'));
    dialogEl().dispatchEvent(new Event('cancel', { cancelable: true }));
    await waitFor(() => expect(document.querySelector('dialog')).toBeNull());
    expect(document.activeElement?.textContent).toBe('First');
  });

  /** Inside a tool window: when the opener vanishes, the focus goes to the window. */
  function InWindow({ withWindow }: { readonly withWindow: boolean }) {
    const [open, setOpen] = useState(false);
    const [gone, setGone] = useState(false);
    const inner = (
      <div>
        {!gone && <button onClick={() => setOpen(true)}>Open</button>}
        <button>Neighbor</button>
      </div>
    );
    return (
      <div data-focus-root>
        <button>First</button>
        {withWindow ? (
          <section data-window="details" tabIndex={-1} aria-label="Details">
            {inner}
          </section>
        ) : (
          inner
        )}
        {open && (
          <Dialog
            title="Confirm"
            onCancel={() => setOpen(false)}
            returnFocus={() => null}
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

  it('with an explicit target that vanished and an opener in a tool window, goes to the window', async () => {
    render(<InWindow withWindow />);
    await openAndConfirm();
    expect(document.activeElement).toBe(
      document.querySelector('section[data-window="details"]'),
    );
  });

  it('with an explicit target that vanished and no window around, goes to the first control of the app', async () => {
    render(<InWindow withWindow={false} />);
    await openAndConfirm();
    expect(document.activeElement?.textContent).toBe('First');
  });

  it('the opener is still in the DOM: the focus returns to it (the explicit target is the fallback)', async () => {
    const user = userEvent.setup();
    render(<Vanishing explicit />);
    const opener = [...document.querySelectorAll('button')].find(
      (b) => b.textContent === 'Open',
    ) as HTMLElement;
    opener.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(document.activeElement?.textContent).toBe('Ok'));
    // Esc (jsdom does not fire `cancel` by itself).
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

  it('the interactive guide is the first section, with the link in another tab', () => {
    render(<HelpDialog onClose={vi.fn()} />);
    const links = within(toc()).getAllByRole('link', { hidden: true });
    expect(links[0]?.textContent).toBe(t('help.guide.title'));
    const section = document.getElementById('help-guide') as HTMLElement;
    const open = within(section).getByRole('link', {
      name: t('help.guide.open'),
      hidden: true,
    });
    expect(open.getAttribute('href')).toBe('guia/index.html');
    expect(open.getAttribute('target')).toBe('_blank');
    expect(open.getAttribute('rel')).toContain('noopener');
    expect(within(section).getByText(t('help.guide.example'))).toBeTruthy();
  });

  it('on file:// the guide section shows the notice in place of the link', () => {
    protocolOverride.value = 'file:';
    try {
      render(<HelpDialog onClose={vi.fn()} />);
      const section = document.getElementById('help-guide') as HTMLElement;
      expect(within(section).getByText(t('help.guide.fileProtocol'))).toBeTruthy();
      expect(
        within(section).queryByRole('link', { name: t('help.guide.open'), hidden: true }),
      ).toBeNull();
      expect(within(section).getByText(t('help.guide.example'))).toBeTruthy();
    } finally {
      protocolOverride.value = null;
    }
  });

  it('side index with the sections, the downloads and the shortcuts', () => {
    render(<HelpDialog onClose={vi.fn()} />);
    const links = within(toc())
      .getAllByRole('link', { hidden: true })
      .map((a) => a.textContent);
    expect(links).toContain(t('help.specs.downloads'));
    expect(links.at(-1)).toBe(t('help.shortcuts.title'));
    expect(links.length).toBeGreaterThan(5);
  });

  it('tapping an index item scrolls to the section', async () => {
    render(<HelpDialog onClose={vi.fn()} />);
    await userEvent.click(
      within(toc()).getByRole('link', { name: t('help.shortcuts.title'), hidden: true }),
    );
    const scroll = vi.mocked(Element.prototype.scrollIntoView);
    expect(scroll).toHaveBeenCalledOnce();
    expect(scroll.mock.contexts[0]).toBe(document.getElementById('help-shortcuts'));
  });

  it('opens straight on the requested section', () => {
    render(<HelpDialog onClose={vi.fn()} section={HELP_SHORTCUTS} />);
    const scroll = vi.mocked(Element.prototype.scrollIntoView);
    expect(scroll.mock.contexts.at(-1)).toBe(document.getElementById('help-shortcuts'));
  });

  it('Proposals section: opens straight on it and has the review shortcuts in Shortcuts', () => {
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

  it('Shortcuts section: shows Ctrl+Shift+1 for the Tree and F1', () => {
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

  // pt-BR kept: the search is accent-insensitive and the query is Portuguese text
  it('search filters the sections and ignores accents (pt-BR)', async () => {
    locale.value = 'pt-BR';
    render(<HelpDialog onClose={vi.fn()} />);
    await userEvent.type(
      within(dialogEl()).getByRole('searchbox', { name: t('help.search'), hidden: true }),
      'atalhos',
    );
    const links = within(toc()).getAllByRole('link', { hidden: true });
    expect(links.map((a) => a.textContent)).toEqual([t('help.shortcuts.title')]);
    expect(document.getElementById('help-downloads')).toBeNull();
  });

  it('find by the key text', async () => {
    render(<HelpDialog onClose={vi.fn()} />);
    await userEvent.type(
      within(dialogEl()).getByRole('searchbox', { hidden: true }),
      'ctrl shift 1',
    );
    expect(document.getElementById('help-shortcuts')).not.toBeNull();
  });

  it('no result says what was searched', async () => {
    render(<HelpDialog onClose={vi.fn()} />);
    await userEvent.type(
      within(dialogEl()).getByRole('searchbox', { hidden: true }),
      'zzzxyz',
    );
    expect(
      within(dialogEl()).getByText(t('help.noResults', { query: 'zzzxyz' })),
    ).toBeTruthy();
  });

  // pt-BR kept: the test checks that the dialog follows the language
  it('follows the language (pt-BR)', () => {
    locale.value = 'pt-BR';
    render(<HelpDialog onClose={vi.fn()} />);
    expect(
      within(toc()).getByRole('link', { name: 'Atalhos de teclado', hidden: true }),
    ).toBeTruthy();
  });
});

describe('SettingsDialog', () => {
  it('segmented theme: choosing changes the theme', async () => {
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

  it('language switches immediately', async () => {
    render(<SettingsDialog onClose={vi.fn()} onShowShortcuts={vi.fn()} />);
    await userEvent.selectOptions(
      within(dialogEl()).getByLabelText(t('settings.language'), { selector: 'select' }),
      'en-US',
    );
    expect(locale.value).toBe('en-US');
  });

  // B3/P7: the per-person option, next to the semantic zoom.
  it('Show components on photos: turns on, turns off and saves', async () => {
    localStorage.clear();
    setShowComponentsOnPhotos(false);
    render(<SettingsDialog onClose={vi.fn()} onShowShortcuts={vi.fn()} />);
    const box = within(dialogEl()).getByRole<HTMLInputElement>('checkbox', {
      name: new RegExp(t('view.componentsOnPhotos')),
      hidden: true,
    });
    expect(box.checked).toBe(false);
    await userEvent.click(box);
    expect(showComponentsOnPhotos.value).toBe(true);
    expect(box.checked).toBe(true);
    expect(localStorage.getItem('mapping.showComponentsOnPhotos')).toBe('on');
    await userEvent.click(box);
    expect(showComponentsOnPhotos.value).toBe(false);
  });

  it('link to the shortcuts', async () => {
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
