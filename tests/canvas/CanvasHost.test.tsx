import { cleanup, render, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasHost } from '../../src/canvas/CanvasHost';
import { EditorContext, type EditorContextValue } from '../../src/ui/EditorContext';

// Stage #294 (Preact 11), P11.2, decision 6: mounting `CanvasHost` creates the controller once,
// publishes it in `canvas.current`, and unmounting destroys it once without leaving a listener
// on the window. In Preact 11 the passive-effect cleanup runs a frame after the unmount, so the
// assertions wait for it.

const spies = vi.hoisted(() => ({ ctor: vi.fn(), destroy: vi.fn() }));
vi.mock('../../src/canvas/CanvasController', () => ({
  CanvasController: class {
    private readonly onResize = () => undefined;
    constructor(options: unknown) {
      spies.ctor(options);
      // Like the real controller: a listener on the window that `destroy` must remove.
      globalThis.addEventListener('resize', this.onResize);
    }
    destroy() {
      spies.destroy();
      globalThis.removeEventListener('resize', this.onResize);
    }
  },
}));

beforeEach(() => {
  spies.ctor.mockClear();
  spies.destroy.mockClear();
});
afterEach(async () => {
  cleanup();
  // The cleanup of a test's effect runs a frame later: wait for it so it does not land in the next.
  await waitFor(() =>
    expect(spies.destroy).toHaveBeenCalledTimes(spies.ctor.mock.calls.length),
  );
  vi.restoreAllMocks();
});

function context(): EditorContextValue {
  return {
    store: {},
    actions: {},
    display: {},
    ui: {},
    derived: {},
    canvas: { current: null },
    view: {},
    review: {},
    quick: {},
    session: { perspective: {}, page: {}, components: { images: {} } },
  } as unknown as EditorContextValue;
}

function mount(value: EditorContextValue) {
  const tree = (
    <EditorContext.Provider value={value}>
      <CanvasHost />
    </EditorContext.Provider>
  );
  const view = render(tree);
  return { ...view, tree };
}

describe('CanvasHost', () => {
  it('mount creates the controller once, in the host element, and publishes it', () => {
    const value = context();
    const { container } = mount(value);
    expect(spies.ctor).toHaveBeenCalledTimes(1);
    const options = spies.ctor.mock.calls[0]?.[0] as { container: HTMLElement };
    expect(options.container).toBe(container.querySelector('.canvas-host'));
    expect(value.canvas.current).not.toBeNull();
    expect(spies.destroy).not.toHaveBeenCalled();
  });

  it('a re-render with the same context does not recreate the controller', () => {
    const { rerender, tree } = mount(context());
    rerender(tree);
    rerender(tree);
    expect(spies.ctor).toHaveBeenCalledTimes(1);
    expect(spies.destroy).not.toHaveBeenCalled();
  });

  it('unmount destroys the controller once, clears `canvas.current` and leaves no window listener', async () => {
    const value = context();
    const added = vi.spyOn(globalThis, 'addEventListener');
    const removed = vi.spyOn(globalThis, 'removeEventListener');
    const { unmount } = mount(value);
    expect(added.mock.calls.filter(([type]) => type === 'resize')).toHaveLength(1);
    unmount();
    // Preact 11 runs the passive cleanup a frame after the unmount.
    await waitFor(() => expect(spies.destroy).toHaveBeenCalledTimes(1));
    expect(value.canvas.current).toBeNull();
    const resizeAdded = added.mock.calls.filter(([type]) => type === 'resize');
    const resizeRemoved = removed.mock.calls.filter(([type]) => type === 'resize');
    expect(resizeRemoved).toHaveLength(resizeAdded.length);
    expect(resizeRemoved[0]?.[1]).toBe(resizeAdded[0]?.[1]);
    expect(spies.ctor).toHaveBeenCalledTimes(1);
  });
});
