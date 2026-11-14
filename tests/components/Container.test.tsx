import { cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasController } from '../../src/canvas/CanvasController';
import { t } from '../../src/i18n';
import { MAX_CONTAINER_SIZE } from '../../src/model';
import { locale } from '../../src/store/settings';
import { EditorMainBar } from '../../src/app/EditorMainBar';
import type { EditorDialogs } from '../../src/app/useEditorDialogs';
import type { ProjectCommands } from '../../src/app/useProjectCommands';
import { ContainerDialog } from '../../src/ui/ContainerDialog';
import { EditorContext } from '../../src/ui/EditorContext';
import { SelectionPanel } from '../../src/ui/SelectionPanel';
import {
  parseContainerColor,
  parseContainerSide,
  presetGroups,
  selectionSize,
} from '../../src/ui/containerForm';
import { applySpecialization, type Project, type Spec } from '../../src/model';
import { sampleProject } from '../model/fixtures';
import { createHarness, renderLive, type Harness } from './harness';

// B3/P7: the "New container" dialog and the size and color fields in the screen Details.

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

const dialogEl = () => document.querySelector('dialog') as HTMLElement;
const inDialog = () => within(dialogEl());
/** The error shown under the field (or `null`): the notice sits in the same cell as the control. */
const alertOf = (control: HTMLElement): string | null =>
  control.closest('.props-value')?.querySelector('[role="alert"]')?.textContent ?? null;
const field = (name: string) => inDialog().getByLabelText<HTMLInputElement>(name);

function renderDialog(harness: Harness, onClose = vi.fn()) {
  const canvas = {
    viewportCenter: vi.fn(() => ({ x: 2500, y: 100 })),
    centerSelection: vi.fn(),
  };
  harness.context.canvas.current = canvas as unknown as CanvasController;
  render(
    <EditorContext.Provider value={harness.context}>
      <ContainerDialog onClose={onClose} />
    </EditorContext.Provider>,
  );
  return { canvas, onClose, user: userEvent.setup() };
}

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

function withSpec(project: Project): Project {
  return applySpecialization(project, SPEC);
}

const submit = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(
    inDialog().getByRole('button', { name: t('container.create'), hidden: true }),
  );

describe('reading the form', () => {
  it('integer sides from 1 to the maximum; #RRGGBB color', () => {
    expect(parseContainerSide('360')).toBe(360);
    expect(parseContainerSide(' 20000 ')).toBe(MAX_CONTAINER_SIZE);
    for (const bad of ['0', '-1', '12.5', 'abc', '', String(MAX_CONTAINER_SIZE + 1)]) {
      expect(parseContainerSide(bad), bad).toBeNull();
    }
    expect(parseContainerColor('#a1b2c3')).toBe('#A1B2C3');
    for (const bad of ['', 'fff', '#fff', '#GGGGGG', 'red']) {
      expect(parseContainerColor(bad), bad).toBeNull();
    }
  });
});

describe('New container dialog', () => {
  it('the specialization preset fills in size and background; creates, selects and frames', async () => {
    const harness = createHarness(withSpec(sampleProject()));
    const { user, canvas, onClose } = renderDialog(harness);
    await user.type(field(t('container.name')), 'Login');
    await user.selectOptions(
      inDialog().getByLabelText(t('container.preset')),
      'ds:tablet',
    );
    expect(field(t('container.width')).value).toBe('800');
    expect(field(t('container.height')).value).toBe('1280');
    expect(field(t('container.background')).value).toBe('#EEEEEE');
    await submit(user);

    const created = harness.project().containers.at(-1);
    expect(created).toMatchObject({
      name: 'Login',
      file: null,
      width: 800,
      height: 1280,
      background: '#EEEEEE',
    });
    expect(harness.ui.selection.value).toEqual({ kind: 'image', id: created?.id });
    expect(canvas.viewportCenter).toHaveBeenCalled();
    expect(canvas.centerSelection).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('with the specialization, the presets are grouped under its name', () => {
    renderDialog(createHarness(withSpec(sampleProject())));
    const select = inDialog().getByLabelText<HTMLSelectElement>(t('container.preset'));
    const group = select.querySelector('optgroup');
    expect(group?.label).toBe('Design System');
    expect(
      Array.from(group?.querySelectorAll('option') ?? []).map((o) => o.value),
    ).toEqual(['ds:phone', 'ds:tablet']);
    expect(select.value).toBe('ds:phone');
    expect(field(t('container.width')).value).toBe('360');
  });

  it('without a specialization only Custom and Selection size (disabled without a selection)', () => {
    renderDialog(createHarness(sampleProject()));
    const select = inDialog().getByLabelText<HTMLSelectElement>(t('container.preset'));
    expect(Array.from(select.options).map((o) => o.value)).toEqual([
      'custom',
      'selection',
    ]);
    expect(select.querySelector('optgroup')).toBeNull();
    expect(select.options[1]?.disabled).toBe(true);
    expect(select.value).toBe('custom');
  });

  it('Selection size uses the rectangle of the selected marking', async () => {
    const harness = createHarness(sampleProject());
    const marking = harness.project().markings[0];
    if (!marking) throw new Error('no marking');
    harness.ui.selection.value = { kind: 'marking', id: marking.id };
    expect(selectionSize(harness.project(), harness.ui.selection.value)).toEqual({
      width: marking.rect.width,
      height: marking.rect.height,
    });
    const { user } = renderDialog(harness);
    await user.selectOptions(
      inDialog().getByLabelText(t('container.preset')),
      'selection',
    );
    expect(field(t('container.width')).value).toBe(String(marking.rect.width));
    expect(field(t('container.height')).value).toBe(String(marking.rect.height));
  });

  it('presetGroups ignores a specialization without containers or without a copy', () => {
    expect(
      presetGroups([
        { id: 'a', spec: { ...SPEC, containers: undefined } },
        { id: 'b', spec: null },
      ]),
    ).toEqual([]);
  });

  it('editing the size switches the preset to Custom', async () => {
    const { user } = renderDialog(createHarness(withSpec(sampleProject())));
    await user.clear(field(t('container.width')));
    await user.type(field(t('container.width')), '361');
    expect(
      inDialog().getByLabelText<HTMLSelectElement>(t('container.preset')).value,
    ).toBe('custom');
  });

  it('validates: required name, size and color; nothing is created', async () => {
    const harness = createHarness(sampleProject());
    const before = harness.project().containers.length;
    const { user, onClose } = renderDialog(harness);

    await submit(user);
    expect(inDialog().getByRole('alert', { hidden: true }).textContent).toBe(
      t('container.error.name'),
    );

    await user.type(field(t('container.name')), 'Tela');
    await user.clear(field(t('container.width')));
    await user.type(field(t('container.width')), '0');
    await submit(user);
    expect(inDialog().getByRole('alert', { hidden: true }).textContent).toBe(
      t('container.error.size', { max: MAX_CONTAINER_SIZE }),
    );

    await user.clear(field(t('container.width')));
    await user.type(field(t('container.width')), '300');
    await user.clear(field(t('container.background')));
    await user.type(field(t('container.background')), 'blue');
    await submit(user);
    expect(inDialog().getByRole('alert', { hidden: true }).textContent).toBe(
      t('container.error.color'),
    );

    expect(harness.project().containers).toHaveLength(before);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('Container Details', () => {
  function renderContainer() {
    const harness = createHarness(sampleProject());
    const created = harness.actions.addBackgroundContainer({
      name: 'Home',
      width: 360,
      height: 800,
      background: '#FFFFFF',
    });
    if (!created.ok) throw new Error(created.error);
    renderLive(harness, (project) => {
      const image = project.containers.find((i) => i.id === created.value);
      return image ? (
        <SelectionPanel
          image={image}
          display={undefined}
          readOnly={false}
          busy={false}
          onReplace={() => undefined}
          onDelete={() => undefined}
        />
      ) : null;
    });
    const image = (): ReturnType<Harness['project']>['containers'][number] => {
      const found = harness.project().containers.find((i) => i.id === created.value);
      if (!found) throw new Error('no screen');
      return found;
    };
    return { harness, image, user: userEvent.setup() };
  }

  it('Width, Height and Background color in place of File', async () => {
    const { image, user } = renderContainer();
    expect(screen.queryByText(t('image.file'))).toBeNull();
    const width = screen.getByLabelText<HTMLInputElement>(t('container.width'));
    expect(width.value).toBe('360');
    expect(screen.getByLabelText<HTMLInputElement>(t('container.height')).value).toBe(
      '800',
    );

    await user.clear(width);
    await user.type(width, '412{Enter}');
    expect(image().width).toBe(412);

    const color = screen.getByLabelText<HTMLInputElement>(t('container.background'));
    await user.clear(color);
    await user.type(color, '#00ff00{Enter}');
    expect(image().background).toBe('#00FF00');
  });

  it('an invalid value shows the error and does not save', async () => {
    const { image, user } = renderContainer();
    const color = screen.getByLabelText<HTMLInputElement>(t('container.background'));
    await user.clear(color);
    await user.type(color, 'red{Enter}');
    expect(screen.getByRole('alert').textContent).toBe(t('container.error.color'));
    expect(image().background).toBe('#FFFFFF');

    const height = screen.getByLabelText<HTMLInputElement>(t('container.height'));
    await user.clear(height);
    await user.type(height, '0{Enter}');
    expect(alertOf(height)).toBe(t('container.error.size', { max: MAX_CONTAINER_SIZE }));
    expect(alertOf(color)).toBe(t('container.error.color'));
    expect(image().height).toBe(800);
  });

  it('the width, height and color errors appear under their own field (code review #954, item 36)', async () => {
    const { user } = renderContainer();
    const width = screen.getByLabelText<HTMLInputElement>(t('container.width'));
    const height = screen.getByLabelText<HTMLInputElement>(t('container.height'));
    const color = screen.getByLabelText<HTMLInputElement>(t('container.background'));
    await user.clear(width);
    await user.type(width, '0{Enter}');
    expect(alertOf(width)).toBe(t('container.error.size', { max: MAX_CONTAINER_SIZE }));
    expect(alertOf(height)).toBeNull();
    expect(alertOf(color)).toBeNull();
  });

  it('switching the selected container clears the errors (code review #954, item 36)', async () => {
    const harness = createHarness(sampleProject());
    const ids = ['Home', 'Profile'].map((name) => {
      const created = harness.actions.addBackgroundContainer({
        name,
        width: 360,
        height: 800,
        background: '#FFFFFF',
      });
      if (!created.ok) throw new Error(created.error);
      return created.value;
    });
    const panel = (id: string | undefined) => {
      const image = harness.project().containers.find((i) => i.id === id);
      if (!image) throw new Error('no screen');
      return (
        <EditorContext.Provider value={harness.context}>
          <SelectionPanel
            image={image}
            display={undefined}
            readOnly={false}
            busy={false}
            onReplace={() => undefined}
            onDelete={() => undefined}
          />
        </EditorContext.Provider>
      );
    };
    const { rerender } = render(panel(ids[0]));
    const user = userEvent.setup();
    const color = screen.getByLabelText<HTMLInputElement>(t('container.background'));
    await user.clear(color);
    await user.type(color, 'red{Enter}');
    expect(screen.getByRole('alert').textContent).toBe(t('container.error.color'));
    rerender(panel(ids[1]));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a photo keeps File and Size, without the screen fields', () => {
    const harness = createHarness(sampleProject());
    renderLive(harness, (project) => {
      const image = project.containers[0];
      return image ? (
        <SelectionPanel
          image={image}
          display={undefined}
          readOnly={false}
          busy={false}
          onReplace={() => undefined}
          onDelete={() => undefined}
        />
      ) : null;
    });
    expect(screen.getByText(t('image.file'))).toBeTruthy();
    expect(screen.queryByLabelText(t('container.background'))).toBeNull();
  });
});

describe('entry through the main bar', () => {
  function renderBar(harness: Harness) {
    const dialogs = { show: vi.fn(), exportButton: { current: null } };
    render(
      <EditorContext.Provider value={harness.context}>
        <EditorMainBar
          busy={false}
          onAdd={() => undefined}
          dialogs={dialogs as unknown as EditorDialogs}
          commands={{} as unknown as ProjectCommands}
        />
      </EditorContext.Provider>,
    );
    return dialogs;
  }

  it('the button next to Add images opens the dialog', async () => {
    const dialogs = renderBar(createHarness(sampleProject()));
    await userEvent.click(screen.getByRole('button', { name: t('container.new') }));
    expect(dialogs.show).toHaveBeenCalledWith({ kind: 'container' });
  });

  it('read-only: disabled', () => {
    renderBar(createHarness(sampleProject(), true));
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: t('container.new') })
        .disabled,
    ).toBe(true);
  });
});
