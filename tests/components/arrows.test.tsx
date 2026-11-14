import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorDialogs } from '../../src/app/EditorDialogs';
import { useEditorDialogs } from '../../src/app/useEditorDialogs';
import { t } from '../../src/i18n';
import type { Arrow, Marking, Project } from '../../src/model';
import { locale, setShowArrows, showArrows, theme } from '../../src/store/settings';
import { showToolWindow } from '../../src/store/toolWindows';
import { selectItems, selectedItems } from '../../src/store/ui';
import { ArrowPanel } from '../../src/ui/ArrowPanel';
import { crumbsOf } from '../../src/ui/Breadcrumbs';
import { EditorContext } from '../../src/ui/EditorContext';
import { MarkingPanel } from '../../src/ui/MarkingPanel';
import { MarkingTree } from '../../src/ui/MarkingTree';
import { MultiSelectionPanel } from '../../src/ui/MultiSelectionPanel';
import { SettingsBar } from '../../src/ui/SettingsBar';
import { sampleProject } from '../model/fixtures';
import { descriptionOf } from './describedBy';
import { createHarness, renderLive, type Harness } from './harness';

// Arrows in the interface (ME4, decision 14): arrow Details, "Link to…", Tree, deletion with the
// arrow count, multi-selection, breadcrumb and the "Show arrows" switch.
// pt-BR kept: shared fixture data (Porta, Maçaneta) asserted by tests/model

beforeEach(() => {
  locale.value = 'en-US';
  showToolWindow('tree');
});
afterEach(() => {
  cleanup();
  theme.value = 'system';
});

/** The sample with an arrow A1 from M1 (Porta) to M4, with an annotation of it. */
function withArrow(): Harness {
  const harness = createHarness(sampleProject());
  const result = harness.actions.addArrow('M1', 'M4');
  if (!result.ok) throw new Error('addArrow failed');
  return harness;
}

const arrowOf = (p: Project): Arrow => {
  const arrow = p.arrows[0];
  if (!arrow) throw new Error('no arrow');
  return arrow;
};

function renderArrowPanel(harness: Harness) {
  renderLive(harness, (p) => (
    <ArrowPanel
      project={p}
      arrow={arrowOf(p)}
      readOnly={false}
      onDelete={vi.fn()}
      onGoToAnnotation={vi.fn()}
    />
  ));
  return userEvent.setup();
}

describe('Arrow Details', () => {
  it('shows name, origin, destination, style and the lock', () => {
    const harness = withArrow();
    renderArrowPanel(harness);
    expect(screen.getByLabelText(t('arrow.name'))).toBeTruthy();
    expect(
      screen.getByRole('button', { name: t('arrow.select', { name: 'Porta' }) }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: t('arrow.select', { name: t('marking.unnamed') }),
      }),
    ).toBeTruthy();
    const curve = screen.getByRole('button', { name: t('arrow.style.curve') });
    expect(curve.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: t('arrow.lock') })).toBeTruthy();
  });

  it('the name is editable and becomes the label', async () => {
    const harness = withArrow();
    const user = renderArrowPanel(harness);
    const field = screen.getByLabelText(t('arrow.name'));
    await user.type(field, 'Opens the screen{Enter}');
    expect(arrowOf(harness.project()).name).toBe('Opens the screen');
  });

  it('origin and destination select the marking', async () => {
    const harness = withArrow();
    const user = renderArrowPanel(harness);
    await user.click(
      screen.getByRole('button', { name: t('arrow.select', { name: 'Porta' }) }),
    );
    expect(harness.ui.selection.value).toEqual({ kind: 'marking', id: 'M1' });
  });

  it('switches the style in one undo entry', async () => {
    const harness = withArrow();
    const user = renderArrowPanel(harness);
    await user.click(screen.getByRole('button', { name: t('arrow.style.elbow') }));
    expect(arrowOf(harness.project()).style).toBe('elbow');
    harness.store.undo();
    expect(arrowOf(harness.project()).style).toBe('curve');
  });

  it('locked, the style and the deletion are disabled, but the name stays free', async () => {
    const harness = withArrow();
    const user = renderArrowPanel(harness);
    await user.click(screen.getByRole('button', { name: t('arrow.lock') }));
    expect(arrowOf(harness.project()).locked).toBe(true);
    // Decision 8 of #353: no notice under the header; the help icon next to the padlock.
    expect(document.querySelector('.notice')).toBeNull();
    const help = screen.getByRole('button', {
      name: t('help.about', { name: t('lock.helpName') }),
    });
    expect(descriptionOf(help)).toBe(t('arrow.lockNotice'));
    // The icon and the padlock stay together at any width (a single block that does not wrap).
    const lockButton = screen.getByRole('button', { name: t('arrow.lock') });
    expect(help.closest('.identity-lock')).not.toBeNull();
    expect(help.closest('.identity-lock')).toBe(lockButton.closest('.identity-lock'));
    // SN2: the name and the hint do not change; the state stays in aria-pressed.
    const lock = screen.getByRole('button', { name: t('arrow.lock') });
    expect(lock.getAttribute('aria-pressed')).toBe('true');
    expect(lock.parentElement?.querySelector('[data-tooltip]')?.textContent).toContain(
      t('arrow.lock'),
    );
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: t('arrow.style.straight') })
        .disabled,
    ).toBe(true);
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: t('arrow.delete') }).disabled,
    ).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>(t('arrow.name')).disabled).toBe(false);
  });

  it('Delete calls the delete request with the arrow', async () => {
    const harness = withArrow();
    const onDelete = vi.fn();
    renderLive(harness, (p) => (
      <ArrowPanel
        project={p}
        arrow={arrowOf(p)}
        readOnly={false}
        onDelete={onDelete}
        onGoToAnnotation={vi.fn()}
      />
    ));
    await userEvent.click(screen.getByRole('button', { name: t('arrow.delete') }));
    expect(onDelete).toHaveBeenCalledWith(arrowOf(harness.project()));
  });

  it('the annotations per layer are the usual ones, with the arrow as the owner', async () => {
    const harness = withArrow();
    const user = renderArrowPanel(harness);
    const arrow = arrowOf(harness.project());
    const add = screen.getAllByRole('button', {
      name: (name) => name.startsWith(t('annotation.addIn', { layer: '' }).trim()),
    })[0];
    if (!add) throw new Error('no annotation button');
    await user.click(add);
    const created = harness.project().annotations.filter((a) => a.markingId === arrow.id);
    expect(created).toHaveLength(1);
  });
});

describe('Link to…', () => {
  function renderMarking(harness: Harness, id: string) {
    renderLive(harness, (p) => {
      const marking = p.markings.find((m) => m.id === id) as Marking;
      const image = p.containers.find((c) => c.id === marking.containerId) ?? null;
      return (
        <MarkingPanel
          project={p}
          marking={marking}
          image={image}
          readOnly={false}
          onDelete={vi.fn()}
          onGoToAnnotation={vi.fn()}
        />
      );
    });
    return userEvent.setup();
  }

  it('the picker lists markings without the own one; choosing creates the arrow and selects it', async () => {
    const harness = createHarness(sampleProject());
    const user = renderMarking(harness, 'M1');
    await user.click(screen.getByRole('button', { name: t('arrow.linkTo') }));
    const list = await screen.findByRole('listbox', { hidden: true });
    const options = within(list).getAllByRole('option', { hidden: true });
    expect(options).toHaveLength(3);
    expect(options.map((o) => o.textContent).join('|')).not.toMatch(/^Porta/);
    const input = screen.getByRole('combobox', {
      name: t('arrow.pickerSearch'),
      hidden: true,
    });
    await user.type(input, 'Maçaneta');
    await user.keyboard('{Enter}');
    const arrow = arrowOf(harness.project());
    expect(arrow).toMatchObject({ from: 'M1', to: 'M2' });
    expect(harness.ui.selection.value).toEqual({ kind: 'arrow', id: arrow.id });
  });

  it('after choosing, focus stays in the Details window (which switches to the arrow), not on the first control of the app', async () => {
    const harness = createHarness(sampleProject());
    renderLive(harness, (p) => {
      const sel = harness.ui.selection.value;
      const arrow = sel?.kind === 'arrow' ? p.arrows.find((a) => a.id === sel.id) : null;
      const marking = p.markings.find((m) => m.id === 'M1') as Marking;
      const image = p.containers.find((c) => c.id === marking.containerId) ?? null;
      return (
        <div data-focus-root>
          <button type="button">before everything</button>
          <section data-window="details" tabIndex={-1} aria-label="Details">
            {arrow ? (
              <ArrowPanel
                project={p}
                arrow={arrow}
                readOnly={false}
                onDelete={vi.fn()}
                onGoToAnnotation={vi.fn()}
              />
            ) : (
              <MarkingPanel
                project={p}
                marking={marking}
                image={image}
                readOnly={false}
                onDelete={vi.fn()}
                onGoToAnnotation={vi.fn()}
              />
            )}
          </section>
        </div>
      );
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: t('arrow.linkTo') }));
    const input = await screen.findByRole('combobox', {
      name: t('arrow.pickerSearch'),
      hidden: true,
    });
    await user.type(input, 'Maçaneta');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(document.querySelector('dialog')).toBeNull());
    const details = document.querySelector('section[data-window="details"]');
    expect(arrowOf(harness.project())).toMatchObject({ from: 'M1', to: 'M2' });
    expect(document.activeElement).toBe(details);
  });

  it('disabled when read-only', () => {
    const harness = createHarness(sampleProject(), true);
    renderLive(harness, (p) => (
      <MarkingPanel
        project={p}
        marking={p.markings[0] as Marking}
        image={p.containers[0] ?? null}
        readOnly
        onDelete={vi.fn()}
        onGoToAnnotation={vi.fn()}
      />
    ));
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: t('arrow.linkTo') }).disabled,
    ).toBe(true);
  });
});

describe('Tree with arrows', () => {
  function renderTree(harness: Harness, onSelect = vi.fn()) {
    render(
      <EditorContext.Provider value={harness.context}>
        <MarkingTree
          project={harness.project()}
          selection={harness.ui.selection.value}
          onSelect={onSelect}
        />
      </EditorContext.Provider>,
    );
    return onSelect;
  }

  it('the arrow shows under the origin as "→ destination"; clicking selects it', async () => {
    const harness = withArrow();
    const onSelect = renderTree(harness);
    const row = screen.getByRole('button', {
      name: t('arrow.treeItem', { name: t('marking.unnamed') }),
    });
    expect(row.textContent).toContain(`→ ${t('marking.unnamed')}`);
    // Under the Porta (M1): inside the list that follows it.
    expect(row.closest('li')?.parentElement?.closest('li')?.textContent).toContain(
      'Porta',
    );
    await userEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith({
      kind: 'arrow',
      id: arrowOf(harness.project()).id,
    });
  });

  it('the arrow name replaces the destination', () => {
    const harness = withArrow();
    harness.actions.setArrowName(arrowOf(harness.project()).id, 'Opens');
    renderTree(harness);
    expect(screen.getByText('Opens')).toBeTruthy();
  });

  it('Shift+click toggles the arrow in the multi-selection', async () => {
    const harness = withArrow();
    const arrowId = arrowOf(harness.project()).id;
    harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    renderTree(harness);
    fireEvent.click(
      screen.getByRole('button', {
        name: t('arrow.treeItem', { name: t('marking.unnamed') }),
      }),
      { shiftKey: true },
    );
    expect(selectedItems(harness.ui)).toEqual([
      { kind: 'marking', id: 'M1' },
      { kind: 'arrow', id: arrowId },
    ]);
  });

  it('the row padlock locks the arrow', async () => {
    const harness = withArrow();
    renderTree(harness);
    await userEvent.click(
      screen.getByRole('button', {
        name: t('lock.treeLock', {
          name: t('arrow.treeItem', { name: t('marking.unnamed') }),
        }),
      }),
    );
    expect(arrowOf(harness.project()).locked).toBe(true);
  });
});

describe('deletion with arrows', () => {
  function Probe({
    run,
  }: {
    readonly run: (d: ReturnType<typeof useEditorDialogs>) => void;
  }) {
    const dialogs = useEditorDialogs();
    return (
      <>
        <button type="button" onClick={() => run(dialogs)}>
          go
        </button>
        <EditorDialogs dialogs={dialogs} />
      </>
    );
  }
  const dialog = () => document.querySelector('dialog') as HTMLElement;

  it('deleting a marking without children or annotations, but with an arrow, asks for confirmation with the count', async () => {
    const harness = createHarness(sampleProject());
    harness.actions.addArrow('M3', 'M4');
    const user = userEvent.setup();
    render(
      <EditorContext.Provider value={harness.context}>
        <Probe
          run={(d) =>
            d.requestDeleteMarking(
              harness.project().markings.find((m) => m.id === 'M3') as Marking,
            )
          }
        />
      </EditorContext.Provider>,
    );
    await user.click(screen.getByRole('button', { name: 'go' }));
    expect(dialog().textContent).toContain(t('marking.deleteArrows', { arrows: 1 }));
    await user.click(
      within(dialog()).getByRole('button', { name: t('common.delete'), hidden: true }),
    );
    expect(harness.project().arrows).toHaveLength(0);
  });

  it('the confirmation shows the annotations that leave with the arrow', async () => {
    const harness = withArrow();
    const arrow = arrowOf(harness.project());
    harness.actions.addAnnotation(arrow.id, 'L1');
    const user = userEvent.setup();
    render(
      <EditorContext.Provider value={harness.context}>
        <Probe run={(d) => d.requestDeleteArrow(arrowOf(harness.project()))} />
      </EditorContext.Provider>,
    );
    await user.click(screen.getByRole('button', { name: 'go' }));
    expect(dialog().textContent).toContain(
      t('arrow.deleteMessage', {
        name: 'Porta → ' + t('marking.unnamed'),
        annotations: 1,
      }),
    );
    await user.click(
      within(dialog()).getByRole('button', { name: t('common.delete'), hidden: true }),
    );
    expect(harness.project().arrows).toHaveLength(0);
    expect(harness.project().annotations.some((a) => a.markingId === arrow.id)).toBe(
      false,
    );
  });

  it('the arrow without an annotation is deleted directly; the locked one does nothing', async () => {
    const harness = withArrow();
    const user = userEvent.setup();
    render(
      <EditorContext.Provider value={harness.context}>
        <Probe run={(d) => d.requestDeleteArrow(arrowOf(harness.project()))} />
      </EditorContext.Provider>,
    );
    harness.actions.setArrowLocked(arrowOf(harness.project()).id, true);
    await user.click(screen.getByRole('button', { name: 'go' }));
    expect(harness.project().arrows).toHaveLength(1);
    harness.actions.setArrowLocked(arrowOf(harness.project()).id, false);
    await user.click(screen.getByRole('button', { name: 'go' }));
    expect(harness.project().arrows).toHaveLength(0);
  });

  it('deleting the selection counts the linked arrows', async () => {
    const harness = withArrow();
    const user = userEvent.setup();
    render(
      <EditorContext.Provider value={harness.context}>
        <Probe run={(d) => d.requestDeleteItems([{ kind: 'marking', id: 'M4' }])} />
      </EditorContext.Provider>,
    );
    await user.click(screen.getByRole('button', { name: 'go' }));
    expect(dialog().textContent).toContain(t('multi.deleteArrows', { arrows: 1 }));
  });
});

describe('multi-selection and breadcrumb', () => {
  it('the panel counts the arrows and locks all of them', async () => {
    const harness = withArrow();
    const arrowId = arrowOf(harness.project()).id;
    const items = [
      { kind: 'marking', id: 'M1' },
      { kind: 'arrow', id: arrowId },
    ] as const;
    renderLive(harness, (p) => (
      <MultiSelectionPanel
        project={p}
        items={items}
        readOnly={false}
        onDelete={vi.fn()}
      />
    ));
    expect(screen.getByText(t('multi.arrows', { count: 1 }))).toBeTruthy();
    expect(screen.getByText(t('multi.markings', { count: 1 }))).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: t('multi.lock') }));
    expect(arrowOf(harness.project()).locked).toBe(true);
    act(() => selectItems(harness.ui, []));
  });

  it('the arrow breadcrumb is "Canvas › Origin → Destination"', () => {
    const harness = withArrow();
    const arrow = arrowOf(harness.project());
    const crumbs = crumbsOf(harness.project(), { kind: 'arrow', id: arrow.id });
    expect(crumbs.map((c) => c.name)).toEqual([
      t('canvas.name'),
      `Porta → ${t('marking.unnamed')}`,
    ]);
    expect(crumbs[1]?.selection).toEqual({ kind: 'arrow', id: arrow.id });
  });
});

describe('Show arrows', () => {
  it('the switch turns the preference on and off', async () => {
    localStorage.clear();
    setShowArrows(true);
    render(<SettingsBar />);
    const box = screen.getByRole<HTMLInputElement>('checkbox', {
      name: new RegExp(t('view.arrows')),
    });
    expect(box.checked).toBe(true);
    await userEvent.click(box);
    expect(showArrows.value).toBe(false);
    expect(box.checked).toBe(false);
    await userEvent.click(box);
    expect(showArrows.value).toBe(true);
  });
});
