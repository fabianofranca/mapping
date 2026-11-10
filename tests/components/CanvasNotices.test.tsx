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

describe('CanvasNotices — pé do canvas (PV2, decisão 7)', () => {
  it('o aviso curto vai para o .canvas-overlay-foot, com o papel e o texto de sempre', () => {
    const harness = createHarness(sampleProject());
    const { container } = mount(harness);
    act(() => showToast(harness.ui, 'Cada lado precisa ter pelo menos 8 px.'));
    const foot = container.querySelector('.canvas-overlay-foot');
    expect(foot).not.toBeNull();
    const toast = screen.getByRole('status');
    expect(foot?.contains(toast)).toBe(true);
    expect(toast.textContent).toBe('Cada lado precisa ter pelo menos 8 px.');
    expect(container.querySelector('.canvas-overlay')?.contains(toast)).toBe(false);
  });

  it('o progresso vai para o pé, com aria-live polite', () => {
    const harness = createHarness(sampleProject());
    const { container } = mount(harness, fakeNotices({ progress: 'Importando' }));
    const foot = container.querySelector('.canvas-overlay-foot');
    const progress = screen.getByText('Importando');
    expect(foot?.contains(progress)).toBe(true);
    expect(progress.getAttribute('aria-live')).toBe('polite');
  });

  // Achado 1.1 (CL1): numa coluna estreita (canvas de 360 px, pé de ~200 px) o aviso quebra em
  // linhas em vez de cortar o texto com reticências (a medida de verdade está no e2e).
  it('o aviso do pé quebra linha: sem nowrap nem reticências', () => {
    const css = readFileSync('src/theme/canvas.css', 'utf8');
    const rule = /\.canvas-overlay-foot \.notice\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).not.toBe('');
    expect(rule).not.toMatch(/white-space:\s*nowrap/);
    expect(rule).not.toMatch(/text-overflow:\s*ellipsis/);
    expect(rule).not.toMatch(/overflow:\s*hidden/);
  });

  it('sem aviso curto nem progresso, não há pé', () => {
    const harness = createHarness(sampleProject());
    const { container } = mount(harness);
    expect(container.querySelector('.canvas-overlay-foot')).toBeNull();
  });
});

describe('CanvasNotices — topo do canvas', () => {
  it('Somente leitura fica no .canvas-overlay', () => {
    const harness = createHarness(sampleProject(), true);
    const { container } = mount(harness);
    const top = container.querySelector('.canvas-overlay');
    expect(top?.contains(screen.getByText(t('editor.readOnlyNotice')))).toBe(true);
    expect(container.querySelector('.canvas-overlay-foot')).toBeNull();
  });

  it('a mensagem de erro fica no .canvas-overlay, não no pé', () => {
    const harness = createHarness(sampleProject());
    const { container } = mount(harness, fakeNotices({ message: 'Deu ruim' }));
    const alert = screen.getByRole('alert');
    expect(container.querySelector('.canvas-overlay')?.contains(alert)).toBe(true);
    expect(container.querySelector('.canvas-overlay-foot')).toBeNull();
  });

  it('reparo, backup da migração e erro de gravação ficam no .canvas-overlay', () => {
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
