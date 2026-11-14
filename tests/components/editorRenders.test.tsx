import { act, cleanup, render } from '@testing-library/preact';
import { options, type VNode } from 'preact';
import { signal } from '@preact/signals';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { EditorScreen } from '../../src/app/Editor';
import type { OpenProject } from '../../src/app/controller';
import { createFolderStorage } from '../../src/storage/folder';
import { createDisplayImages } from '../../src/store/displayImages';
import { addPerspective, buildPerspective } from '../../src/model';
import { openSession } from '../../src/store/session';
import { EditorContext, createEditorContextValue } from '../../src/ui/EditorContext';
import { installFakeCanvas } from '../canvas/harness';
import { buildLargeTypedProject } from '../model/largeTypedProject';
import { MemoryDirectory } from '../storage/memoryFs';

// Phase 26: dragging/resizing swaps `store.project` on every `pointermove`, but the
// interface only reads the committed project (`store.committed`) and renders at the end of the gesture.
const MOVES = 30;
const WATCHED = ['EditorScreen', 'EditorPanel', 'EditorMainBar'] as const;
/** One render when the gesture is released and, at most, one more as slack. */
const MAX_RENDERS = 2;
/** Mounts the whole editor; under coverage on a shared CI runner it easily exceeds the default 5 s. */
const MOUNT_TIMEOUT_MS = 30_000;

describe('interface renders during a gesture', () => {
  const counts = new Map<string, number>();
  const previousDiffed = options.diffed;

  beforeAll(() => {
    installFakeCanvas();
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    options.diffed = (vnode: VNode) => {
      const name = typeof vnode.type === 'function' ? vnode.type.name : '';
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
      previousDiffed?.(vnode);
    };
  });
  afterEach(cleanup);
  afterAll(() => {
    options.diffed = previousDiffed;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function mountEditor(withPerspective = false) {
    let project = buildLargeTypedProject();
    if (withPerspective) {
      // A perspective with all roots at the Main positions.
      const view = buildPerspective(project, { id: 'V', name: 'View', startFrom: null });
      project = addPerspective(project, view);
    }
    const session = openSession({
      storage: createFolderStorage(new MemoryDirectory('large'), { copyId: 'large' }),
      project,
      readOnly: false,
      prepareImage: () => Promise.reject(new Error('images are not used here')),
      now: () => '2026-10-02T12:00:00.000Z',
    });
    const open: OpenProject = {
      kind: 'folder',
      session,
      display: createDisplayImages<ImageBitmap>(() => new Promise(() => undefined)),
      localId: null,
      unexported: signal(false),
    };
    const context = createEditorContextValue(open);
    render(
      <EditorContext.Provider value={context}>
        <EditorScreen />
      </EditorContext.Provider>,
    );
    return { project, session, ui: context.ui, context };
  }

  it(
    `${MOVES} moves render EditorScreen, EditorPanel and EditorMainBar at most ${MAX_RENDERS} times`,
    async () => {
      const { project, session, ui } = mountEditor();
      const { store, actions } = session;
      const marking = project.markings.find((m) => m.parentId === null);
      if (!marking) throw new Error('fixture');

      // Selects the marking (the panel shows the x/y/width/height fields) and lets it settle.
      ui.selection.value = { kind: 'marking', id: marking.id };
      await act(async () => {
        await Promise.resolve();
      });

      counts.clear();
      const before = store.committed.value;
      // Without `act`: it would batch the renders; here the Preact queue runs between the
      // moves, as between two finger events.
      const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
      {
        expect(actions.beginGesture().ok).toBe(true);
        for (let i = 1; i <= MOVES; i++) {
          expect(actions.previewMarkingMove(marking.id, i, 0).ok).toBe(true);
          await settle();
        }
        expect(counts.get('EditorScreen') ?? 0).toBe(0);
        expect(counts.get('EditorPanel') ?? 0).toBe(0);
        expect(counts.get('EditorMainBar') ?? 0).toBe(0);
        // Nor the panel of the selected marking (its sections read the committed project, not the preview).
        expect(counts.get('MarkingPanel') ?? 0).toBe(0);
        // The preview changed the project, but not the committed one.
        expect(store.project.value).not.toBe(before);
        expect(store.committed.value).toBe(before);
        actions.commitGesture();
      }
      await settle();

      expect(store.committed.value).toBe(store.project.value);
      for (const name of WATCHED) {
        expect(counts.get(name) ?? 0, name).toBeLessThanOrEqual(MAX_RENDERS);
      }
    },
    MOUNT_TIMEOUT_MS,
  );

  it(
    'pan and zoom with an open perspective neither render the interface nor rebuild the project in view',
    async () => {
      const { session, context } = mountEditor(true);
      expect(session.perspective.open('V')).toBe(true);
      await act(async () => {
        await Promise.resolve();
      });
      const shown = context.review.derived.shownProject.value;
      const visible = context.derived.visibleLayers.value;
      const controller = context.canvas.current;
      if (!controller) throw new Error('canvas not mounted');

      counts.clear();
      const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
      for (let i = 0; i < MOVES; i++) {
        controller.zoomBy(i % 2 === 0 ? 1.1 : 1 / 1.1);
        controller.centerOnPoint({ x: i * 10, y: i * 10 });
        await settle();
      }
      expect(context.review.derived.shownProject.value).toBe(shown);
      expect(context.derived.visibleLayers.value).toBe(visible);
      for (const name of WATCHED) expect(counts.get(name) ?? 0, name).toBe(0);
    },
    MOUNT_TIMEOUT_MS,
  );
});
