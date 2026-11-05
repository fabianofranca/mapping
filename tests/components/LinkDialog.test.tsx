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
  locale.value = 'pt-BR';
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

/** Renderiza o cartão de `annotationId`; `visible` limita as camadas visíveis. */
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

const linkButtons = () => screen.getAllByRole('button', { name: '+ Vincular…' });
const openDialog = () => document.querySelector('dialog') as HTMLElement;

describe('Vincular — dono sem papéis', () => {
  it('nenhum botão "+ <tipo>" direto: um só "+ Vincular…"', () => {
    setup(roleProject());
    expect(linkButtons()).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /^\+ onClick/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^\+ navigate/ })).toBeNull();
  });

  it('com um tipo só ainda abre o diálogo "Vincular a <dono>"', async () => {
    const { user } = setup(roleProject(oneChild));
    await user.click(linkButtons()[0] as HTMLElement);
    const dialog = openDialog();
    expect(
      within(dialog).getByRole('heading', { name: 'Vincular a Button' }),
    ).toBeTruthy();
    expect(
      within(dialog).getByRole('button', { name: /^onClick/, hidden: true }),
    ).toBeTruthy();
    expect(within(dialog).queryByText(/›/)).toBeNull();
  });

  it('mostra os tipos do dono, com os grupos da camada', async () => {
    const { user } = setup(roleProject());
    await user.click(linkButtons()[0] as HTMLElement);
    const dialog = openDialog();
    expect(
      within(dialog).getByRole('heading', { name: 'Navegação', hidden: true }),
    ).toBeTruthy();
    expect(
      within(dialog).getByRole('heading', { name: 'Dados', hidden: true }),
    ).toBeTruthy();
  });

  it('escolher o tipo cria o filho vinculado, na camada do tipo, numa só entrada de desfazer', async () => {
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

  it('camada oculta: cria e avisa, sem ir à anotação', async () => {
    const { harness, user, onGoToAnnotation } = setup(roleProject(oneChild), 'A1', [
      'componentes-nao-existe',
    ]);
    await user.click(linkButtons()[0] as HTMLElement);
    await user.click(
      within(openDialog()).getByRole('button', { name: /^onClick/, hidden: true }),
    );
    expect(harness.project().annotations.at(-1)?.parentAnnotationId).toBe('A1');
    expect(onGoToAnnotation).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain('onClick criado na camada');
  });

  it('Cancelar fecha sem criar e o foco volta ao "+ Vincular…"', async () => {
    const { harness, user } = setup(roleProject(oneChild));
    const before = harness.project().annotations.length;
    const trigger = linkButtons()[0] as HTMLElement;
    await user.click(trigger);
    await user.click(
      within(openDialog()).getByRole('button', { name: 'Cancelar', hidden: true }),
    );
    expect(document.querySelector('dialog')).toBeNull();
    expect(harness.project().annotations).toHaveLength(before);
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});

describe('Vincular — dono com papéis', () => {
  it('uma linha por papel, na ordem de childRoles, com "nenhuma" no vazio', () => {
    const project = addChild(roleProject(withRoles), 'E1', 'A1', 'hold', 'onHold');
    setup(project);
    const rows = [...document.querySelectorAll<HTMLElement>('[data-role-row]')];
    expect(rows.map((r) => r.dataset.roleRow)).toEqual(['click', 'hold']);
    expect(within(rows[0] as HTMLElement).getByText('Clique:')).toBeTruthy();
    expect(within(rows[0] as HTMLElement).getByText('nenhuma')).toBeTruthy();
    expect(within(rows[1] as HTMLElement).queryByText('nenhuma')).toBeNull();
    expect(
      within(rows[1] as HTMLElement).getByRole('button', { name: /onHold|onClick/ }),
    ).toBeTruthy();
    expect(linkButtons()).toHaveLength(2);
  });

  it('o filho da linha leva à anotação', async () => {
    const project = addChild(roleProject(withRoles), 'E1', 'A1', 'click');
    const { user, onGoToAnnotation } = setup(project);
    const row = document.querySelector('[data-role-row="click"]') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: /onHold|onClick/ }));
    expect(onGoToAnnotation).toHaveBeenCalledWith(expect.objectContaining({ id: 'E1' }));
  });

  it('o "+ Vincular…" da linha abre "Vincular a <dono> › <papel>" e o filho nasce com o papel', async () => {
    const { harness, user } = setup(roleProject(withRoles));
    const before = harness.project().annotations.length;
    const row = document.querySelector('[data-role-row="hold"]') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: '+ Vincular…' }));
    const dialog = openDialog();
    expect(
      within(dialog).getByRole('heading', { name: 'Vincular a Button › Pressionar' }),
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

  it('o foco volta ao "+ Vincular…" da linha ao fechar', async () => {
    const { user } = setup(roleProject(rolesAndOneChild));
    const row = document.querySelector('[data-role-row="click"]') as HTMLElement;
    const trigger = within(row).getByRole('button', { name: '+ Vincular…' });
    await user.click(trigger);
    await user.click(
      within(openDialog()).getByRole('button', { name: 'Cancelar', hidden: true }),
    );
    await vi.waitFor(() => expect(document.querySelector('dialog')).toBeNull());
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('sem papel ou com papel inexistente: linha "Sem <rótulo>" com a marca de pendência', () => {
    let project = addChild(roleProject(withRoles), 'E1', 'A1', null);
    project = addChild(project, 'E2', 'A1', 'click', 'navigate');
    project = {
      ...project,
      annotations: project.annotations.map((a) =>
        a.id === 'E2' ? { ...a, parentRole: 'sumiu' } : a,
      ),
    };
    setup(project);
    const row = document.querySelector('[data-role-row-missing]') as HTMLElement;
    expect(within(row).getByText('Sem trigger:')).toBeTruthy();
    expect(row.querySelector('.issue-badge')).not.toBeNull();
    expect(within(row).getAllByRole('button')).toHaveLength(2);
    // As duas linhas de papel ficam vazias.
    expect(screen.getAllByText('nenhuma')).toHaveLength(2);
  });

  it('sem rótulo declarado, a linha é "Sem papel"', () => {
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
    expect(screen.getByText('Sem papel:')).toBeTruthy();
  });

  it('sem filhos sem papel, a linha "Sem <rótulo>" não aparece', () => {
    setup(addChild(roleProject(withRoles), 'E1', 'A1', 'click'));
    expect(document.querySelector('[data-role-row-missing]')).toBeNull();
  });

  it('nenhum botão "+ <tipo>" direto sobra', () => {
    setup(roleProject(withRoles));
    expect(screen.queryByRole('button', { name: /^\+ on/ })).toBeNull();
  });
});
