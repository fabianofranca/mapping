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

// "Linked by arrow" section of the marking Details (stage #658, LS1): one row per arrow that leaves
// or arrives, with the direction, the other end (which can be selected), the arrow (which can also
// be selected) and the annotations of the other end and of the arrow in the visible layers, read-only.
// pt-BR kept: shared fixture data (Porta, Maçaneta, Lataria, Vidros) asserted by tests/model

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

/**
 * The sample with arrow `R1` "Flow" from M1 (Porta) to M4, arrow `R2` from M2 (Maçaneta) to M1,
 * an annotation of M4 in the Lataria layer (L1), one of `R1` in Vidros (L2) and A4 of M4 (Vidros).
 */
function linked(): Project {
  let p = sampleProject();
  p = createArrow(p, { id: 'R1', from: 'M1', to: 'M4', name: 'Flow' });
  p = createArrow(p, { id: 'R2', from: 'M2', to: 'M1' });
  p = addAnnotation(p, {
    id: 'Q1',
    markingId: 'M4',
    layerId: 'L1',
    name: 'Event',
    entries: [{ id: 'QE1', key: 'origin', value: 'home' }],
  });
  p = addAnnotation(p, {
    id: 'Q2',
    markingId: 'R1',
    layerId: 'L2',
    name: 'Transition',
    entries: [{ id: 'QE2', key: 'when', value: 'on touch' }],
  });
  return p;
}

const markingOf = (p: Project, id: string): Marking => {
  const found = p.markings.find((m) => m.id === id);
  if (!found) throw new Error(`marking ${id} not found`);
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

describe('Details — "Linked by arrow" section', () => {
  it('marking without an arrow: the section does not show', () => {
    renderPanel(createHarness(sampleProject()), 'M3');
    expect(section()).toBeNull();
  });

  it('one arrow that leaves and one that arrives: both rows, the outgoing first, with the direction and the other end', () => {
    renderPanel(createHarness(linked()), 'M1');
    expect(rows()).toHaveLength(2);
    const [out, incoming] = rows() as [HTMLElement, HTMLElement];
    expect(within(out).getByRole('img', { name: t('arrowLinks.out') })).toBeTruthy();
    expect(
      within(out).getByRole('button', {
        name: t('arrow.select', { name: t('marking.unnamed') }),
      }),
    ).toBeTruthy();
    expect(out.querySelector('.arrow-link-name')?.textContent).toBe('Flow');
    expect(within(incoming).getByRole('img', { name: t('arrowLinks.in') })).toBeTruthy();
    expect(
      within(incoming).getByRole('button', {
        name: t('arrow.select', { name: 'Maçaneta' }),
      }),
    ).toBeTruthy();
  });

  it('the button of the other end selects the marking; "Select the arrow" selects the arrow', async () => {
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

  it('shows the annotations of the other end grouped by layer; hiding the layer removes them', () => {
    const harness = createHarness(linked());
    renderPanel(harness, 'M1');
    const [out] = rows() as [HTMLElement];
    const groups = out.querySelectorAll(':scope > .arrow-link-layer');
    // M4 has annotations in Lataria (Q1) and in Vidros (A4); each group carries a dot and a name.
    expect(
      [...groups].map((g) => g.querySelector('.arrow-link-layer-name')?.textContent),
    ).toEqual(['Lataria', 'Vidros']);
    expect(within(out).getByText('Event')).toBeTruthy();
    expect(within(out).getByText(/origin:/)).toBeTruthy();
    act(() => {
      harness.ui.hiddenLayers.value = new Set(['L1']);
    });
    expect(within(section()!).queryByText('Event')).toBeNull();
    expect(
      [...out.querySelectorAll(':scope > .arrow-link-layer .arrow-link-layer-name')].map(
        (s) => s.textContent,
      ),
    ).toEqual(['Vidros']);
  });

  it('the annotation of the arrow itself stays under "On the arrow"', () => {
    renderPanel(createHarness(linked()), 'M1');
    const [out, incoming] = rows() as [HTMLElement, HTMLElement];
    const onArrow = within(out).getByText(t('arrowLinks.onArrow'));
    expect(onArrow).toBeTruthy();
    expect(within(out).getByText('Transition')).toBeTruthy();
    expect(within(out).getByText(/when:/)).toBeTruthy();
    // Arrow R2 has no annotation: no label.
    expect(within(incoming).queryByText(t('arrowLinks.onArrow'))).toBeNull();
  });

  it('no annotation in view: "No annotations in the visible layers."', () => {
    const harness = createHarness(linked());
    renderPanel(harness, 'M1');
    act(() => {
      harness.ui.hiddenLayers.value = new Set(['L1', 'L2']);
    });
    const [out, incoming] = rows() as [HTMLElement, HTMLElement];
    expect(within(out).getByText(t('arrowLinks.empty'))).toBeTruthy();
    expect(within(incoming).getByText(t('arrowLinks.empty'))).toBeTruthy();
    expect(t('arrowLinks.empty')).toBe('No annotations in the visible layers.');
  });

  it('it is read-only: no "+" or field inside the section', () => {
    renderPanel(createHarness(linked()), 'M1');
    const body = section()!;
    expect(body.querySelector('input, textarea, select')).toBeNull();
    expect(within(body).queryByRole('button', { name: /^Add/ })).toBeNull();
    expect(within(body).queryByRole('textbox')).toBeNull();
  });

  it('the section collapses and the state is that of the other sections', async () => {
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

  it('an arrow that points to a removed marking shows the neutral text, without a button', () => {
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

describe('Details — "Linked by arrow" section: performance', () => {
  it('switching markings mounts only the rows of the new one, and moving the view does not render the section', () => {
    const previous = options.diffed;
    const counts = new Map<string, number>();
    options.diffed = (vnode: VNode) => {
      const name = typeof vnode.type === 'function' ? vnode.type.name : '';
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
      previous?.(vnode);
    };
    try {
      const harness = createHarness(linked());
      // `key` per marking, as the Editor does when switching selection.
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
      // M4 has a single arrow (R1): does not redo the rows of the arrows of the other markings.
      expect(counts.get('ArrowLinkRow')).toBe(1);
      counts.clear();
      // Pan and zoom do not go through the project or the layers: nothing in the section renders.
      act(() => {
        harness.ui.selection.value = { kind: 'marking', id: 'M4' };
      });
      expect(counts.get('ArrowLinksSection') ?? 0).toBe(0);
    } finally {
      options.diffed = previous;
    }
  });
});
