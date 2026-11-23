import { cleanup, render, screen, waitFor, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useImageIntake } from '../../src/app/useImageIntake';
import type { EditorDialogs } from '../../src/app/useEditorDialogs';
import type { EditorNotices } from '../../src/app/useEditorNotices';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import { CanvasContextMenu } from '../../src/ui/CanvasContextMenu';
import { EditorContext } from '../../src/ui/EditorContext';
import { sampleProject } from '../model/fixtures';
import { createHarness, type Harness } from './harness';

// "Replace with clipboard image" in the canvas menu of an image (#2721, CE3, decision 11).

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'clipboard');
});

function setClipboard(read: (() => Promise<unknown>) | null) {
  Object.defineProperty(navigator, 'clipboard', {
    value: read ? { read, write: vi.fn() } : undefined,
    configurable: true,
  });
}

const imageItem = (type = 'image/png') => ({
  types: [type],
  getType: () => Promise.resolve(new Blob([new Uint8Array([1])], { type })),
});

function mount(harness: Harness, { prop = true }: { prop?: boolean } = {}) {
  const replaceImage = vi
    .spyOn(harness.context.session, 'replaceImage')
    .mockResolvedValue('replaced' as never);
  const notices: EditorNotices = {
    progress: null,
    message: null,
    busy: false,
    setProgress: vi.fn(),
    setMessage: vi.fn(),
  };
  const Menu = () => {
    const intake = useImageIntake({
      dialogs: { show: vi.fn() } as unknown as EditorDialogs,
      notices,
    });
    return (
      <CanvasContextMenu
        onReplaceFromClipboard={prop ? intake.replaceFromClipboard : undefined}
      />
    );
  };
  render(
    <EditorContext.Provider value={harness.context}>
      <Menu />
    </EditorContext.Provider>,
  );
  return { replaceImage, notices };
}

async function openMenu(harness: Harness, id = 'I1') {
  harness.ui.canvasMenu.value = { x: 5, y: 5, target: { kind: 'i', id } };
  return screen.findByRole('menu');
}

const itemName = () => t('image.replaceFromClipboard');

describe('Replace with clipboard image: the menu item', () => {
  it('shows for an image with a file when the browser can read the clipboard', async () => {
    setClipboard(() => Promise.resolve([]));
    const harness = createHarness(sampleProject());
    mount(harness);
    const menu = await openMenu(harness);
    const item = within(menu).getByRole('menuitem', { name: itemName() });
    expect((item as HTMLButtonElement).disabled).toBe(false);
  });

  it('is hidden without `navigator.clipboard.read`', async () => {
    setClipboard(null);
    const harness = createHarness(sampleProject());
    mount(harness);
    const menu = await openMenu(harness);
    expect(within(menu).queryByRole('menuitem', { name: itemName() })).toBeNull();
  });

  it('is hidden without the prop', async () => {
    setClipboard(() => Promise.resolve([]));
    const harness = createHarness(sampleProject());
    mount(harness, { prop: false });
    const menu = await openMenu(harness);
    expect(within(menu).queryByRole('menuitem', { name: itemName() })).toBeNull();
  });

  it('is hidden on a container without a file', async () => {
    setClipboard(() => Promise.resolve([]));
    const base = sampleProject();
    const harness = createHarness({
      ...base,
      containers: base.containers.map((c) => (c.id === 'I2' ? { ...c, file: null } : c)),
    });
    mount(harness);
    const menu = await openMenu(harness, 'I2');
    expect(within(menu).queryByRole('menuitem', { name: itemName() })).toBeNull();
  });

  it('is hidden on a marking', async () => {
    setClipboard(() => Promise.resolve([]));
    const harness = createHarness(sampleProject());
    mount(harness);
    harness.ui.canvasMenu.value = { x: 5, y: 5, target: { kind: 'm', id: 'M1' } };
    const menu = await screen.findByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: itemName() })).toBeNull();
  });

  it('is disabled in read-only', async () => {
    setClipboard(() => Promise.resolve([]));
    const harness = createHarness(sampleProject(), true);
    mount(harness);
    const menu = await openMenu(harness);
    const item = within(menu).getByRole('menuitem', { name: itemName() });
    expect((item as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Replace with clipboard image: the click', () => {
  it('replaces the file with the clipboard image', async () => {
    setClipboard(() => Promise.resolve([imageItem()]));
    const harness = createHarness(sampleProject());
    const { replaceImage } = mount(harness);
    const menu = await openMenu(harness);
    await userEvent.click(within(menu).getByRole('menuitem', { name: itemName() }));
    await waitFor(() => expect(replaceImage).toHaveBeenCalledOnce());
    expect(replaceImage.mock.calls[0]?.[0]).toBe('I1');
    expect(replaceImage.mock.calls[0]?.[1]).toBeInstanceOf(File);
    expect(harness.ui.canvasMenu.value).toBeNull();
  });

  it('with text only on the clipboard, toasts that there is no image', async () => {
    setClipboard(() =>
      Promise.resolve([
        { types: ['text/plain'], getType: () => Promise.resolve(new Blob(['x'])) },
      ]),
    );
    const harness = createHarness(sampleProject());
    const { replaceImage } = mount(harness);
    const menu = await openMenu(harness);
    await userEvent.click(within(menu).getByRole('menuitem', { name: itemName() }));
    await waitFor(() => expect(harness.ui.toast.value).toBe(t('image.clipboardEmpty')));
    expect(replaceImage).not.toHaveBeenCalled();
  });

  it('with the permission refused, toasts to allow access', async () => {
    setClipboard(() => Promise.reject(new DOMException('denied', 'NotAllowedError')));
    const harness = createHarness(sampleProject());
    const { replaceImage } = mount(harness);
    const menu = await openMenu(harness);
    await userEvent.click(within(menu).getByRole('menuitem', { name: itemName() }));
    await waitFor(() => expect(harness.ui.toast.value).toBe(t('image.clipboardDenied')));
    expect(replaceImage).not.toHaveBeenCalled();
  });

  it('with any other error, toasts that it could not replace', async () => {
    setClipboard(() => Promise.reject(new Error('boom')));
    const harness = createHarness(sampleProject());
    const { replaceImage } = mount(harness);
    const menu = await openMenu(harness);
    await userEvent.click(within(menu).getByRole('menuitem', { name: itemName() }));
    await waitFor(() => expect(harness.ui.toast.value).toBe(t('image.replaceFailed')));
    expect(replaceImage).not.toHaveBeenCalled();
  });
});
