import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { modalOpen } from '../../src/ui/focus';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signal } from '@preact/signals';
import { useState } from 'preact/hooks';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import type { CanvasController } from '../../src/canvas/CanvasController';
import { hideToolWindow, isToolWindowOpen } from '../../src/store/toolWindows';
import { EditorContext } from '../../src/ui/EditorContext';
import { sampleProject } from '../model/fixtures';
import { createHarness } from './harness';
import type { EditorDialogs } from '../../src/app/useEditorDialogs';
import type { EditorNotices } from '../../src/app/useEditorNotices';

const controller = vi.hoisted(() => ({
  buildExport: vi.fn(),
  closeProject: vi.fn(),
  markExported: vi.fn(),
}));

vi.mock('../../src/app/controller', async () => {
  const { signal } = await import('@preact/signals');
  return { ...controller, openProject: signal(null) };
});

import { CanvasNotices } from '../../src/app/CanvasNotices';
import { Breadcrumbs } from '../../src/ui/Breadcrumbs';
import { EditorDialogs as EditorDialogsView } from '../../src/app/EditorDialogs';
import { useEditorDialogs } from '../../src/app/useEditorDialogs';
import { EditorMainBar } from '../../src/app/EditorMainBar';
import { ErrorBoundary } from '../../src/app/ErrorBoundary';
import { ExportDialog } from '../../src/app/ExportDialog';
import { useEditorNotices } from '../../src/app/useEditorNotices';
import { useEditorShortcuts } from '../../src/app/useEditorShortcuts';
import {
  useProjectCommands,
  type ProjectCommands,
} from '../../src/app/useProjectCommands';

beforeEach(() => {
  locale.value = 'en-US';
  for (const fn of Object.values(controller)) fn.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function fakeDialogs(): EditorDialogs {
  return {
    current: null,
    slot: null,
    exportButton: { current: null },
    show: vi.fn(),
    close: vi.fn(),
    requestDeleteImage: vi.fn(),
    requestDeleteMarking: vi.fn(),
    requestDeleteArrow: vi.fn(),
    requestDeleteItems: vi.fn(),
  };
}

function fakeCommands(): ProjectCommands {
  return { exportProject: vi.fn(), closeProject: vi.fn() } as unknown as ProjectCommands;
}

function fakeNotices(over: Partial<EditorNotices> = {}): EditorNotices {
  return {
    progress: null,
    message: null,
    busy: false,
    setProgress: vi.fn(),
    setMessage: vi.fn(),
    ...over,
  };
}

function withContext(
  harness: ReturnType<typeof createHarness>,
  ui: preact.ComponentChildren,
) {
  return render(
    <EditorContext.Provider value={harness.context}>{ui}</EditorContext.Provider>,
  );
}

describe('useEditorNotices', () => {
  it('busy follows the progress', () => {
    const ref: { current: EditorNotices | null } = { current: null };
    function Probe() {
      ref.current = useEditorNotices();
      return <output>{`${ref.current.busy}:${ref.current.message}`}</output>;
    }
    render(<Probe />);
    expect(screen.getByRole('status').textContent).toBe('false:null');
    act(() => ref.current?.setProgress('x'));
    expect(screen.getByRole('status').textContent).toBe('true:null');
    act(() => ref.current?.setMessage('error'));
    expect(screen.getByRole('status').textContent).toBe('true:error');
  });
});

describe('useProjectCommands', () => {
  function setup() {
    const harness = createHarness(sampleProject());
    const dialogs = fakeDialogs();
    const notices = fakeNotices();
    let commands: ProjectCommands | null = null;
    function Probe() {
      commands = useProjectCommands(dialogs, notices);
      return null;
    }
    withContext(harness, <Probe />);
    return {
      harness,
      dialogs,
      notices,
      commands: () => {
        if (!commands) throw new Error('hook not mounted');
        return commands;
      },
    };
  }

  it('exporting successfully opens the dialog with the file', async () => {
    const s = setup();
    const file = new File(['z'], 'p.zip');
    controller.buildExport.mockResolvedValue({
      ok: true,
      value: { file, missingImages: [], saved: true },
    });
    await s.commands().exportProject();
    expect(s.notices.setProgress).toHaveBeenNthCalledWith(1, t('editor.exporting'));
    expect(s.notices.setProgress).toHaveBeenLastCalledWith(null);
    expect(s.dialogs.show).toHaveBeenCalledWith({ kind: 'export', file, saved: true });
    expect(s.notices.setMessage).toHaveBeenLastCalledWith(null);
  });

  it('exporting with missing images opens the dialog and warns which ones are missing', async () => {
    const s = setup();
    const file = new File(['z'], 'p.zip');
    controller.buildExport.mockResolvedValue({
      ok: true,
      value: { file, missingImages: ['images/a.jpg', 'images/b.png'], saved: true },
    });
    await s.commands().exportProject();
    expect(s.dialogs.show).toHaveBeenCalledWith({ kind: 'export', file, saved: true });
    expect(s.notices.setMessage).toHaveBeenLastCalledWith(
      t('editor.exportMissingImages', {
        count: 2,
        files: 'images/a.jpg, images/b.png',
      }),
    );
  });

  // Stage 8 (8.7), residue 1 (S8): the zip with the save in error carries the committed state,
  // which the storage does not have yet; the dialog receives `saved` to warn.
  it('exporting with the save in error passes saved: false to the dialog', async () => {
    const s = setup();
    const file = new File(['z'], 'p.zip');
    controller.buildExport.mockResolvedValue({
      ok: true,
      value: { file, missingImages: [], saved: false },
    });
    await s.commands().exportProject();
    expect(s.dialogs.show).toHaveBeenCalledWith({ kind: 'export', file, saved: false });
  });

  it('exporting with an error shows the translated message', async () => {
    const s = setup();
    controller.buildExport.mockResolvedValue({ ok: false, error: 'storage-failed' });
    await s.commands().exportProject();
    expect(s.notices.setMessage).toHaveBeenLastCalledWith(t('error.storage-failed'));
    expect(s.dialogs.show).not.toHaveBeenCalled();
  });

  it('closing saves and closes the project', async () => {
    const s = setup();
    const flush = vi
      .spyOn(s.harness.context.session, 'flush')
      .mockResolvedValue({ ok: true });
    await s.commands().closeProject();
    expect(flush).toHaveBeenCalledOnce();
    expect(controller.closeProject).toHaveBeenCalledOnce();
    expect(s.dialogs.show).not.toHaveBeenCalled();
  });

  it('closing with the save in error asks for confirmation and does not close', async () => {
    const s = setup();
    vi.spyOn(s.harness.context.session, 'flush').mockResolvedValue({ ok: true });
    Object.defineProperty(s.harness.context.session, 'saveStatus', {
      value: signal('error'),
    });
    await s.commands().closeProject();
    expect(s.dialogs.show).toHaveBeenCalledWith({ kind: 'confirmClose' });
    expect(controller.closeProject).not.toHaveBeenCalled();
  });
});

describe('useEditorShortcuts', () => {
  function setup(readOnly = false) {
    const harness = createHarness(sampleProject(), readOnly);
    const dialogs = fakeDialogs();
    const cancelInteraction = vi.fn(() => false);
    harness.context.canvas.current = { cancelInteraction } as unknown as CanvasController;
    const commands: ProjectCommands = {
      exportProject: vi.fn(),
      closeProject: vi.fn(),
    };
    function Probe() {
      useEditorShortcuts(dialogs, commands);
      return null;
    }
    withContext(harness, <Probe />);
    return { harness, dialogs, cancelInteraction, commands };
  }

  it('Ctrl+Z undoes and Ctrl+Shift+Z redoes', () => {
    const { harness } = setup();
    harness.actions.renameProject('New');
    expect(harness.project().project.name).toBe('New');
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(harness.project().project.name).not.toBe('New');
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(harness.project().project.name).toBe('New');
  });

  it('Esc cancels the gesture; without a gesture, clears the selection', () => {
    const { harness, cancelInteraction } = setup();
    harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    cancelInteraction.mockReturnValueOnce(true);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(harness.ui.selection.value).not.toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(harness.ui.selection.value).toBeNull();
  });

  it('Delete asks to delete the selected marking or image', () => {
    const { harness, dialogs } = setup();
    harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    fireEvent.keyDown(window, { key: 'Delete' });
    expect(dialogs.requestDeleteMarking).toHaveBeenCalledOnce();
    harness.ui.selection.value = { kind: 'image', id: 'I1' };
    fireEvent.keyDown(window, { key: 'Delete' });
    expect(dialogs.requestDeleteImage).toHaveBeenCalledOnce();
  });

  it('Ctrl+L opens and focuses the Layers window on the desktop', async () => {
    const { dialogs } = setup();
    hideToolWindow('layers');
    expect(isToolWindowOpen('layers')).toBe(false);
    fireEvent.keyDown(window, { key: 'l', ctrlKey: true });
    expect(isToolWindowOpen('layers')).toBe(true);
    expect(dialogs.show).not.toHaveBeenCalled();
  });

  it('read-only does not delete', () => {
    const { harness, dialogs } = setup(true);
    harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    fireEvent.keyDown(window, { key: 'Delete' });
    expect(dialogs.requestDeleteMarking).not.toHaveBeenCalled();
  });

  it('ignores keys in text fields and with a dialog open', () => {
    const { harness, dialogs } = setup();
    harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    const input = document.createElement('input');
    document.body.append(input);
    fireEvent.keyDown(input, { key: 'Delete' });
    input.remove();
    // Stage 8 (8.3), F4: an open modal counts in `modalOpen` (instead of `dialog[open]`).
    modalOpen.value += 1;
    fireEvent.keyDown(window, { key: 'Delete' });
    modalOpen.value -= 1;
    fireEvent.keyDown(window, { key: 'a' });
    expect(dialogs.requestDeleteMarking).not.toHaveBeenCalled();
  });
});

describe('CanvasNotices', () => {
  it('shows message, progress and drawing hint; the message can be dismissed', async () => {
    const harness = createHarness(sampleProject());
    harness.ui.mode.value = 'draw';
    const notices = fakeNotices({ message: 'Went wrong', progress: 'Importing' });
    withContext(harness, <CanvasNotices notices={notices} />);
    expect(screen.getByRole('alert').textContent).toContain('Went wrong');
    expect(screen.getByText('Importing')).toBeTruthy();
    // The Draw hint lives in the canvas bar (Breadcrumbs), never over the canvas.
    expect(screen.queryByText(t('editor.drawHint'))).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: t('editor.dismiss') }));
    expect(notices.setMessage).toHaveBeenCalledWith(null);
  });

  it('read-only shows the notice and hides the drawing hint', () => {
    const harness = createHarness(sampleProject(), true);
    harness.ui.mode.value = 'draw';
    withContext(harness, <CanvasNotices notices={fakeNotices()} />);
    expect(screen.getByText(t('editor.readOnlyNotice'))).toBeTruthy();
    expect(screen.queryByText(t('editor.drawHint'))).toBeNull();
  });
});

describe('Draw hint in the canvas bar', () => {
  function crumbsNav() {
    return screen.getByRole('navigation', { name: t('crumbs.label') });
  }

  it('in Draw, with no selection, the hint is in the path and not in the canvas overlay', () => {
    const harness = createHarness(sampleProject());
    harness.ui.mode.value = 'draw';
    harness.ui.selection.value = null;
    const { container } = withContext(
      harness,
      <>
        <Breadcrumbs onSelect={vi.fn()} />
        <CanvasNotices notices={fakeNotices()} />
      </>,
    );
    const hint = within(crumbsNav()).getByText(t('editor.drawHint'));
    expect(hint.getAttribute('title')).toBe(t('editor.drawHint'));
    expect(within(crumbsNav()).queryByText(t('panel.nothingSelected'))).toBeNull();
    const overlay = container.querySelector('.canvas-overlay');
    expect(overlay?.querySelector('.canvas-hint')).toBeNull();
    expect(overlay?.textContent).not.toContain(t('editor.drawHint'));
  });

  it('with a selection, the path returns and the hint goes away', () => {
    const harness = createHarness(sampleProject());
    harness.ui.mode.value = 'draw';
    harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    withContext(harness, <Breadcrumbs onSelect={vi.fn()} />);
    expect(within(crumbsNav()).queryByText(t('editor.drawHint'))).toBeNull();
    expect(within(crumbsNav()).getAllByRole('button').length).toBeGreaterThan(0);
  });

  it('in Navigate, shows "Nothing selected"', () => {
    const harness = createHarness(sampleProject());
    harness.ui.mode.value = 'navigate';
    withContext(harness, <Breadcrumbs onSelect={vi.fn()} />);
    expect(within(crumbsNav()).getByText(t('panel.nothingSelected'))).toBeTruthy();
    expect(within(crumbsNav()).queryByText(t('editor.drawHint'))).toBeNull();
  });

  it('with the project locked, shows "Nothing selected"', () => {
    const harness = createHarness(sampleProject(), true);
    harness.ui.mode.value = 'draw';
    withContext(harness, <Breadcrumbs onSelect={vi.fn()} />);
    expect(within(crumbsNav()).getByText(t('panel.nothingSelected'))).toBeTruthy();
    expect(within(crumbsNav()).queryByText(t('editor.drawHint'))).toBeNull();
  });

  it('with no images, shows "Nothing selected"', () => {
    const harness = createHarness({ ...sampleProject(), containers: [], markings: [] });
    harness.ui.mode.value = 'draw';
    withContext(harness, <Breadcrumbs onSelect={vi.fn()} />);
    expect(within(crumbsNav()).getByText(t('panel.nothingSelected'))).toBeTruthy();
    expect(within(crumbsNav()).queryByText(t('editor.drawHint'))).toBeNull();
  });
});

describe('ErrorBoundary', () => {
  it('shows the failure screen and offers reload', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Boom(): never {
      throw new Error('broke');
    }
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert').textContent).toContain(t('error.crashed'));
    expect(screen.getByRole('button', { name: t('error.reload') })).toBeTruthy();
  });

  it('without an error, renders the children', () => {
    render(
      <ErrorBoundary>
        <p>ok</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('ok')).toBeTruthy();
  });
});

describe('ExportDialog', () => {
  it('download marks as exported and closes', async () => {
    const onDone = vi.fn();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:x'),
      revokeObjectURL: vi.fn(),
    });
    render(<ExportDialog file={new File(['z'], 'p.zip')} onDone={onDone} />);
    await userEvent.click(screen.getByRole('button', { name: t('export.download') }));
    expect(click).toHaveBeenCalled();
    expect(controller.markExported).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('sharing successfully marks as exported; failure shows an error', async () => {
    const onDone = vi.fn();
    const share = vi.fn().mockResolvedValueOnce(undefined);
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: () => true,
    });
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    render(<ExportDialog file={new File(['z'], 'p.zip')} onDone={onDone} />);
    await userEvent.click(screen.getByRole('button', { name: t('export.share') }));
    expect(onDone).toHaveBeenCalledOnce();
    expect(controller.markExported).toHaveBeenCalledOnce();

    share.mockRejectedValueOnce(new Error('failed'));
    await userEvent.click(screen.getByRole('button', { name: t('export.share') }));
    expect((await screen.findByRole('alert')).textContent).toBe(t('export.shareFailed'));
    Reflect.deleteProperty(navigator, 'canShare');
    Reflect.deleteProperty(navigator, 'share');
  });

  it('shows the generated file, with the size', () => {
    render(
      <ExportDialog
        file={new File([new Uint8Array(2048)], 'project.zip')}
        onDone={vi.fn()}
      />,
    );
    const card = document.querySelector('.file-card') as HTMLElement;
    expect(card.textContent).toContain('project.zip');
    expect(card.textContent).toContain(t('export.fileMeta', { size: '2 KB' }));
  });

  // Stage 8 (8.7), residue 1 (S8).
  it('with the save in error, warns that the zip carries changes not yet saved', () => {
    render(
      <ExportDialog file={new File(['z'], 'p.zip')} saved={false} onDone={vi.fn()} />,
    );
    expect(screen.getByRole('status').textContent).toBe(t('export.unsaved'));
  });

  it('with everything saved, does not show the notice', () => {
    render(<ExportDialog file={new File(['z'], 'p.zip')} saved onDone={vi.fn()} />);
    expect(screen.queryByText(t('export.unsaved'))).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('cancel only closes', async () => {
    const onDone = vi.fn();
    render(<ExportDialog file={new File(['z'], 'p.zip')} onDone={onDone} />);
    await userEvent.click(screen.getByRole('button', { name: t('common.cancel') }));
    expect(onDone).toHaveBeenCalledOnce();
    expect(controller.markExported).not.toHaveBeenCalled();
  });
});

// Stage 7 (7.1), finding A1: the zip is generated before the dialog opens, with the Export
// button disabled (Chrome takes the focus away from it), so the dialog has nobody to return the focus to.
describe('ExportDialog: focus on closing', () => {
  function ExportFlow({
    harness,
  }: {
    readonly harness: ReturnType<typeof createHarness>;
  }) {
    const [busy, setBusy] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    // Stage 8 (8.3), F4: the return comes from the bar button (buttonRef), not from a selector.
    const [dialogs] = useState(fakeDialogs);
    const commands = {
      exportProject: async () => {
        setBusy(true);
        // The button is disabled while the zip is generated: the focus falls to the body.
        (document.activeElement as HTMLElement | null)?.blur();
        await Promise.resolve();
        setBusy(false);
        setFile(new File(['z'], 'p.zip'));
      },
      closeProject: vi.fn(),
    } as unknown as ProjectCommands;
    return (
      <EditorContext.Provider value={harness.context}>
        <EditorMainBar
          busy={busy}
          onAdd={vi.fn()}
          dialogs={dialogs}
          commands={commands}
        />
        {file && (
          <ExportDialog
            file={file}
            onDone={() => setFile(null)}
            returnFocus={() => dialogs.exportButton.current}
          />
        )}
      </EditorContext.Provider>
    );
  }

  async function openExport() {
    render(<ExportFlow harness={createHarness(sampleProject())} />);
    const user = userEvent.setup();
    const button = screen.getByRole('button', { name: t('editor.export') });
    await user.click(button);
    const dialog = await vi.waitFor(() => {
      const el = document.querySelector('dialog');
      // Really open: the initial focus has already entered it.
      if (!el?.contains(document.activeElement)) throw new Error('has not opened yet');
      return el;
    });
    return { user, button, dialog };
  }

  it('Cancel returns the focus to the Export button (and not to the body)', async () => {
    const { user, button, dialog } = await openExport();
    await user.click(
      within(dialog).getByRole('button', { name: t('common.cancel'), hidden: true }),
    );
    await vi.waitFor(() => expect(document.querySelector('dialog')).toBeNull());
    expect(document.activeElement).toBe(button);
  });

  it('Esc returns the focus to the Export button', async () => {
    const { button, dialog } = await openExport();
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    await vi.waitFor(() => expect(document.querySelector('dialog')).toBeNull());
    expect(document.activeElement).toBe(button);
  });
});

// Phase 6.1 (finding 7): in Chrome and Edge, Download opens the "Save as" through
// `showSaveFilePicker`; the project only counts as exported after the file has been written.
describe('ExportDialog with the file picker', () => {
  const steps: string[] = [];

  function installPicker(outcome: 'cancel' | 'save'): ReturnType<typeof vi.fn> {
    const picker = vi.fn(() => {
      steps.push('picker');
      if (outcome === 'cancel') {
        return Promise.reject(new DOMException('cancelled', 'AbortError'));
      }
      return Promise.resolve({
        createWritable: () =>
          Promise.resolve({
            write: (data: Blob) => {
              steps.push(`write:${data.size}`);
              return Promise.resolve();
            },
            close: () => {
              steps.push('close');
              return Promise.resolve();
            },
            abort: () => Promise.resolve(),
          }),
      });
    });
    Reflect.set(globalThis, 'showSaveFilePicker', picker);
    return picker;
  }

  beforeEach(() => {
    steps.length = 0;
    controller.markExported.mockImplementation(() => {
      steps.push('markExported');
      return Promise.resolve();
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      steps.push('download');
    });
    Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:x'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'showSaveFilePicker');
    vi.restoreAllMocks();
  });

  it('cancelling the "Save as" does not mark as exported and keeps the dialog', async () => {
    installPicker('cancel');
    const onDone = vi.fn();
    render(<ExportDialog file={new File(['z'], 'p.zip')} onDone={onDone} />);
    await userEvent.click(screen.getByRole('button', { name: t('export.download') }));
    expect(controller.markExported).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(steps).toEqual(['picker']);
    expect(screen.getByRole('button', { name: t('export.download') })).toBeTruthy();
  });

  it('saving writes through the handle and only after close marks as exported', async () => {
    const picker = installPicker('save');
    const onDone = vi.fn();
    render(<ExportDialog file={new File(['zip!'], 'p.zip')} onDone={onDone} />);
    await userEvent.click(screen.getByRole('button', { name: t('export.download') }));
    expect(steps).toEqual(['picker', 'write:4', 'close', 'markExported']);
    expect(picker).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestedName: 'p.zip',
        types: [expect.objectContaining({ accept: { 'application/zip': ['.zip'] } })],
      }),
    );
    expect(onDone).toHaveBeenCalledOnce();
    expect(screen.queryByText(t('export.downloadHint'))).toBeNull();
  });

  it('a write failure shows the error, discards the write and does not mark', async () => {
    const abort = vi.fn(() => Promise.resolve());
    Reflect.set(globalThis, 'showSaveFilePicker', () =>
      Promise.resolve({
        createWritable: () =>
          Promise.resolve({
            write: () => Promise.reject(new DOMException('full', 'QuotaExceededError')),
            close: () => Promise.resolve(),
            abort,
          }),
      }),
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onDone = vi.fn();
    render(<ExportDialog file={new File(['z'], 'p.zip')} onDone={onDone} />);
    await userEvent.click(screen.getByRole('button', { name: t('export.download') }));
    expect((await screen.findByRole('alert')).textContent).toBe(t('export.saveFailed'));
    expect(abort).toHaveBeenCalledOnce();
    expect(controller.markExported).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('without the picker, downloads as before and warns that cancelling requires exporting again', async () => {
    const onDone = vi.fn();
    render(<ExportDialog file={new File(['z'], 'p.zip')} onDone={onDone} />);
    expect(screen.getByText(t('export.downloadHint'))).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: t('export.download') }));
    expect(steps).toEqual(['download', 'markExported']);
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('cancelling the share does not mark as exported', async () => {
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: () => true,
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: () => Promise.reject(new DOMException('cancelled', 'AbortError')),
    });
    const onDone = vi.fn();
    render(<ExportDialog file={new File(['z'], 'p.zip')} onDone={onDone} />);
    await userEvent.click(screen.getByRole('button', { name: t('export.share') }));
    expect(controller.markExported).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
    Reflect.deleteProperty(navigator, 'canShare');
    Reflect.deleteProperty(navigator, 'share');
  });
});

describe('editor bars', () => {
  it('main (desktop): mode, undo, export and the bar dialogs', async () => {
    const harness = createHarness(sampleProject());
    const dialogs = fakeDialogs();
    const commands = { exportProject: vi.fn(), closeProject: vi.fn() };
    withContext(
      harness,
      <EditorMainBar
        busy={false}
        onAdd={vi.fn()}
        dialogs={dialogs}
        commands={commands as unknown as ProjectCommands}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: t('editor.modeDraw') }));
    expect(harness.ui.mode.value).toBe('draw');
    await user.click(screen.getByRole('button', { name: t('editor.undo') }));
    expect(harness.ui.mode.value).toBe('draw');
    await user.click(screen.getByRole('button', { name: t('editor.export') }));
    expect(commands.exportProject).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: t('spec.menu') }));
    expect(dialogs.show).toHaveBeenCalledWith({ kind: 'specs' });
    await user.click(screen.getByRole('button', { name: t('help.open') }));
    expect(dialogs.show).toHaveBeenCalledWith({ kind: 'help' });
    await user.click(screen.getByRole('button', { name: t('settings.title') }));
    expect(dialogs.show).toHaveBeenCalledWith({ kind: 'settings' });
    // The saving state left the bar (it went to the status bar).
    expect(screen.queryByText(t('status.saved'))).toBeNull();
  });

  it('project menu (desktop): export and close', async () => {
    const harness = createHarness(sampleProject());
    const commands = { exportProject: vi.fn(), closeProject: vi.fn() };
    withContext(
      harness,
      <EditorMainBar
        busy={false}
        onAdd={vi.fn()}
        dialogs={fakeDialogs()}
        commands={commands as unknown as ProjectCommands}
      />,
    );
    const user = userEvent.setup();
    const trigger = screen.getByRole('button', {
      name: t('editor.projectMenuName', { name: harness.project().project.name }),
    });
    expect(trigger.textContent).toContain(harness.project().project.name);
    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: t('editor.closeProject') }));
    expect(commands.closeProject).toHaveBeenCalledOnce();
    // The menu closes on choosing.
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('main bar: there is no layer chip', () => {
    const harness = createHarness(sampleProject());
    withContext(
      harness,
      <EditorMainBar
        busy={false}
        onAdd={vi.fn()}
        dialogs={fakeDialogs()}
        commands={{ exportProject: vi.fn(), closeProject: vi.fn() } as ProjectCommands}
      />,
    );
    expect(document.querySelector('.layer-chip')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Layers \(active/ })).toBeNull();
  });

  it('main: read-only or busy disables draw and add', () => {
    const harness = createHarness(sampleProject(), true);
    withContext(
      harness,
      <EditorMainBar
        busy
        onAdd={vi.fn()}
        dialogs={fakeDialogs()}
        commands={fakeCommands()}
      />,
    );
    expect(
      screen.getByRole('button', { name: t('editor.modeDraw') }).hasAttribute('disabled'),
    ).toBe(true);
    expect(
      screen
        .getByRole('button', { name: t('editor.addImages') })
        .hasAttribute('disabled'),
    ).toBe(true);
  });
});

// Stage 8 (8.3), finding F3: swapping a dialog in the same slot (Settings › View shortcuts)
// unmounted the old one before the new one saved who opened it; Esc left the focus on the first
// control of the app (or on the body), and not on the Settings button.
describe('dialog swap in the editor (F3)', () => {
  function Shell() {
    const dialogs = useEditorDialogs();
    return (
      <>
        <EditorMainBar
          busy={false}
          onAdd={vi.fn()}
          dialogs={dialogs}
          commands={fakeCommands()}
        />
        <EditorDialogsView dialogs={dialogs} />
      </>
    );
  }

  it('Settings › View shortcuts › Esc returns to the Settings button', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    withContext(createHarness(sampleProject()), <Shell />);
    const user = userEvent.setup();
    const settings = screen.getByRole('button', { name: t('settings.title') });
    await user.click(settings);
    await user.click(
      await screen.findByRole('button', { name: t('settings.shortcuts'), hidden: true }),
    );
    const help = await vi.waitFor(() => {
      const el = document.querySelector('dialog');
      if (!el?.querySelector('.help')) throw new Error('the Help has not opened yet');
      return el;
    });
    help.dispatchEvent(new Event('cancel', { cancelable: true }));
    await vi.waitFor(() => expect(document.querySelector('dialog')).toBeNull());
    expect(document.activeElement).toBe(settings);
  });
});
