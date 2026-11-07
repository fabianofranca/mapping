import { act, cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { options, type VNode } from 'preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { addAnnotation, createArrow, type Marking, type Project } from '../../src/model';
import { locale } from '../../src/store/settings';
import { isSectionCollapsed } from '../../src/store/ui';
import { EditorContext } from '../../src/ui/EditorContext';
import { MarkingPanel } from '../../src/ui/MarkingPanel';
import { sampleProject } from '../model/fixtures';
import { createHarness, renderLive, type Harness } from './harness';

// Seção "Ligado por seta" dos Detalhes da marcação (etapa #658, LS1): uma linha por seta que sai
// ou chega, com a direção, a outra ponta (que se seleciona), a seta (que também se seleciona) e as
// anotações da outra ponta e da seta nas camadas visíveis, só para ler.

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

/**
 * A amostra com a seta `R1` "Fluxo" de M1 (Porta) para M4, a seta `R2` de M2 (Maçaneta) para M1,
 * uma anotação de M4 na camada Lataria (L1), uma de `R1` na Vidros (L2) e a A4 de M4 (Vidros).
 */
function linked(): Project {
  let p = sampleProject();
  p = createArrow(p, { id: 'R1', from: 'M1', to: 'M4', name: 'Fluxo' });
  p = createArrow(p, { id: 'R2', from: 'M2', to: 'M1' });
  p = addAnnotation(p, {
    id: 'Q1',
    markingId: 'M4',
    layerId: 'L1',
    name: 'Evento',
    entries: [{ id: 'QE1', key: 'origem', value: 'home' }],
  });
  p = addAnnotation(p, {
    id: 'Q2',
    markingId: 'R1',
    layerId: 'L2',
    name: 'Transição',
    entries: [{ id: 'QE2', key: 'quando', value: 'ao tocar' }],
  });
  return p;
}

const markingOf = (p: Project, id: string): Marking => {
  const found = p.markings.find((m) => m.id === id);
  if (!found) throw new Error(`marcação ${id} não encontrada`);
  return found;
};

function renderPanel(harness: Harness, markingId: string, readOnly = false) {
  renderLive(harness, (p) => {
    const marking = markingOf(p, markingId);
    return (
      <MarkingPanel
        project={p}
        marking={marking}
        image={p.containers.find((c) => c.id === marking.containerId) ?? null}
        readOnly={readOnly}
        onDelete={() => undefined}
        onGoToAnnotation={() => undefined}
      />
    );
  });
  return userEvent.setup();
}

const section = () => screen.queryByRole('region', { name: t('arrowLinks.section') });
const rows = () => within(section()!).getAllByRole('listitem');

describe('Detalhes — seção "Ligado por seta"', () => {
  it('marcação sem seta: a seção não aparece', () => {
    renderPanel(createHarness(sampleProject()), 'M3');
    expect(section()).toBeNull();
  });

  it('uma seta que sai e uma que chega: as duas linhas, as que saem antes, com a direção e a outra ponta', () => {
    renderPanel(createHarness(linked()), 'M1');
    expect(rows()).toHaveLength(2);
    const [out, incoming] = rows() as [HTMLElement, HTMLElement];
    expect(within(out).getByRole('img', { name: t('arrowLinks.out') })).toBeTruthy();
    expect(
      within(out).getByRole('button', {
        name: t('arrow.select', { name: t('marking.unnamed') }),
      }),
    ).toBeTruthy();
    expect(out.querySelector('.arrow-link-name')?.textContent).toBe('Fluxo');
    expect(within(incoming).getByRole('img', { name: t('arrowLinks.in') })).toBeTruthy();
    expect(
      within(incoming).getByRole('button', {
        name: t('arrow.select', { name: 'Maçaneta' }),
      }),
    ).toBeTruthy();
  });

  it('o botão da outra ponta seleciona a marcação; "Selecionar a seta" seleciona a seta', async () => {
    const harness = createHarness(linked());
    const user = renderPanel(harness, 'M1');
    const [out] = rows() as [HTMLElement];
    await user.click(
      within(out).getByRole('button', {
        name: t('arrow.select', { name: t('marking.unnamed') }),
      }),
    );
    expect(harness.ui.selection.value).toEqual({ kind: 'marking', id: 'M4' });
    await user.click(
      within(out).getByRole('button', { name: t('arrowLinks.selectArrow') }),
    );
    expect(harness.ui.selection.value).toEqual({ kind: 'arrow', id: 'R1' });
  });

  it('mostra as anotações da outra ponta agrupadas por camada; esconder a camada as tira', () => {
    const harness = createHarness(linked());
    renderPanel(harness, 'M1');
    const [out] = rows() as [HTMLElement];
    const groups = out.querySelectorAll(':scope > .arrow-link-layer');
    // M4 tem anotações na Lataria (Q1) e na Vidros (A4); cada grupo traz bolinha e nome.
    expect(
      [...groups].map((g) => g.querySelector('.arrow-link-layer-name')?.textContent),
    ).toEqual(['Lataria', 'Vidros']);
    expect(within(out).getByText('Evento')).toBeTruthy();
    expect(within(out).getByText(/origem:/)).toBeTruthy();
    act(() => {
      harness.ui.hiddenLayers.value = new Set(['L1']);
    });
    expect(within(section()!).queryByText('Evento')).toBeNull();
    expect(
      [...out.querySelectorAll(':scope > .arrow-link-layer .arrow-link-layer-name')].map(
        (s) => s.textContent,
      ),
    ).toEqual(['Vidros']);
  });

  it('a anotação da própria seta fica sob "Na seta"', () => {
    renderPanel(createHarness(linked()), 'M1');
    const [out, incoming] = rows() as [HTMLElement, HTMLElement];
    const onArrow = within(out).getByText(t('arrowLinks.onArrow'));
    expect(onArrow).toBeTruthy();
    expect(within(out).getByText('Transição')).toBeTruthy();
    expect(within(out).getByText(/quando:/)).toBeTruthy();
    // A seta R2 não tem anotação: sem o rótulo.
    expect(within(incoming).queryByText(t('arrowLinks.onArrow'))).toBeNull();
  });

  it('sem anotação à vista: "Sem anotações nas camadas visíveis."', () => {
    const harness = createHarness(linked());
    renderPanel(harness, 'M1');
    act(() => {
      harness.ui.hiddenLayers.value = new Set(['L1', 'L2']);
    });
    const [out, incoming] = rows() as [HTMLElement, HTMLElement];
    expect(within(out).getByText(t('arrowLinks.empty'))).toBeTruthy();
    expect(within(incoming).getByText(t('arrowLinks.empty'))).toBeTruthy();
    expect(t('arrowLinks.empty')).toBe('Sem anotações nas camadas visíveis.');
  });

  it('é só leitura: nenhum "+" nem campo dentro da seção', () => {
    renderPanel(createHarness(linked()), 'M1');
    const body = section()!;
    expect(body.querySelector('input, textarea, select')).toBeNull();
    expect(within(body).queryByRole('button', { name: /^Adicionar/ })).toBeNull();
    expect(within(body).queryByRole('textbox')).toBeNull();
  });

  it('a seção recolhe e o estado é o das outras seções', async () => {
    const harness = createHarness(linked());
    const user = renderPanel(harness, 'M1');
    const toggle = within(section()!).getByRole('button', {
      name: new RegExp(`^${t('arrowLinks.section')}`),
    });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    await user.click(toggle);
    expect(isSectionCollapsed(harness.ui, { kind: 'arrowLinks' })).toBe(true);
    expect(within(section()!).queryAllByRole('listitem')).toHaveLength(0);
    await user.click(toggle);
    expect(rows()).toHaveLength(2);
  });

  it('a seta que aponta para uma marcação removida mostra o texto neutro, sem botão', () => {
    const p = linked();
    const broken: Project = {
      ...p,
      markings: p.markings.filter((m) => m.id !== 'M4'),
      annotations: p.annotations.filter((a) => a.markingId !== 'M4'),
    };
    renderPanel(createHarness(broken), 'M1');
    const [out] = rows() as [HTMLElement];
    expect(within(out).getByText(t('arrow.missingEnd'))).toBeTruthy();
  });
});

describe('Detalhes — seção "Ligado por seta": desempenho', () => {
  it('trocar de marcação monta só as linhas da nova, e mexer na vista não renderiza a seção', () => {
    const previous = options.diffed;
    const counts = new Map<string, number>();
    options.diffed = (vnode: VNode) => {
      const name = typeof vnode.type === 'function' ? vnode.type.name : '';
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
      previous?.(vnode);
    };
    try {
      const harness = createHarness(linked());
      // `key` por marcação, como o Editor faz ao trocar de seleção.
      const view = (id: string) => (
        <EditorContext.Provider value={harness.context}>
          <MarkingPanel
            key={id}
            project={harness.project()}
            marking={markingOf(harness.project(), id)}
            image={harness.project().containers[0] ?? null}
            readOnly={false}
            onDelete={() => undefined}
            onGoToAnnotation={() => undefined}
          />
        </EditorContext.Provider>
      );
      const { rerender } = render(view('M1'));
      expect(counts.get('ArrowLinkRow')).toBe(2);
      counts.clear();
      rerender(view('M4'));
      // M4 tem uma só seta (R1): não refaz as linhas das setas das outras marcações.
      expect(counts.get('ArrowLinkRow')).toBe(1);
      counts.clear();
      // Pan e zoom não passam pelo projeto nem pelas camadas: nada da seção renderiza.
      act(() => {
        harness.ui.selection.value = { kind: 'marking', id: 'M4' };
      });
      expect(counts.get('ArrowLinksSection') ?? 0).toBe(0);
    } finally {
      options.diffed = previous;
    }
  });
});
