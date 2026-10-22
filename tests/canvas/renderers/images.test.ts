import Konva from 'konva/lib/Core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ImageRenderer } from '../../../src/canvas/renderers/images';
import { t } from '../../../src/i18n';
import {
  addBackgroundContainer,
  removeContainer,
  renameContainer,
} from '../../../src/model';
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
      containerId: 'I2',
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

  // Achado 10: `drawImage … The image source is detached`. Um `ImageBitmap` fechado fica
  // com largura e altura zero; desenhá-lo lança. O nó nunca recebe um bitmap fechado.
  it('não desenha um bitmap fechado: o nó fica sem imagem e volta ao espaço reservado', () => {
    const { renderer, editor } = setup();
    const open = { width: 1000, height: 800, close: () => undefined };
    const ready = (bitmap: typeof open) =>
      new Map([
        [
          'images/a.jpg',
          { status: 'ready' as const, bitmap: bitmap as unknown as ImageBitmap },
        ],
      ]);
    renderer.render(frameOf(editor, { bitmaps: ready(open) }));
    const node = renderer.node('I1');
    expect(node?.bitmap.image()).toBe(open);

    const closed = { width: 0, height: 0, close: () => undefined };
    renderer.render(frameOf(editor, { bitmaps: ready(closed) }));
    expect(node?.bitmap.visible()).toBe(false);
    expect(node?.bitmap.image()).toBeUndefined();
    expect(node?.placeholder.visible()).toBe(true);
    // Sem aviso: não é uma imagem ausente nem quebrada, só um quadro de transição.
    expect(node?.label.visible()).toBe(false);
  });

  it('imagem ausente: borda tracejada de aviso e mensagem com o arquivo', () => {
    const { renderer, editor } = setup();
    const bitmaps = new Map([['images/a.jpg', { status: 'missing' as const }]]);
    renderer.render(frameOf(editor, { bitmaps }));
    const node = renderer.node('I1');
    expect(node?.placeholder.stroke()).toBe(TOKENS.warningText);
    expect(node?.placeholder.dash()).toEqual([8, 6]);
    expect(node?.label.visible()).toBe(true);
    expect(node?.label.text()).toBe(`⚠ ${t('canvas.imageMissing')}\nimages/a.jpg`);
  });

  it('rótulo: nome da imagem (ou o arquivo, esmaecido); some quando fica estreito na tela', () => {
    const { renderer, editor } = setup();
    renderer.render(frameOf(editor));
    expect(renderer.node('I1')?.title.text()).toBe('images/a.jpg');
    expect(renderer.node('I1')?.title.fill()).toBe(TOKENS.textMuted);

    const named = renameContainer(canvasProject(), 'I1', 'Lateral');
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
    const without = removeContainer(canvasProject(), 'I2');
    renderer.render(frameOf(editor, { project: without }));
    expect(renderer.node('I2')).toBeUndefined();
    expect(layer.getChildren()).toHaveLength(1);
    expect(node?.group.getParent()).toBeFalsy();
  });

  it('container: retângulo cheio na cor de fundo, nunca o reservado de carregando', () => {
    const { renderer, editor } = setup();
    const project = addBackgroundContainer(canvasProject(), {
      id: 'B1',
      width: 400,
      height: 600,
      background: '#FFEEDD',
      center: { x: 3000, y: 300 },
    });
    // Sem nenhum bitmap no mapa: continua pronta.
    const placements = renderer.render(frameOf(editor, { project }));
    expect(placements.has('B1')).toBe(true);
    const node = renderer.node('B1');
    expect(node?.bitmap.visible()).toBe(false);
    expect(node?.bitmap.image()).toBeUndefined();
    expect(node?.label.visible()).toBe(false);
    const scale = placements.get('B1')?.scale ?? Number.NaN;
    expect(node?.placeholder.getAttrs()).toMatchObject({
      visible: true,
      width: 400 * scale,
      height: 600 * scale,
      fill: '#FFEEDD',
      stroke: TOKENS.border,
      dash: [],
    });
    // Sem nome: o rótulo é o de tela sem nome, esmaecido.
    expect(node?.title.text()).toBe(t('image.containerUntitled'));
    expect(node?.title.fill()).toBe(TOKENS.textMuted);

    // A espessura da borda segue o zoom.
    renderer.render(frameOf(editor, { project, viewport: { x: 0, y: 0, scale: 4 } }));
    expect(node?.placeholder.strokeWidth()).toBe(0.25);
  });
});
