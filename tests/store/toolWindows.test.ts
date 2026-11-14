import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BREAKPOINTS } from '../../src/theme/breakpoints';
import { tokenValue } from '../../src/theme/tokens';
import {
  RESIZE_STEP,
  WINDOW_LIMITS,
  bottomToolWindow,
  clampLayersHeight,
  clampWindowSize,
  fitSideWidths,
  hideToolWindow,
  isToolWindowOpen,
  layersWindowHeight,
  openWindowOf,
  openWindowsOf,
  resetLayersWindowHeight,
  resetToolWindowSize,
  resizeLayersWindow,
  resizeToolWindow,
  REVIEW_BOTTOM_DEFAULT,
  setReviewLayout,
  showToolWindow,
  sideWidth,
  toggleToolWindow,
  toolWindowByNumber,
  toolWindowSizes,
} from '../../src/store/toolWindows';

// State of the tool windows (R4, B1 and B2). The signals are module-level (as in
// `store/settings`), so each test starts from a known state.

const SPACE = { width: 1400, height: 800, otherWidth: 0 };

function reset(): void {
  showToolWindow('tree');
  showToolWindow('layers');
  showToolWindow('details');
  resetLayersWindowHeight(800);
  hideToolWindow('list');
  resetToolWindowSize('left', SPACE);
  resetToolWindowSize('right', SPACE);
  resetToolWindowSize('bottom', SPACE);
}

beforeEach(reset);

describe('opening and closing windows', () => {
  it('the left stacks Tree and Layers; the other sides show just one', () => {
    expect(openWindowsOf('left')).toEqual(['tree', 'layers']);
    hideToolWindow('tree');
    expect(openWindowsOf('left')).toEqual(['layers']);
    expect(openWindowOf('left')).toBe('layers');
    // Hiding one does not hide the other, and coming back keeps the order.
    showToolWindow('tree');
    expect(openWindowsOf('left')).toEqual(['tree', 'layers']);
    expect(isToolWindowOpen('layers')).toBe(true);
  });

  it('each side shows the open window', () => {
    expect(openWindowOf('left')).toBe('tree');
    expect(openWindowOf('right')).toBe('details');
    expect(openWindowOf('bottom')).toBeNull();
  });

  it('clicking the strip opens and hides', () => {
    toggleToolWindow('list');
    expect(isToolWindowOpen('list')).toBe(true);
    expect(bottomToolWindow.value).toBe('list');
    toggleToolWindow('list');
    expect(isToolWindowOpen('list')).toBe(false);
    expect(openWindowOf('bottom')).toBeNull();
  });

  it('hiding Details zeroes the right width', () => {
    expect(sideWidth('right')).toBe(WINDOW_LIMITS.right.default);
    hideToolWindow('details');
    expect(sideWidth('right')).toBe(0);
    expect(isToolWindowOpen('details')).toBe(false);
  });

  it('the shortcut number only counts for the windows that exist', () => {
    expect(toolWindowByNumber(1)).toBe('tree');
    expect(toolWindowByNumber(3)).toBe('details');
    expect(toolWindowByNumber(4)).toBe('list');
    expect(toolWindowByNumber(2)).toBe('layers');
    expect(toolWindowByNumber(5)).toBe('incomplete');
    expect(toolWindowByNumber(6)).toBe('diagnostics');
    // The 8 became vacant when the B3 palette became a tab of the Catalog (B5); stage #486 gave it to the
    // Notices window.
    expect(toolWindowByNumber(8)).toBe('notices');
    expect(toolWindowByNumber(9)).toBe('catalog');
    expect(toolWindowByNumber(10)).toBeNull();
  });

  it('the Catalog stays alone in the left column', () => {
    showToolWindow('tree');
    showToolWindow('layers');
    showToolWindow('catalog');
    expect(isToolWindowOpen('catalog')).toBe(true);
    expect(isToolWindowOpen('tree')).toBe(false);
    expect(isToolWindowOpen('layers')).toBe(false);
    // Opening the Tree gives the column back; the Library leaves.
    showToolWindow('tree');
    expect(isToolWindowOpen('catalog')).toBe(false);
    showToolWindow('layers');
    expect(isToolWindowOpen('tree') && isToolWindowOpen('layers')).toBe(true);
  });

  it('the bottom window shows one tab at a time', () => {
    showToolWindow('list');
    showToolWindow('incomplete');
    expect(openWindowOf('bottom')).toBe('incomplete');
    expect(isToolWindowOpen('list')).toBe(false);
    showToolWindow('diagnostics');
    expect(bottomToolWindow.value).toBe('diagnostics');
    expect(isToolWindowOpen('incomplete')).toBe(false);
    hideToolWindow('diagnostics');
    expect(openWindowOf('bottom')).toBeNull();
  });
});

describe('tamanhos', () => {
  it('respeita os limites do lado', () => {
    expect(clampWindowSize('left', 100, SPACE)).toBe(WINDOW_LIMITS.left.min);
    expect(clampWindowSize('left', 999, SPACE)).toBe(480);
    expect(clampWindowSize('right', 999, SPACE)).toBe(560);
    expect(clampWindowSize('right', 300, SPACE)).toBe(300);
  });

  it('does not let the canvas go below 360px', () => {
    const tight = { width: 900, height: 800, otherWidth: 360 };
    // 900 − 360 (Details) − 360 (canvas) = 180: the side minimum (180) applies.
    expect(clampWindowSize('left', 480, tight)).toBe(WINDOW_LIMITS.left.min);
    expect(clampWindowSize('left', 480, { ...tight, otherWidth: 280 })).toBe(260);
    // With no space at all, the side minimum applies.
    expect(clampWindowSize('left', 480, { ...tight, width: 400 })).toBe(
      WINDOW_LIMITS.left.min,
    );
  });

  it('the bottom window goes up to 60% of the height', () => {
    expect(clampWindowSize('bottom', 999, SPACE)).toBe(480);
    expect(clampWindowSize('bottom', 50, SPACE)).toBe(WINDOW_LIMITS.bottom.min);
  });

  it('resizing stores the clamped size and the default comes back', () => {
    resizeToolWindow('left', WINDOW_LIMITS.left.default + RESIZE_STEP, SPACE);
    expect(toolWindowSizes.value.left).toBe(WINDOW_LIMITS.left.default + RESIZE_STEP);
    resizeToolWindow('left', 10_000, SPACE);
    expect(toolWindowSizes.value.left).toBe(480);
    resetToolWindowSize('left', SPACE);
    expect(toolWindowSizes.value.left).toBe(WINDOW_LIMITS.left.default);
  });
});

describe('divider between Tree and Layers', () => {
  it('neither window goes below the minimum', () => {
    expect(clampLayersHeight(10, 800)).toBe(96);
    expect(clampLayersHeight(900, 800)).toBe(704);
    expect(clampLayersHeight(300, 800)).toBe(300);
    // Column smaller than the two minimum heights: the minimum applies.
    expect(clampLayersHeight(300, 150)).toBe(96);
  });

  it('resizes, clamps and goes back to the default', () => {
    const initial = layersWindowHeight.value;
    resizeLayersWindow(initial + RESIZE_STEP, 800);
    expect(layersWindowHeight.value).toBe(initial + RESIZE_STEP);
    resizeLayersWindow(10_000, 800);
    expect(layersWindowHeight.value).toBe(704);
    resetLayersWindowHeight(800);
    expect(layersWindowHeight.value).toBe(initial);
  });
});

describe('bottom window in review mode (size-tw-bottom-review)', () => {
  it('Proposals is the 7th window, in the bottom strip', () => {
    expect(toolWindowByNumber(7)).toBe('proposals');
    showToolWindow('proposals');
    expect(bottomToolWindow.value).toBe('proposals');
    hideToolWindow('proposals');
  });

  it('starts larger in review and stores the height of each mode separately', () => {
    const normal = toolWindowSizes.value.bottom;
    setReviewLayout(true);
    expect(toolWindowSizes.value.bottom).toBe(REVIEW_BOTTOM_DEFAULT);
    resizeToolWindow('bottom', 300, SPACE);
    expect(toolWindowSizes.value.bottom).toBe(300);
    setReviewLayout(false);
    expect(toolWindowSizes.value.bottom).toBe(normal);
    setReviewLayout(true);
    expect(toolWindowSizes.value.bottom).toBe(300);
    // Double click on the divider goes back to the mode default.
    resetToolWindowSize('bottom', SPACE);
    expect(toolWindowSizes.value.bottom).toBe(REVIEW_BOTTOM_DEFAULT);
    setReviewLayout(false);
  });
});

describe('stored layout with the old Library id', () => {
  it('library becomes catalog when reading localStorage', async () => {
    localStorage.setItem(
      'mapping.toolWindows',
      JSON.stringify({ open: ['library', 'details', 'inexistente'] }),
    );
    vi.resetModules();
    try {
      const fresh = await import('../../src/store/toolWindows');
      expect(fresh.isToolWindowOpen('catalog')).toBe(true);
      expect(fresh.isToolWindowOpen('details')).toBe(true);
      expect(fresh.isToolWindowOpen('tree')).toBe(false);
    } finally {
      localStorage.removeItem('mapping.toolWindows');
      vi.resetModules();
    }
  });
});

describe('Details collapse in the compact window', () => {
  it('only applies on the first visit: once Details is reopened, a new call (another project) does not collapse it', async () => {
    localStorage.removeItem('mapping.toolWindows');
    vi.resetModules();
    try {
      const fresh = await import('../../src/store/toolWindows');
      fresh.collapseDetailsOnCompact();
      expect(fresh.isToolWindowOpen('details')).toBe(false);
      fresh.showToolWindow('details');
      fresh.collapseDetailsOnCompact();
      expect(fresh.isToolWindowOpen('details')).toBe(true);
    } finally {
      localStorage.removeItem('mapping.toolWindows');
      vi.resetModules();
    }
  });
});

describe('stored height of the bottom window in review', () => {
  async function loadWith(bottomReview: number) {
    localStorage.setItem('mapping.toolWindows', JSON.stringify({ bottomReview }));
    vi.resetModules();
    try {
      const fresh = await import('../../src/store/toolWindows');
      fresh.setReviewLayout(true);
      return {
        fallback: fresh.REVIEW_BOTTOM_DEFAULT,
        bottom: fresh.toolWindowSizes.value.bottom,
      };
    } finally {
      localStorage.removeItem('mapping.toolWindows');
      vi.resetModules();
    }
  }

  it('the new default is lower than the old 344', () => {
    expect(REVIEW_BOTTOM_DEFAULT).toBeLessThan(344);
  });

  it('whoever has 344 stored (the old default) moves to the new default', async () => {
    const { fallback, bottom } = await loadWith(344);
    expect(fallback).toBeLessThan(344);
    expect(bottom).toBe(fallback);
  });

  it('any other stored value stays', async () => {
    const { bottom } = await loadWith(300);
    expect(bottom).toBe(300);
  });
});

describe('fitSideWidths', () => {
  it('keeps the widths when they fit or when the area was not measured', () => {
    expect(fitSideWidths(264, 360, 1400)).toEqual({ left: 264, right: 360 });
    expect(fitSideWidths(264, 360, 0)).toEqual({ left: 264, right: 360 });
  });

  it('shrinks the right first and then the left, down to the minimum of each', () => {
    expect(fitSideWidths(264, 560, 1000)).toEqual({ left: 264, right: 376 });
    expect(fitSideWidths(480, 560, 900)).toEqual({ left: 260, right: 280 });
  });

  it('from 900px on the canvas keeps its minimum and the sides never invade it', () => {
    const canvasMin = Number.parseFloat(tokenValue('size-canvas-min', 'light'));
    for (const avail of [820, 900, 1000]) {
      const { left, right } = fitSideWidths(480, 560, avail);
      expect(left + right + canvasMin).toBeLessThanOrEqual(avail);
      expect(left).toBeGreaterThanOrEqual(WINDOW_LIMITS.left.min);
      expect(right).toBeGreaterThanOrEqual(WINDOW_LIMITS.right.min);
    }
  });

  it('at the app minimum width the minimums of both sides and the canvas fit between the strips (#1464)', () => {
    // 900px of window minus the two strips: it is the area that `fitSideWidths` receives. If the
    // minimums add up to more, the right window goes under the strip and covers the X.
    const stripe = Number.parseFloat(tokenValue('size-stripe', 'light'));
    const canvasMin = Number.parseFloat(tokenValue('size-canvas-min', 'light'));
    const avail = BREAKPOINTS.appMin - 2 * stripe;
    expect(
      WINDOW_LIMITS.left.min + WINDOW_LIMITS.right.min + canvasMin,
    ).toBeLessThanOrEqual(avail);
    const fit = fitSideWidths(WINDOW_LIMITS.left.max, WINDOW_LIMITS.right.max, avail);
    expect(fit.left + fit.right + canvasMin).toBeLessThanOrEqual(avail);
  });

  it('a collapsed side (0) neither takes up space nor gets cut', () => {
    expect(fitSideWidths(0, 560, 700)).toEqual({ left: 0, right: 340 });
    expect(fitSideWidths(480, 0, 600)).toEqual({ left: 240, right: 0 });
  });
});

describe('malformed stored layout (#943)', () => {
  const malformed: readonly [string, unknown][] = [
    ['string', 'tree'],
    ['number', 5],
    ['null', null],
    ['object', { tree: true }],
  ];

  it.each(malformed)('open %s falls back to the default, without exception', async (_name, open) => {
    localStorage.setItem('mapping.toolWindows', JSON.stringify({ open }));
    vi.resetModules();
    try {
      const fresh = await import('../../src/store/toolWindows');
      expect(fresh.isToolWindowOpen('tree')).toBe(true);
      expect(fresh.isToolWindowOpen('layers')).toBe(true);
      expect(fresh.isToolWindowOpen('details')).toBe(true);
      expect(fresh.isToolWindowOpen('list')).toBe(false);
    } finally {
      localStorage.removeItem('mapping.toolWindows');
      vi.resetModules();
    }
  });

  it('open with items that are not text ignores only those items', async () => {
    localStorage.setItem(
      'mapping.toolWindows',
      JSON.stringify({ open: [1, null, 'list'] }),
    );
    vi.resetModules();
    try {
      const fresh = await import('../../src/store/toolWindows');
      expect(fresh.isToolWindowOpen('list')).toBe(true);
      expect(fresh.isToolWindowOpen('tree')).toBe(false);
    } finally {
      localStorage.removeItem('mapping.toolWindows');
      vi.resetModules();
    }
  });
});
