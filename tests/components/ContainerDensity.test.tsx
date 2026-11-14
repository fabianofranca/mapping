import { cleanup, render, screen, waitFor, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasController } from '../../src/canvas/CanvasController';
import { t } from '../../src/i18n';
import {
  addBackgroundContainer,
  applySpecialization,
  setContainerDensity,
  type Project,
  type Spec,
} from '../../src/model';
import { locale } from '../../src/store/settings';
import { ContainerDialog } from '../../src/ui/ContainerDialog';
import { EditorContext } from '../../src/ui/EditorContext';
import { SelectionPanel } from '../../src/ui/SelectionPanel';
import { emptyProject } from '../model/fixtures';
import { createHarness, renderLive, type Harness } from './harness';

// D2: the Density field in the container Details (suggestion, Apply, Custom) and in the
// New container dialog.

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

const SPEC: Spec = {
  format: 'mapping-spec',
  formatVersion: 6,
  id: 'ds',
  name: 'Design System',
  version: 1,
  containers: [
    { id: 'phone', name: 'Phone', width: 360, height: 800 },
    { id: 'tablet', name: 'Tablet', width: 800, height: 1280, background: '#EEEEEE' },
  ],
  layers: [],
};

function screenProject(width = 1080, height = 2400): Project {
  return applySpecialization(
    addBackgroundContainer(emptyProject(), {
      id: 'C1',
      width,
      height,
      background: '#FFFFFF',
    }),
    SPEC,
  );
}

const options = (select: HTMLElement) =>
  within(select)
    .getAllByRole('option', { hidden: true })
    .map((o) => o.textContent);

describe('Container Details: Density field', () => {
  function setup(project = screenProject(), readOnly = false) {
    const harness = createHarness(project, readOnly);
    renderLive(harness, (p) => {
      const image = p.containers[0];
      return image ? (
        <SelectionPanel
          image={image}
          display={undefined}
          readOnly={readOnly}
          busy={false}
          onReplace={() => undefined}
          onDelete={() => undefined}
        />
      ) : null;
    });
    return { harness, user: userEvent.setup() };
  }
  const select = () =>
    screen.getByLabelText<HTMLSelectElement>(t('density.label'), { selector: 'select' });
  const custom = () => screen.getByLabelText<HTMLInputElement>(t('density.customLabel'));
  const density = (h: Harness) => h.project().containers[0]?.density;
  const hint = () => screen.queryByText('Suggestion: 3x (Phone 360 × 800)');
  const apply = () => screen.queryByRole('button', { name: t('density.apply') });

  it('the Select shows 1x to 4x and Custom, with 1x on a container without density', () => {
    setup();
    expect(options(select())).toEqual(['1x', '1.5x', '2x', '3x', '4x', 'Custom']);
    expect(select().value).toBe('1');
    expect(screen.queryByLabelText(t('density.customLabel'))).toBeNull();
  });

  it('in pt-BR the decimal separator is the comma (pt-BR)', () => {
    // pt-BR kept: the decimal separator of the Portuguese locale is the object of this test
    locale.value = 'pt-BR';
    setup();
    expect(options(select())).toEqual(['1x', '1,5x', '2x', '3x', '4x', 'Personalizada']);
  });

  it('the suggestion hint appears when it differs from the value and disappears when equal', async () => {
    const { harness, user } = setup();
    expect(hint()).toBeTruthy();
    expect(apply()).toBeTruthy();
    await user.selectOptions(select(), '3');
    expect(density(harness)).toBe(3);
    expect(hint()).toBeNull();
    expect(apply()).toBeNull();
    await user.selectOptions(select(), '2');
    expect(hint()).toBeTruthy();
  });

  it('with no ready size that explains the width there is no hint or Apply', () => {
    setup(screenProject(1000, 2000));
    expect(screen.queryByText(/Suggestion/)).toBeNull();
    expect(apply()).toBeNull();
  });

  it('Apply saves the suggestion and Ctrl+Z reverts it in a single entry', async () => {
    const { harness, user } = setup();
    await user.click(apply()!);
    expect(density(harness)).toBe(3);
    expect(select().value).toBe('3');
    expect(harness.store.undo()).toBe(true);
    expect(harness.project().containers[0]?.density).toBeUndefined();
    await waitFor(() => expect(select().value).toBe('1'));
    expect(harness.store.canUndo.value).toBe(false);
  });

  it('choosing 1x removes the density (back to the default)', async () => {
    const { harness, user } = setup(setContainerDensity(screenProject(), 'C1', 3));
    expect(select().value).toBe('3');
    await user.selectOptions(select(), '1');
    expect('density' in (harness.project().containers[0] ?? {})).toBe(false);
  });

  it('Custom accepts 2,625 (and 2.5) on confirm and shows the value outside the list', async () => {
    const { harness, user } = setup();
    await user.selectOptions(select(), 'custom');
    expect(density(harness)).toBeUndefined();
    await user.clear(custom());
    await user.type(custom(), '2,625{Enter}');
    expect(density(harness)).toBe(2.625);
    expect(select().value).toBe('custom');
    expect(custom().value).toBe('2.625');
    expect(harness.store.undo()).toBe(true);
    expect(density(harness)).toBeUndefined();
    await waitFor(() => expect(custom().value).toBe('1'));
    await user.clear(custom());
    await user.type(custom(), '2.5{Enter}');
    expect(density(harness)).toBe(2.5);
  });

  it('Custom refuses 0,2 and 9 with a warning and does not save', async () => {
    const { harness, user } = setup();
    await user.selectOptions(select(), 'custom');
    await user.clear(custom());
    await user.type(custom(), '0,2{Enter}');
    expect(density(harness)).toBeUndefined();
    expect(screen.getByRole('alert').textContent).toBe(t('density.error'));
    await user.clear(custom());
    await user.type(custom(), '9{Enter}');
    expect(density(harness)).toBeUndefined();
    await user.clear(custom());
    await user.type(custom(), 'abc{Enter}');
    expect(density(harness)).toBeUndefined();
  });

  it('a stored value outside the list (1.25) opens directly on Custom', () => {
    setup(setContainerDensity(screenProject(), 'C1', 1.25));
    expect(select().value).toBe('custom');
    expect(custom().value).toBe('1.25');
  });

  it('a value with more than 3 decimal places (the agent saves 2.6254) appears whole in the field', () => {
    setup(setContainerDensity(screenProject(), 'C1', 2.6254));
    expect(custom().value).toBe('2.6254');
  });

  it('the warning disappears when typing in the field again', async () => {
    const { harness, user } = setup(setContainerDensity(screenProject(), 'C1', 1.25));
    await user.clear(custom());
    await user.type(custom(), '0,2{Enter}');
    expect(screen.getByRole('alert').textContent).toBe(t('density.error'));
    await user.type(custom(), '3');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(density(harness)).toBe(1.25);
  });

  it('read-only disables the field and Apply', () => {
    setup(screenProject(), true);
    expect(select().disabled).toBe(true);
    expect(apply()?.hasAttribute('disabled')).toBe(true);
  });
});

describe('Details: container switch', () => {
  it('the warning and the Custom field of one container do not carry over to the other', async () => {
    const two = addBackgroundContainer(screenProject(), {
      id: 'C2',
      width: 360,
      height: 800,
      background: '#FFFFFF',
    });
    const harness = createHarness(two);
    const panel = (index: number) => {
      const image = harness.project().containers[index];
      return (
        <EditorContext.Provider value={harness.context}>
          {image && (
            <SelectionPanel
              image={image}
              display={undefined}
              readOnly={false}
              busy={false}
              onReplace={() => undefined}
              onDelete={() => undefined}
            />
          )}
        </EditorContext.Provider>
      );
    };
    const view = render(panel(0));
    const user = userEvent.setup();
    const select = () =>
      screen.getByLabelText<HTMLSelectElement>(t('density.label'), {
        selector: 'select',
      });
    await user.selectOptions(select(), 'custom');
    const field = screen.getByLabelText<HTMLInputElement>(t('density.customLabel'));
    await user.clear(field);
    await user.type(field, '0,2{Enter}');
    expect(screen.getByRole('alert').textContent).toBe(t('density.error'));
    view.rerender(panel(1));
    expect(select().value).toBe('1');
    expect(screen.queryByLabelText(t('density.customLabel'))).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('New container dialog: Density field', () => {
  const dialogEl = () => document.querySelector('dialog') as HTMLElement;
  const inDialog = () => within(dialogEl());

  function renderDialog(harness: Harness) {
    const canvas = {
      viewportCenter: vi.fn(() => ({ x: 2500, y: 100 })),
      centerSelection: vi.fn(),
    };
    harness.context.canvas.current = canvas as unknown as CanvasController;
    render(
      <EditorContext.Provider value={harness.context}>
        <ContainerDialog onClose={vi.fn()} />
      </EditorContext.Provider>,
    );
    return userEvent.setup();
  }
  const select = () =>
    inDialog().getByLabelText<HTMLSelectElement>(t('density.label'), {
      selector: 'select',
    });
  const create = (user: ReturnType<typeof userEvent.setup>) =>
    user.click(
      inDialog().getByRole('button', { name: t('container.create'), hidden: true }),
    );
  const named = (user: ReturnType<typeof userEvent.setup>) =>
    user.type(inDialog().getByLabelText(t('container.name')), 'Login');

  it('exists, starts at 1x and does not save density when it stays at 1x', async () => {
    const harness = createHarness(screenProject());
    const user = renderDialog(harness);
    expect(select().value).toBe('1');
    await named(user);
    await create(user);
    const created = harness.project().containers.at(-1);
    expect(created?.name).toBe('Login');
    expect('density' in (created ?? {})).toBe(false);
  });

  it('saves density when different from 1 (one entry: undo removes the container)', async () => {
    const harness = createHarness(screenProject());
    const user = renderDialog(harness);
    await user.selectOptions(select(), '3');
    await named(user);
    await create(user);
    expect(harness.project().containers.at(-1)?.density).toBe(3);
    expect(harness.store.undo()).toBe(true);
    expect(harness.project().containers).toHaveLength(1);
  });

  it('switching the ready size does not change the chosen density', async () => {
    const harness = createHarness(screenProject());
    const user = renderDialog(harness);
    await user.selectOptions(select(), '2');
    await user.selectOptions(
      inDialog().getByLabelText(t('container.preset')),
      'ds:tablet',
    );
    expect(select().value).toBe('2');
  });

  it('an invalid Custom warns right away, without waiting for Create container', async () => {
    const harness = createHarness(screenProject());
    const user = renderDialog(harness);
    await user.selectOptions(select(), 'custom');
    const field = inDialog().getByLabelText(t('density.customLabel'));
    await user.clear(field);
    await user.type(field, '9');
    expect(inDialog().getByRole('alert').textContent).toBe(t('density.error'));
    expect(field.getAttribute('aria-invalid')).toBe('true');
    await user.clear(field);
    await user.type(field, '2');
    expect(inDialog().queryByRole('alert')).toBeNull();
  });

  it('an invalid Custom blocks the creation with the warning', async () => {
    const harness = createHarness(screenProject());
    const user = renderDialog(harness);
    await user.selectOptions(select(), 'custom');
    await user.clear(inDialog().getByLabelText(t('density.customLabel')));
    await user.type(inDialog().getByLabelText(t('density.customLabel')), '0,2');
    await named(user);
    await create(user);
    expect(harness.project().containers).toHaveLength(1);
    expect(
      inDialog()
        .getAllByRole('alert')
        .map((a) => a.textContent),
    ).toContain(t('density.error'));
    await user.clear(inDialog().getByLabelText(t('density.customLabel')));
    await user.type(inDialog().getByLabelText(t('density.customLabel')), '2,625');
    await create(user);
    expect(harness.project().containers.at(-1)?.density).toBe(2.625);
  });
});
