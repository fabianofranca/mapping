// M2 of the "faithful Material 3" stage, group D: fab, extended-fab and chip against what
// `FloatingActionButton.kt`, `Chip.kt` and the tokens fix at commit 5113b82a.
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import type { PathNode, SceneNode, TextNode } from '../../src/model/components/scene';
import {
  SPEC_FILE,
  drawIn,
  files,
  findText,
  solid,
  text,
} from '../support/material3Library';

const catalog = buildCatalog(files);
const entryOf = (id: string) => findEntry(catalog, id)!;
type Values = Parameters<typeof drawIn>[2];
const both = (id: string, values: Values) => ({
  light: drawIn(catalog, entryOf(id), values, 'light'),
  dark: drawIn(catalog, entryOf(id), values, 'dark'),
});
type Drawing = ReturnType<typeof drawIn>;

const named = (root: SceneNode, name: string): SceneNode | undefined => {
  for (const node of walk(root)) if (node.name === name && node.visible) return node;
  return undefined;
};
/** Icon of the set drawn by the `icon` node (the group has the icon name), with the color of the first path. */
const iconOf = (d: Drawing, name: string) => {
  const node = named(d.root, name);
  const path = node && [...walk(node)].find((n): n is PathNode => n.type === 'path');
  return { node, color: path === undefined ? undefined : solid(path.fills) };
};
const label = (d: Drawing): TextNode => findText(d.root)!;
const POINT = 'rgba(0, 0, 0, 0.3)';
const AMBIENT = 'rgba(0, 0, 0, 0.15)';
/** The node's shadows in the order they are drawn: [point, ambient]. */
const shadowsOf = (node: SceneNode) =>
  node.effects.map((s) => ({
    color: s.color,
    y: s.offset.y,
    blur: s.blur,
    spread: s.spread ?? 0,
  }));
const snake = (name: string): string =>
  name.replace(/(?<!^)([A-Z])/g, '_$1').toLowerCase();

describe('M2 group D — fab, extended-fab and chip', () => {
  it('fab: 56 with corner-large (small 12, large 28), elevation 3, colors and icon by tokens', () => {
    const regular = both('fab', { icon: 'Add', size: 'regular' });
    expect(regular.light.root.width).toBe(56);
    expect(regular.light.root.height).toBe(56);
    expect(regular.light.root.type === 'frame' && regular.light.root.cornerRadius).toBe(
      16,
    );
    // Compose default: containerColor = primaryContainer, content onPrimaryContainer
    expect(solid(regular.light.root.fills)).toBe('#EADDFF');
    expect(solid(regular.dark.root.fills)).toBe('#4F378B');
    expect(iconOf(regular.light, 'add').color).toBe('#21005D');
    expect(iconOf(regular.dark, 'add').color).toBe('#EADDFF');
    expect(iconOf(regular.light, 'add').node?.width).toBe(24);
    // FabPrimaryContainerTokens.ContainerElevation = Level3 (6 dp): two shadows,
    // point (y 1, blur 3, spread 0) and ambient (y 4, blur 8, spread 3)
    expect(shadowsOf(regular.light.root)).toEqual([
      { color: POINT, y: 1, blur: 3, spread: 0 },
      { color: AMBIENT, y: 4, blur: 8, spread: 3 },
    ]);
    const small = both('fab', {
      icon: 'Edit',
      size: 'small',
      containerColor: 'tertiaryContainer',
    });
    expect(small.light.root.type === 'frame' && small.light.root.cornerRadius).toBe(12);
    expect(solid(small.dark.root.fills)).toBe('#633B48');
    expect(iconOf(small.dark, 'edit').color).toBe('#FFD8E4');
    const large = both('fab', { icon: 'Add', size: 'large' });
    expect(large.light.root.type === 'frame' && large.light.root.cornerRadius).toBe(28);
    // FloatingActionButtonDefaults.LargeIconSize = 36 dp
    expect(iconOf(large.light, 'add').node?.width).toBe(36);
    // contentColorFor: surfaceVariant -> onSurfaceVariant, primary -> onPrimary
    const variant = both('fab', { icon: 'Add', containerColor: 'surfaceVariant' });
    expect(iconOf(variant.dark, 'add').color).toBe('#CAC4D0');
    expect(
      iconOf(both('fab', { icon: 'Add', containerColor: 'primary' }).dark, 'add').color,
    ).toBe('#381E72');
  });

  it('extended-fab: height 56 with corner-large, label-large label, icon by the icon node and level 3 shadow', () => {
    const open = both('extended-fab', { text: 'Create', icon: 'Add' });
    expect(open.light.root.height).toBe(56);
    expect(open.light.root.type === 'frame' && open.light.root.cornerRadius).toBe(16);
    expect(solid(open.light.root.fills)).toBe('#EADDFF');
    expect(solid(open.dark.root.fills)).toBe('#4F378B');
    expect(shadowsOf(open.light.root)).toEqual([
      { color: POINT, y: 1, blur: 3, spread: 0 },
      { color: AMBIENT, y: 4, blur: 8, spread: 3 },
    ]);
    const style = label(open.light).style;
    expect([
      style.fontSize,
      style.lineHeight,
      style.fontWeight,
      style.letterSpacing,
    ]).toEqual([14, 20, 500, 0.1]);
    expect(solid(label(open.light).fills)).toBe('#21005D');
    expect(solid(label(open.dark).fills)).toBe('#EADDFF');
    expect(iconOf(open.dark, 'add').color).toBe('#EADDFF');
    expect(iconOf(open.light, 'add').node?.width).toBe(24);
    // ExtendedFabEndIconPadding = 12 dp between the icon and the text
    const boxes = absoluteBoxes(open.light.root);
    const icon = boxes.get(iconOf(open.light, 'add').node!.id)!;
    const textBox = boxes.get(label(open.light).id)!;
    expect(textBox.x - (icon.x + icon.width)).toBe(12);
    // collapsed: only the icon
    const closed = both('extended-fab', {
      text: 'Editar',
      icon: 'Edit',
      expanded: 'false',
    });
    expect(findText(closed.light.root)).toBeUndefined();
    expect(iconOf(closed.light, 'edit').node).toBeDefined();
  });

  it('chip: height 32, corner-small, colors by style in light and dark, label-large label and 18 icons', () => {
    const assist = both('chip', {
      label: 'Adicionar',
      style: 'assist',
      leadingIcon: 'DateRange',
    });
    expect(assist.light.root.height).toBe(32);
    expect(assist.light.root.type === 'frame' && assist.light.root.cornerRadius).toBe(8);
    expect(assist.light.root.fills).toEqual([]);
    expect(solid(assist.light.root.stroke?.paints ?? [])).toBe('#CAC4D0');
    expect(solid(assist.dark.root.stroke?.paints ?? [])).toBe('#49454F');
    expect(assist.light.root.stroke?.width).toBe(1);
    const style = label(assist.light).style;
    expect([
      style.fontSize,
      style.lineHeight,
      style.fontWeight,
      style.letterSpacing,
    ]).toEqual([14, 20, 500, 0.1]);
    expect(solid(label(assist.light).fills)).toBe('#1D1B20');
    expect(solid(label(assist.dark).fills)).toBe('#E6E0E9');
    expect(iconOf(assist.light, 'date_range').color).toBe('#6750A4');
    expect(iconOf(assist.dark, 'date_range').color).toBe('#D0BCFF');
    expect(iconOf(assist.light, 'date_range').node?.width).toBe(18);
    // AssistChipPadding 8 + label padding 8: the text starts after the icon + 8
    const abox = absoluteBoxes(assist.light.root);
    const aicon = abox.get(iconOf(assist.light, 'date_range').node!.id)!;
    expect([aicon.x, abox.get(label(assist.light).id)!.x]).toEqual([8, 34]);

    // elevated: ElevatedContainerColor = surfaceContainerLow, level 1 elevation, no outline
    const elevated = both('chip', { label: 'Map', style: 'assist-elevated' });
    expect(solid(elevated.light.root.fills)).toBe('#F7F2FA');
    expect(solid(elevated.dark.root.fills)).toBe('#1D1B20');
    expect(shadowsOf(elevated.light.root)).toEqual([
      { color: POINT, y: 1, blur: 2, spread: 0 },
      { color: AMBIENT, y: 1, blur: 3, spread: 1 },
    ]);
    expect(elevated.light.root.stroke).toBeUndefined();

    // selected filter: secondaryContainer, no outline (SelectedOutlineWidth 0), onSecondaryContainer
    const filter = both('chip', { label: 'Open', style: 'filter', selected: 'true' });
    expect(solid(filter.light.root.fills)).toBe('#E8DEF8');
    expect(solid(filter.dark.root.fills)).toBe('#4A4458');
    expect(filter.light.root.stroke).toBeUndefined();
    expect(solid(label(filter.light).fills)).toBe('#1D192B');
    expect(solid(label(filter.dark).fills)).toBe('#E8DEF8');
    expect(iconOf(filter.light, 'done').color).toBe('#1D192B');
    // unselected filter: onSurfaceVariant label, primary leading icon
    const plain = both('chip', { label: 'Open', style: 'filter', leadingIcon: 'Star' });
    expect(solid(label(plain.dark).fills)).toBe('#CAC4D0');
    expect(iconOf(plain.light, 'star').color).toBe('#6750A4');

    // input: onSurfaceVariant trailing icon; padding 4 + 8 without a leading icon
    const input = both('chip', {
      label: 'ana@example.com',
      style: 'input',
      trailingIcon: 'Close',
    });
    expect(iconOf(input.light, 'close').color).toBe('#49454F');
    expect(iconOf(input.dark, 'close').color).toBe('#CAC4D0');
    expect(absoluteBoxes(input.light.root).get(label(input.light).id)!.x).toBe(12);

    // disabled: onSurface at 0.38 on the content and 0.12 on the container and the outline
    const off = both('chip', {
      label: 'Map',
      style: 'assist-elevated',
      enabled: 'false',
    });
    expect(solid(label(off.dark).fills)).toBe('#E6E0E9');
    expect(label(off.dark).opacity).toBe(0.38);
    expect(off.light.root.effects).toEqual([]);
    // pt-BR kept: node names of the material3-compose library (libraries/*.json, outside this phase)
    const container = named(off.light.root, 'contêiner desabilitado');
    expect(solid(container?.fills ?? [])).toBe('#1D1B20');
    expect(container?.opacity).toBe(0.12);
    const outline = both('chip', { label: 'Map', style: 'assist', enabled: 'false' });
    const edge = named(outline.light.root, 'contorno desabilitado');
    expect(solid(edge?.stroke?.paints ?? [])).toBe('#1D1B20');
    expect(edge?.opacity).toBe(0.12);
  });

  it('all combinations of style, selection, state and icons draw without warnings in light and dark', () => {
    const styles = [
      ...['assist', 'assist-elevated', 'filter', 'filter-elevated'],
      ...['input', 'suggestion', 'suggestion-elevated'],
    ];
    for (const mode of ['light', 'dark'] as const) {
      for (const style of styles) {
        for (const selected of ['true', 'false']) {
          for (const enabled of ['true', 'false']) {
            for (const icons of [
              {},
              { leadingIcon: 'Star' },
              { trailingIcon: 'Close' },
            ]) {
              const values = { label: 'Chip', style, selected, enabled, ...icons };
              const d = drawIn(catalog, entryOf('chip'), values, mode);
              expect(d.warnings, JSON.stringify(values)).toEqual([]);
            }
          }
        }
      }
      for (const size of ['small', 'regular', 'large']) {
        const d = drawIn(catalog, entryOf('fab'), { icon: 'Add', size }, mode);
        expect(d.warnings, size).toEqual([]);
      }
      for (const expanded of ['true', 'false']) {
        const values = { text: 'Create', expanded };
        for (const icon of ['Add', undefined]) {
          const d = drawIn(catalog, entryOf('extended-fab'), { ...values, icon }, mode);
          expect(d.warnings, `${expanded} ${String(icon)}`).toEqual([]);
        }
      }
    }
  });

  it.each(['fab', 'extended-fab', 'chip'])(
    '%s: the $switch of the icon node covers every suggestion of the field, with no SVG path',
    (id) => {
      const raw = JSON.parse(text(`components/${id}.json`)) as { template: unknown };
      const nodes: {
        name: { $switch?: string; cases?: Record<string, string> } | string;
      }[] = [];
      const visit = (node: unknown): void => {
        if (typeof node !== 'object' || node === null) return;
        const rec = node as { type?: string; children?: unknown[] };
        if (rec.type === 'icon') nodes.push(rec as (typeof nodes)[number]);
        rec.children?.forEach(visit);
      };
      visit(raw.template);
      expect(nodes.length).toBeGreaterThan(0);
      const spec = JSON.parse(text(SPEC_FILE)) as {
        layers: {
          annotationTypes: {
            id: string;
            fields: { key: string; suggestions?: string[] }[];
          }[];
        }[];
      };
      const type = spec.layers
        .flatMap((l) => l.annotationTypes)
        .find((t) => t.id === id)!;
      const suggested = type.fields.filter((f) => f.suggestions !== undefined);
      expect(suggested.length).toBeGreaterThan(0);
      for (const field of suggested) {
        const node = nodes.find(
          (n) => typeof n.name !== 'string' && n.name.$switch === field.key,
        );
        expect(node, field.key).toBeDefined();
        const cases = typeof node!.name === 'string' ? {} : (node!.name.cases ?? {});
        for (const name of field.suggestions ?? [])
          expect(cases[name], name).toBe(snake(name));
      }
    },
  );
});
