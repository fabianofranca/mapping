import { act, cleanup, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../../src/model';
import { locale } from '../../src/store/settings';
import { AnnotationEditor } from '../../src/ui/AnnotationEditor';
import { addChild, roleProject, withRoles } from '../model/roleFixtures';
import type { Json } from '../model/specV11Fixtures';
import { annotationOf, createHarness, renderLive } from './harness';

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

const button = (s: Json) => s.layers[0].annotationTypes[0] as Json;
const oneChild = (s: Json) => {
  button(s).allowedChildren = ['onClick'];
};
const rolesAndOneChild = (s: Json) => {
  withRoles(s);
  oneChild(s);
};

/** Renders the card of `annotationId`; `visible` limits the visible layers. */
function setup(
  project: Project,
  annotationId = 'A1',
  visible?: readonly string[],
): ReturnType<typeof extras> {
  const harness = createHarness(project);
  const onGoToAnnotation = vi.fn();
  const onShowLayer = vi.fn();
  renderLive(harness, (p) => (
    <AnnotationEditor
      project={p}
      annotation={annotationOf(p, annotationId)}
      visibleLayerIds={new Set(visible ?? p.layers.map((l) => l.id))}
      onGoToAnnotation={onGoToAnnotation}
      onShowLayer={onShowLayer}
      readOnly={false}
    />
  ));
  return extras(harness, onGoToAnnotation, onShowLayer);
}
function extras(
  harness: ReturnType<typeof createHarness>,
  onGoToAnnotation: ReturnType<typeof vi.fn>,
  onShowLayer: ReturnType<typeof vi.fn>,
) {
  return { harness, onGoToAnnotation, onShowLayer, user: userEvent.setup() };
}

const linkButtons = () => screen.getAllByRole('button', { name: '+ Link…' });
const openDialog = () => document.querySelector('dialog') as HTMLElement;

describe('Link — owner without roles', () => {
  it('no direct "+ <type>" button: a single "+ Link…"', () => {
    setup(roleProject());
    expect(linkButtons()).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /^\+ onClick/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^\+ navigate/ })).toBeNull();
  });

  it('with a single type it still opens the "Link to <owner>" dialog', async () => {
    const { user } = setup(roleProject(oneChild));
    await user.click(linkButtons()[0] as HTMLElement);
    const dialog = openDialog();
    expect(within(dialog).getByRole('heading', { name: 'Link to Button' })).toBeTruthy();
    expect(
      within(dialog).getByRole('button', { name: /^onClick/, hidden: true }),
    ).toBeTruthy();
    expect(within(dialog).queryByText(/›/)).toBeNull();
  });

  it("shows the owner's types, with the layer groups", async () => {
    const { user } = setup(roleProject());
    await user.click(linkButtons()[0] as HTMLElement);
    const dialog = openDialog();
    // pt-BR kept: shared fixture data asserted by tests/model, tests/mcp (group names of specV11Fixtures)
    expect(
      within(dialog).getByRole('heading', { name: 'Navegação', hidden: true }),
    ).toBeTruthy();
    expect(
      within(dialog).getByRole('heading', { name: 'Dados', hidden: true }),
    ).toBeTruthy();
  });

  it("choosing the type creates the linked child, on the type's layer, in a single undo entry", async () => {
    const { harness, user, onGoToAnnotation } = setup(roleProject());
    const before = harness.project().annotations.length;
    await user.click(linkButtons()[0] as HTMLElement);
    await user.click(
      within(openDialog()).getByRole('button', { name: /^onHold/, hidden: true }),
    );
    const project = harness.project();
    const created = project.annotations.at(-1);
    expect(project.annotations).toHaveLength(before + 1);
    expect(created?.parentAnnotationId).toBe('A1');
    expect(created?.parentRole ?? null).toBeNull();
    expect(created?.type?.typeId).toBe('onHold');
    // pt-BR kept: shared fixture data asserted by tests/model, tests/mcp (layer name of specV11Fixtures)
    expect(project.layers.find((l) => l.id === created?.layerId)?.name).toBe('Eventos');
    expect(document.querySelector('dialog')).toBeNull();
    expect(onGoToAnnotation).toHaveBeenCalledWith(
      expect.objectContaining({ id: created?.id }),
    );
    act(() => {
      harness.store.undo();
    });
    expect(harness.project().annotations).toHaveLength(before);
  });

  it('hidden layer: creates and warns, without going to the annotation', async () => {
    const { harness, user, onGoToAnnotation } = setup(roleProject(oneChild), 'A1', [
      'components-does-not-exist',
    ]);
    await user.click(linkButtons()[0] as HTMLElement);
    await user.click(
      within(openDialog()).getByRole('button', { name: /^onClick/, hidden: true }),
    );
    expect(harness.project().annotations.at(-1)?.parentAnnotationId).toBe('A1');
    expect(onGoToAnnotation).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain('onClick created in the');
  });

  it('Cancel closes without creating and the focus returns to "+ Link…"', async () => {
    const { harness, user } = setup(roleProject(oneChild));
    const before = harness.project().annotations.length;
    const trigger = linkButtons()[0] as HTMLElement;
    await user.click(trigger);
    await user.click(
      within(openDialog()).getByRole('button', { name: 'Cancel', hidden: true }),
    );
    expect(document.querySelector('dialog')).toBeNull();
    expect(harness.project().annotations).toHaveLength(before);
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});

describe('Link — owner with roles', () => {
  it('one row per role, in childRoles order, with "none" when empty', () => {
    const project = addChild(roleProject(withRoles), 'E1', 'A1', 'hold', 'onHold');
    setup(project);
    const rows = [...document.querySelectorAll<HTMLElement>('[data-role-row]')];
    expect(rows.map((r) => r.dataset.roleRow)).toEqual(['click', 'hold']);
    // pt-BR kept: shared fixture data asserted by tests/model, tests/mcp (role name of roleFixtures)
    expect(within(rows[0] as HTMLElement).getByText('Clique:')).toBeTruthy();
    expect(within(rows[0] as HTMLElement).getByText('none')).toBeTruthy();
    expect(within(rows[1] as HTMLElement).queryByText('none')).toBeNull();
    expect(
      within(rows[1] as HTMLElement).getByRole('button', { name: /onHold|onClick/ }),
    ).toBeTruthy();
    expect(linkButtons()).toHaveLength(2);
  });

  it("the row's child leads to the annotation", async () => {
    const project = addChild(roleProject(withRoles), 'E1', 'A1', 'click');
    const { user, onGoToAnnotation } = setup(project);
    const row = document.querySelector('[data-role-row="click"]') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: /onHold|onClick/ }));
    expect(onGoToAnnotation).toHaveBeenCalledWith(expect.objectContaining({ id: 'E1' }));
  });

  it('the row\'s "+ Link…" opens "Link to <owner> › <role>" and the child is born with the role', async () => {
    const { harness, user } = setup(roleProject(withRoles));
    const before = harness.project().annotations.length;
    const row = document.querySelector('[data-role-row="hold"]') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: '+ Link…' }));
    const dialog = openDialog();
    // pt-BR kept: shared fixture data asserted by tests/model, tests/mcp (role name "Pressionar" of roleFixtures)
    expect(
      within(dialog).getByRole('heading', { name: 'Link to Button › Pressionar' }),
    ).toBeTruthy();
    await user.click(
      within(dialog).getByRole('button', { name: /^onClick/, hidden: true }),
    );
    const created = harness.project().annotations.at(-1);
    expect(created?.parentAnnotationId).toBe('A1');
    expect(created?.parentRole).toBe('hold');
    expect(harness.project().annotations).toHaveLength(before + 1);
    act(() => {
      harness.store.undo();
    });
    expect(harness.project().annotations).toHaveLength(before);
  });

  it('the focus returns to the row\'s "+ Link…" on close', async () => {
    const { user } = setup(roleProject(rolesAndOneChild));
    const row = document.querySelector('[data-role-row="click"]') as HTMLElement;
    const trigger = within(row).getByRole('button', { name: '+ Link…' });
    await user.click(trigger);
    await user.click(
      within(openDialog()).getByRole('button', { name: 'Cancel', hidden: true }),
    );
    await vi.waitFor(() => expect(document.querySelector('dialog')).toBeNull());
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('without a role or with a nonexistent role: "No <label>" row with the pending mark', () => {
    let project = addChild(roleProject(withRoles), 'E1', 'A1', null);
    project = addChild(project, 'E2', 'A1', 'click', 'navigate');
    project = {
      ...project,
      annotations: project.annotations.map((a) =>
        a.id === 'E2' ? { ...a, parentRole: 'vanished' } : a,
      ),
    };
    setup(project);
    const row = document.querySelector('[data-role-row-missing]') as HTMLElement;
    expect(within(row).getByText('No trigger:')).toBeTruthy();
    expect(row.querySelector('.issue-badge')).not.toBeNull();
    expect(within(row).getAllByRole('button')).toHaveLength(2);
    // The two role rows stay empty.
    expect(screen.getAllByText('none')).toHaveLength(2);
  });

  it('without a declared label, the row is "No role"', () => {
    const project = addChild(
      roleProject((s) => {
        withRoles(s);
        delete button(s).childRolesLabel;
      }),
      'E1',
      'A1',
      null,
    );
    setup(project);
    expect(screen.getByText('No role:')).toBeTruthy();
  });

  it('without children lacking a role, the "No <label>" row does not appear', () => {
    setup(addChild(roleProject(withRoles), 'E1', 'A1', 'click'));
    expect(document.querySelector('[data-role-row-missing]')).toBeNull();
  });

  it('no direct "+ <type>" button is left', () => {
    setup(roleProject(withRoles));
    expect(screen.queryByRole('button', { name: /^\+ on/ })).toBeNull();
  });
});
