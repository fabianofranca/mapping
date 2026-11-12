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

// D2: o campo Densidade nos Detalhes do container (sugestão, Aplicar, Personalizada) e no
// diálogo Novo container.

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

const SPEC: Spec = {
  format: 'mapping-spec',
  formatVersion: 6,
  id: 'ds',
  name: 'Design System',
  version: 1,
  containers: [
    { id: 'phone', name: 'Celular', width: 360, height: 800 },
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

describe('Detalhes do container: campo Densidade', () => {
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
  const hint = () => screen.queryByText('Sugestão: 3x (Celular 360 × 800)');
  const apply = () => screen.queryByRole('button', { name: t('density.apply') });

  it('o Select mostra 1x a 4x e Personalizada, com 1x no container sem densidade', () => {
    setup();
    expect(options(select())).toEqual(['1x', '1,5x', '2x', '3x', '4x', 'Personalizada']);
    expect(select().value).toBe('1');
    expect(screen.queryByLabelText(t('density.customLabel'))).toBeNull();
  });

  it('em en-US o separador decimal é o ponto', () => {
    locale.value = 'en-US';
    setup();
    expect(options(select())).toEqual(['1x', '1.5x', '2x', '3x', '4x', 'Custom']);
  });

  it('a dica da sugestão aparece quando difere do valor e some quando igual', async () => {
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

  it('sem tamanho pronto que explique a largura não há dica nem Aplicar', () => {
    setup(screenProject(1000, 2000));
    expect(screen.queryByText(/Sugestão/)).toBeNull();
    expect(apply()).toBeNull();
  });

  it('Aplicar grava a sugestão e Ctrl+Z volta numa entrada só', async () => {
    const { harness, user } = setup();
    await user.click(apply()!);
    expect(density(harness)).toBe(3);
    expect(select().value).toBe('3');
    expect(harness.store.undo()).toBe(true);
    expect(harness.project().containers[0]?.density).toBeUndefined();
    await waitFor(() => expect(select().value).toBe('1'));
    expect(harness.store.canUndo.value).toBe(false);
  });

  it('escolher 1x remove a densidade (volta ao padrão)', async () => {
    const { harness, user } = setup(setContainerDensity(screenProject(), 'C1', 3));
    expect(select().value).toBe('3');
    await user.selectOptions(select(), '1');
    expect('density' in (harness.project().containers[0] ?? {})).toBe(false);
  });

  it('Personalizada aceita 2,625 (e 2.5) ao confirmar e mostra o valor fora da lista', async () => {
    const { harness, user } = setup();
    await user.selectOptions(select(), 'custom');
    expect(density(harness)).toBeUndefined();
    await user.clear(custom());
    await user.type(custom(), '2,625{Enter}');
    expect(density(harness)).toBe(2.625);
    expect(select().value).toBe('custom');
    expect(custom().value).toBe('2,625');
    expect(harness.store.undo()).toBe(true);
    expect(density(harness)).toBeUndefined();
    await waitFor(() => expect(custom().value).toBe('1'));
    await user.clear(custom());
    await user.type(custom(), '2.5{Enter}');
    expect(density(harness)).toBe(2.5);
  });

  it('Personalizada recusa 0,2 e 9 com aviso e não grava', async () => {
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

  it('um valor gravado fora da lista (1,25) abre direto em Personalizada', () => {
    setup(setContainerDensity(screenProject(), 'C1', 1.25));
    expect(select().value).toBe('custom');
    expect(custom().value).toBe('1,25');
  });

  it('somente leitura desabilita o campo e o Aplicar', () => {
    setup(screenProject(), true);
    expect(select().disabled).toBe(true);
    expect(apply()?.hasAttribute('disabled')).toBe(true);
  });
});

describe('diálogo Novo container: campo Densidade', () => {
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

  it('existe, vem em 1x e não grava density quando fica em 1x', async () => {
    const harness = createHarness(screenProject());
    const user = renderDialog(harness);
    expect(select().value).toBe('1');
    await named(user);
    await create(user);
    const created = harness.project().containers.at(-1);
    expect(created?.name).toBe('Login');
    expect('density' in (created ?? {})).toBe(false);
  });

  it('grava density quando diferente de 1 (uma entrada: desfazer remove o container)', async () => {
    const harness = createHarness(screenProject());
    const user = renderDialog(harness);
    await user.selectOptions(select(), '3');
    await named(user);
    await create(user);
    expect(harness.project().containers.at(-1)?.density).toBe(3);
    expect(harness.store.undo()).toBe(true);
    expect(harness.project().containers).toHaveLength(1);
  });

  it('trocar o tamanho pronto não muda a densidade escolhida', async () => {
    const harness = createHarness(screenProject());
    const user = renderDialog(harness);
    await user.selectOptions(select(), '2');
    await user.selectOptions(
      inDialog().getByLabelText(t('container.preset')),
      'ds:tablet',
    );
    expect(select().value).toBe('2');
  });

  it('Personalizada inválida bloqueia a criação com o aviso', async () => {
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
