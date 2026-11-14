import { signal, type Signal } from '@preact/signals';
import { cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasNotices } from '../../src/app/CanvasNotices';
import { EditorDialogs } from '../../src/app/EditorDialogs';
import type { EditorDialogs as Dialogs } from '../../src/app/useEditorDialogs';
import type { EditorNotices } from '../../src/app/useEditorNotices';
import {
  EXTERNAL_POLL_FACTOR,
  EXTERNAL_POLL_MAX_MS,
  EXTERNAL_POLL_MS,
  useExternalChanges,
} from '../../src/app/useExternalChanges';
import { t } from '../../src/i18n';
import { serialize } from '../../src/model';
import { AUTOSAVE_DELAY_MS } from '../../src/storage/autosave';
import { createFolderStorage } from '../../src/storage/folder';
import { createDisplayImages } from '../../src/store/displayImages';
import {
  openSession,
  type ExternalConflict,
  type ProjectSession,
} from '../../src/store/session';
import { locale } from '../../src/store/settings';
import { EditorContext, createEditorContextValue } from '../../src/ui/EditorContext';
import { createHarness, type Harness } from '../components/harness';
import { sampleProject } from '../model/fixtures';
import { MemoryDirectory } from '../storage/memoryFs';

// Stage 3a.2: the "Project changed outside the app" dialog, the "Project updated
// externally" notice and the periodic check of mapping.json.

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** The session `conflict` is read-only for the interface; the test writes it. */
const conflictOf = (h: Harness) =>
  h.context.session.conflict as unknown as Signal<ExternalConflict | null>;
const reloadsOf = (h: Harness) => h.context.session.reloads as unknown as Signal<number>;

function renderDialogs(harness: Harness) {
  const dialogs = {
    current: null,
    show: vi.fn(),
    close: vi.fn(),
    requestDeleteImage: vi.fn(),
    requestDeleteMarking: vi.fn(),
  } as unknown as Dialogs;
  return render(
    <EditorContext.Provider value={harness.context}>
      <EditorDialogs dialogs={dialogs} />
    </EditorContext.Provider>,
  );
}

const dialogEl = () => document.querySelector('dialog') as HTMLElement | null;

describe('"Project changed outside the app" dialog', () => {
  it('does not show without a conflict', () => {
    renderDialogs(createHarness(sampleProject()));
    expect(dialogEl()).toBeNull();
  });

  it('shows with the conflict, with Reload and Keep mine', async () => {
    const harness = createHarness(sampleProject());
    renderDialogs(harness);
    conflictOf(harness).value = { reloadFailed: false };
    await vi.waitFor(() => expect(dialogEl()).not.toBeNull());
    const dialog = within(dialogEl()!);
    expect(
      dialog.getByRole('heading', { name: t('external.title'), hidden: true }),
    ).toBeTruthy();
    expect(
      dialog.getByRole('button', { name: t('external.reload'), hidden: true }),
    ).toBeTruthy();
    expect(
      dialog.getByRole('button', { name: t('external.keep'), hidden: true }),
    ).toBeTruthy();
    expect(dialog.queryByRole('alert', { hidden: true })).toBeNull();
  });

  it('each button decides the conflict in the session', async () => {
    const harness = createHarness(sampleProject());
    const resolve = vi
      .spyOn(harness.context.session, 'resolveConflict')
      .mockResolvedValue(undefined);
    renderDialogs(harness);
    conflictOf(harness).value = { reloadFailed: false };
    await vi.waitFor(() => expect(dialogEl()).not.toBeNull());
    const dialog = within(dialogEl()!);

    await userEvent.click(
      dialog.getByRole('button', { name: t('external.reload'), hidden: true }),
    );
    expect(resolve).toHaveBeenLastCalledWith('reload');
    await userEvent.click(
      dialog.getByRole('button', { name: t('external.keep'), hidden: true }),
    );
    expect(resolve).toHaveBeenLastCalledWith('keep');
  });

  // Stage 6 (6.2), finding 9: the X showed up and did nothing. The choice is mandatory, so
  // the dialog has no close button; Esc and clicking the backdrop do not decide either.
  it('no X: Esc and clicking the backdrop do not decide for anyone', async () => {
    const harness = createHarness(sampleProject());
    const resolve = vi.spyOn(harness.context.session, 'resolveConflict');
    renderDialogs(harness);
    conflictOf(harness).value = { reloadFailed: false };
    await vi.waitFor(() => expect(dialogEl()).not.toBeNull());
    expect(
      within(dialogEl()!).queryByRole('button', {
        name: t('dialog.close'),
        hidden: true,
      }),
    ).toBeNull();
    expect(within(dialogEl()!).getAllByRole('button', { hidden: true })).toHaveLength(2);
    const esc = new Event('cancel', { cancelable: true });
    dialogEl()!.dispatchEvent(esc);
    expect(esc.defaultPrevented).toBe(true);
    await userEvent.click(dialogEl()!);
    expect(resolve).not.toHaveBeenCalled();
    expect(conflictOf(harness).value).not.toBeNull();
    expect(dialogEl()).not.toBeNull();
  });

  it('warns when reloading failed', async () => {
    const harness = createHarness(sampleProject());
    renderDialogs(harness);
    conflictOf(harness).value = { reloadFailed: true };
    await vi.waitFor(() => expect(dialogEl()).not.toBeNull());
    expect(within(dialogEl()!).getByRole('alert', { hidden: true }).textContent).toBe(
      t('external.reloadFailed'),
    );
  });

  it('disappears when the conflict is resolved', async () => {
    const harness = createHarness(sampleProject());
    renderDialogs(harness);
    conflictOf(harness).value = { reloadFailed: false };
    await vi.waitFor(() => expect(dialogEl()).not.toBeNull());
    conflictOf(harness).value = null;
    await vi.waitFor(() => expect(dialogEl()).toBeNull());
  });
});

describe('notices over the canvas', () => {
  const notices: EditorNotices = {
    progress: null,
    message: null,
    busy: false,
    setProgress: () => undefined,
    setMessage: () => undefined,
  };

  function renderNotices(harness: Harness) {
    return render(
      <EditorContext.Provider value={harness.context}>
        <CanvasNotices notices={notices} />
      </EditorContext.Provider>,
    );
  }

  it('shows the short UI notice (e.g. "Reference copied")', async () => {
    const harness = createHarness(sampleProject());
    renderNotices(harness);
    expect(screen.queryByRole('status')).toBeNull();
    harness.ui.toast.value = t('copy.referenceDone');
    expect((await screen.findByRole('status')).textContent).toBe(t('copy.referenceDone'));
    harness.ui.toast.value = null;
    await vi.waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('the save error disappears while the conflict dialog explains the reason', async () => {
    const harness = createHarness(sampleProject());
    const status = harness.context.session.saveStatus as unknown as Signal<string>;
    renderNotices(harness);
    status.value = 'error';
    expect(await screen.findByRole('alert')).toBeTruthy();
    conflictOf(harness).value = { reloadFailed: false };
    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});

describe('useExternalChanges', () => {
  function Probe({ interval }: { readonly interval?: number }) {
    useExternalChanges(interval);
    return null;
  }

  function mount(harness: Harness, interval?: number) {
    return render(
      <EditorContext.Provider value={harness.context}>
        <Probe interval={interval} />
      </EditorContext.Provider>,
    );
  }

  const setVisibility = (state: 'visible' | 'hidden') =>
    Object.defineProperty(document, 'visibilityState', {
      value: state,
      configurable: true,
    });

  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility('visible');
  });
  afterEach(() => Reflect.deleteProperty(document, 'visibilityState'));

  it('checks mapping.json every 3 s with the window visible (without looking at the images)', async () => {
    const harness = createHarness(sampleProject());
    const sync = vi.spyOn(harness.context.session, 'sync').mockResolvedValue('unchanged');
    mount(harness);
    expect(sync).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(EXTERNAL_POLL_MS);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenLastCalledWith({ images: false });
    await vi.advanceTimersByTimeAsync(EXTERNAL_POLL_MS * 2);
    expect(sync).toHaveBeenCalledTimes(3);
  });

  // Stage #1777 (decision 8): the next cycle starts `clamp(4 × duration, 3 s, 30 s)` after the
  // last one ends, never with work in progress, and focus checks right away.
  describe('adaptive check (stage #1777)', () => {
    /** A `sync` that takes `ms` to finish (fake clock). */
    const takes = (ms: number) => () =>
      new Promise<'unchanged'>((resolve) => setTimeout(() => resolve('unchanged'), ms));

    it('exports the limits: minimum of 3 s, ceiling of 30 s, factor 4', () => {
      expect(EXTERNAL_POLL_MS).toBe(3000);
      expect(EXTERNAL_POLL_MAX_MS).toBe(30_000);
      expect(EXTERNAL_POLL_FACTOR).toBe(4);
    });

    it('in a fast folder, the cycles keep running every 3 s', async () => {
      const harness = createHarness(sampleProject());
      const sync = vi
        .spyOn(harness.context.session, 'sync')
        .mockImplementation(takes(50));
      mount(harness);
      await vi.advanceTimersByTimeAsync(EXTERNAL_POLL_MS - 1);
      expect(sync).toHaveBeenCalledTimes(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(sync).toHaveBeenCalledTimes(1);
      // The cycle ended 50 ms later: the next one starts 3 s after the end (4 × 50 ms < 3 s).
      await vi.advanceTimersByTimeAsync(50 + EXTERNAL_POLL_MS - 1);
      expect(sync).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(sync).toHaveBeenCalledTimes(2);
    });

    it('with a 2 s cycle, the next one starts 8 s after the end', async () => {
      const harness = createHarness(sampleProject());
      const sync = vi
        .spyOn(harness.context.session, 'sync')
        .mockImplementation(takes(2000));
      mount(harness);
      await vi.advanceTimersByTimeAsync(EXTERNAL_POLL_MS); // cycle 1 starts
      expect(sync).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(2000); // ends
      await vi.advanceTimersByTimeAsync(8000 - 1);
      expect(sync).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(sync).toHaveBeenCalledTimes(2);
    });

    it('with a 10 s cycle, the next one waits for the 30 s ceiling', async () => {
      const harness = createHarness(sampleProject());
      const sync = vi
        .spyOn(harness.context.session, 'sync')
        .mockImplementation(takes(10_000));
      mount(harness);
      await vi.advanceTimersByTimeAsync(EXTERNAL_POLL_MS);
      await vi.advanceTimersByTimeAsync(10_000);
      await vi.advanceTimersByTimeAsync(EXTERNAL_POLL_MAX_MS - 1);
      expect(sync).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(sync).toHaveBeenCalledTimes(2);
    });

    it('a fast cycle after a slow one goes back to 3 s', async () => {
      const harness = createHarness(sampleProject());
      const sync = vi
        .spyOn(harness.context.session, 'sync')
        .mockImplementationOnce(takes(2000))
        .mockImplementation(takes(0));
      mount(harness);
      await vi.advanceTimersByTimeAsync(EXTERNAL_POLL_MS + 2000 + 8000); // cycle 2 starts
      expect(sync).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1); // cycle 2 (almost instantaneous) ends
      await vi.advanceTimersByTimeAsync(EXTERNAL_POLL_MS - 1);
      expect(sync).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(sync).toHaveBeenCalledTimes(3);
    });

    it('with a save in progress, the cycle is postponed every 3 s and runs afterwards', async () => {
      const harness = createHarness(sampleProject());
      const sync = vi
        .spyOn(harness.context.session, 'sync')
        .mockResolvedValue('unchanged');
      const busy = vi.spyOn(harness.context.session, 'busy').mockReturnValue(true);
      mount(harness);
      await vi.advanceTimersByTimeAsync(EXTERNAL_POLL_MS * 3);
      expect(sync).not.toHaveBeenCalled();
      busy.mockReturnValue(false);
      await vi.advanceTimersByTimeAsync(EXTERNAL_POLL_MS);
      expect(sync).toHaveBeenCalledTimes(1);
      expect(sync).toHaveBeenLastCalledWith({ images: false });
    });

    it('focus checks right away, with the images, even with work in progress', async () => {
      const harness = createHarness(sampleProject());
      const sync = vi
        .spyOn(harness.context.session, 'sync')
        .mockResolvedValue('unchanged');
      vi.spyOn(harness.context.session, 'busy').mockReturnValue(true);
      mount(harness);
      window.dispatchEvent(new Event('focus'));
      expect(sync).toHaveBeenCalledTimes(1);
      expect(sync).toHaveBeenLastCalledWith({ images: true });
    });

    it('an error in the cycle does not stop the chain', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const harness = createHarness(sampleProject());
      const sync = vi
        .spyOn(harness.context.session, 'sync')
        .mockRejectedValueOnce(new Error('no permission'))
        .mockResolvedValue('unchanged');
      mount(harness);
      await vi.advanceTimersByTimeAsync(EXTERNAL_POLL_MS * 2);
      expect(sync).toHaveBeenCalledTimes(2);
    });

    it('unmounting during a cycle does not schedule the next one', async () => {
      const harness = createHarness(sampleProject());
      const sync = vi
        .spyOn(harness.context.session, 'sync')
        .mockImplementation(takes(1000));
      const view = mount(harness);
      await vi.advanceTimersByTimeAsync(EXTERNAL_POLL_MS);
      expect(sync).toHaveBeenCalledTimes(1);
      view.unmount();
      await vi.advanceTimersByTimeAsync(EXTERNAL_POLL_MAX_MS * 2);
      expect(sync).toHaveBeenCalledTimes(1);
    });
  });

  it('with the window hidden, it does not check', async () => {
    const harness = createHarness(sampleProject());
    const sync = vi.spyOn(harness.context.session, 'sync').mockResolvedValue('unchanged');
    mount(harness);
    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(EXTERNAL_POLL_MS * 3);
    window.dispatchEvent(new Event('focus'));
    expect(sync).not.toHaveBeenCalled();
  });

  it('when focus returns, it checks right away, including the image files', () => {
    const harness = createHarness(sampleProject());
    const sync = vi.spyOn(harness.context.session, 'sync').mockResolvedValue('unchanged');
    mount(harness);
    window.dispatchEvent(new Event('focus'));
    expect(sync).toHaveBeenLastCalledWith({ images: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it('reloaded: warns "Project updated from outside" and the notice disappears on its own', async () => {
    const harness = createHarness(sampleProject());
    vi.spyOn(harness.context.session, 'sync')
      .mockResolvedValueOnce('reloaded')
      .mockResolvedValue('unchanged');
    mount(harness);
    await vi.advanceTimersByTimeAsync(EXTERNAL_POLL_MS);
    expect(harness.ui.toast.value).toBe(t('editor.externalUpdated'));
    await vi.advanceTimersByTimeAsync(5000);
    expect(harness.ui.toast.value).toBeNull();
  });

  it('without a reload (nothing changed, or there are pending items), it does not warn', async () => {
    const harness = createHarness(sampleProject());
    const sync = vi.spyOn(harness.context.session, 'sync').mockResolvedValue('busy');
    mount(harness);
    await vi.advanceTimersByTimeAsync(EXTERNAL_POLL_MS);
    expect(sync).toHaveBeenCalled();
    expect(harness.ui.toast.value).toBeNull();
  });

  it('an error in the check goes to Diagnostics and the check continues', async () => {
    const harness = createHarness(sampleProject());
    const sync = vi
      .spyOn(harness.context.session, 'sync')
      .mockRejectedValueOnce(new Error('no permission'))
      .mockResolvedValue('unchanged');
    mount(harness);
    await vi.advanceTimersByTimeAsync(EXTERNAL_POLL_MS * 2);
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it('a project outside a folder (not watchable) checks nothing', async () => {
    const harness = createHarness(sampleProject());
    Object.defineProperty(harness.context.session, 'watchable', { value: false });
    const sync = vi.spyOn(harness.context.session, 'sync');
    mount(harness);
    await vi.advanceTimersByTimeAsync(EXTERNAL_POLL_MS * 2);
    window.dispatchEvent(new Event('focus'));
    expect(sync).not.toHaveBeenCalled();
  });

  it('on unmount, it stops checking', async () => {
    const harness = createHarness(sampleProject());
    const sync = vi.spyOn(harness.context.session, 'sync').mockResolvedValue('unchanged');
    const view = mount(harness);
    view.unmount();
    await vi.advanceTimersByTimeAsync(EXTERNAL_POLL_MS * 2);
    window.dispatchEvent(new Event('focus'));
    expect(sync).not.toHaveBeenCalled();
  });

  it('after a reload, the selection that no longer exists is cleared; the one that exists stays', async () => {
    const harness = createHarness(sampleProject());
    mount(harness);
    harness.ui.selection.value = { kind: 'marking', id: 'M2' };
    reloadsOf(harness).value++;
    expect(harness.ui.selection.value).toEqual({ kind: 'marking', id: 'M2' });

    harness.ui.selection.value = { kind: 'marking', id: 'gone' };
    reloadsOf(harness).value++;
    expect(harness.ui.selection.value).toBeNull();
  });

  // Stage 6 (6.2), finding 8 (R6.10): with the save in error (locked file), the change
  // made externally opens the dialog on the next check, without waiting for "Try again".
  describe('with the save in error (phase 6.2)', () => {
    function lockedFolder() {
      const root = new MemoryDirectory('shop');
      const project = sampleProject();
      const text = serialize(project);
      root.put('mapping.json', text);
      const session = openSession({
        storage: createFolderStorage(root, { copyId: 'external' }),
        project,
        loadedText: text,
        prepareImage: () => Promise.reject(new Error('no images here')),
        now: () => '2026-10-11T12:00:00.000Z',
      });
      const context = createEditorContextValue({
        kind: 'folder',
        session,
        display: createDisplayImages<ImageBitmap>(() => Promise.resolve(null)),
        localId: null,
        unexported: signal(false),
      });
      const view = render(
        <EditorContext.Provider value={context}>
          <Probe />
          <EditorDialogs
            dialogs={
              {
                current: null,
                show: vi.fn(),
                close: vi.fn(),
                requestDeleteImage: vi.fn(),
                requestDeleteMarking: vi.fn(),
              } as unknown as Dialogs
            }
          />
        </EditorContext.Provider>,
      );
      return { root, project, session, view };
    }

    /** R6.9 and R6.10: edit in the app with the file locked, then an external edit. */
    async function failedThenExternal(root: MemoryDirectory, session: ProjectSession) {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      root.failWrites = new Error('NoModificationAllowedError');
      session.actions.renameProject('App title');
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
      expect(session.saveStatus.value).toBe('error');
      const external = serialize({
        ...sampleProject(),
        revision: 1,
        project: { ...sampleProject().project, name: 'External footer' },
      });
      root.put('mapping.json', external);
      return external;
    }

    it('the dialog opens within one check cycle', async () => {
      const { root, session, view } = lockedFolder();
      await failedThenExternal(root, session);
      expect(dialogEl()).toBeNull();
      await vi.advanceTimersByTimeAsync(EXTERNAL_POLL_MS);
      await vi.waitFor(() => expect(dialogEl()).not.toBeNull());
      expect(
        within(dialogEl()!).getByRole('heading', {
          name: t('external.title'),
          hidden: true,
        }),
      ).toBeTruthy();
      expect(session.store.project.value?.project.name).toBe('App title');
      view.unmount();
      await session.close();
    });

    it('Reload from that state reads the outside file', async () => {
      const { root, session, view } = lockedFolder();
      const external = await failedThenExternal(root, session);
      await vi.advanceTimersByTimeAsync(EXTERNAL_POLL_MS);
      await vi.waitFor(() => expect(dialogEl()).not.toBeNull());
      within(dialogEl()!)
        .getByRole('button', { name: t('external.reload'), hidden: true })
        .click();
      await vi.waitFor(() => expect(dialogEl()).toBeNull());
      expect(session.store.project.value?.project.name).toBe('External footer');
      expect(session.saveStatus.value).toBe('saved');
      expect(await root.read('mapping.json')).toBe(external);
      view.unmount();
      await session.close();
    });

    it('Keep mine from that state writes over it once permission is given back', async () => {
      const { root, session, view } = lockedFolder();
      await failedThenExternal(root, session);
      await vi.advanceTimersByTimeAsync(EXTERNAL_POLL_MS);
      await vi.waitFor(() => expect(dialogEl()).not.toBeNull());
      root.failWrites = null;
      within(dialogEl()!)
        .getByRole('button', { name: t('external.keep'), hidden: true })
        .click();
      await vi.waitFor(() => expect(dialogEl()).toBeNull());
      await vi.waitFor(() => expect(session.saveStatus.value).toBe('saved'));
      const saved = await root.read('mapping.json');
      expect(saved).toContain('App title');
      expect(saved).not.toContain('External footer');
      view.unmount();
      await session.close();
    });
  });

  it('hidden layers stay as they were', () => {
    const harness = createHarness(sampleProject());
    mount(harness);
    harness.ui.hiddenLayers.value = new Set(['L2']);
    reloadsOf(harness).value++;
    expect([...harness.ui.hiddenLayers.value]).toEqual(['L2']);
  });
});
