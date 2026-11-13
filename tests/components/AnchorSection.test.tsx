import { cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorDialogs } from '../../src/app/useEditorDialogs';
import type { ProjectCommands } from '../../src/app/useProjectCommands';
import { useEditorShortcuts } from '../../src/app/useEditorShortcuts';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import { arrangeHintKey } from '../../src/ui/arrange';
import { CanvasContextMenu } from '../../src/ui/CanvasContextMenu';
import { EditorContext } from '../../src/ui/EditorContext';
import { MarkingPanel } from '../../src/ui/MarkingPanel';
import { libraryHarness, type LibraryHarness } from './libraryHarness';
import { renderLive } from './harness';

// Âncora na app (R4, decisão 13): a seção Âncora dos Detalhes (Select das marcações do mesmo
// espaço, Lado, Alinhamento, Deslocamento e Encostar na âncora) e o Arrumar que também encosta.

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

interface Scene {
  readonly harness: LibraryHarness;
  /** O botão (alvo da âncora), o FAB (ancorado) e um botão em outra imagem (I2). */
  readonly button: string;
  readonly fab: string;
  readonly other: string;
}

async function scene(options: { readOnly?: boolean } = {}): Promise<Scene> {
  const harness = await libraryHarness();
  const add = (typeId: string, containerId: string) => {
    const result = harness.actions.addComponent({
      containerId,
      parentId: null,
      specId: 'material3',
      typeId,
    });
    if (!result.ok) throw new Error(result.error);
    return result.value;
  };
  const button = add('m3-button', 'I1');
  const fab = add('m3-fab', 'I1');
  const other = add('m3-button', 'I2');
  if (options.readOnly) harness.store.load(harness.project(), { readOnly: true });
  return { harness, button, fab, other };
}

const marking = (harness: LibraryHarness, id: string) =>
  harness.project().markings.find((m) => m.id === id)!;

function renderPanel(harness: LibraryHarness, markingId: string) {
  renderLive(harness, (project) => {
    const item = project.markings.find((m) => m.id === markingId);
    const image = project.containers.find((i) => i.id === item?.containerId);
    if (!item || !image) return null;
    return (
      <MarkingPanel
        project={project}
        marking={item}
        image={image}
        readOnly={harness.store.locked.value}
        onDelete={() => undefined}
        onGoToAnnotation={() => undefined}
      />
    );
  });
  return userEvent.setup();
}

const select = () =>
  screen.getByLabelText<HTMLSelectElement>(t('anchor.target'), { selector: 'select' });
const snapButton = () =>
  screen.getByRole<HTMLButtonElement>('button', { name: t('anchor.snap') });
const optionTexts = (el: HTMLElement) =>
  within(el)
    .getAllByRole('option', { hidden: true })
    .map((o) => o.textContent);
const group = (name: string) => screen.getByRole('group', { name });
const pressed = (name: string, label: string) =>
  within(group(name))
    .getByRole<HTMLButtonElement>('button', { name: label })
    .getAttribute('aria-pressed');

describe('seção Âncora dos Detalhes', () => {
  it('aparece na marcação que desenha um componente, sem âncora ("Nenhuma") e com o resto desabilitado', async () => {
    const { harness, fab } = await scene();
    renderPanel(harness, fab);
    expect(screen.getByRole('region', { name: t('anchor.section') })).toBeTruthy();
    expect(select().value).toBe('');
    expect(optionTexts(select())[0]).toBe(t('anchor.none'));
    expect(snapButton().disabled).toBe(true);
    for (const name of [t('anchor.side'), t('anchor.align')]) {
      for (const b of within(group(name)).getAllByRole<HTMLButtonElement>('button')) {
        expect(b.disabled).toBe(true);
      }
    }
    for (const name of [t('anchor.offsetMain'), t('anchor.offsetCross')]) {
      expect(screen.getByLabelText<HTMLInputElement>(name).disabled).toBe(true);
    }
  });

  it('o Select lista só as marcações do mesmo espaço (e "Nenhuma"), não a própria nem as de outro container', async () => {
    const { harness, fab, other } = await scene();
    renderPanel(harness, fab);
    const texts = optionTexts(select());
    const inI1 = harness
      .project()
      .markings.filter((m) => m.containerId === 'I1' && m.id !== fab);
    expect(texts).toHaveLength(1 + inI1.length);
    const values = within(select())
      .getAllByRole<HTMLOptionElement>('option', { hidden: true })
      .map((o) => o.value);
    expect(values).toEqual(['', ...inI1.map((m) => m.id)]);
    expect(values).not.toContain(fab);
    expect(values).not.toContain(other);
  });

  it('escolher a âncora grava com desfazer, sem mover a marcação; "Nenhuma" a tira', async () => {
    const { harness, button, fab } = await scene();
    const user = renderPanel(harness, fab);
    const before = marking(harness, fab).rect;
    await user.selectOptions(select(), button);
    expect(marking(harness, fab).anchor).toEqual({ to: button });
    expect(marking(harness, fab).rect).toEqual(before);
    expect(select().value).toBe(button);
    expect(snapButton().disabled).toBe(false);

    harness.store.undo();
    expect(marking(harness, fab).anchor ?? null).toBeNull();
    harness.store.redo();
    await user.selectOptions(select(), '');
    expect(marking(harness, fab).anchor).toBeNull();
  });

  it('Lado e Alinhamento gravam o valor escolhido, cada um numa entrada de desfazer', async () => {
    const { harness, button, fab } = await scene();
    const user = renderPanel(harness, fab);
    await user.selectOptions(select(), button);
    // Sem nada gravado, vale o padrão do lugar: acima e ao centro.
    expect(pressed(t('anchor.side'), t('anchor.sideTop'))).toBe('true');
    expect(pressed(t('anchor.align'), t('anchor.alignCenter'))).toBe('true');

    await user.click(
      within(group(t('anchor.side'))).getByRole('button', {
        name: t('anchor.sideBottom'),
      }),
    );
    expect(marking(harness, fab).anchor).toEqual({ to: button, side: 'bottom' });
    await user.click(
      within(group(t('anchor.align'))).getByRole('button', {
        name: t('anchor.alignEnd'),
      }),
    );
    expect(marking(harness, fab).anchor).toEqual({
      to: button,
      side: 'bottom',
      align: 'end',
    });
    expect(pressed(t('anchor.side'), t('anchor.sideBottom'))).toBe('true');
    expect(pressed(t('anchor.align'), t('anchor.alignEnd'))).toBe('true');

    harness.store.undo();
    expect(marking(harness, fab).anchor).toEqual({ to: button, side: 'bottom' });
    harness.store.undo();
    expect(marking(harness, fab).anchor).toEqual({ to: button });
  });

  it('Deslocamento grava distância e deslocamento ao longo do lado, com desfazer', async () => {
    const { harness, button, fab } = await scene();
    const user = renderPanel(harness, fab);
    await user.selectOptions(select(), button);
    const main = screen.getByLabelText<HTMLInputElement>(t('anchor.offsetMain'));
    const cross = screen.getByLabelText<HTMLInputElement>(t('anchor.offsetCross'));
    expect(main.value).toBe('0');
    expect(cross.value).toBe('0');

    await user.clear(main);
    await user.type(main, '12{Enter}');
    expect(marking(harness, fab).anchor).toEqual({
      to: button,
      offset: { main: 12, cross: 0 },
    });
    await user.clear(cross);
    await user.type(cross, '-6{Enter}');
    expect(marking(harness, fab).anchor).toEqual({
      to: button,
      offset: { main: 12, cross: -6 },
    });
    harness.store.undo();
    expect(marking(harness, fab).anchor).toEqual({
      to: button,
      offset: { main: 12, cross: 0 },
    });
  });

  it('um valor que não é número é recusado com o erro da seção e não grava', async () => {
    const { harness, button, fab } = await scene();
    const user = renderPanel(harness, fab);
    await user.selectOptions(select(), button);
    const main = screen.getByLabelText<HTMLInputElement>(t('anchor.offsetMain'));
    await user.clear(main);
    await user.type(main, '{Enter}');
    expect(marking(harness, fab).anchor).toEqual({ to: button });
  });

  it('Encostar na âncora move a marcação e o Ctrl+Z a devolve, numa entrada só', async () => {
    const { harness, button, fab } = await scene();
    const user = renderPanel(harness, fab);
    await user.selectOptions(select(), button);
    const before = marking(harness, fab).rect;
    const target = marking(harness, button).rect;
    await user.click(snapButton());
    const after = marking(harness, fab).rect;
    // Acima da âncora (padrão), centrada nela; o tamanho não muda.
    expect(after.width).toBe(before.width);
    expect(after.height).toBe(before.height);
    expect(after.y).toBe(target.y - after.height);
    expect(after.x).toBe(Math.round(target.x + (target.width - after.width) / 2));
    expect(harness.ui.toast.value).toBe(t('anchor.snapped'));

    harness.store.undo();
    expect(marking(harness, fab).rect).toEqual(before);
    expect(marking(harness, fab).anchor).toEqual({ to: button });

    harness.store.redo();
    await user.click(snapButton());
    expect(harness.ui.toast.value).toBe(t('anchor.snapNothing'));
  });

  it('somente leitura: tudo desabilitado', async () => {
    const { harness, button, fab } = await scene();
    harness.actions.setMarkingAnchor(fab, { to: button });
    harness.store.load(harness.project(), { readOnly: true });
    renderPanel(harness, fab);
    expect(select().disabled).toBe(true);
    expect(snapButton().disabled).toBe(true);
    for (const b of within(group(t('anchor.side'))).getAllByRole<HTMLButtonElement>(
      'button',
    )) {
      expect(b.disabled).toBe(true);
    }
  });

  it('marcação trancada: grava a âncora mas não encosta', async () => {
    const { harness, button, fab } = await scene();
    harness.actions.setMarkingAnchor(fab, { to: button });
    harness.actions.setMarkingLocked(fab, true);
    const user = renderPanel(harness, fab);
    expect(select().disabled).toBe(false);
    expect(snapButton().disabled).toBe(true);
    await user.selectOptions(select(), '');
    expect(marking(harness, fab).anchor).toBeNull();
  });

  it('uma marcação sem componente e sem âncora não tem a seção; com âncora (vinda do MCP) tem', async () => {
    const { harness, button } = await scene();
    const created = harness.actions.createMarking('I1', {
      x: 5,
      y: 5,
      width: 30,
      height: 30,
    });
    if (!created.ok) throw new Error(created.error);
    renderPanel(harness, created.value);
    expect(screen.queryByRole('region', { name: t('anchor.section') })).toBeNull();
    cleanup();
    harness.actions.setMarkingAnchor(created.value, { to: button });
    renderPanel(harness, created.value);
    expect(screen.getByRole('region', { name: t('anchor.section') })).toBeTruthy();
  });

  it('em en-US os textos vêm de t()', async () => {
    const { harness, fab } = await scene();
    locale.value = 'en-US';
    renderPanel(harness, fab);
    expect(t('anchor.snap')).toBe('Snap to anchor');
    expect(screen.getByRole('button', { name: 'Snap to anchor' })).toBeTruthy();
  });
});

describe('Arrumar numa marcação com âncora encosta', () => {
  const arrangeName = () => new RegExp(t('arrange.action'));

  it('a folha (FAB) não tem o botão Arrumar; com âncora passa a ter, e ele encosta numa entrada só', async () => {
    const { harness, button, fab } = await scene();
    const user = renderPanel(harness, fab);
    expect(screen.queryByRole('button', { name: arrangeName() })).toBeNull();
    await user.selectOptions(select(), button);
    const arrange = screen.getByRole<HTMLButtonElement>('button', {
      name: arrangeName(),
    });
    expect(arrange.disabled).toBe(false);
    const before = marking(harness, fab).rect;
    await user.click(arrange);
    expect(marking(harness, fab).rect).not.toEqual(before);
    expect(harness.ui.toast.value).toBe(t('arrange.done'));
    harness.store.undo();
    expect(marking(harness, fab).rect).toEqual(before);
  });

  it('a dica do botão diz que ele encosta na âncora', async () => {
    const { harness, button, fab } = await scene();
    harness.actions.setMarkingAnchor(fab, { to: button });
    expect(arrangeHintKey(harness.context, fab)).toBe('arrange.hintAnchor');
    expect(t('arrange.hintAnchor')).not.toBe('arrange.hintAnchor');
  });

  it('o menu do canvas oferece Arrumar na marcação ancorada e a folha sem âncora não', async () => {
    const { harness, button, fab } = await scene();
    render(
      <EditorContext.Provider value={harness.context}>
        <CanvasContextMenu />
      </EditorContext.Provider>,
    );
    const user = userEvent.setup();
    harness.ui.canvasMenu.value = { x: 10, y: 10, target: { kind: 'm', id: fab } };
    let menu = await screen.findByRole('menu');
    expect(
      within(menu).queryByRole('menuitem', { name: t('arrange.action') }),
    ).toBeNull();

    harness.ui.canvasMenu.value = null;
    harness.actions.setMarkingAnchor(fab, { to: button });
    const before = marking(harness, fab).rect;
    harness.ui.canvasMenu.value = { x: 10, y: 10, target: { kind: 'm', id: fab } };
    menu = await screen.findByRole('menu');
    await user.click(within(menu).getByRole('menuitem', { name: t('arrange.action') }));
    expect(marking(harness, fab).rect).not.toEqual(before);
  });

  describe('atalho Alt+Shift+A', () => {
    function Probe() {
      useEditorShortcuts(
        { current: null, show: vi.fn(), close: vi.fn() } as unknown as EditorDialogs,
        { exportProject: vi.fn(), closeProject: vi.fn() } as unknown as ProjectCommands,
      );
      return null;
    }
    const press = () =>
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'A',
          code: 'KeyA',
          altKey: true,
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );

    it('encosta a marcação ancorada selecionada', async () => {
      const { harness, button, fab } = await scene();
      harness.actions.setMarkingAnchor(fab, { to: button });
      harness.ui.selection.value = { kind: 'marking', id: fab };
      render(
        <EditorContext.Provider value={harness.context}>
          <Probe />
        </EditorContext.Provider>,
      );
      const before = marking(harness, fab).rect;
      press();
      expect(marking(harness, fab).rect).not.toEqual(before);
      expect(harness.ui.toast.value).toBe(t('arrange.done'));
    });
  });
});
