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
      stroke: TOKENS.accent,
      strokeWidth: 1,
    });
    expect(handles().filter((h) => h.visible())).toHaveLength(4);
    // Alça de 14 px de tela centrada no canto.
    expect(overlay.handles.get('se')?.getAttrs()).toMatchObject({
      x: 1600 - 3.5,
      y: 500 - 3.5,
      width: 7,
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
    expect(overlay.selectionOutline.stroke()).toBe(TOKENS.danger);
    expect(overlay.selectionOutline.strokeWidth()).toBe(4);
    expect(overlay.selectionOutline.x()).toBe(500);
  });

  it('marcação selecionada: só as alças (a borda dela já engrossa)', () => {
    const { overlay, render, handles } = setup();
    render({ selection: { kind: 'marking', id: 'M2' } });
    expect(overlay.selectionOutline.visible()).toBe(false);
    expect(overlay.handles.get('nw')?.getAttrs()).toMatchObject({ x: 193, y: 193 });
    expect(handles().every((h) => h.visible())).toBe(true);
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
      shadowColor: TOKENS.accent,
    });
  });

  it('rascunho: tracejado; vermelho enquanto for pequeno demais', () => {
    const { overlay, render } = setup();
    render({ draft: { imageId: 'I1', rect: { x: 10, y: 10, width: 2, height: 2 } } });
    expect(overlay.draftRect.visible()).toBe(true);
    expect(overlay.draftRect.stroke()).toBe(TOKENS.danger);
    render({ draft: { imageId: 'I1', rect: { x: 10, y: 10, width: 80, height: 60 } } });
    expect(overlay.draftRect.stroke()).toBe(TOKENS.accent);
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
