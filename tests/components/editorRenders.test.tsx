import { act, cleanup, render } from '@testing-library/preact';
import { options, type VNode } from 'preact';
import { signal } from '@preact/signals';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { EditorScreen } from '../../src/app/Editor';
import type { OpenProject } from '../../src/app/controller';
import { createFolderStorage } from '../../src/storage/folder';
import { createDisplayImages } from '../../src/store/displayImages';
import { openSession } from '../../src/store/session';
import { EditorContext, createEditorContextValue } from '../../src/ui/EditorContext';
import { installFakeCanvas } from '../canvas/harness';
import { buildLargeTypedProject } from '../model/largeTypedProject';
import { MemoryDirectory } from '../storage/memoryFs';

// Fase 26: arrastar/redimensionar troca `store.project` a cada `pointermove`, mas a
// interface só lê o projeto confirmado (`store.committed`) e renderiza no fim do gesto.
const MOVES = 30;
const WATCHED = ['EditorScreen', 'EditorPanel', 'EditorTopBar'] as const;
/** Um render ao soltar o gesto e, no máximo, mais um de folga. */
const MAX_RENDERS = 2;

describe('renderizações da interface durante um gesto', () => {
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

  function mountEditor() {
    const project = buildLargeTypedProject();
    const session = openSession({
      storage: createFolderStorage(new MemoryDirectory('grande')),
      project,
      readOnly: false,
      prepareImage: () => Promise.reject(new Error('imagens não são usadas aqui')),
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
    return { project, session, ui: context.ui };
  }

  it(`${MOVES} movimentos renderizam EditorScreen, EditorPanel e EditorTopBar no máximo ${MAX_RENDERS} vezes`, async () => {
    const { project, session, ui } = mountEditor();
    const { store, actions } = session;
    const marking = project.markings.find((m) => m.parentId === null);
    if (!marking) throw new Error('fixture');

    // Seleciona a marcação (o painel mostra os campos x/y/largura/altura) e deixa assentar.
    ui.selection.value = { kind: 'marking', id: marking.id };
    await act(async () => {
      await Promise.resolve();
    });

    counts.clear();
    const before = store.committed.value;
    // Sem `act`: ele agruparia as renderizações; aqui a fila do Preact roda entre os
    // movimentos, como entre dois eventos do dedo.
    const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
    {
      expect(actions.beginGesture().ok).toBe(true);
      for (let i = 1; i <= MOVES; i++) {
        expect(actions.previewMarkingMove(marking.id, i, 0).ok).toBe(true);
        await settle();
      }
      expect(counts.get('EditorScreen') ?? 0).toBe(0);
      expect(counts.get('EditorPanel') ?? 0).toBe(0);
      expect(counts.get('EditorTopBar') ?? 0).toBe(0);
      // A prévia mudou o projeto, mas não o confirmado.
      expect(store.project.value).not.toBe(before);
      expect(store.committed.value).toBe(before);
      actions.commitGesture();
    }
    await settle();

    expect(store.committed.value).toBe(store.project.value);
    for (const name of WATCHED) {
      expect(counts.get(name) ?? 0, name).toBeLessThanOrEqual(MAX_RENDERS);
    }
  });
});
