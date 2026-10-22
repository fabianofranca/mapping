import Konva from 'konva/lib/Core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Frame } from '../../../src/canvas/frame';
import { MarkingRenderer } from '../../../src/canvas/renderers/markings';
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
        preview: { containerId: 'I2', placement, valid: false },
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

    // Etapa 6 (6.4), achado 6: "Topo" por cima do título da imagem "Checkout".
    it('marcação no topo da imagem: a etiqueta sobe acima do título da imagem', () => {
      const { overlay } = setup();
      const editor = editorFor();
      const p = editor.store.committed.value;
      if (!p) throw new Error('sem projeto');
      const project = {
        ...p,
        markings: p.markings.map((m) =>
          m.id === 'M2' ? { ...m, rect: { x: 200, y: 4, width: 100, height: 100 } } : m,
        ),
      };
      overlay.render(
        frameOf(editor, {
          project,
          selection: SELECTED,
          viewport: { x: 0, y: 300, scale: 1 },
        }),
        PLACEMENTS,
      );
      // Título da imagem: linha de 16 px terminando 4 px acima do topo (y = 0).
      const tagBottom = overlay.nameTag.y() + overlay.nameTagBox.height();
      expect(tagBottom).toBeLessThanOrEqual(-(TOKENS.type.image.line + 4));
    });

    // Etapa 7 (7.2), achado A2: a 52%, a etiqueta "Nome" da filha encostada no topo do
    // Formulário cobria o rótulo "Formulário …" do pai ("Fo[Nome]ulário").
    it('filha no topo do pai: a etiqueta não cobre o rótulo do pai', () => {
      const editor = editorFor();
      const p = editor.store.committed.value;
      if (!p) throw new Error('sem projeto');
      const zoom = 0.52;
      const project = {
        ...p,
        markings: p.markings.map((m) =>
          m.id === 'M2' ? { ...m, rect: { x: 110, y: 120, width: 200, height: 120 } } : m,
        ),
      };
      const frame = frameOf(editor, {
        project,
        selection: SELECTED,
        size: { width: 1000, height: 800 },
        viewport: { x: 0, y: 0, scale: zoom },
      });
      const markings = new MarkingRenderer(new Konva.Layer());
      markings.render(frame, PLACEMENTS);
      const overlay = new OverlayRenderer(
        new Konva.Layer(),
        document.createElement('div'),
      );
      overlay.render(frame, PLACEMENTS, markings.headers);

      const label = markings.node('M1')?.text.header;
      if (!label) throw new Error('sem rótulo do pai');
      expect(label.visible()).toBe(true);
      const labelBox = {
        x: label.x(),
        y: label.y(),
        right: label.x() + Math.min(label.width(), label.getTextWidth()),
        bottom: label.y() + label.height(),
      };
      expect(overlay.nameTag.visible()).toBe(true);
      const tag = {
        x: overlay.nameTag.x(),
        y: overlay.nameTag.y(),
        right: overlay.nameTag.x() + overlay.nameTagBox.width() / zoom,
        bottom: overlay.nameTag.y() + overlay.nameTagBox.height() / zoom,
      };
      const overlaps =
        tag.x < labelBox.right &&
        labelBox.x < tag.right &&
        tag.y < labelBox.bottom &&
        labelBox.y < tag.bottom;
      expect(overlaps).toBe(false);
      // Deslocada para baixo do rótulo do pai, sem sair da linha de cima da filha.
      expect(tag.y).toBeGreaterThanOrEqual(labelBox.bottom);
      expect(tag.x).toBe(110);
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

  it('rascunho: tracejado; vermelho enquanto for pequeno demais', () => {
    const { overlay, render } = setup();
    render({ draft: { containerId: 'I1', rect: { x: 10, y: 10, width: 2, height: 2 } } });
    expect(overlay.draftRect.visible()).toBe(true);
    expect(overlay.draftRect.stroke()).toBe(TOKENS.invalid);
    render({
      draft: { containerId: 'I1', rect: { x: 10, y: 10, width: 80, height: 60 } },
    });
    expect(overlay.draftRect.stroke()).toBe(TOKENS.select);
    expect(overlay.draftRect.dash()).toEqual([6, 4]);
    render();
    expect(overlay.draftRect.visible()).toBe(false);
  });

  it('alvo de soltar: imagem destacada; área vazia marca o container', () => {
    const { container, overlay, render } = setup();
    render({ dropTarget: { containerId: 'I1' } });
    expect(overlay.dropRect.visible()).toBe(true);
    expect(overlay.dropRect.width()).toBe(1000);
    expect(container.classList.contains('canvas-host--drop')).toBe(false);

    render({ dropTarget: { containerId: null } });
    expect(overlay.dropRect.visible()).toBe(false);
    expect(container.classList.contains('canvas-host--drop')).toBe(true);

    render();
    expect(container.classList.contains('canvas-host--drop')).toBe(false);
  });

  it('alvo de soltar com marcação: acende o retângulo dela, sem o fundo', () => {
    const { container, overlay, render } = setup();
    render({ dropTarget: { containerId: null, markingId: 'M1' } });
    expect(overlay.dropRect.visible()).toBe(true);
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

// Marcações do canvas, absorção e trava herdada (etapa Marcações espaciais, ME1).
describe('OverlayRenderer: marcações do canvas', () => {
  function spatialSetup() {
    const container = document.createElement('div');
    const overlay = new OverlayRenderer(new Konva.Layer(), container);
    const editor = editorFor();
    const created = editor.actions.createMarking(null, {
      x: -100,
      y: -100,
      width: 1800,
      height: 1000,
    });
    const id = created.ok ? created.value : '';
    const render = (overrides: Partial<Frame> = {}, placements = PLACEMENTS) =>
      overlay.render(frameOf(editor, overrides), placements);
    return { overlay, editor, render, id };
  }

  it('rascunho no vazio (sem imagem): no espaço identidade do canvas', () => {
    const { overlay, render } = spatialSetup();
    render({
      draft: { containerId: null, rect: { x: 1050, y: 600, width: 300, height: 200 } },
    });
    expect(overlay.draftRect.getAttrs()).toMatchObject({
      visible: true,
      x: 1050,
      y: 600,
      width: 300,
      height: 200,
      stroke: TOKENS.select,
    });
  });

  it('marcação do canvas selecionada: alças nos cantos dela e sem etiqueta de título de imagem', () => {
    const { overlay, render, id } = spatialSetup();
    render({
      selection: { kind: 'marking', id },
      viewport: { x: 100, y: 100, scale: 1 },
    });
    expect(overlay.handles.get('nw')?.getAttrs()).toMatchObject({
      visible: true,
      x: -105,
      y: -105,
    });
    expect(overlay.handles.get('se')?.getAttrs()).toMatchObject({ x: 1695, y: 895 });
  });

  it('itens a absorver acendem com o token novo e somem quando a lista esvazia', () => {
    const { overlay, render } = spatialSetup();
    render({ absorb: [{ x: 10, y: 20, width: 30, height: 40 }] });
    const lit = overlay.absorbHighlights();
    expect(lit).toHaveLength(1);
    expect(lit[0]?.getAttrs()).toMatchObject({
      visible: true,
      x: 10,
      y: 20,
      width: 30,
      height: 40,
      stroke: TOKENS.absorb,
      fill: TOKENS.absorbFill,
    });
    render({ absorb: [] });
    expect(overlay.absorbHighlights().every((r) => !r.visible())).toBe(true);
    // Dois itens, depois um: o segundo nó some, o primeiro é reaproveitado.
    render({
      absorb: [
        { x: 1, y: 1, width: 5, height: 5 },
        { x: 9, y: 9, width: 5, height: 5 },
      ],
    });
    expect(overlay.absorbHighlights().filter((r) => r.visible())).toHaveLength(2);
    render({ absorb: [{ x: 1, y: 1, width: 5, height: 5 }] });
    expect(overlay.absorbHighlights().filter((r) => r.visible())).toHaveLength(1);
  });

  it('container dentro de uma marcação do canvas trancada: cadeado esmaecido (trava herdada)', () => {
    const { overlay, editor, render, id } = spatialSetup();
    expect(editor.actions.setMarkingLocked(id, true).ok).toBe(true);
    render({ selection: { kind: 'image', id: 'I2' } });
    expect([...overlay.handles.values()].every((h) => !h.visible())).toBe(true);
    expect(overlay.selectionLock.group.visible()).toBe(true);
    expect(overlay.selectionLock.group.opacity()).toBe(TOKENS.opacity.inherited);
    // O cadeado sob o mouse também mostra a herança.
    render({ hoverLock: { kind: 'image', id: 'I1' } });
    expect(overlay.hoverLockBadge.group.visible()).toBe(true);
    expect(overlay.hoverLockBadge.group.opacity()).toBe(TOKENS.opacity.inherited);
  });

  it('a marcação do canvas trancada tem o cadeado cheio e as filhas do espaço dela, o esmaecido', () => {
    const { overlay, editor, render, id } = spatialSetup();
    const inner = editor.actions.createMarking(null, {
      x: -50,
      y: -50,
      width: 60,
      height: 60,
    });
    const innerId = inner.ok ? inner.value : '';
    expect(editor.actions.setMarkingLocked(id, true).ok).toBe(true);
    render({ selection: { kind: 'marking', id } });
    expect(overlay.selectionLock.group.opacity()).toBe(1);
    render({ selection: { kind: 'marking', id: innerId } });
    expect(overlay.selectionLock.group.visible()).toBe(true);
    expect(overlay.selectionLock.group.opacity()).toBe(TOKENS.opacity.inherited);
  });
});

// Seleção múltipla (etapa Marcações espaciais, ME2): alças, cadeado e etiqueta só no primário;
// contorno secundário nos demais.
describe('OverlayRenderer: seleção múltipla', () => {
  const im = (id: string) => ({ kind: 'image', id }) as const;
  const mk = (id: string) => ({ kind: 'marking', id }) as const;

  function multiSetup() {
    const container = document.createElement('div');
    const overlay = new OverlayRenderer(new Konva.Layer(), container);
    const editor = editorFor();
    const render = (overrides: Partial<Frame> = {}, placements = PLACEMENTS) =>
      overlay.render(frameOf(editor, overrides), placements);
    const lit = () =>
      overlay
        .secondaryHighlights()
        .filter((r) => r.visible())
        .map((r) => r.getAttrs());
    return { overlay, editor, render, lit };
  }

  it('sem seleção múltipla, nenhum contorno secundário', () => {
    const { overlay, render } = multiSetup();
    render({ selection: mk('M2'), items: [mk('M2')] });
    expect(overlay.secondaryHighlights().filter((r) => r.visible())).toHaveLength(0);
    render();
    expect(overlay.secondaryHighlights().filter((r) => r.visible())).toHaveLength(0);
  });

  it('os não primários ganham contorno no retângulo deles, com o token novo', () => {
    const { render, lit } = multiSetup();
    render({
      selection: mk('M2'),
      items: [im('I2'), mk('M3'), mk('M1'), mk('M2')],
      viewport: { x: 0, y: 0, scale: 2 },
    });
    const attrs = lit();
    expect(attrs).toHaveLength(3);
    // Container: o retângulo dele no canvas.
    expect(attrs[0]).toMatchObject({
      x: 1100,
      y: 0,
      width: 500,
      height: 500,
      stroke: TOKENS.selectSecondary,
      strokeWidth: 1, // 2 px de tela com zoom 2
    });
    // Marcação de container: o retângulo dela pelo espaço do container.
    expect(attrs[1]).toMatchObject({
      x: 1150,
      y: 50,
      width: 200,
      height: 200,
      stroke: TOKENS.selectSecondary,
    });
    expect(attrs[2]).toMatchObject({ x: 100, y: 100, width: 600, height: 500 });
    // O primário não ganha contorno secundário.
    expect(attrs.some((a) => a.x === 200 && a.y === 200)).toBe(false);
  });

  it('marcação do canvas e container dentro do espaço do canvas', () => {
    const { editor, overlay, render, lit } = multiSetup();
    const created = editor.actions.createMarking(null, {
      x: -100,
      y: -100,
      width: 1800,
      height: 1000,
    });
    const id = created.ok ? created.value : '';
    render({ selection: im('I1'), items: [mk(id), im('I1')] });
    expect(lit()).toEqual([
      expect.objectContaining({ x: -100, y: -100, width: 1800, height: 1000 }),
    ]);
    expect(overlay.selectionOutline.visible()).toBe(true); // o contorno do primário (container)
  });

  it('alças só no primário (marcação), sem alças nos demais', () => {
    const { overlay, render } = multiSetup();
    render({ selection: mk('M2'), items: [im('I2'), mk('M2')] });
    const visible = [...overlay.handles.values()].filter((h) => h.visible());
    expect(visible).toHaveLength(4);
    // Em volta de M2 (200, 200, 100×100); nenhuma nos cantos de I2.
    expect(overlay.handles.get('nw')?.getAttrs()).toMatchObject({ x: 195, y: 195 });
    expect(overlay.handles.get('se')?.getAttrs()).toMatchObject({ x: 295, y: 295 });
  });

  it('alças só no primário (container): o contorno de seleção é o dele', () => {
    const { overlay, render, lit } = multiSetup();
    render({ selection: im('I2'), items: [mk('M2'), im('I2')] });
    expect(overlay.selectionOutline.getAttrs()).toMatchObject({
      visible: true,
      x: 1100,
      stroke: TOKENS.select,
    });
    expect(overlay.handles.get('se')?.getAttrs()).toMatchObject({ x: 1595, y: 495 });
    expect(lit()).toHaveLength(1);
    expect(lit()[0]).toMatchObject({ x: 200, y: 200 });
  });

  it('a etiqueta de nome e o cadeado são só do primário', () => {
    const { editor, overlay, render } = multiSetup();
    expect(editor.actions.setMarkingLocked('M3', true).ok).toBe(true);
    render({ selection: mk('M2'), items: [mk('M3'), mk('M1'), mk('M2')] });
    expect(overlay.nameTag.visible()).toBe(true);
    expect(overlay.nameTagText.text()).toBe('Maçaneta');
    // M3 (secundário) está trancada, mas o cadeado da seleção é do primário, que é livre.
    expect(overlay.selectionLock.group.visible()).toBe(false);
    render({ selection: mk('M3'), items: [mk('M2'), mk('M3')] });
    expect(overlay.selectionLock.group.visible()).toBe(true);
    expect(overlay.nameTag.visible()).toBe(false); // M3 não tem nome
  });

  it('o contorno acompanha a prévia do arrasto (posições do quadro) e o pool é reaproveitado', () => {
    const { overlay, render, lit } = multiSetup();
    const moved = new Map<string, Placement>([
      ['I1', { x: 0, y: 0, scale: 1 }],
      ['I2', { x: 1200, y: 40, scale: 1 }],
    ]);
    render({ selection: mk('M2'), items: [im('I2'), mk('M3'), mk('M2')] }, moved);
    expect(lit()).toEqual([
      expect.objectContaining({ x: 1200, y: 40, width: 500, height: 500 }),
      // M3 anda com o container: x = 1200 + 50, y = 40 + 50.
      expect.objectContaining({ x: 1250, y: 90, width: 200, height: 200 }),
    ]);
    const nodes = overlay.secondaryHighlights().slice();
    render({ selection: mk('M2'), items: [im('I2'), mk('M2')] }, moved);
    expect(lit()).toHaveLength(1);
    expect(overlay.secondaryHighlights()).toHaveLength(2); // o segundo nó só some
    expect(overlay.secondaryHighlights()[0]).toBe(nodes[0]);
    render({ selection: mk('M2'), items: [mk('M2')] });
    expect(lit()).toHaveLength(0);
  });

  it('item que deixou de existir (depois de desfazer) não deixa contorno', () => {
    const { render, lit } = multiSetup();
    render({ selection: mk('M2'), items: [mk('Fantasma'), im('I9'), mk('M2')] });
    expect(lit()).toHaveLength(0);
  });

  it('sem projeto, nada aparece', () => {
    const { render, lit } = multiSetup();
    render({ project: null, selection: mk('M2'), items: [im('I2'), mk('M2')] });
    expect(lit()).toHaveLength(0);
  });
});
