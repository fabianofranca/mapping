import Konva from 'konva/lib/Core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ImageRenderer } from '../../../src/canvas/renderers/images';
import { t } from '../../../src/i18n';
import { removeImage, renameImage } from '../../../src/model';
import { canvasProject, editorFor, frameOf, installFakeCanvas, TOKENS } from '../harness';

beforeAll(installFakeCanvas);
afterAll(() => vi.restoreAllMocks());

function setup() {
  const layer = new Konva.Layer();
  const renderer = new ImageRenderer(layer);
  const editor = editorFor();
  return { layer, renderer, editor };
}

describe('ImageRenderer', () => {
  it('cria um grupo por imagem, na posição e na ordem do projeto', () => {
    const { layer, renderer, editor } = setup();
    const placements = renderer.render(frameOf(editor));
    expect([...placements.keys()]).toEqual(['I1', 'I2']);
    expect(layer.getChildren()).toHaveLength(2);
    const i2 = renderer.node('I2');
    expect(i2?.group.position()).toEqual({ x: 1100, y: 0 });
    expect(i2?.group.zIndex()).toBe(1);
    expect(i2?.placeholder.width()).toBe(500);
  });

  it('usa a posição da prévia do gesto em andamento', () => {
    const { renderer, editor } = setup();
    const preview = {
      imageId: 'I2',
      placement: { x: 2000, y: 50, scale: 2 },
      valid: true,
    };
    const placements = renderer.render(frameOf(editor, { preview }));
    expect(placements.get('I2')).toEqual(preview.placement);
    expect(renderer.node('I2')?.group.position()).toEqual({ x: 2000, y: 50 });
    expect(renderer.node('I2')?.placeholder.width()).toBe(1000);
  });

  it('carregando: espaço reservado sem aviso; pronta: só o bitmap', () => {
    const { renderer, editor } = setup();
    renderer.render(frameOf(editor));
    const node = renderer.node('I1');
    expect(node?.placeholder.visible()).toBe(true);
    expect(node?.bitmap.visible()).toBe(false);
    expect(node?.label.visible()).toBe(false);

    const bitmap = { width: 1000, height: 800, close: () => undefined };
    const bitmaps = new Map([
      [
        'images/a.jpg',
        { status: 'ready' as const, bitmap: bitmap as unknown as ImageBitmap },
      ],
    ]);
    renderer.render(frameOf(editor, { bitmaps }));
    expect(node?.bitmap.visible()).toBe(true);
    expect(node?.bitmap.image()).toBe(bitmap);
    expect(node?.placeholder.visible()).toBe(false);
  });

  it('imagem ausente: borda tracejada de aviso e mensagem com o arquivo', () => {
    const { renderer, editor } = setup();
    const bitmaps = new Map([['images/a.jpg', { status: 'missing' as const }]]);
    renderer.render(frameOf(editor, { bitmaps }));
    const node = renderer.node('I1');
    expect(node?.placeholder.stroke()).toBe(TOKENS.warning);
    expect(node?.placeholder.dash()).toEqual([8, 6]);
    expect(node?.label.visible()).toBe(true);
    expect(node?.label.text()).toBe(`⚠ ${t('canvas.imageMissing')}\nimages/a.jpg`);
  });

  it('rótulo: nome da imagem (ou o arquivo, esmaecido); some quando fica estreito na tela', () => {
    const { renderer, editor } = setup();
    renderer.render(frameOf(editor));
    expect(renderer.node('I1')?.title.text()).toBe('images/a.jpg');
    expect(renderer.node('I1')?.title.fill()).toBe(TOKENS.textMuted);

    const named = renameImage(canvasProject(), 'I1', 'Lateral');
    renderer.render(frameOf(editor, { project: named }));
    expect(renderer.node('I1')?.title.text()).toBe('Lateral');
    expect(renderer.node('I1')?.title.fill()).toBe(TOKENS.text);

    // 500 px de largura × 0,05 = 25 px de tela: menos que o mínimo legível.
    renderer.render(frameOf(editor, { viewport: { x: 0, y: 0, scale: 0.05 } }));
    expect(renderer.node('I2')?.title.visible()).toBe(false);
  });

  it('espessuras em px de tela: divididas pelo zoom', () => {
    const { renderer, editor } = setup();
    const bitmaps = new Map([['images/a.jpg', { status: 'error' as const }]]);
    renderer.render(frameOf(editor, { bitmaps, viewport: { x: 0, y: 0, scale: 4 } }));
    expect(renderer.node('I1')?.placeholder.strokeWidth()).toBe(0.5);
    expect(renderer.node('I1')?.label.text()).toContain(t('canvas.imageError'));
  });

  it('remove o nó de uma imagem que saiu do projeto', () => {
    const { layer, renderer, editor } = setup();
    renderer.render(frameOf(editor));
    const node = renderer.node('I2');
    const without = removeImage(canvasProject(), 'I2');
    renderer.render(frameOf(editor, { project: without }));
    expect(renderer.node('I2')).toBeUndefined();
    expect(layer.getChildren()).toHaveLength(1);
    expect(node?.group.getParent()).toBeFalsy();
  });
});
