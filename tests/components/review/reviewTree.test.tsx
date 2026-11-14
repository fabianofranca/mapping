import { act, cleanup, screen } from '@testing-library/preact';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { EditorScreen } from '../../../src/app/Editor';
import { addContainer, createMarking, createProject } from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { showToolWindow } from '../../../src/store/toolWindows';
import { TreeWindow } from '../../../src/ui/TreeWindow';
import { installFakeCanvas } from '../../canvas/harness';
import { AT, propose } from '../../model/proposalFixtures';
import { openReviewHarness, renderInEditor } from './reviewHarness';

// Finding 12 of the 2026-10-11 report: in the review of a new import (project without
// images with a proposal that creates images and markings), the Tree said "No images
// yet." and the canvas empty state appeared over the proposed images, because both read
// the current project and not the preview ("how it would look") of the Proposed view.

beforeAll(() => {
  installFakeCanvas();
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});
beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
  showToolWindow('tree');
});
afterEach(cleanup);
afterAll(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Freshly created project (no images) and the proposal that creates the first image with one item. */
function firstImport() {
  const base = createProject({
    name: 'Import',
    now: AT,
    firstLayer: { id: 'L1', name: 'Layer 1', color: '#D32F2F' },
  });
  let after = addContainer(base, {
    id: 'I1',
    file: 'images/cadastro.webp',
    width: 800,
    height: 600,
  });
  after = createMarking(after, {
    id: 'M1',
    containerId: 'I1',
    rect: { x: 10, y: 10, width: 200, height: 100 },
    name: 'Form',
  });
  return { base, proposal: propose(base, after, { id: 'P1', title: 'Import' }) };
}

const TREE_EMPTY = 'No images yet.';
const CANVAS_EMPTY = 'No images yet. Add photos to build the canvas.';

describe('review of a new import', () => {
  it('the Tree reads the preview in the Proposed view (created images and items) and the current one in the Current view', async () => {
    const { base, proposal } = firstImport();
    const h = await openReviewHarness({ project: base, proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    expect(h.review.view.value).toBe('proposed');
    const onSelect = vi.fn();
    renderInEditor(h, <TreeWindow onSelect={onSelect} />);
    expect(screen.queryByText(TREE_EMPTY)).toBeNull();
    expect(screen.getByRole('button', { name: /^images\/cadastro\.webp/ })).toBeTruthy();
    const item = screen.getByRole('button', { name: /^Form/ });
    item.click();
    expect(onSelect).toHaveBeenCalledWith({ kind: 'marking', id: 'M1' });

    // In the Current view, the project as it is: still without images.
    act(() => h.review.setView('current'));
    expect(screen.getByText(TREE_EMPTY)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Form/ })).toBeNull();

    // Outside the review, the current project.
    act(() => h.review.close());
    expect(screen.getByText(TREE_EMPTY)).toBeTruthy();
  });

  it('the canvas empty state does not appear over the proposed images', async () => {
    const { base, proposal } = firstImport();
    const h = await openReviewHarness({ project: base, proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    const { container } = renderInEditor(h, <EditorScreen />);
    expect(screen.queryByText(CANVAS_EMPTY)).toBeNull();
    expect(container.querySelector('.canvas-empty')).toBeNull();

    act(() => h.review.setView('current'));
    expect(screen.getByText(CANVAS_EMPTY)).toBeTruthy();

    act(() => h.review.close());
    expect(screen.getByText(CANVAS_EMPTY)).toBeTruthy();
    expect(container.querySelector('.canvas-empty')).toBeTruthy();
  });
});
