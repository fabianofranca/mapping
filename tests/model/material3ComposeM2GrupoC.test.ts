// M2 of the "faithful Material 3" stage, group C (button, icon-button, icon-toggle-button, badge):
// the values the pinned Compose material3 1.4.0 commit defines against the drawing.
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { walk } from '../../src/model/components/scene';
import type { SceneNode, TextNode } from '../../src/model/components/scene';
import { SPEC_FILE, drawIn, findText, solid, text } from '../support/material3Library';

type Mode = 'light' | 'dark';
const MODES: Mode[] = ['light', 'dark'];
const tokens = (
  JSON.parse(text(SPEC_FILE)) as {
    tokens: { values: Record<string, Record<Mode, string> | number | string> };
  }
).tokens.values;
const color = (name: string, mode: Mode): string => {
  const v = tokens[name] as Record<Mode, string>;
  return v[mode];
};
const number = (name: string): number => tokens[name] as number;

const catalog = buildCatalog(
  // reuses the catalog of the whole folder
  (await import('../support/material3Library')).files,
);
const draw = (id: string, values: Record<string, string>, mode: Mode) =>
  drawIn(catalog, findEntry(catalog, id)!, values, mode);
const named = (root: SceneNode, name: string): SceneNode | undefined =>
  [...walk(root)].find((n) => n.name === name);
const kinds = (root: SceneNode, type: string): SceneNode[] =>
  [...walk(root)].filter((n) => n.type === type);

describe('M2 group C — Compose values', () => {
  it('button: height 40, full shape, label in label-large, 18 icon drawn by the icon node', () => {
    for (const mode of MODES) {
      const d = draw('button', { label: 'Save', style: 'filled', icon: 'Add' }, mode);
      expect(d.warnings.filter((w) => /unknown icon/.test(w))).toEqual([]);
      expect(d.root.height).toBe(40);
      const container = named(d.root, 'container');
      expect(container?.type === 'rect' && container.cornerRadius).toBe(
        number('corner-full'),
      );
      expect(solid(container?.fills ?? [])).toBe(color('primary', mode));
      const label = findText(d.root) as TextNode;
      expect(label.text).toBe('Save');
      expect(label.style.fontSize).toBe(number('label-large-size'));
      expect(label.style.fontWeight).toBe(number('label-large-weight'));
      expect(label.style.lineHeight).toBe(number('label-large-line-height'));
      expect(label.style.letterSpacing).toBe(number('label-large-tracking'));
      expect(label.style.fontFamily).toMatch(/Roboto/);
      expect(solid(label.fills)).toBe(color('on-primary', mode));
      const icon = named(d.root, 'add');
      expect(icon?.width).toBe(18);
      expect(icon?.height).toBe(18);
      expect(kinds(icon!, 'path').length).toBeGreaterThan(0);
    }
  });

  it('button: elevated has the level 1 shadow, tonal and text take the Defaults colors, outlined has an outline-variant outline', () => {
    for (const mode of MODES) {
      const elevated = draw('button', { label: 'A', style: 'elevated' }, mode);
      const box = named(elevated.root, 'container')!;
      expect(solid(box.fills)).toBe(color('surface-container-low', mode));
      expect(box.effects).toHaveLength(2);
      for (const [i, kind] of ['point', 'ambient'].entries()) {
        expect(box.effects[i]?.blur).toBe(number(`elevation-1-${kind}-blur`));
        expect(box.effects[i]?.offset.y).toBe(number(`elevation-1-${kind}-y`));
        expect(box.effects[i]?.spread ?? 0).toBe(number(`elevation-1-${kind}-spread`));
        expect(box.effects[i]?.color).toBe(color(`elevation-${kind}-shadow`, mode));
      }
      expect(solid(findText(elevated.root)!.fills)).toBe(color('primary', mode));

      const filled = draw('button', { label: 'A', style: 'filled' }, mode);
      expect(named(filled.root, 'container')!.effects).toEqual([]);

      const tonal = draw('button', { label: 'A', style: 'tonal' }, mode);
      expect(solid(named(tonal.root, 'container')!.fills)).toBe(
        color('secondary-container', mode),
      );
      expect(solid(findText(tonal.root)!.fills)).toBe(
        color('on-secondary-container', mode),
      );

      const textual = draw('button', { label: 'A', style: 'text' }, mode);
      expect(named(textual.root, 'container')!.fills).toEqual([]);
      expect(solid(findText(textual.root)!.fills)).toBe(color('primary', mode));

      const outlined = draw('button', { label: 'A', style: 'outlined' }, mode);
      // pt-BR kept: node names of the material3-compose library (libraries/*.json, outside this phase)
      const ring = named(outlined.root, 'contorno')!;
      expect(ring.visible).toBe(true);
      expect(ring.stroke?.width).toBe(1);
      expect(solid(ring.stroke?.paints ?? [])).toBe(color('outline-variant', mode));
      expect(solid(findText(outlined.root)!.fills)).toBe(
        color('on-surface-variant', mode),
      );
    }
  });

  it('button: disabled uses on-surface at 0.1 on the container and 0.38 on the content', () => {
    for (const mode of MODES) {
      const d = draw('button', { label: 'A', style: 'filled', enabled: 'false' }, mode);
      const box = named(d.root, 'container')!;
      expect(solid(box.fills)).toBe(color('on-surface', mode));
      expect(box.opacity).toBe(0.1);
      const label = findText(d.root)!;
      expect(solid(label.fills)).toBe(color('on-surface-variant', mode));
      expect(label.opacity).toBe(number('state-disabled-content'));
      const tonal = draw(
        'button',
        { label: 'A', style: 'tonal', enabled: 'false' },
        mode,
      );
      expect(named(tonal.root, 'container')!.opacity).toBe(
        number('state-disabled-container'),
      );
      expect(solid(findText(tonal.root)!.fills)).toBe(color('on-surface', mode));
      expect(
        named(
          draw('button', { label: 'A', style: 'elevated', enabled: 'false' }, mode).root,
          'container',
        )!.effects,
      ).toEqual([]);
    }
  });

  it('icon-button: 40 container, full shape, centered 24 icon, colors by style', () => {
    for (const mode of MODES) {
      const d = draw('icon-button', { icon: 'Add', style: 'filled' }, mode);
      expect(d.warnings.filter((w) => /unknown icon/.test(w))).toEqual([]);
      expect(d.root.width).toBe(40);
      expect(d.root.height).toBe(40);
      const box = named(d.root, 'container')!;
      expect(box.type === 'rect' && box.cornerRadius).toBe(number('corner-full'));
      expect(solid(box.fills)).toBe(color('primary', mode));
      const icon = named(d.root, 'add')!;
      expect([icon.width, icon.height]).toEqual([24, 24]);
      expect([icon.transform[4], icon.transform[5]]).toEqual([8, 8]);
      expect(kinds(icon, 'path').length).toBeGreaterThan(0);
      expect(solid(kinds(icon, 'path')[0]!.fills)).toBe(color('on-primary', mode));

      const tonal = draw('icon-button', { icon: 'Add', style: 'tonal' }, mode);
      expect(solid(named(tonal.root, 'container')!.fills)).toBe(
        color('secondary-container', mode),
      );
      const outlined = draw('icon-button', { icon: 'Add', style: 'outlined' }, mode);
      expect(solid(named(outlined.root, 'contorno')!.stroke?.paints ?? [])).toBe(
        color('on-surface', mode),
      );
      const off = draw(
        'icon-button',
        { icon: 'Add', style: 'filled', enabled: 'false' },
        mode,
      );
      expect(named(off.root, 'container')!.opacity).toBe(0.1);
      expect(solid(named(off.root, 'container')!.fills)).toBe(color('on-surface', mode));
      expect(named(off.root, 'add')!.opacity).toBe(number('state-disabled-content'));
    }
  });

  it('icon-toggle-button: on and off swap the colors of each style', () => {
    for (const mode of MODES) {
      const v = (style: string, checked: string, enabled = 'true') => ({
        icon: 'Favorite',
        style,
        checked,
        enabled,
      });
      const d = draw('icon-toggle-button', v('filled', 'true'), mode);
      expect(d.warnings.filter((w) => /unknown icon/.test(w))).toEqual([]);
      expect([d.root.width, d.root.height]).toEqual([40, 40]);
      const box = (style: string, checked: string, enabled?: string) =>
        named(
          draw('icon-toggle-button', v(style, checked, enabled), mode).root,
          'container',
        )!;
      const glyph = (style: string, checked: string) =>
        solid(
          kinds(
            named(draw('icon-toggle-button', v(style, checked), mode).root, 'favorite')!,
            'path',
          )[0]!.fills,
        );
      expect(solid(box('filled', 'true').fills)).toBe(color('primary', mode));
      expect(solid(box('filled', 'false').fills)).toBe(color('surface-container', mode));
      expect(glyph('filled', 'true')).toBe(color('on-primary', mode));
      expect(glyph('filled', 'false')).toBe(color('on-surface-variant', mode));
      expect(solid(box('tonal', 'true').fills)).toBe(color('secondary', mode));
      expect(solid(box('tonal', 'false').fills)).toBe(color('secondary-container', mode));
      expect(glyph('tonal', 'true')).toBe(color('on-secondary', mode));
      expect(solid(box('outlined', 'true').fills)).toBe(color('inverse-surface', mode));
      expect(glyph('outlined', 'true')).toBe(color('inverse-on-surface', mode));
      expect(glyph('standard', 'true')).toBe(color('primary', mode));
      expect(glyph('standard', 'false')).toBe(color('on-surface', mode));
      const ring = (checked: string): SceneNode | undefined =>
        named(draw('icon-toggle-button', v('outlined', checked), mode).root, 'contorno');
      expect(ring('false')?.visible).toBe(true);
      // when on, the outline disappears from the scene (Compose passes border = null)
      expect(ring('true')).toBeUndefined();
      expect(box('filled', 'true', 'false').opacity).toBe(0.1);
    }
  });

  it('badge: 6 dot and 16 counter in corner-full, error / on-error and label-small', () => {
    for (const mode of MODES) {
      const dot = draw('badge', { style: 'small' }, mode);
      const point = named(dot.root, 'pontinho')!;
      expect(point.visible).toBe(true);
      expect([point.width, point.height]).toEqual([6, 6]);
      expect(point.type === 'frame' && point.cornerRadius).toBe(number('corner-full'));
      expect(solid(point.fills)).toBe(color('error', mode));

      const one = draw('badge', { style: 'large', count: '3' }, mode);
      const pill = named(one.root, 'contador')!;
      expect(pill.visible).toBe(true);
      expect([pill.width, pill.height]).toEqual([16, 16]);
      expect(pill.type === 'frame' && pill.cornerRadius).toBe(number('corner-full'));
      expect(solid(pill.fills)).toBe(color('error', mode));
      const label = findText(one.root)!;
      expect(label.style.fontSize).toBe(number('label-small-size'));
      expect(label.style.fontWeight).toBe(number('label-small-weight'));
      expect(label.style.lineHeight).toBe(number('label-small-line-height'));
      expect(label.style.letterSpacing).toBe(number('label-small-tracking'));
      expect(label.style.fontFamily).toMatch(/Roboto/);
      expect(solid(label.fills)).toBe(color('on-error', mode));

      const many = named(
        draw('badge', { style: 'large', count: '999+' }, mode).root,
        'contador',
      )!;
      expect(many.width).toBeGreaterThan(16);
      expect(many.height).toBe(16);
    }
  });
});
