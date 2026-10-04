import Konva from 'konva/lib/Core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Frame } from '../../../src/canvas/frame';
import { OverlayRenderer } from '../../../src/canvas/renderers/overlay';
import type { Placement } from '../../../src/model';
import { editorFor, frameOf, installFakeCanvas, TOKENS } from '../harness';

beforeAll(installFakeCanvas);
afterAll(() => vi.restoreAllMocks());

const PLACEMENTS: ReadonlyMap<string, Placement> = new Map([
  ['I1', { x: 0, y: 0, scale: 1 }],
  ['I2', { x: 1100, y: 0, scale: 1 }],
]);

function setup() {
  const container = document.createElement('div');
  const overlay = new OverlayRenderer(new Konva.Layer(), container);
  const editor = editorFor();
  const render = (overrides: Partial<Frame> = {}, placements = PLACEMENTS) =>
    overlay.render(frameOf(editor, overrides), placements);
  const handles = () => [...overlay.handles.values()];
  return { container, overlay, render, handles };
}

describe('OverlayRenderer', () => {
  it('sem seleção, nada aparece', () => {
    const { overlay, render, handles } = setup();
    render();
    expect(overlay.selectionOutline.visible()).toBe(false);
    expect(overlay.grabRect.visible()).toBe(false);
    expect(handles().every((h) => !h.visible())).toBe(true);
  });

  it('imagem selecionada: contorno e quatro alças nos cantos', () => {
    const { overlay, render, handles } = setup();
    render({
      selection: { kind: 'image', id: 'I2' },
      viewport: { x: 0, y: 0, scale: 2 },
    });
    expect(overlay.selectionOutline.getAttrs()).toMatchObject({
      visible: true,
      x: 1100,
      y: 0,
      width: 500,
      height: 500,
      stroke: TOKENS.select,
      strokeWidth: 1,
    });
    expect(handles().filter((h) => h.visible())).toHaveLength(4);
    // Alça de `size-handle` (10 px de tela) centrada no canto, com a cor de seleção.
    expect(overlay.handles.get('se')?.getAttrs()).toMatchObject({
      x: 1600 - 2.5,
      y: 500 - 2.5,
      width: 5,
      fill: TOKENS.line,
      stroke: TOKENS.select,
    });
  });

  it('posição inválida durante o gesto: contorno em vermelho, mais grosso', () => {
    const { overlay, render } = setup();
    const placement = { x: 500, y: 0, scale: 1 };
    render(
      {
        selection: { kind: 'image', id: 'I2' },
        preview: { imageId: 'I2', placement, valid: false },
      },
      new Map([...PLACEMENTS, ['I2', placement]]),
    );
    expect(overlay.selectionOutline.stroke()).toBe(TOKENS.invalid);
    expect(overlay.selectionOutline.strokeWidth()).toBe(4);
    expect(overlay.selectionOutline.x()).toBe(500);
  });

  it('marcação selecionada: só as alças (a borda dela já engrossa)', () => {
    const { overlay, render, handles } = setup();
    render({ selection: { kind: 'marking', id: 'M2' } });
    expect(overlay.selectionOutline.visible()).toBe(false);
    expect(overlay.handles.get('nw')?.getAttrs()).toMatchObject({ x: 195, y: 195 });
    expect(handles().every((h) => h.visible())).toBe(true);
  });

  it('alça maior com toque (size-handle-touch)', () => {
    const { overlay, render } = setup();
    render({
      selection: { kind: 'marking', id: 'M2' },
      tokens: { ...TOKENS, handleSize: 14 },
    });
    expect(overlay.handles.get('nw')?.getAttrs()).toMatchObject({
      x: 193,
      y: 193,
      width: 14,
    });
  });

  describe('etiqueta do nome da marcação selecionada', () => {
    const SELECTED = { kind: 'marking', id: 'M2' } as const;
    /** Tela 380×700 com a imagem I1 deslocada: o topo de M2 (y = 200) fica em `top`. */
    const at = (top: number, scale = 1) => ({ x: 0, y: top - 200 * scale, scale });

    it('acima do canto superior esquerdo, com as cores da etiqueta', () => {
      const { overlay, render } = setup();
      render({ selection: SELECTED, viewport: at(100) });
      expect(overlay.nameTag.visible()).toBe(true);
      expect(overlay.nameTagText.text()).toBe('Maçaneta');
      expect(overlay.nameTagText.getAttrs()).toMatchObject({
        fill: TOKENS.nameTagText,
        fontFamily: TOKENS.fontFamily,
        fontSize: TOKENS.type.name.size,
      });
      expect(overlay.nameTagBox.getAttrs()).toMatchObject({ fill: TOKENS.nameTag });
      // Altura de 16 + 2·1 de halo e vão de 2 px: o fundo termina 2 px acima da borda.
      expect(overlay.nameTag.x()).toBe(200);
      expect(overlay.nameTag.y()).toBe(200 - 20);
    });

    it('mantém o tamanho em px de tela com zoom', () => {
      const { overlay, render } = setup();
      render({ selection: SELECTED, viewport: at(100, 2) });
      expect(overlay.nameTag.scaleX()).toBe(0.5);
      expect(overlay.nameTag.y()).toBe(200 - 20 / 2);
    });

    it('sem espaço acima na tela: por dentro da marcação', () => {
      const { overlay, render } = setup();
      render({ selection: SELECTED, viewport: at(5) });
      expect(overlay.nameTag.y()).toBe(200 + 2);
    });

    it('canto fora da tela: ancorada na borda visível', () => {
      const { overlay, render } = setup();
      // M2 começa em x = 200 e y = 200; a tela mostra de (250, 250) em diante.
      render({ selection: SELECTED, viewport: { x: -250, y: -250, scale: 1 } });
      expect(overlay.nameTag.x()).toBe(250);
      expect(overlay.nameTag.y()).toBe(250 + 2);
    });

    it('sem nome, imagem selecionada ou sem seleção: sem etiqueta', () => {
      const { overlay, render } = setup();
      render({ selection: { kind: 'marking', id: 'M3' }, viewport: at(100) });
      expect(overlay.nameTag.visible()).toBe(false);
      render({ selection: { kind: 'image', id: 'I1' } });
      expect(overlay.nameTag.visible()).toBe(false);
      render({ selection: SELECTED, viewport: at(100) });
      render();
      expect(overlay.nameTag.visible()).toBe(false);
    });

    it('followsView só enquanto a etiqueta aparece (pan precisa redesenhá-la)', () => {
      const { overlay, render } = setup();
      expect(overlay.followsView).toBe(false);
      render({ selection: SELECTED, viewport: at(100) });
      expect(overlay.followsView).toBe(true);
    });
  });

  it('sem alças no modo Desenhar e só em leitura', () => {
    const { render, handles } = setup();
    render({ selection: { kind: 'marking', id: 'M2' }, mode: 'draw' });
    expect(handles().some((h) => h.visible())).toBe(false);
    render({ selection: { kind: 'marking', id: 'M2' }, readOnly: true });
    expect(handles().some((h) => h.visible())).toBe(false);
  });

  it('item pego pelo segurar-e-mover: destaque com sombra', () => {
    const { overlay, render } = setup();
    render({
      selection: { kind: 'marking', id: 'M2' },
      grabbed: { kind: 'marking', id: 'M2' },
    });
    expect(overlay.grabRect.getAttrs()).toMatchObject({
      visible: true,
      x: 200,
      width: 100,
      opacity: TOKENS.opacity.grabbed,
      shadowColor: TOKENS.grabShadow.color,
      shadowBlur: TOKENS.grabShadow.blur,
    });
  });

  it('rascunho: tracejado; vermelho enquanto for pequeno demais', () => {
    const { overlay, render } = setup();
    render({ draft: { imageId: 'I1', rect: { x: 10, y: 10, width: 2, height: 2 } } });
    expect(overlay.draftRect.visible()).toBe(true);
    expect(overlay.draftRect.stroke()).toBe(TOKENS.invalid);
    render({ draft: { imageId: 'I1', rect: { x: 10, y: 10, width: 80, height: 60 } } });
    expect(overlay.draftRect.stroke()).toBe(TOKENS.select);
    expect(overlay.draftRect.dash()).toEqual([6, 4]);
    render();
    expect(overlay.draftRect.visible()).toBe(false);
  });

  it('alvo de soltar: imagem destacada; área vazia marca o container', () => {
    const { container, overlay, render } = setup();
    render({ dropTarget: { imageId: 'I1' } });
    expect(overlay.dropRect.visible()).toBe(true);
    expect(overlay.dropRect.width()).toBe(1000);
    expect(container.classList.contains('canvas-host--drop')).toBe(false);

    render({ dropTarget: { imageId: null } });
    expect(overlay.dropRect.visible()).toBe(false);
    expect(container.classList.contains('canvas-host--drop')).toBe(true);

    render();
    expect(container.classList.contains('canvas-host--drop')).toBe(false);
  });
});

describe('OverlayRenderer: trava (etapa 2.5)', () => {
  const lock = (
    editor: ReturnType<typeof editorFor>,
    kind: 'marking' | 'image',
    id: string,
  ) =>
    expect(
      (kind === 'marking'
        ? editor.actions.setMarkingLocked(id, true)
        : editor.actions.setImageLocked(id, true)
      ).ok,
    ).toBe(true);

  function lockedSetup() {
    const container = document.createElement('div');
    const overlay = new OverlayRenderer(new Konva.Layer(), container);
    const editor = editorFor();
    const render = (overrides: Partial<Frame> = {}, placements = PLACEMENTS) =>
      overlay.render(frameOf(editor, overrides), placements);
    return { overlay, editor, render };
  }

  it('marcação trancada e selecionada: sem alças, com o cadeado no canto superior direito', () => {
    const { overlay, editor, render } = lockedSetup();
    lock(editor, 'marking', 'M2');
    render({ selection: { kind: 'marking', id: 'M2' } });
    expect([...overlay.handles.values()].every((h) => !h.visible())).toBe(true);
    const badge = overlay.selectionLock.group;
    expect(badge.visible()).toBe(true);
    // M2 mede 100×100 e o cadeado tem 20 px: cabe por dentro, com vão de 2 px.
    expect(badge.x()).toBe(300 - 20 - 2);
    expect(badge.y()).toBe(200 + 2);
    expect(badge.opacity()).toBe(1);
    expect(overlay.hoverLockBadge.group.visible()).toBe(false);
  });

  it('o cadeado usa os tokens e mantém o tamanho em px de tela com o zoom', () => {
    const { overlay, editor, render } = lockedSetup();
    lock(editor, 'marking', 'M1');
    render({
      selection: { kind: 'marking', id: 'M1' },
      viewport: { x: 0, y: 0, scale: 2 },
    });
    const badge = overlay.selectionLock.group;
    expect(badge.scaleX()).toBe(0.5);
    const [box, glyph] = badge.getChildren();
    expect(box?.getAttrs()).toMatchObject({
      width: TOKENS.lock.size,
      height: TOKENS.lock.size,
      fill: TOKENS.lock.fill,
      cornerRadius: TOKENS.radius.sm,
    });
    const paths = (glyph as Konva.Group).getChildren();
    expect(paths).toHaveLength(2);
    expect(paths.every((p) => p.getAttrs().stroke === TOKENS.lock.glyph)).toBe(true);
  });

  it('descendente de um pai trancado: sem alças e com o cadeado esmaecido', () => {
    const { overlay, editor, render } = lockedSetup();
    lock(editor, 'marking', 'M1');
    render({ selection: { kind: 'marking', id: 'M2' } });
    expect([...overlay.handles.values()].every((h) => !h.visible())).toBe(true);
    expect(overlay.selectionLock.group.visible()).toBe(true);
    expect(overlay.selectionLock.group.opacity()).toBe(TOKENS.opacity.inherited);
  });

  it('marcação pequena na tela: o cadeado fica por fora, acima do canto', () => {
    const { overlay, editor, render } = lockedSetup();
    lock(editor, 'marking', 'M2');
    render({
      selection: { kind: 'marking', id: 'M2' },
      viewport: { x: 0, y: 0, scale: 0.25 },
    });
    // 100 unidades a 0,25 = 25 px de tela: menos que dois cadeados de 20 px.
    const badge = overlay.selectionLock.group;
    expect(badge.x()).toBe(300 - 20 / 0.25);
    expect(badge.y()).toBe(200 - (20 + 2) / 0.25);
  });

  it('imagem trancada e selecionada: sem alças e com o cadeado', () => {
    const { overlay, editor, render } = lockedSetup();
    lock(editor, 'image', 'I2');
    // Metade da escala: I2 (1100–1600) cabe na tela de 380 px; o cadeado mede 40 unidades.
    render({
      selection: { kind: 'image', id: 'I2' },
      viewport: { x: -500, y: 0, scale: 0.5 },
    });
    expect([...overlay.handles.values()].every((h) => !h.visible())).toBe(true);
    expect(overlay.selectionLock.group.visible()).toBe(true);
    expect(overlay.selectionLock.group.x()).toBe(1600 - 40 - 4);
  });

  it('item livre: alças e nenhum cadeado; destrancar traz as alças de volta', () => {
    const { overlay, editor, render } = lockedSetup();
    lock(editor, 'marking', 'M2');
    render({ selection: { kind: 'marking', id: 'M2' } });
    expect(overlay.selectionLock.group.visible()).toBe(true);
    editor.actions.setMarkingLocked('M2', false);
    render({ selection: { kind: 'marking', id: 'M2' } });
    expect(overlay.selectionLock.group.visible()).toBe(false);
    expect([...overlay.handles.values()].every((h) => h.visible())).toBe(true);
  });

  it('cadeado sob o mouse: aparece no item trancado que não é o selecionado', () => {
    const { overlay, editor, render } = lockedSetup();
    lock(editor, 'marking', 'M1');
    render({ hoverLock: { kind: 'marking', id: 'M1' } });
    expect(overlay.hoverLockBadge.group.visible()).toBe(true);
    expect(overlay.selectionLock.group.visible()).toBe(false);
    // Selecionado, o item usa o cadeado da seleção e o do mouse some.
    render({
      selection: { kind: 'marking', id: 'M1' },
      hoverLock: { kind: 'marking', id: 'M1' },
    });
    expect(overlay.hoverLockBadge.group.visible()).toBe(false);
    expect(overlay.selectionLock.group.visible()).toBe(true);
    render({ hoverLock: null });
    expect(overlay.hoverLockBadge.group.visible()).toBe(false);
  });

  it('o cadeado acompanha a parte visível: pan precisa redesenhar', () => {
    const { overlay, editor, render } = lockedSetup();
    expect(overlay.followsView).toBe(false);
    lock(editor, 'image', 'I1');
    render({ selection: { kind: 'image', id: 'I1' } });
    expect(overlay.followsView).toBe(true);
    render({ selection: null });
    expect(overlay.followsView).toBe(false);
  });

  it('o cadeado do item grande é ancorado na borda visível', () => {
    const { overlay, editor, render } = lockedSetup();
    lock(editor, 'image', 'I1');
    // Metade direita de I1 fora da tela (tela de 380 px): o cadeado fica na borda da tela.
    render({
      selection: { kind: 'image', id: 'I1' },
      viewport: { x: 0, y: 0, scale: 1 },
    });
    expect(overlay.selectionLock.group.x()).toBe(380 - 20 - 2);
  });

  it('em tela estreita com o topo fora da tela: ancora no topo visível', () => {
    const { overlay, editor, render } = lockedSetup();
    lock(editor, 'image', 'I1');
    render({
      selection: { kind: 'image', id: 'I1' },
      viewport: { x: 0, y: -100, scale: 1 },
    });
    expect(overlay.selectionLock.group.y()).toBe(100 + 2);
  });
});
