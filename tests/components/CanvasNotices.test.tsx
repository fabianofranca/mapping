import { readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/preact';
import { t } from '../../src/i18n';
import { showToast } from '../../src/store/ui';
import { EditorContext } from '../../src/ui/EditorContext';
import { sampleProject } from '../model/fixtures';
import { createHarness } from './harness';
import type { EditorNotices } from '../../src/app/useEditorNotices';

vi.mock('../../src/app/controller', async () => {
  const { signal } = await import('@preact/signals');
  return { openProject: signal(null) };
});

import { CanvasNotices } from '../../src/app/CanvasNotices';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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

function mount(
  harness: ReturnType<typeof createHarness>,
  notices: EditorNotices = fakeNotices(),
) {
  return render(
    <EditorContext.Provider value={harness.context}>
      <CanvasNotices notices={notices} />
    </EditorContext.Provider>,
  );
}

describe('CanvasNotices — canvas foot (PV2, decision 7)', () => {
  it('the short notice goes to .canvas-overlay-foot, with the usual role and text', () => {
    const harness = createHarness(sampleProject());
    const { container } = mount(harness);
    act(() => showToast(harness.ui, 'Each side must be at least 8 px.'));
    const foot = container.querySelector('.canvas-overlay-foot');
    expect(foot).not.toBeNull();
    const toast = screen.getByRole('status');
    expect(foot?.contains(toast)).toBe(true);
    expect(toast.textContent).toBe('Each side must be at least 8 px.');
    expect(container.querySelector('.canvas-overlay')?.contains(toast)).toBe(false);
  });

  it('the progress goes to the foot, with aria-live polite', () => {
    const harness = createHarness(sampleProject());
    const { container } = mount(harness, fakeNotices({ progress: 'Importing' }));
    const foot = container.querySelector('.canvas-overlay-foot');
    const progress = screen.getByText('Importing');
    expect(foot?.contains(progress)).toBe(true);
    expect(progress.getAttribute('aria-live')).toBe('polite');
  });

  // Finding 1.1 (CL1): in a narrow column (360 px canvas, ~200 px foot) the notice wraps onto
  // lines instead of cutting the text with an ellipsis (the real measurement is in the e2e).
  it('the foot notice wraps: no nowrap or ellipsis', () => {
    const css = readFileSync('src/theme/canvas.css', 'utf8');
    const rule = /\.canvas-overlay-foot \.notice\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).not.toBe('');
    expect(rule).not.toMatch(/white-space:\s*nowrap/);
    expect(rule).not.toMatch(/text-overflow:\s*ellipsis/);
    expect(rule).not.toMatch(/overflow:\s*hidden/);
  });

  it('without a short notice or progress, there is no foot', () => {
    const harness = createHarness(sampleProject());
    const { container } = mount(harness);
    expect(container.querySelector('.canvas-overlay-foot')).toBeNull();
  });
});

describe('CanvasNotices — top of the canvas', () => {
  it('Read-only goes in .canvas-overlay', () => {
    const harness = createHarness(sampleProject(), true);
    const { container } = mount(harness);
    const top = container.querySelector('.canvas-overlay');
    expect(top?.contains(screen.getByText(t('editor.readOnlyNotice')))).toBe(true);
    expect(container.querySelector('.canvas-overlay-foot')).toBeNull();
  });

  it('the error message goes in .canvas-overlay, not in the foot', () => {
    const harness = createHarness(sampleProject());
    const { container } = mount(harness, fakeNotices({ message: 'It went wrong' }));
    const alert = screen.getByRole('alert');
    expect(container.querySelector('.canvas-overlay')?.contains(alert)).toBe(true);
    expect(container.querySelector('.canvas-overlay-foot')).toBeNull();
  });

  it('repair, migration backup and save error go in .canvas-overlay', () => {
    const harness = createHarness(sampleProject());
    Object.assign(harness.context.open, { repaired: [{}] });
    Object.assign(harness.context.session.saveStatus, { value: 'error' });
    const { container } = mount(harness);
    const top = container.querySelector('.canvas-overlay');
    expect(top?.contains(screen.getByRole('alert'))).toBe(true);
    expect(
      top?.contains(
        screen.getByText(t('editor.repairNotice', { count: 1 }), { exact: false }),
      ),
    ).toBe(true);
    expect(container.querySelector('.canvas-overlay-foot')).toBeNull();
  });
});
