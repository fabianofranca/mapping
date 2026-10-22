import { signal } from '@preact/signals';
import { cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasController } from '../../src/canvas/CanvasController';
import { t } from '../../src/i18n';
import type { ComponentDrawing, ComponentDrawings } from '../../src/model';
import type { FontStatus } from '../../src/storage/fonts';
import { locale } from '../../src/store/settings';
import { DiagnosticsView } from '../../src/ui/DiagnosticsView';
import { EditorContext, type EditorContextValue } from '../../src/ui/EditorContext';
import { libraryHarness, type LibraryHarness } from './libraryHarness';

// B3/P7: a seção "Componentes" do Diagnóstico (fontes, componentes que não carregaram e os
// avisos do desenho por marcação).

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

const font = (weight: string, style: 'normal' | 'italic' = 'normal') => ({
  family: 'Roboto',
  weight,
  style,
  path: `specs/material3/fonts/Roboto-${weight}.ttf`,
});

/** O contexto do harness com fontes e avisos de desenho escolhidos pelo teste. */
function withInjected(
  harness: LibraryHarness,
  injected: {
    fonts?: readonly FontStatus[];
    warnings?: readonly { markingId: string; warnings: readonly string[] }[];
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

describe('Diagnóstico: Componentes', () => {
  it('sem nada a mostrar, a seção não aparece', async () => {
    const harness = await libraryHarness();
    renderView(withInjected(harness, {}));
    expect(section()).toBeNull();
  });

  it('fontes ausentes ou que falharam, com família, peso, estilo e o motivo', async () => {
    const harness = await libraryHarness();
    renderView(
      withInjected(harness, {
        fonts: [
          { font: font('400'), status: 'loaded' },
          { font: font('500'), status: 'missing' },
          { font: font('700', 'italic'), status: 'failed', detail: 'arquivo corrompido' },
        ],
      }),
    );
    const items = within(section() as HTMLElement).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      `Roboto · peso 500 · normal: ${t('diagnostics.fontMissing')}`,
      `Roboto · peso 700 · itálico: ${t('diagnostics.fontFailed', { detail: 'arquivo corrompido' })}`,
    ]);
  });

  it('componente que não carregou aparece com a especialização', async () => {
    const harness = await libraryHarness({
      mutate: (files) => files.delete('components/m3-card.json'),
    });
    renderView(harness.context);
    const list = within(section() as HTMLElement);
    expect(list.getByText(t('diagnostics.catalogProblems'))).toBeTruthy();
    expect(list.getByText(/m3-card/)).toBeTruthy();
  });

  it('avisos do desenho: nome da marcação, botão que seleciona e a conta dos "não cabe"', async () => {
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
        warnings: [{ markingId: id, warnings: ['conteúdo maior que a caixa'] }],
        overflowing: [id],
      }),
    );
    const view = within(section() as HTMLElement);
    expect(view.getByText(t('diagnostics.overflowCount', { count: 1 }))).toBeTruthy();
    expect(view.getByText(/conteúdo maior que a caixa/)).toBeTruthy();

    await userEvent.click(
      view.getByRole('button', {
        name: t('diagnostics.selectMarking', { name: t('marking.unnamed') }),
      }),
    );
    expect(harness.ui.selection.value).toEqual({ kind: 'marking', id });
  });
});
