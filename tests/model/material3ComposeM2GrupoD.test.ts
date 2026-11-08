// M2 da etapa "Material 3 fiel", grupo D: fab, extended-fab e chip contra o que o
// `FloatingActionButton.kt`, o `Chip.kt` e os tokens fixam no commit 5113b82a.
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import type { PathNode, SceneNode, TextNode } from '../../src/model/components/scene';
import { SPEC_FILE, drawIn, files, findText, solid, text, typeOf } from '../support/material3Library';

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
/** Ícone do conjunto desenhado pelo nó `icon` (o grupo tem o nome do ícone), com a cor do primeiro caminho. */
const iconOf = (d: Drawing, name: string) => {
  const node = named(d.root, name);
  const path = node && [...walk(node)].find((n): n is PathNode => n.type === 'path');
  return { node, color: path === undefined ? undefined : solid(path.fills) };
};
const label = (d: Drawing): TextNode => findText(d.root)!;
const SHADOW = 'rgba(0, 0, 0, 0.3)';
const snake = (name: string): string =>
  name.replace(/(?<!^)([A-Z])/g, '_$1').toLowerCase();

describe('M2 grupo D — fab, extended-fab e chip', () => {
  it('fab: 56 com corner-large (small 12, large 28), elevação 3, cores e ícone pelos tokens', () => {
    const regular = both('fab', { icon: 'Add', size: 'regular' });
    expect(regular.light.root.width).toBe(56);
    expect(regular.light.root.height).toBe(56);
    expect(regular.light.root.type === 'frame' && regular.light.root.cornerRadius).toBe(16);
    // padrão do Compose: containerColor = primaryContainer, conteúdo onPrimaryContainer
    expect(solid(regular.light.root.fills)).toBe('#EADDFF');
    expect(solid(regular.dark.root.fills)).toBe('#4F378B');
    expect(iconOf(regular.light, 'add').color).toBe('#21005D');
    expect(iconOf(regular.dark, 'add').color).toBe('#EADDFF');
    expect(iconOf(regular.light, 'add').node?.width).toBe(24);
    // FabPrimaryContainerTokens.ContainerElevation = Level3 (6 dp): blur 12, y 3
    const shadow = regular.light.root.effects[0];
    expect(shadow?.color).toBe(SHADOW);
    expect([shadow?.blur, shadow?.offset.y]).toEqual([12, 3]);
    const small = both('fab', { icon: 'Edit', size: 'small', containerColor: 'tertiaryContainer' });
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
    expect(iconOf(both('fab', { icon: 'Add', containerColor: 'primary' }).dark, 'add').color).toBe(
      '#381E72',
    );
  });

  it('extended-fab: 56 de altura com corner-large, rótulo label-large, ícone pelo nó icon e sombra do nível 3', () => {
    const open = both('extended-fab', { text: 'Criar', icon: 'Add' });
    expect(open.light.root.height).toBe(56);
    expect(open.light.root.type === 'frame' && open.light.root.cornerRadius).toBe(16);
    expect(solid(open.light.root.fills)).toBe('#EADDFF');
    expect(solid(open.dark.root.fills)).toBe('#4F378B');
    const shadow = open.light.root.effects[0];
    expect([shadow?.blur, shadow?.offset.y, shadow?.color]).toEqual([12, 3, SHADOW]);
    const style = label(open.light).style;
    expect([style.fontSize, style.lineHeight, style.fontWeight, style.letterSpacing]).toEqual([
      14, 20, 500, 0.1,
    ]);
    expect(solid(label(open.light).fills)).toBe('#21005D');
    expect(solid(label(open.dark).fills)).toBe('#EADDFF');
    expect(iconOf(open.dark, 'add').color).toBe('#EADDFF');
    expect(iconOf(open.light, 'add').node?.width).toBe(24);
    // ExtendedFabEndIconPadding = 12 dp entre o ícone e o texto
    const boxes = absoluteBoxes(open.light.root);
    const icon = boxes.get(iconOf(open.light, 'add').node!.id)!;
    const textBox = boxes.get(label(open.light).id)!;
    expect(textBox.x - (icon.x + icon.width)).toBe(12);
    // recolhido: só o ícone
    const closed = both('extended-fab', { text: 'Editar', icon: 'Edit', expanded: 'false' });
    expect(findText(closed.light.root)).toBeUndefined();
    expect(iconOf(closed.light, 'edit').node).toBeDefined();
  });

  it('chip: 32 de altura, corner-small, cores por estilo em light e dark, rótulo label-large e ícones de 18', () => {
    const assist = both('chip', { label: 'Adicionar', style: 'assist', leadingIcon: 'DateRange' });
    expect(assist.light.root.height).toBe(32);
    expect(assist.light.root.type === 'frame' && assist.light.root.cornerRadius).toBe(8);
    expect(assist.light.root.fills).toEqual([]);
    expect(solid(assist.light.root.stroke?.paints ?? [])).toBe('#CAC4D0');
    expect(solid(assist.dark.root.stroke?.paints ?? [])).toBe('#49454F');
    expect(assist.light.root.stroke?.width).toBe(1);
    const style = label(assist.light).style;
    expect([style.fontSize, style.lineHeight, style.fontWeight, style.letterSpacing]).toEqual([
      14, 20, 500, 0.1,
    ]);
    expect(solid(label(assist.light).fills)).toBe('#1D1B20');
    expect(solid(label(assist.dark).fills)).toBe('#E6E0E9');
    expect(iconOf(assist.light, 'date_range').color).toBe('#6750A4');
    expect(iconOf(assist.dark, 'date_range').color).toBe('#D0BCFF');
    expect(iconOf(assist.light, 'date_range').node?.width).toBe(18);
    // AssistChipPadding 8 + padding do rótulo 8: o texto começa depois do ícone + 8
    const abox = absoluteBoxes(assist.light.root);
    const aicon = abox.get(iconOf(assist.light, 'date_range').node!.id)!;
    expect([aicon.x, abox.get(label(assist.light).id)!.x]).toEqual([8, 34]);

    // elevated: ElevatedContainerColor = surfaceContainerLow, elevação nível 1, sem contorno
    const elevated = both('chip', { label: 'Mapa', style: 'assist-elevated' });
    expect(solid(elevated.light.root.fills)).toBe('#F7F2FA');
    expect(solid(elevated.dark.root.fills)).toBe('#1D1B20');
    expect([elevated.light.root.effects[0]?.blur, elevated.light.root.effects[0]?.offset.y]).toEqual(
      [2, 1],
    );
    expect(elevated.light.root.stroke).toBeUndefined();

    // filter selecionado: secondaryContainer, sem contorno (SelectedOutlineWidth 0), onSecondaryContainer
    const filter = both('chip', { label: 'Aberto', style: 'filter', selected: 'true' });
    expect(solid(filter.light.root.fills)).toBe('#E8DEF8');
    expect(solid(filter.dark.root.fills)).toBe('#4A4458');
    expect(filter.light.root.stroke).toBeUndefined();
    expect(solid(label(filter.light).fills)).toBe('#1D192B');
    expect(solid(label(filter.dark).fills)).toBe('#E8DEF8');
    expect(iconOf(filter.light, 'done').color).toBe('#1D192B');
    // filter não selecionado: rótulo onSurfaceVariant, ícone inicial primary
    const plain = both('chip', { label: 'Aberto', style: 'filter', leadingIcon: 'Star' });
    expect(solid(label(plain.dark).fills)).toBe('#CAC4D0');
    expect(iconOf(plain.light, 'star').color).toBe('#6750A4');

    // input: ícone final onSurfaceVariant; padding 4 + 8 sem ícone inicial
    const input = both('chip', { label: 'ana@exemplo.com', style: 'input', trailingIcon: 'Close' });
    expect(iconOf(input.light, 'close').color).toBe('#49454F');
    expect(iconOf(input.dark, 'close').color).toBe('#CAC4D0');
    expect(absoluteBoxes(input.light.root).get(label(input.light).id)!.x).toBe(12);

    // desabilitado: onSurface com 0,38 no conteúdo e 0,12 no contêiner e no contorno
    const off = both('chip', { label: 'Mapa', style: 'assist-elevated', enabled: 'false' });
    expect(solid(label(off.dark).fills)).toBe('#E6E0E9');
    expect(label(off.dark).opacity).toBe(0.38);
    expect(off.light.root.effects[0]?.color).not.toBe(SHADOW);
    const container = named(off.light.root, 'contêiner desabilitado');
    expect(solid(container?.fills ?? [])).toBe('#1D1B20');
    expect(container?.opacity).toBe(0.12);
    const outline = both('chip', { label: 'Mapa', style: 'assist', enabled: 'false' });
    const edge = named(outline.light.root, 'contorno desabilitado');
    expect(solid(edge?.stroke?.paints ?? [])).toBe('#1D1B20');
    expect(edge?.opacity).toBe(0.12);
  });

  it.each(['fab', 'extended-fab', 'chip'])(
    '%s: o $switch do nó icon cobre toda sugestão do campo, sem caminho SVG',
    (id) => {
      const raw = JSON.parse(text(`components/${id}.json`)) as { template: unknown };
      const nodes: { name: { cases?: Record<string, string> } | string }[] = [];
      const visit = (node: unknown): void => {
        if (typeof node !== 'object' || node === null) return;
        const rec = node as { type?: string; children?: unknown[] };
        if (rec.type === 'icon') nodes.push(rec as (typeof nodes)[number]);
        rec.children?.forEach(visit);
      };
      visit(raw.template);
      expect(nodes.length).toBeGreaterThan(0);
      const spec = JSON.parse(text(SPEC_FILE)) as {
        layers: { annotationTypes: { id: string; fields: { key: string; suggestions?: string[] }[] }[] }[];
      };
      const type = spec.layers.flatMap((l) => l.annotationTypes).find((t) => t.id === id)!;
      const suggested = type.fields.filter((f) => f.suggestions !== undefined);
      expect(suggested.length).toBeGreaterThan(0);
      expect(typeOf(id).fields.length).toBe(type.fields.length);
      for (const field of suggested) {
        const node = nodes.find((n) => JSON.stringify(n).includes(`"${field.key}"`));
        expect(node, field.key).toBeDefined();
        const cases = typeof node!.name === 'string' ? {} : (node!.name.cases ?? {});
        for (const name of field.suggestions ?? []) expect(cases[name], name).toBe(snake(name));
      }
    },
  );
});
