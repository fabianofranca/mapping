import { act, cleanup, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renameMarking } from '../../src/model';
import { locale } from '../../src/store/settings';
import { showToolWindow } from '../../src/store/toolWindows';
import { EditorContext } from '../../src/ui/EditorContext';
import { ListView } from '../../src/ui/ListView';
import { Minimap } from '../../src/ui/Minimap';
import { markingOptions } from '../../src/ui/MarkingPicker';
import { TreeWindow } from '../../src/ui/TreeWindow';
import { pagesProject } from '../store/pageHarness';
import { createHarness, type Harness } from './harness';

// The windows read the project in view, cut by the open page (stage #883, PG2, decision 16): the
// Tree, the List and the minimap only show what is on the open page.
// pt-BR kept: shared fixture data (names of sampleProject, extended by pagesProject)

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
  showToolWindow('tree');
});
afterEach(cleanup);

function start(): Harness {
  let p = pagesProject();
  p = renameMarking(p, 'M5', 'Quadro');
  p = renameMarking(p, 'K', 'Solto');
  return createHarness(p);
}

const mount = (h: Harness, ui: preact.ComponentChildren) =>
  render(<EditorContext.Provider value={h.context}>{ui}</EditorContext.Provider>);
const treeRow = (name: string) =>
  screen.queryByRole('button', { name: new RegExp(`^${name}`) });
const openPage = (h: Harness, id: string) =>
  act(() => void h.context.session.page.open(id));

describe('windows cut by the open page', () => {
  it('the Tree lists the open page only and follows the switch', () => {
    const h = start();
    mount(h, <TreeWindow onSelect={vi.fn()} />);
    expect(treeRow('Porta')).toBeTruthy();
    expect(treeRow('Quadro')).toBeNull();
    expect(treeRow('Solto')).toBeNull();

    openPage(h, 'PG2');
    expect(treeRow('Quadro')).toBeTruthy();
    expect(treeRow('Solto')).toBeTruthy();
    expect(treeRow('Porta')).toBeNull();

    openPage(h, 'PG3');
    expect(treeRow('Quadro')).toBeNull();
    expect(treeRow('Porta')).toBeNull();
  });

  it('the List lists the open page only (rows and listing)', () => {
    const h = start();
    h.ui.listShowEmpty.value = true;
    mount(h, <ListView onSelect={vi.fn()} />);
    const rows = () =>
      [...document.querySelectorAll<HTMLElement>('[data-marking]')].map(
        (r) => r.dataset.marking,
      );
    expect(rows()).toContain('M1');
    expect(rows()).not.toContain('M5');

    openPage(h, 'PG2');
    expect(rows()).toContain('M5');
    expect(rows()).toContain('K');
    expect(rows()).not.toContain('M1');
    const listed = h.context.derived.listing.value.flatMap((g) =>
      g.markings.map((m) => m.marking.id),
    );
    expect(listed).not.toContain('M1');
  });

  it('the minimap draws the images of the open page only', () => {
    const h = start();
    const { view } = h.context;
    view.bounds.value = { x: 0, y: 0, width: 1000, height: 800 };
    view.size.value = { width: 400, height: 300 };
    view.viewport.value = { x: 0, y: 0, scale: 1 };
    mount(h, <Minimap />);
    const images = () => document.querySelectorAll('.minimap-image').length;
    expect(images()).toBe(2);
    openPage(h, 'PG2');
    expect(images()).toBe(1);
    openPage(h, 'PG3');
    expect(images()).toBe(0);
  });

  it('the project in view is the open page: shownProject and derived state', () => {
    const h = start();
    const shown = () => h.context.review.derived.shownProject.value;
    expect(shown()?.containers.map((c) => c.id)).toEqual(['I1', 'I2']);
    openPage(h, 'PG2');
    expect(shown()?.containers.map((c) => c.id)).toEqual(['I3']);
    expect(h.context.review.derived.shownAcrossPages.value?.containers).toHaveLength(3);
  });

  it('the arrow destination picker lists the markings of the open page only (decision 6)', () => {
    const h = start();
    const options = (source: string) => {
      const shown = h.context.review.derived.shownProject.value;
      if (!shown) throw new Error('no project in view');
      return markingOptions(shown, source)
        .map((o) => o.marking.id)
        .sort();
    };
    expect(options('M1')).toEqual(['M2', 'M3', 'M4']);
    openPage(h, 'PG2');
    expect(options('M5')).toEqual(['K']);
  });
});
