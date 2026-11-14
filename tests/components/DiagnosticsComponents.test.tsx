import { signal } from '@preact/signals';
import { cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasController } from '../../src/canvas/CanvasController';
import { t } from '../../src/i18n';
import {
  rawMessage,
  type ComponentDrawing,
  type ComponentDrawings,
  type ModelMessage,
} from '../../src/model';
import type { FontStatus } from '../../src/storage/fonts';
import { locale } from '../../src/store/settings';
import { DiagnosticsView } from '../../src/ui/DiagnosticsView';
import { EditorContext, type EditorContextValue } from '../../src/ui/EditorContext';
import { libraryHarness, type LibraryHarness } from './libraryHarness';

// B3/P7: the "Components" section of the Diagnostics (fonts, components that failed to load and the
// drawing warnings per marking).

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

const font = (weight: string, style: 'normal' | 'italic' = 'normal') => ({
  family: 'Roboto',
  weight,
  style,
  path: `specs/material3/fonts/Roboto-${weight}.ttf`,
});

/** The harness context with fonts and drawing warnings chosen by the test. */
function withInjected(
  harness: LibraryHarness,
  injected: {
    fonts?: readonly FontStatus[];
    warnings?: readonly { markingId: string; warnings: readonly ModelMessage[] }[];
    overflowing?: readonly string[];
  },
): EditorContextValue {
  const { context } = harness;
  const scenes: ComponentDrawings = new Map(
    (injected.overflowing ?? []).map((id) => [
      id,
      { markingId: id, overflow: true, warnings: [] } as unknown as ComponentDrawing,
    ]),
  );
  return {
    ...context,
    session: {
      ...context.session,
      components: {
        ...context.session.components,
        fonts: signal(injected.fonts ?? []),
      },
    },
    derived: {
      ...context.derived,
      componentWarnings: signal(injected.warnings ?? []),
      componentScenes: signal(scenes),
    },
  };
}

function renderView(context: EditorContextValue) {
  render(
    <EditorContext.Provider value={context}>
      <DiagnosticsView />
    </EditorContext.Provider>,
  );
}

const section = () => screen.queryByRole('region', { name: t('diagnostics.components') });

describe('Diagnostics: Components', () => {
  it('with nothing to show, the section does not appear', async () => {
    const harness = await libraryHarness();
    renderView(withInjected(harness, {}));
    expect(section()).toBeNull();
  });

  it('missing or failed fonts, with family, weight, style and the reason', async () => {
    const harness = await libraryHarness();
    renderView(
      withInjected(harness, {
        fonts: [
          { font: font('400'), status: 'loaded' },
          {
            font: font('500'),
            status: 'missing',
            problem: { code: 'missing', path: 'specs/material3/fonts/Roboto-500.ttf' },
          },
          {
            font: font('700', 'italic'),
            status: 'failed',
            problem: { code: 'load-failed', message: 'corrupted file' },
          },
        ],
      }),
    );
    const items = within(section() as HTMLElement).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      `Roboto · weight 500 · normal: ${t('diagnostics.fontMissing', { path: 'specs/material3/fonts/Roboto-500.ttf' })}`,
      `Roboto · weight 700 · italic: ${t('diagnostics.fontFailed', { detail: 'corrupted file' })}`,
    ]);
  });

  it('the state of each font appears in English', async () => {
    const harness = await libraryHarness();
    renderView(
      withInjected(harness, {
        fonts: [
          {
            font: font('500'),
            status: 'missing',
            problem: { code: 'missing', path: 'specs/material3/fonts/Roboto-500.ttf' },
          },
          { font: font('600'), status: 'failed', problem: { code: 'no-fontface' } },
          {
            font: font('700'),
            status: 'failed',
            problem: { code: 'load-failed', message: 'corrupted' },
          },
        ],
      }),
    );
    const text = within(section() as HTMLElement)
      .getAllByRole('listitem')
      .map((li) => li.textContent)
      .join('\n');
    // pt-BR kept: asserts that the Portuguese strings are absent in en-US
    expect(text).not.toMatch(
      /arquivo não encontrado|não tem FontFace|ausente|não carregou/,
    );
    expect(text).toContain('specs/material3/fonts/Roboto-500.ttf');
    expect(text).toContain('corrupted');
    expect(text.toLowerCase()).toContain('fontface');
  });

  it('a component that failed to load appears with the specialization', async () => {
    const harness = await libraryHarness({
      mutate: (files) => files.delete('components/m3-card.json'),
    });
    renderView(harness.context);
    const list = within(section() as HTMLElement);
    expect(list.getByText(t('diagnostics.catalogProblems'))).toBeTruthy();
    expect(list.getByText(/m3-card/)).toBeTruthy();
  });

  it('drawing warnings: marking name, button that selects and the "does not fit" count', async () => {
    const harness = await libraryHarness();
    const result = harness.actions.addComponent({
      containerId: 'I1',
      parentId: null,
      specId: 'material3',
      typeId: 'm3-button',
    });
    if (!result.ok) throw new Error(result.error);
    const id = result.value;
    harness.context.canvas.current = {
      centerSelection: vi.fn(),
    } as unknown as CanvasController;
    renderView(
      withInjected(harness, {
        warnings: [
          { markingId: id, warnings: [rawMessage('content larger than the box')] },
        ],
        overflowing: [id],
      }),
    );
    const view = within(section() as HTMLElement);
    expect(view.getByText(t('diagnostics.overflowCount', { count: 1 }))).toBeTruthy();
    expect(view.getByText(/content larger than the box/)).toBeTruthy();

    await userEvent.click(
      view.getByRole('button', {
        // Unnamed instance: the label is the name of the type it draws.
        name: t('diagnostics.selectMarking', { name: 'Button' }),
      }),
    );
    expect(harness.ui.selection.value).toEqual({ kind: 'marking', id });
  });
});
