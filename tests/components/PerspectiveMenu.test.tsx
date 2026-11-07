import type { Signal } from '@preact/signals';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';
import { addPerspective, buildPerspective } from '../../src/model';
import { locale } from '../../src/store/settings';
import { selectItems } from '../../src/store/ui';
import { CanvasContextMenu } from '../../src/ui/CanvasContextMenu';
import { EditorContext } from '../../src/ui/EditorContext';
import { sampleProject } from '../model/fixtures';
import { createHarness, type Harness } from './harness';
import { libraryHarness } from './libraryHarness';

// Etapa Perspectivas (PE3, C1): o menu do botão direito envia a raiz do item para outra
// perspectiva, tira da aberta e desabilita o que só vale na Principal.

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

function setup(options: { open?: boolean; others?: number } = {}) {
  const harness = createHarness(sampleProject());
  const actions = harness.context.session.perspectiveActions;
  const ids: string[] = [];
  const names = ['Vista A', 'Vista B'];
  for (let i = 0; i < (options.others ?? 1); i++) {
    const created = actions.createPerspective({
      name: names[i] ?? `V${i}`,
      startFrom: 'empty',
      local: false,
    });
    if (!created.ok) throw new Error(`perspectiva não criada: ${created.error}`);
    ids.push(created.value);
  }
  // "Só eu" sem IndexedDB no teste: marca a segunda no conjunto `localIds` (só a interface o lê).
  if (ids[1] !== undefined) {
    (harness.context.session.perspective.localIds as Signal<ReadonlySet<string>>).value =
      new Set([ids[1]]);
  }
  if (options.open && ids[0] !== undefined)
    harness.context.session.perspective.open(ids[0]);
  render(
    <EditorContext.Provider value={harness.context}>
      <CanvasContextMenu />
    </EditorContext.Provider>,
  );
  return { harness, ids };
}

function openMenu(harness: Harness, kind: 'i' | 'm', id: string) {
  act(() => {
    harness.ui.canvasMenu.value = { x: 10, y: 10, target: { kind, id } };
  });
}

const itemsOf = (harness: Harness, id: string) =>
  harness
    .project()
    .perspectives.find((x) => x.id === id)
    ?.items.map((i) => i.root) ?? [];

const sendItem = () => screen.getByRole('menuitem', { name: t('perspective.menu.send') });

describe('Enviar para perspectiva', () => {
  it('o item abre um submenu com a Principal e a aberta marcadas e travadas', () => {
    const { harness, ids } = setup({ open: true, others: 2 });
    openMenu(harness, 'i', 'I1');
    const send = sendItem();
    expect(send.getAttribute('aria-haspopup')).toBe('menu');
    fireEvent.click(send);
    const sub = screen.getByRole('menu', { name: t('perspective.menu.send') });
    expect(within(sub).getByText(t('perspective.menu.sendHeading'))).toBeTruthy();
    const boxes = within(sub).getAllByRole('menuitemcheckbox');
    expect(boxes.map((b) => b.textContent)).toEqual([
      `${t('perspective.principal')}${t('perspective.menu.always')}`,
      `Vista A${t('perspective.menu.current')}`,
      `Vista B${t('perspective.menu.mine')}`,
    ]);
    expect(boxes[0]?.getAttribute('aria-checked')).toBe('true');
    expect((boxes[0] as HTMLButtonElement).disabled).toBe(true);
    expect(boxes[1]?.getAttribute('aria-checked')).toBe('true');
    expect((boxes[1] as HTMLButtonElement).disabled).toBe(true);
    expect(boxes[2]?.getAttribute('aria-checked')).toBe('false');
    expect((boxes[2] as HTMLButtonElement).disabled).toBe(false);
    expect(ids).toHaveLength(2);
  });

  it('passar o ponteiro sobre o item abre o submenu, sem roubar o foco', () => {
    const { harness } = setup({ others: 1 });
    openMenu(harness, 'i', 'I1');
    expect(screen.queryByRole('menu', { name: t('perspective.menu.send') })).toBeNull();
    const send = sendItem();
    send.focus();
    fireEvent.pointerEnter(send.parentElement as HTMLElement);
    expect(screen.getByRole('menu', { name: t('perspective.menu.send') })).toBeTruthy();
    expect(send.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(send);
  });

  it('clicar no item depois de o ponteiro abri-lo mantém o submenu aberto', () => {
    const { harness } = setup({ others: 1 });
    openMenu(harness, 'i', 'I1');
    const send = sendItem();
    fireEvent.pointerEnter(send.parentElement as HTMLElement);
    fireEvent.click(send);
    expect(screen.getByRole('menu', { name: t('perspective.menu.send') })).toBeTruthy();
    expect(send.getAttribute('aria-expanded')).toBe('true');
  });

  it('perto da borda direita, o submenu abre à esquerda do item', () => {
    const { harness } = setup({ others: 1 });
    openMenu(harness, 'i', 'I1');
    const spy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        const right =
          this.dataset.submenu !== undefined ? globalThis.innerWidth + 50 : 100;
        return {
          left: right - 200,
          right,
          top: 0,
          bottom: 0,
          width: 200,
          height: 0,
        } as DOMRect;
      });
    try {
      fireEvent.click(sendItem());
      const sub = screen.getByRole('menu', { name: t('perspective.menu.send') });
      expect(sub.classList.contains('menu-submenu-left')).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it('na Principal, com uma outra perspectiva, a caixa dela começa desmarcada', () => {
    const { harness } = setup({ others: 1 });
    openMenu(harness, 'i', 'I1');
    fireEvent.click(sendItem());
    const sub = screen.getByRole('menu', { name: t('perspective.menu.send') });
    const boxes = within(sub).getAllByRole('menuitemcheckbox');
    expect(boxes).toHaveLength(2);
    expect(boxes[1]?.getAttribute('aria-checked')).toBe('false');
  });

  it('marcar envia a raiz e desmarcar tira', () => {
    const { harness, ids } = setup({ others: 1 });
    const [target] = ids as [string];
    openMenu(harness, 'i', 'I1');
    fireEvent.click(sendItem());
    let box = within(
      screen.getByRole('menu', { name: t('perspective.menu.send') }),
    ).getByRole('menuitemcheckbox', { name: /Vista A/ });
    fireEvent.click(box);
    expect(itemsOf(harness, target)).toContain('I1');
    // O submenu segue aberto, agora com a caixa marcada: desmarcar tira.
    box = within(
      screen.getByRole('menu', { name: t('perspective.menu.send') }),
    ).getByRole('menuitemcheckbox', { name: /Vista A/ });
    expect(box.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(box);
    expect(itemsOf(harness, target)).not.toContain('I1');
  });

  it('o alvo é a raiz do item: uma marcação dentro do container envia o container', () => {
    const { harness, ids } = setup({ others: 1 });
    openMenu(harness, 'm', 'M3');
    fireEvent.click(sendItem());
    fireEvent.click(
      within(screen.getByRole('menu', { name: t('perspective.menu.send') })).getByRole(
        'menuitemcheckbox',
        { name: /Vista A/ },
      ),
    );
    expect(itemsOf(harness, ids[0] as string)).toEqual(['I1']);
  });

  it('com várias raízes selecionadas, envia todas', () => {
    const { harness, ids } = setup({ others: 1 });
    act(() => {
      selectItems(harness.ui, [
        { kind: 'image', id: 'I1' },
        { kind: 'image', id: 'I2' },
      ]);
    });
    openMenu(harness, 'i', 'I1');
    fireEvent.click(sendItem());
    fireEvent.click(
      within(screen.getByRole('menu', { name: t('perspective.menu.send') })).getByRole(
        'menuitemcheckbox',
        { name: /Vista A/ },
      ),
    );
    expect(itemsOf(harness, ids[0] as string).sort()).toEqual(['I1', 'I2']);
  });

  it('somente leitura, Enviar e Tirar ficam desabilitados', () => {
    const base = sampleProject();
    const project = addPerspective(
      base,
      buildPerspective(base, {
        id: 'V',
        name: 'Vista A',
        startFrom: 'empty',
        hiddenLayers: [],
      }),
    );
    const harness = createHarness(project, true);
    harness.context.session.perspective.open('V');
    render(
      <EditorContext.Provider value={harness.context}>
        <CanvasContextMenu />
      </EditorContext.Provider>,
    );
    openMenu(harness, 'i', 'I1');
    expect((sendItem() as HTMLButtonElement).disabled).toBe(true);
    const remove = screen.getByRole('menuitem', { name: t('perspective.menu.remove') });
    expect((remove as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Tirar desta perspectiva', () => {
  it('tira só da aberta e o projeto fica como está', () => {
    const { harness, ids } = setup({ open: true, others: 1 });
    const [open] = ids as [string];
    const actions = harness.context.session.perspectiveActions;
    actions.sendRootsToPerspective(open, ['I1', 'I2']);
    openMenu(harness, 'i', 'I1');
    fireEvent.click(screen.getByRole('menuitem', { name: t('perspective.menu.remove') }));
    expect(itemsOf(harness, open)).toEqual(['I2']);
    expect(harness.project().containers.map((c) => c.id)).toContain('I1');
  });

  it('na Principal não há de onde tirar: o item não aparece', () => {
    const { harness } = setup({ others: 1 });
    openMenu(harness, 'i', 'I1');
    expect(
      screen.queryByRole('menuitem', { name: t('perspective.menu.remove') }),
    ).toBeNull();
  });
});

describe('Só na Principal', () => {
  const arrange = () => screen.getByRole('menuitem', { name: t('arrange.action') });

  async function arrangeScene(open: boolean) {
    const harness = await libraryHarness();
    const add = (typeId: string, parentId: string | null) => {
      const result = harness.actions.addComponent({
        containerId: 'I1',
        parentId,
        specId: 'material3',
        typeId,
      });
      if (!result.ok) throw new Error(result.error);
      return result.value;
    };
    const column = add('m3-column', null);
    add('m3-button', column);
    if (open) {
      const actions = harness.context.session.perspectiveActions;
      const created = actions.createPerspective({
        name: 'Vista A',
        startFrom: 'empty',
        local: false,
      });
      if (!created.ok) throw new Error(created.error);
      actions.sendRootsToPerspective(created.value, ['I1']);
      harness.context.session.perspective.open(created.value);
    }
    render(
      <EditorContext.Provider value={harness.context}>
        <CanvasContextMenu />
      </EditorContext.Provider>,
    );
    openMenu(harness, 'm', column);
  }

  it('fora da Principal, Arrumar fica desabilitado com a dica', async () => {
    await arrangeScene(true);
    const item = arrange() as HTMLButtonElement;
    expect(item.disabled).toBe(true);
    expect(item.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getAllByText(t('perspective.principalOnly')).length).toBeGreaterThan(0);
  });

  it('na Principal, Arrumar segue habilitado', async () => {
    await arrangeScene(false);
    expect((arrange() as HTMLButtonElement).disabled).toBe(false);
  });

  it('Excluir de uma raiz aparece desabilitado fora da Principal', () => {
    const { harness } = setup({ open: true, others: 1 });
    openMenu(harness, 'i', 'I1');
    const del = screen.getByRole('menuitem', { name: t('common.delete') });
    expect((del as HTMLButtonElement).disabled).toBe(true);
  });

  it('Excluir não aparece na Principal', () => {
    const { harness } = setup({ others: 1 });
    openMenu(harness, 'i', 'I1');
    expect(screen.queryByRole('menuitem', { name: t('common.delete') })).toBeNull();
  });

  it('Comentar aqui num ponto do canvas fica desabilitado fora da Principal', () => {
    const { harness } = setup({ open: true, others: 1 });
    act(() => {
      harness.ui.canvasMenu.value = {
        x: 10,
        y: 10,
        target: null,
        here: { kind: 'point', containerId: null, x: 5, y: 5 },
      };
    });
    const item = screen.getByRole('menuitem', { name: t('comments.here') });
    expect((item as HTMLButtonElement).disabled).toBe(true);
  });

  it('Comentar aqui num ponto de container segue habilitado fora da Principal', () => {
    const { harness } = setup({ open: true, others: 1 });
    act(() => {
      harness.ui.canvasMenu.value = {
        x: 10,
        y: 10,
        target: null,
        here: { kind: 'point', containerId: 'I1', x: 5, y: 5 },
      };
    });
    const item = screen.getByRole('menuitem', { name: t('comments.here') });
    expect((item as HTMLButtonElement).disabled).toBe(false);
  });

  it('Comentar aqui num ponto do canvas segue habilitado na Principal', () => {
    const { harness } = setup({ others: 1 });
    act(() => {
      harness.ui.canvasMenu.value = {
        x: 10,
        y: 10,
        target: null,
        here: { kind: 'point', containerId: null, x: 5, y: 5 },
      };
    });
    const item = screen.getByRole('menuitem', { name: t('comments.here') });
    expect((item as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('Teclado', () => {
  it('→ abre o submenu, ← fecha e volta ao item, ↓ e ↑ movem', () => {
    const { harness } = setup({ open: true, others: 2 });
    openMenu(harness, 'i', 'I1');
    const send = sendItem();
    send.focus();
    fireEvent.keyDown(send, { key: 'ArrowRight' });
    const sub = screen.getByRole('menu', { name: t('perspective.menu.send') });
    // O foco vai à primeira caixa habilitada.
    const enabled = within(sub)
      .getAllByRole('menuitemcheckbox')
      .filter((b) => !(b as HTMLButtonElement).disabled);
    expect(document.activeElement).toBe(enabled[0]);
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(enabled[0]);
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowLeft' });
    expect(screen.queryByRole('menu', { name: t('perspective.menu.send') })).toBeNull();
    expect(document.activeElement).toBe(sendItem());
  });

  it('↓ e ↑ percorrem os itens do menu', () => {
    const { harness } = setup({ open: true, others: 1 });
    openMenu(harness, 'i', 'I1');
    const send = sendItem();
    send.focus();
    fireEvent.keyDown(send, { key: 'ArrowDown' });
    const remove = screen.getByRole('menuitem', { name: t('perspective.menu.remove') });
    expect(document.activeElement).toBe(remove);
    fireEvent.keyDown(remove, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(send);
  });

  it('Esc fecha o menu', () => {
    const { harness } = setup({ open: true, others: 1 });
    openMenu(harness, 'i', 'I1');
    fireEvent.click(sendItem());
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
