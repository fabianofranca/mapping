// M2 da etapa "Material 3 fiel", grupo C (button, icon-button, icon-toggle-button, badge):
// os valores que o commit fixado do Compose material3 1.4.0 define contra o desenho.
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
  // reaproveita o catálogo da pasta inteira
  (await import('../support/material3Library')).files,
);
const draw = (id: string, values: Record<string, string>, mode: Mode) =>
  drawIn(catalog, findEntry(catalog, id)!, values, mode);
const named = (root: SceneNode, name: string): SceneNode | undefined =>
  [...walk(root)].find((n) => n.name === name);
const kinds = (root: SceneNode, type: string): SceneNode[] =>
  [...walk(root)].filter((n) => n.type === type);

describe('M2 grupo C — valores do Compose', () => {
  it('button: 40 de altura, forma full, rótulo em label-large, ícone de 18 desenhado pelo nó icon', () => {
    for (const mode of MODES) {
      const d = draw('button', { label: 'Salvar', style: 'filled', icon: 'Add' }, mode);
      expect(d.warnings.filter((w) => /unknown icon/.test(w))).toEqual([]);
      expect(d.root.height).toBe(40);
      const container = named(d.root, 'container');
      expect(container?.type === 'rect' && container.cornerRadius).toBe(
        number('corner-full'),
      );
      expect(solid(container?.fills ?? [])).toBe(color('primary', mode));
      const label = findText(d.root) as TextNode;
      expect(label.text).toBe('Salvar');
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

  it('button: elevated tem a sombra do nível 1, tonal e text pegam as cores do Defaults, outlined tem contorno outline-variant', () => {
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
      const ring = named(outlined.root, 'contorno')!;
      expect(ring.visible).toBe(true);
      expect(ring.stroke?.width).toBe(1);
      expect(solid(ring.stroke?.paints ?? [])).toBe(color('outline-variant', mode));
      expect(solid(findText(outlined.root)!.fills)).toBe(
        color('on-surface-variant', mode),
      );
    }
  });

  it('button: desabilitado usa on-surface a 0,1 no contêiner e 0,38 no conteúdo', () => {
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

  it('icon-button: container de 40, forma full, ícone de 24 centrado, cores por estilo', () => {
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

  it('icon-toggle-button: ligado e desligado trocam as cores de cada estilo', () => {
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
      // ligado, o contorno some da cena (o Compose passa border = null)
      expect(ring('true')).toBeUndefined();
      expect(box('filled', 'true', 'false').opacity).toBe(0.1);
    }
  });

  it('badge: ponto de 6 e contador de 16 em corner-full, error / on-error e label-small', () => {
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
