import { act, cleanup, fireEvent, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../../src/model';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import { goToAnnotation } from '../../src/store/ui';
import { AnnotationEditor } from '../../src/ui/AnnotationEditor';
import { MarkingPanel } from '../../src/ui/MarkingPanel';
import { cadastroProject } from '../model/specFixtures';
import { annotationOf, createHarness, renderLive, type Harness } from './harness';
import { layerOf } from '../model/specFixtures';

// R5: redesigned Details (identity, PropertyGrid, collapsible LayerGroup, pending items
// with links, KeyValueGrid with drag and keyboard). Editing and undo are the same as before.

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

function renderMarking(markingId: string, project: Project = cadastroProject()) {
  const harness = createHarness(project);
  renderLive(harness, (p) => {
    const marking = p.markings.find((m) => m.id === markingId);
    const image = p.containers.find((i) => i.id === marking?.containerId);
    if (!marking || !image) return null;
    return (
      <MarkingPanel
        project={p}
        marking={marking}
        image={image}
        readOnly={false}
        onDelete={() => undefined}
        onGoToAnnotation={(a) => goToAnnotation(harness.ui, a)}
      />
    );
  });
  return { harness, user: userEvent.setup() };
}

describe('Details — all layers hidden', () => {
  it('the Annotations section says they are hidden and "Show all" brings them back', async () => {
    const { harness, user } = renderMarking('MN');
    expect(screen.queryByText('All layers are hidden.')).toBeNull();
    act(() => {
      harness.ui.hiddenLayers.value = new Set(harness.project().layers.map((l) => l.id));
    });
    expect(screen.getByText('All layers are hidden.')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: /^Add annotation in layer/ }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: '+ Annotation' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Show all' }));
    expect(harness.ui.hiddenLayers.value.size).toBe(0);
    expect(screen.queryByText('All layers are hidden.')).toBeNull();
  });
});

describe('Details — marking', () => {
  it('identity: name, where it is and the ID with copy', async () => {
    const { user } = renderMarking('MN');
    // pt-BR kept: shared fixture data asserted by tests/model (specFixtures)
    expect(screen.getByText('Nome', { selector: '.identity-name' })).toBeTruthy();
    // pt-BR kept: shared fixture data asserted by tests/model (specFixtures)
    expect(screen.getByText('In images/cadastro.png › Formulário')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Copy ID: MN' }));
    // user-event swaps the clipboard for an in-memory one.
    expect(await navigator.clipboard.readText()).toBe('MN');
    expect(screen.getByText('ID copied.').getAttribute('role')).toBe('status');
  });

  it('Marking section: position and size in pairs; collapsed, it shows the summary', async () => {
    const { harness, user } = renderMarking('MT');
    const x = screen.getByLabelText('X');
    await user.clear(x);
    await user.type(x, '120{Enter}');
    expect(harness.project().markings.find((m) => m.id === 'MT')?.rect.x).toBe(120);
    expect(screen.getByLabelText('Width')).toHaveProperty('value', '800');

    await user.click(screen.getByRole('button', { name: /^Marking/ }));
    expect(screen.queryByLabelText('X')).toBeNull();
    expect(screen.getByText('X 120 · Y 50 · 800 × 100 px')).toBeTruthy();
    // One undo step restores the X (collapsing does not enter the history).
    harness.store.undo();
    expect(harness.project().markings.find((m) => m.id === 'MT')?.rect.x).toBe(100);
  });

  // 8.3 rework (second read, A1): after undo, the same name was swallowed by the Enter
  // guard (the field showed the text and the project did not change).
  it('name: saving, undoing and retyping the same name saves again with Enter', async () => {
    const { harness, user } = renderMarking('MN');
    const name = () => screen.getByLabelText<HTMLInputElement>('Name');
    const stored = () => harness.project().markings.find((m) => m.id === 'MN')?.name;
    await user.clear(name());
    await user.type(name(), 'New name{Enter}');
    expect(stored()).toBe('New name');
    act(() => {
      harness.store.undo();
    });
    // pt-BR kept: shared fixture data asserted by tests/model (specFixtures)
    expect(stored()).toBe('Nome');
    // pt-BR kept: shared fixture data asserted by tests/model (specFixtures)
    expect(name().value).toBe('Nome');
    await user.clear(name());
    await user.type(name(), 'New name{Enter}');
    expect(stored()).toBe('New name');
    expect(document.activeElement).toBe(name());
  });

  it('pending items: each reason moves the focus to the field', async () => {
    const { user } = renderMarking('MT');
    const notice = screen.getByText('Incomplete: 1 issue').closest('.issues');
    if (!(notice instanceof HTMLElement)) throw new Error('no pending-items notice');
    const id = screen.getByLabelText('id');
    expect(id.getAttribute('aria-invalid')).toBe('true');
    await user.click(
      within(notice).getByRole('button', { name: /id: required and empty/ }),
    );
    await vi.waitFor(() => expect(document.activeElement).toBe(id));
  });

  it('a collapsed LayerGroup summarizes the first annotation and does not mount the annotations', async () => {
    const { user } = renderMarking('MF');
    const group = screen.getByRole('button', { name: /^Model/ });
    expect(group.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByLabelText('Annotation name')).toBeTruthy();
    await user.click(group);
    expect(screen.queryByLabelText('Annotation name')).toBeNull();
    expect(group.textContent).toContain('User — name: string · age: number');
  });

  it('going to an annotation of a collapsed layer opens the layer and focuses the annotation', async () => {
    const { harness, user } = renderMarking('MF');
    await user.click(screen.getByRole('button', { name: /^Model/ }));
    expect(screen.queryByLabelText('Annotation name')).toBeNull();
    act(() => goToAnnotation(harness.ui, annotationOf(harness.project(), 'AU')));
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText('Annotation name')),
    );
  });

  it('a collapsed annotation shows the summary in place of the body', async () => {
    const { user } = renderMarking('MF');
    await user.click(screen.getByRole('button', { name: 'Collapse User' }));
    expect(screen.queryAllByLabelText('Key')).toHaveLength(0);
    expect(screen.getByText('User — name: string · age: number')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Show User' }));
    expect(screen.getAllByLabelText('Key')).toHaveLength(2);
  });
});

function renderAnnotation(id: string): {
  harness: Harness;
  user: ReturnType<typeof userEvent.setup>;
} {
  const harness = createHarness(cadastroProject());
  renderLive(harness, (p) => (
    <AnnotationEditor
      project={p}
      annotation={annotationOf(p, id)}
      visibleLayerIds={new Set(p.layers.map((l) => l.id))}
      onGoToAnnotation={() => undefined}
      onShowLayer={() => undefined}
      readOnly={false}
    />
  ));
  return { harness, user: userEvent.setup() };
}

const keys = (h: Harness, id: string) =>
  annotationOf(h.project(), id).entries.map((e) => e.key);

describe('Detalhes — KeyValueGrid', () => {
  it('Alt+Shift+↓ moves the pair and the focus follows the row', async () => {
    const { harness, user } = renderAnnotation('AU');
    const [first] = screen.getAllByLabelText('Key');
    first?.focus();
    await user.keyboard('{Alt>}{Shift>}{ArrowDown}{/Shift}{/Alt}');
    expect(keys(harness, 'AU')).toEqual(['age', 'name']);
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Move pair name' }),
      ),
    );
    // ↑ on the handle moves it back.
    await user.keyboard('{ArrowUp}');
    expect(keys(harness, 'AU')).toEqual(['name', 'age']);
  });

  it('Alt+Enter creates a new pair with the focus on the key', async () => {
    const { harness, user } = renderAnnotation('AU');
    screen.getAllByLabelText('Value')[0]?.focus();
    await user.keyboard('{Alt>}{Enter}{/Alt}');
    const created = screen.getAllByLabelText('Key')[2];
    await vi.waitFor(() => expect(document.activeElement).toBe(created));
    await user.keyboard('email{Enter}');
    expect(keys(harness, 'AU')).toEqual(['name', 'age', 'email']);
  });

  it('dragging by the handle reorders with a single undo entry', () => {
    const { harness } = renderAnnotation('AU');
    const rows = [...document.querySelectorAll<HTMLElement>('[data-drag-row]')];
    rows.forEach((row, i) => {
      row.getBoundingClientRect = () => new DOMRect(0, i * 30, 300, 30);
    });
    const grip = screen.getByRole('button', { name: 'Move pair name' });
    fireEvent.pointerDown(grip, { button: 0, clientY: 15, pointerId: 1 });
    fireEvent.pointerMove(grip, { clientY: 40, pointerId: 1 });
    expect(rows[0]?.classList.contains('is-dragging')).toBe(true);
    fireEvent.pointerMove(grip, { clientY: 55, pointerId: 1 });
    expect(rows[1]?.getAttribute('data-drop')).toBe('after');
    fireEvent.pointerUp(grip, { clientY: 55, pointerId: 1 });
    expect(keys(harness, 'AU')).toEqual(['age', 'name']);
    harness.store.undo();
    expect(keys(harness, 'AU')).toEqual(['name', 'age']);
  });

  it('a canceled drag changes nothing', () => {
    const { harness } = renderAnnotation('AU');
    const grip = screen.getByRole('button', { name: 'Move pair name' });
    fireEvent.pointerDown(grip, { button: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(grip, { clientY: 500, pointerId: 1 });
    fireEvent.pointerCancel(grip, { pointerId: 1 });
    expect(keys(harness, 'AU')).toEqual(['name', 'age']);
  });

  it('Esc on the new pair discards the row', async () => {
    const { user } = renderAnnotation('AU');
    await user.click(screen.getByRole('button', { name: '+ Pair' }));
    const created = screen.getAllByLabelText('Key')[2];
    await vi.waitFor(() => expect(document.activeElement).toBe(created));
    await user.keyboard('x{Escape}');
    expect(screen.getAllByLabelText('Key')).toHaveLength(2);
    // Stage 8 (8.3), F5: the discarded row held the focus; it goes to "+ Pair".
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: '+ Pair' })),
    );
  });

  // Stage 8 (8.3), finding F5 (O5): Enter in the Value took the focus out of the field (it went to the body).
  it('Enter in the Value saves and keeps the focus on the field', async () => {
    const { harness, user } = renderAnnotation('AU');
    const [value] = screen.getAllByLabelText('Value');
    if (!value) throw new Error('no Value');
    await user.clear(value);
    await user.type(value, 'text{Enter}');
    expect(annotationOf(harness.project(), 'AU').entries[0]?.value).toBe('text');
    expect(document.activeElement).toBe(screen.getAllByLabelText('Value')[0]);
  });

  // 8.3 rework (second read, A1): the Enter guard of the pairs was never reset, and
  // the saved draft came back to the field after undo. Retyping the same text did not
  // save.
  it('Value: saving, undoing and retyping the same value saves again with Enter', async () => {
    const { harness, user } = renderAnnotation('AU');
    const value = () => screen.getAllByLabelText<HTMLInputElement>('Value')[0];
    const stored = () => annotationOf(harness.project(), 'AU').entries[0]?.value;
    await user.clear(value()!);
    await user.type(value()!, 'text{Enter}');
    expect(stored()).toBe('text');
    act(() => {
      harness.store.undo();
    });
    expect(stored()).toBe('string');
    // The field follows the saved pair, not the earlier draft.
    expect(value()?.value).toBe('string');
    await user.clear(value()!);
    await user.type(value()!, 'text{Enter}');
    expect(stored()).toBe('text');
  });

  it('Key: saving, undoing and retyping the same key saves again', async () => {
    const { harness, user } = renderAnnotation('AU');
    const key = () => screen.getAllByLabelText<HTMLInputElement>('Key')[0];
    await user.clear(key()!);
    await user.type(key()!, 'renamed{Enter}');
    expect(keys(harness, 'AU')).toEqual(['renamed', 'age']);
    act(() => {
      harness.store.undo();
    });
    expect(keys(harness, 'AU')).toEqual(['name', 'age']);
    expect(key()?.value).toBe('name');
    await user.clear(key()!);
    await user.type(key()!, 'renamed{Enter}');
    expect(keys(harness, 'AU')).toEqual(['renamed', 'age']);
  });

  // The row is identified by position: the one that saved the new pair becomes the saved pair and, when
  // the creation is undone with another new pair open, it goes back to being the new pair (same instance).
  it('new pair: creating, undoing with another new pair open and recreating the same key saves', async () => {
    const { harness, user } = renderAnnotation('AU');
    const addButton = () => screen.getByRole('button', { name: '+ Pair' });
    await user.click(addButton());
    await user.type(screen.getAllByLabelText('Key')[2]!, 'email{Enter}');
    expect(keys(harness, 'AU')).toEqual(['name', 'age', 'email']);
    await user.click(addButton());
    expect(screen.getAllByLabelText('Key')).toHaveLength(4);
    act(() => {
      harness.store.undo();
    });
    expect(keys(harness, 'AU')).toEqual(['name', 'age']);
    const created = screen.getAllByLabelText<HTMLInputElement>('Key');
    expect(created).toHaveLength(3);
    // The new row starts empty, not with the draft of the undone creation.
    expect(created[2]?.value).toBe('');
    await user.type(created[2]!, 'email{Enter}');
    expect(keys(harness, 'AU')).toEqual(['name', 'age', 'email']);
  });
});

describe('Detalhes — DataGrid', () => {
  it('Alt+Enter in the table creates a row', async () => {
    const { harness, user } = renderAnnotation('AC');
    // pt-BR kept: shared fixture data asserted by tests/model (specFixtures)
    screen.getByLabelText('exemplo (email)').focus();
    await user.keyboard('{Alt>}{Enter}{/Alt}');
    const rows = annotationOf(harness.project(), 'AC').values?.['atributos'];
    expect(Array.isArray(rows) ? rows.length : 0).toBe(2);
  });

  it('numbered rows, with the row name', () => {
    renderAnnotation('AC');
    // pt-BR kept: shared fixture data asserted by tests/model (specFixtures)
    const table = screen.getByRole('table', { name: 'atributos' });
    const [, row] = within(table).getAllByRole('row');
    expect(row?.textContent).toContain('1');
    expect(row?.textContent).toContain('email');
  });
});

// Stage 8 (8.3), finding F3: the "type" step is replaced by the "owner" step in the same slot; the new
// dialog kept as "who opened it" the type button, which had already left, and the focus was lost.
describe('Details — new typed annotation with owner (F3)', () => {
  it('type › owner › Cancel goes back to the layer's +', async () => {
    const { harness, user } = renderMarking('MC');
    // The + of the Events layer (the only way to add an annotation: there is no button at the top).
    const eventos = layerOf(harness.project(), 'sdui', 'eventos');
    const layerName = harness.project().layers.find((l) => l.id === eventos)?.name ?? '';
    const add = await screen.findByRole('button', {
      name: t('annotation.addIn', { layer: layerName }),
    });
    await user.click(add);
    const types = await vi.waitFor(() => {
      const el = document.querySelector('dialog');
      if (!el) throw new Error('no type step');
      return el;
    });
    await user.click(
      within(types).getByRole('button', { name: /^onClick/, hidden: true }),
    );
    const owner = await vi.waitFor(() => {
      const el = document.querySelector('dialog');
      if (!el?.textContent?.includes('Owner of the')) throw new Error('no owner step');
      return el;
    });
    owner.dispatchEvent(new Event('cancel', { cancelable: true }));
    await vi.waitFor(() => expect(document.querySelector('dialog')).toBeNull());
    expect(document.activeElement).toBe(add);
  });
});

/** Elements that received focus while `run` runs (in order). */
async function focusTrail(run: () => Promise<void>): Promise<Element[]> {
  const focused: Element[] = [];
  const track = (e: FocusEvent) => focused.push(e.target as Element);
  document.addEventListener('focusin', track);
  try {
    await run();
  } finally {
    document.removeEventListener('focusin', track);
  }
  return focused;
}

// Stage 8 (8.3), finding F2: "choose and go" (Ctrl+Enter in the picker) had two owners of the
// focus: the picker's return (to the `dado` field) and the panel (to the target annotation), and the right one
// won only by queue order. Now the panel is the owner and acts on commit; the picker's
// return sees the focus already at the destination and leaves it alone. The focus goes straight there.
describe('Details — choose and go to the target (F2)', () => {
  it('Ctrl+Enter in the picker takes the focus straight to the target annotation', async () => {
    const harness = createHarness(cadastroProject());
    harness.ui.selection.value = { kind: 'marking', id: 'MN' };
    renderLive(harness, (p) => {
      const selection = harness.ui.selection.value;
      const marking = p.markings.find(
        (m) => selection?.kind === 'marking' && m.id === selection.id,
      );
      const image = p.containers.find((i) => i.id === marking?.containerId);
      if (!marking || !image) return null;
      return (
        <MarkingPanel
          project={p}
          marking={marking}
          image={image}
          readOnly={false}
          onDelete={() => undefined}
          onGoToAnnotation={(a) => goToAnnotation(harness.ui, a)}
        />
      );
    });
    const user = userEvent.setup();
    // pt-BR kept: shared fixture data asserted by tests/model (specFixtures)
    await user.click(screen.getByRole('button', { name: /: dado$/ }));
    await vi.waitFor(() => {
      const el = document.querySelector('dialog');
      if (!el?.contains(document.activeElement)) throw new Error('the picker did not open');
    });
    let target: Element | null = null;
    const trail = await focusTrail(async () => {
      // Opens on the current one (User.name); ↓ goes to User.age, of the User annotation in the Form.
      await user.keyboard('{ArrowDown}{Control>}{Enter}{/Control}');
      await vi.waitFor(() => expect(document.querySelector('dialog')).toBeNull());
      const name = await screen.findByLabelText('Annotation name');
      target = name;
      await vi.waitFor(() => expect(document.activeElement).toBe(name));
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(trail).toEqual([target]);
  });
});
