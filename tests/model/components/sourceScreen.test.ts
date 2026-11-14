// Components lab: from the external JSON (SDUI) to the arranged screen, by the origin declaration
// of Material 3. Depends on `layoutScreen` (layout.ts).
import { describe, expect, it } from 'vitest';
import settings from '../../../viewer/samples/settings.sdui.json';
import { approximateMeasurer } from '../../../src/model/components/instantiate';
import { loadLibrary } from '../../../src/model/components/library';
import { screenFromSource } from '../../../src/model/components/origin';
import { M3_FILES } from '../../../viewer/samples/samplesMaterial3';
import { childrenOf } from '../../../src/model/components/screen';

describe('screenFromSource with Material 3', () => {
  const library = loadLibrary(M3_FILES);
  const result = screenFromSource(library, settings, { measure: approximateMeasurer });

  it('gives the screen with no error and no warning (translation and arrangement)', () => {
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

  it('every instance has a box inside the screen and a unique id', () => {
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

  it('the card button stays inside the actions slot, on the right', () => {
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

  it('the FAB stays at bottom-end with margin 16; the navigation bar, at the bottom', () => {
    const screen = result.screen!;
    const fab = screen.instances.find((i) => i.typeId === 'm3-fab')!;
    expect(fab.box.x + fab.box.width).toBeCloseTo(screen.width - 16);
    expect(fab.box.y + fab.box.height).toBeCloseTo(screen.height - 16);
    const bar = screen.instances.find((i) => i.typeId === 'm3-navigation-bar')!;
    expect(bar.box).toMatchObject({ x: 0, width: screen.width, height: 80 });
    expect(bar.box.y + bar.box.height).toBeCloseTo(screen.height);
  });

  it('the scrim comes before the sheet, covering the screen', () => {
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

  it('the roots come out in order: content, bar, FAB, scrim and sheet', () => {
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
