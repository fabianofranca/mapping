import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  VIEW_SHOW_START,
  attachViewShowPersistence,
  hideViewDrawingLayer,
  onlyScreens,
  setViewShow,
  showEverything,
  toggleViewDrawingLayer,
} from '../../src/store/viewMode';
import { createEditorUi, setViewMode } from '../../src/store/ui';

const KEY = 'mapping.viewShow';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('view mode: state', () => {
  it('starts off, with everything checked except the outline', () => {
    const ui = createEditorUi();
    expect(ui.viewMode.value).toBe(false);
    expect(ui.viewShow.value).toEqual({
      containers: true,
      images: true,
      outline: false,
      names: true,
      arrows: true,
      hiddenDrawingLayers: new Set(),
    });
    expect(ui.viewShow.value).toBe(VIEW_SHOW_START);
  });

  it('turning on goes back to Navigate; turning off does not touch the mode', () => {
    const ui = createEditorUi();
    ui.mode.value = 'draw';
    setViewMode(ui, true);
    expect(ui.viewMode.value).toBe(true);
    expect(ui.mode.value).toBe('navigate');
    ui.mode.value = 'draw';
    setViewMode(ui, false);
    expect(ui.viewMode.value).toBe(false);
    expect(ui.mode.value).toBe('draw');
  });

  it('each panel item toggles only what it says', () => {
    const ui = createEditorUi();
    for (const key of ['containers', 'images', 'outline', 'names', 'arrows'] as const) {
      const before = ui.viewShow.value;
      setViewShow(ui, { [key]: !before[key] });
      expect(ui.viewShow.value[key]).toBe(!before[key]);
      for (const other of [
        'containers',
        'images',
        'outline',
        'names',
        'arrows',
      ] as const) {
        if (other !== key) expect(ui.viewShow.value[other]).toBe(before[other]);
      }
      setViewShow(ui, { [key]: before[key] });
    }
  });

  it('an unchecked layer with drawing enters the set; checking it again removes it', () => {
    const ui = createEditorUi();
    toggleViewDrawingLayer(ui, 'L1');
    expect(ui.viewShow.value.hiddenDrawingLayers).toEqual(new Set(['L1']));
    toggleViewDrawingLayer(ui, 'L1');
    expect(ui.viewShow.value.hiddenDrawingLayers.size).toBe(0);
    hideViewDrawingLayer(ui, 'L2');
    expect(ui.viewShow.value.hiddenDrawingLayers).toEqual(new Set(['L2']));
  });

  it('Show all checks everything; Screens only leaves just containers, images and the drawings', () => {
    const ui = createEditorUi();
    toggleViewDrawingLayer(ui, 'L1');
    setViewShow(ui, { images: false });
    showEverything(ui);
    expect(ui.viewShow.value).toEqual({
      containers: true,
      images: true,
      outline: true,
      names: true,
      arrows: true,
      hiddenDrawingLayers: new Set(),
    });
    toggleViewDrawingLayer(ui, 'L1');
    onlyScreens(ui);
    expect(ui.viewShow.value).toEqual({
      containers: true,
      images: true,
      outline: false,
      names: false,
      arrows: false,
      hiddenDrawingLayers: new Set(),
    });
  });
});

describe('view mode: the choice per project copy', () => {
  const stored = () => JSON.parse(localStorage.getItem(KEY) ?? 'null') as unknown;

  it('comes back for the same copy and each copy has its own', () => {
    const first = createEditorUi();
    const stop = attachViewShowPersistence(first, 'copy-1');
    setViewShow(first, { arrows: false, outline: true });
    toggleViewDrawingLayer(first, 'L1');
    stop();

    const again = createEditorUi();
    attachViewShowPersistence(again, 'copy-1')();
    expect(again.viewShow.value).toEqual({
      containers: true,
      images: true,
      outline: true,
      names: true,
      arrows: false,
      hiddenDrawingLayers: new Set(['L1']),
    });

    const other = createEditorUi();
    attachViewShowPersistence(other, 'copy-2')();
    expect(other.viewShow.value).toEqual(VIEW_SHOW_START);
  });

  it('the mode itself is never stored: reopening starts off', () => {
    const first = createEditorUi();
    const stop = attachViewShowPersistence(first, 'copy-1');
    setViewMode(first, true);
    setViewShow(first, { names: false });
    stop();
    const again = createEditorUi();
    attachViewShowPersistence(again, 'copy-1')();
    expect(again.viewMode.value).toBe(false);
    expect(again.viewShow.value.names).toBe(false);
  });

  it('without copyId it only holds for the session: nothing is read or written', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ v: 1, copies: { '': { outline: true } } }),
    );
    const ui = createEditorUi();
    const stop = attachViewShowPersistence(ui, undefined);
    expect(ui.viewShow.value).toEqual(VIEW_SHOW_START);
    setViewShow(ui, { arrows: false });
    stop();
    expect(stored()).toEqual({ v: 1, copies: { '': { outline: true } } });
  });

  it('a corrupted blob or one from another version becomes empty', () => {
    for (const text of ['{not json', JSON.stringify({ v: 9, copies: {} }), '[]']) {
      localStorage.setItem(KEY, text);
      const ui = createEditorUi();
      attachViewShowPersistence(ui, 'copy-1')();
      expect(ui.viewShow.value).toEqual(VIEW_SHOW_START);
    }
  });

  it('a copy with an invalid field is discarded, without spoiling the others', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        v: 1,
        copies: {
          bad: { containers: 'yes' },
          good: {
            containers: true,
            images: true,
            outline: true,
            names: true,
            arrows: true,
            hiddenLayers: [],
          },
        },
      }),
    );
    const bad = createEditorUi();
    attachViewShowPersistence(bad, 'bad')();
    expect(bad.viewShow.value).toEqual(VIEW_SHOW_START);
    const good = createEditorUi();
    attachViewShowPersistence(good, 'good')();
    expect(good.viewShow.value.outline).toBe(true);
  });

  it('keeps only the most recent copies', () => {
    for (let i = 0; i < 30; i++) {
      const ui = createEditorUi();
      const stop = attachViewShowPersistence(ui, `c${i}`);
      setViewShow(ui, { arrows: false });
      stop();
    }
    const copies = Object.keys((stored() as { copies: object }).copies);
    expect(copies.length).toBeLessThanOrEqual(20);
    expect(copies).toContain('c29');
    expect(copies).not.toContain('c0');
  });

  it('a failing localStorage breaks nothing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    const ui = createEditorUi();
    const stop = attachViewShowPersistence(ui, 'copy-1');
    expect(() => setViewShow(ui, { arrows: false })).not.toThrow();
    expect(ui.viewShow.value.arrows).toBe(false);
    expect(stop).not.toThrow();
  });
});

describe('view mode: wired to the editor', () => {
  it('the editor context restores and stores the choice of the project copy', async () => {
    const { createHarness } = await import('../components/harness');
    const { sampleProject } = await import('../model/fixtures');
    // The harness opens the `harness` copy: what is chosen in one opening comes back in the next.
    const first = createHarness(sampleProject());
    setViewShow(first.ui, { arrows: false });
    toggleViewDrawingLayer(first.ui, 'L1');
    first.context.stopViewShow();
    const again = createHarness(sampleProject());
    expect(again.ui.viewShow.value.arrows).toBe(false);
    expect(again.ui.viewShow.value.hiddenDrawingLayers).toEqual(new Set(['L1']));
    expect(again.ui.viewMode.value).toBe(false);
    again.context.stopViewShow();
  });
});
