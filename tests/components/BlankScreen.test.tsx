import { cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasController } from '../../src/canvas/CanvasController';
import { t } from '../../src/i18n';
import { MAX_BLANK_SIZE } from '../../src/model';
import { locale } from '../../src/store/settings';
import { EditorMainBar } from '../../src/app/EditorMainBar';
import type { EditorDialogs } from '../../src/app/useEditorDialogs';
import type { ProjectCommands } from '../../src/app/useProjectCommands';
import { BlankScreenDialog } from '../../src/ui/BlankScreenDialog';
import { EditorContext } from '../../src/ui/EditorContext';
import { SelectionPanel } from '../../src/ui/SelectionPanel';
import { parseBlankColor, parseBlankSide, presetFor } from '../../src/ui/blankScreen';
import { sampleProject } from '../model/fixtures';
import { createHarness, renderLive, type Harness } from './harness';

// B3/P7: o diálogo "Nova tela em branco" e os campos de tamanho e cor nos Detalhes da tela.

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

const dialogEl = () => document.querySelector('dialog') as HTMLElement;
const inDialog = () => within(dialogEl());
const field = (name: string) => inDialog().getByLabelText<HTMLInputElement>(name);

function renderDialog(harness: Harness, onClose = vi.fn()) {
  const canvas = {
    viewportCenter: vi.fn(() => ({ x: 2500, y: 100 })),
    centerSelection: vi.fn(),
  };
  harness.context.canvas.current = canvas as unknown as CanvasController;
  render(
    <EditorContext.Provider value={harness.context}>
      <BlankScreenDialog onClose={onClose} />
    </EditorContext.Provider>,
  );
  return { canvas, onClose, user: userEvent.setup() };
}

const submit = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(inDialog().getByRole('button', { name: t('blank.create'), hidden: true }));

describe('leitura do formulário', () => {
  it('lados inteiros de 1 ao máximo; cor #RRGGBB', () => {
    expect(parseBlankSide('360')).toBe(360);
    expect(parseBlankSide(' 20000 ')).toBe(MAX_BLANK_SIZE);
    for (const bad of ['0', '-1', '12.5', 'abc', '', String(MAX_BLANK_SIZE + 1)]) {
      expect(parseBlankSide(bad), bad).toBeNull();
    }
    expect(parseBlankColor('#a1b2c3')).toBe('#A1B2C3');
    for (const bad of ['', 'fff', '#fff', '#GGGGGG', 'red']) {
      expect(parseBlankColor(bad), bad).toBeNull();
    }
    expect(presetFor('412', '915')).toBe('phoneLarge');
    expect(presetFor('413', '915')).toBe('custom');
  });
});

describe('diálogo Nova tela em branco', () => {
  it('a predefinição preenche largura e altura; cria, seleciona e enquadra', async () => {
    const harness = createHarness(sampleProject());
    const { user, canvas, onClose } = renderDialog(harness);
    await user.type(field(t('blank.name')), 'Login');
    await user.selectOptions(inDialog().getByLabelText(t('blank.preset')), 'tablet');
    expect(field(t('blank.width')).value).toBe('800');
    expect(field(t('blank.height')).value).toBe('1280');
    await user.clear(field(t('blank.background')));
    await user.type(field(t('blank.background')), '#112233');
    await submit(user);

    const project = harness.project();
    const created = project.images.at(-1);
    expect(created).toMatchObject({
      name: 'Login',
      file: null,
      width: 800,
      height: 1280,
      background: '#112233',
    });
    expect(harness.ui.selection.value).toEqual({ kind: 'image', id: created?.id });
    expect(canvas.viewportCenter).toHaveBeenCalled();
    expect(canvas.centerSelection).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('abre com o celular 360×800 e fundo branco', () => {
    renderDialog(createHarness(sampleProject()));
    expect(field(t('blank.width')).value).toBe('360');
    expect(field(t('blank.height')).value).toBe('800');
    expect(field(t('blank.background')).value).toBe('#FFFFFF');
    expect(inDialog().getByLabelText<HTMLSelectElement>(t('blank.preset')).value).toBe(
      'phone',
    );
  });

  it('editar o tamanho passa a predefinição para Personalizado', async () => {
    const { user } = renderDialog(createHarness(sampleProject()));
    await user.clear(field(t('blank.width')));
    await user.type(field(t('blank.width')), '361');
    expect(inDialog().getByLabelText<HTMLSelectElement>(t('blank.preset')).value).toBe(
      'custom',
    );
  });

  it('valida: nome obrigatório, tamanho e cor; nada é criado', async () => {
    const harness = createHarness(sampleProject());
    const before = harness.project().images.length;
    const { user, onClose } = renderDialog(harness);

    await submit(user);
    expect(inDialog().getByRole('alert', { hidden: true }).textContent).toBe(
      t('blank.error.name'),
    );

    await user.type(field(t('blank.name')), 'Tela');
    await user.clear(field(t('blank.width')));
    await user.type(field(t('blank.width')), '0');
    await submit(user);
    expect(inDialog().getByRole('alert', { hidden: true }).textContent).toBe(
      t('blank.error.size', { max: MAX_BLANK_SIZE }),
    );

    await user.clear(field(t('blank.width')));
    await user.type(field(t('blank.width')), '300');
    await user.clear(field(t('blank.background')));
    await user.type(field(t('blank.background')), 'azul');
    await submit(user);
    expect(inDialog().getByRole('alert', { hidden: true }).textContent).toBe(
      t('blank.error.color'),
    );

    expect(harness.project().images).toHaveLength(before);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('Detalhes da tela em branco', () => {
  function renderBlank() {
    const harness = createHarness(sampleProject());
    const created = harness.actions.addBlankImage({
      name: 'Home',
      width: 360,
      height: 800,
      background: '#FFFFFF',
    });
    if (!created.ok) throw new Error(created.error);
    renderLive(harness, (project) => {
      const image = project.images.find((i) => i.id === created.value);
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
    const image = (): ReturnType<Harness['project']>['images'][number] => {
      const found = harness.project().images.find((i) => i.id === created.value);
      if (!found) throw new Error('sem tela');
      return found;
    };
    return { harness, image, user: userEvent.setup() };
  }

  it('Largura, Altura e Cor de fundo no lugar de Arquivo', async () => {
    const { image, user } = renderBlank();
    expect(screen.queryByText(t('image.file'))).toBeNull();
    const width = screen.getByLabelText<HTMLInputElement>(t('blank.width'));
    expect(width.value).toBe('360');
    expect(screen.getByLabelText<HTMLInputElement>(t('blank.height')).value).toBe('800');

    await user.clear(width);
    await user.type(width, '412{Enter}');
    expect(image().width).toBe(412);

    const color = screen.getByLabelText<HTMLInputElement>(t('blank.background'));
    await user.clear(color);
    await user.type(color, '#00ff00{Enter}');
    expect(image().background).toBe('#00FF00');
  });

  it('valor inválido mostra o erro e não grava', async () => {
    const { image, user } = renderBlank();
    const color = screen.getByLabelText<HTMLInputElement>(t('blank.background'));
    await user.clear(color);
    await user.type(color, 'vermelho{Enter}');
    expect(screen.getByRole('alert').textContent).toBe(t('blank.error.color'));
    expect(image().background).toBe('#FFFFFF');

    const height = screen.getByLabelText<HTMLInputElement>(t('blank.height'));
    await user.clear(height);
    await user.type(height, '0{Enter}');
    expect(screen.getByRole('alert').textContent).toBe(
      t('blank.error.size', { max: MAX_BLANK_SIZE }),
    );
    expect(image().height).toBe(800);
  });

  it('uma foto continua com Arquivo e Tamanho, sem os campos da tela', () => {
    const harness = createHarness(sampleProject());
    renderLive(harness, (project) => {
      const image = project.images[0];
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
    expect(screen.queryByLabelText(t('blank.background'))).toBeNull();
  });
});

describe('entrada pela barra principal', () => {
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

  it('o botão ao lado de Adicionar imagens abre o diálogo', async () => {
    const dialogs = renderBar(createHarness(sampleProject()));
    await userEvent.click(screen.getByRole('button', { name: t('blank.new') }));
    expect(dialogs.show).toHaveBeenCalledWith({ kind: 'blank' });
  });

  it('somente leitura: desabilitado', () => {
    renderBar(createHarness(sampleProject(), true));
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: t('blank.new') }).disabled,
    ).toBe(true);
  });
});
