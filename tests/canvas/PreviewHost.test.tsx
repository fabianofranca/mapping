import { act, cleanup, render } from '@testing-library/preact';
import { signal } from '@preact/signals';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_CATALOG, type ComponentCatalog, type Project } from '../../src/model';
import { createDisplayImages } from '../../src/store/displayImages';
import { setLocale, locale } from '../../src/store/settings';
import { EditorContext, type EditorContextValue } from '../../src/ui/EditorContext';
import { PreviewHost } from '../../src/canvas/PreviewHost';
import { world } from '../model/refAnnotationFixtures';

// PreviewHost (stage #883, PG3): the drawings follow the catalog, the fonts epoch and the locale.

const controllers = vi.hoisted(() => ({
  update: vi.fn(),
  ctor: vi.fn(),
  destroy: vi.fn(),
}));
vi.mock('../../src/canvas/PreviewController', () => ({
  PreviewController: class {
    constructor(options: unknown) {
      controllers.ctor(options);
    }
    update = controllers.update;
    destroy = controllers.destroy;
  },
}));

beforeEach(() => {
  locale.value = 'en-US';
  controllers.update.mockClear();
  controllers.ctor.mockClear();
  controllers.destroy.mockClear();
});
afterEach(cleanup);

function mount() {
  const catalog = signal<ComponentCatalog>(EMPTY_CATALOG);
  const fontsEpoch = signal(0);
  const value = {
    display: createDisplayImages<ImageBitmap>(() => new Promise(() => undefined)),
    review: { components: { catalog, fontsEpoch } },
  } as unknown as EditorContextValue;
  const project: Project = world();
  render(
    <EditorContext.Provider value={value}>
      <PreviewHost project={project} itemId="M1" />
    </EditorContext.Provider>,
  );
  return { catalog, fontsEpoch };
}

describe('PreviewHost', () => {
  it('recomputes the drawings when the catalog changes after mount', () => {
    const { catalog } = mount();
    expect(controllers.ctor).toHaveBeenCalledTimes(1);
    const before = controllers.update.mock.calls.length;
    catalog.value = new Map();
    expect(controllers.update.mock.calls.length).toBeGreaterThan(before);
    expect(controllers.update.mock.lastCall?.[0]).toHaveProperty('drawings');
  });

  it('recomputes the drawings when the fonts epoch changes after mount', () => {
    const { fontsEpoch } = mount();
    const before = controllers.update.mock.calls.length;
    fontsEpoch.value = 1;
    expect(controllers.update.mock.calls.length).toBeGreaterThan(before);
  });

  it('recomputes the drawings when the UI locale changes', () => {
    mount();
    const before = controllers.update.mock.calls.length;
    setLocale('pt-BR');
    expect(controllers.update.mock.calls.length).toBeGreaterThan(before);
  });

  it('stops listening after unmount', () => {
    const { catalog } = mount();
    // Preact 11 runs the cleanup of passive effects after the paint; `act` flushes it.
    act(() => cleanup());
    const before = controllers.update.mock.calls.length;
    catalog.value = new Map();
    expect(controllers.update.mock.calls.length).toBe(before);
  });
});
