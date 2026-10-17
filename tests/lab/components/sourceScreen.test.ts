// Laboratório Componentes: do JSON externo (SDUI) à tela arrumada, pela declaração de origem
// do Material 3. Depende de `layoutScreen` (layout.ts).
import { describe, expect, it } from 'vitest';
import settings from '../../../lab/components/sdui/settings.sdui.json';
import { approximateMeasurer } from '../../../lab/components/instantiate';
import { loadLibrary } from '../../../lab/components/library';
import { screenFromSource } from '../../../lab/components/origin';
import { M3_FILES } from '../../../lab/components/samplesMaterial3';
import { childrenOf } from '../../../lab/components/screen';

describe('screenFromSource com o Material 3', () => {
  const library = loadLibrary(M3_FILES);
  const result = screenFromSource(library, settings, { measure: approximateMeasurer });

  it('dá a tela sem erro e sem nenhum aviso (tradução e arrumação)', () => {
    expect(result.error).toBeUndefined();
    expect(result.warnings).toEqual([]);
    expect(result.screen).toMatchObject({
      id: 'settings',
      name: 'Settings',
      width: 412,
      height: 917,
      background: '#FEF7FF',
    });
  });

  it('toda instância tem caixa dentro da tela e id único', () => {
    const screen = result.screen!;
    const ids = screen.instances.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const instance of screen.instances) {
      const { x, y, width, height } = instance.box;
      expect(width, instance.id).toBeGreaterThan(0);
      expect(height, instance.id).toBeGreaterThan(0);
      expect(x, instance.id).toBeGreaterThanOrEqual(0);
      expect(y, instance.id).toBeGreaterThanOrEqual(0);
      expect(x + width, instance.id).toBeLessThanOrEqual(screen.width + 0.001);
      expect(y + height, instance.id).toBeLessThanOrEqual(screen.height + 0.001);
    }
  });

  it('o botão do cartão fica dentro do slot de ações, à direita', () => {
    const screen = result.screen!;
    const card = screen.instances.find((i) => i.typeId === 'm3-card')!;
    const kids = childrenOf(screen, card.id);
    expect(kids).toHaveLength(1);
    const button = kids[0]!;
    expect(button.typeId).toBe('m3-button');
    expect(button.parentId).toBe(card.id);
    expect(button.box.x + button.box.width).toBeCloseTo(
      card.box.x + card.box.width - 16,
      0,
    );
    expect(button.box.y + button.box.height).toBeLessThanOrEqual(
      card.box.y + card.box.height,
    );
  });

  it('o FAB fica em bottom-end com margem 16; a barra de navegação, no fundo', () => {
    const screen = result.screen!;
    const fab = screen.instances.find((i) => i.typeId === 'm3-fab')!;
    expect(fab.box.x + fab.box.width).toBeCloseTo(screen.width - 16);
    expect(fab.box.y + fab.box.height).toBeCloseTo(screen.height - 16);
    const bar = screen.instances.find((i) => i.typeId === 'm3-navigation-bar')!;
    expect(bar.box).toMatchObject({ x: 0, width: screen.width, height: 80 });
    expect(bar.box.y + bar.box.height).toBeCloseTo(screen.height);
  });

  it('a película vem antes da folha, cobrindo a tela', () => {
    const screen = result.screen!;
    const scrimIndex = screen.instances.findIndex((i) => i.typeId === 'm3-scrim');
    const sheetIndex = screen.instances.findIndex((i) => i.typeId === 'm3-bottom-sheet');
    expect(scrimIndex).toBeGreaterThanOrEqual(0);
    expect(scrimIndex).toBe(sheetIndex - 1);
    expect(screen.instances[scrimIndex]!.box).toEqual({
      x: 0,
      y: 0,
      width: screen.width,
      height: screen.height,
    });
    const sheet = screen.instances[sheetIndex]!;
    expect(sheet.box.y + sheet.box.height).toBeCloseTo(screen.height);
  });

  it('as raízes saem na ordem: conteúdo, barra, FAB, película e folha', () => {
    const roots = result
      .screen!.instances.filter((i) => i.parentId === undefined)
      .map((i) => i.id);
    expect(roots).toEqual([
      'content',
      'bottomBar',
      'floating[0]',
      'modal#scrim',
      'modal',
    ]);
  });
});
