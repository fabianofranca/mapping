// M4 da etapa "Material 3 fiel", grupo B: navigation-bar, short-navigation-bar, navigation-rail e
// navigation-drawer contra o que `NavigationBar.kt`, `ShortNavigationBar.kt`, `NavigationItem.kt`,
// `NavigationRail.kt`, `WideNavigationRail.kt`, `NavigationDrawer.kt` e os arquivos de tokens fixam no
// commit 5113b82a. As cores esperadas saem dos tokens da especialização (light e dark); a geometria,
// das constantes do Compose (dp = px do componente).
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import type { PathNode, SceneNode, TextNode } from '../../src/model/components/scene';
import { resolveTokens } from '../../src/model/components/tokens';
import { defaultValues } from '../../src/model/libraryDrawing';
import { files, solid, spec } from '../support/material3Library';

const catalog = buildCatalog(files);
const entryOf = (id: string) => findEntry(catalog, id)!;
type Values = Parameters<typeof instantiate>[1];
type Mode = 'light' | 'dark';
const MODES: readonly Mode[] = ['light', 'dark'];

/** Desenha o componente numa caixa `width` × `height` (a padrão é a `size` dele). */
function draw(
  id: string,
  values: Values,
  mode: Mode = 'light',
  box?: { width: number; height: number },
) {
  const entry = entryOf(id);
  const library = catalog.library!;
  const size = box ?? entry.component!.size;
  const drawing = instantiate(
    entry.component!,
    { ...defaultValues(entry.type), ...values },
    { x: 0, y: 0, ...size },
    {
      measure: approximateMeasurer,
      tokens: resolveTokens(library.tokens, {}, mode),
      ...(library.icons === undefined ? {} : { icons: library.icons }),
    },
  );
  return { ...drawing, boxes: absoluteBoxes(drawing.root) };
}
type Drawing = ReturnType<typeof draw>;

const tokens = spec.tokens!.values as Record<string, unknown>;
/** Valor do token da especialização no modo (cor ou número). */
const tok = (name: string, mode: Mode): string => {
  const value = tokens[name] as string | Record<Mode, string>;
  return typeof value === 'string' ? value : value[mode];
};
const num = (name: string): number => tokens[name] as number;

/** Todos os nós visíveis com o nome, na ordem do desenho. */
const all = (d: Drawing, name: string): SceneNode[] => {
  const found: SceneNode[] = [];
  for (const node of walk(d.root))
    if (node.name === name && node.visible) found.push(node);
  return found;
};
const named = (d: Drawing, name: string): SceneNode | undefined => all(d, name)[0];
const at = (d: Drawing, node: SceneNode | undefined) => {
  if (node === undefined) throw new Error('nó ausente');
  const b = d.boxes.get(node.id)!;
  return { x: b.x, y: b.y, w: b.width, h: b.height };
};
const fillOf = (node: SceneNode | undefined) => solid(node?.fills ?? []);
const textOf = (node: SceneNode | undefined): TextNode => {
  if (node?.type !== 'text') throw new Error('não é texto');
  return node;
};
const radiusOf = (node: SceneNode | undefined) =>
  node !== undefined && 'cornerRadius' in node ? node.cornerRadius : undefined;
const iconColor = (node: SceneNode | undefined): string | undefined => {
  const path = node && [...walk(node)].find((n): n is PathNode => n.type === 'path');
  return path === undefined ? undefined : solid(path.fills);
};
const typo = (scale: string) => [
  num(`${scale}-size`),
  num(`${scale}-line-height`),
  num(`${scale}-weight`),
  num(`${scale}-tracking`),
];
const fontOf = (node: SceneNode | undefined) => {
  const style = textOf(node).style;
  return [style.fontSize, style.lineHeight, style.fontWeight, style.letterSpacing];
};

const ITEMS = [
  { label: 'Início', icon: 'Home', selected: 'true' },
  { label: 'Buscar', icon: 'Search', selected: 'false' },
  { label: 'Perfil', icon: 'Person', selected: 'false' },
];
const ITEMS_5 = [
  ...ITEMS,
  { label: 'Salvos', icon: 'Favorite', selected: 'false' },
  { label: 'Ajustes', icon: 'Settings', selected: 'false' },
];
const BAR = { width: 412, height: 80 };

describe('M4 grupo B — navigation-bar', () => {
  it('contêiner de 80 (TallContainerHeight) em surface-container, sem sombra e sem canto (Elevation Level0)', () => {
    for (const mode of MODES) {
      const d = draw('navigation-bar', { items: ITEMS }, mode, BAR);
      expect(at(d, d.root)).toMatchObject({ w: 412, h: 80 });
      expect(fillOf(d.root)).toBe(tok('surface-container', mode));
      expect(d.root.effects).toEqual([]);
      expect(radiusOf(d.root)).toBe(0);
    }
  });

  it('destinos de largura igual (weight 1) com 8 de espaço entre eles (NavigationBarItemHorizontalPadding)', () => {
    const three = draw('navigation-bar', { items: ITEMS }, 'light', BAR);
    expect(all(three, 'destino').map((n) => [at(three, n).x, at(three, n).w])).toEqual([
      [0, 132],
      [140, 132],
      [280, 132],
    ]);
    const five = draw('navigation-bar', { items: ITEMS_5 }, 'light', BAR);
    const widths = all(five, 'destino').map((n) => at(five, n).w);
    expect(widths).toEqual([76, 76, 76, 76, 76]);
    expect(at(five, all(five, 'destino')[4]).x).toBe(4 * 84);
  });

  it('indicador do selecionado: 56 × 32 (ActiveIndicatorWidth/Height) em secondary-container, forma full, a 12 do topo', () => {
    for (const mode of MODES) {
      const d = draw('navigation-bar', { items: ITEMS }, mode, BAR);
      const [selected, other] = all(d, 'indicador');
      const bar = at(d, all(d, 'destino')[0]);
      const ind = at(d, selected);
      expect([ind.w, ind.h]).toEqual([56, 32]);
      expect(ind.x).toBe(bar.x + (bar.w - 56) / 2);
      // contentVerticalPadding = (80 - (24 + 4 + 4 + 16)) / 2 = 16, menos o respiro vertical de 4
      expect(ind.y).toBe(12);
      expect(radiusOf(selected)).toBeGreaterThanOrEqual(16);
      expect(fillOf(selected)).toBe(tok('secondary-container', mode));
      expect(fillOf(other)).toBeUndefined();
    }
  });

  it('ícone de 24 centrado no indicador: on-secondary-container selecionado, on-surface-variant nos demais', () => {
    for (const mode of MODES) {
      const d = draw('navigation-bar', { items: ITEMS }, mode, BAR);
      const home = named(d, 'home');
      const ind = at(d, all(d, 'indicador')[0]);
      expect(at(d, home)).toEqual({ x: ind.x + 16, y: ind.y + 4, w: 24, h: 24 });
      expect(iconColor(home)).toBe(tok('on-secondary-container', mode));
      expect(iconColor(named(d, 'search'))).toBe(tok('on-surface-variant', mode));
      expect(at(d, named(d, 'search')).y).toBe(16);
    }
  });

  it('rótulo em label-medium, 4 abaixo do indicador (y = 48): secondary selecionado e on-surface-variant nos demais', () => {
    for (const mode of MODES) {
      const d = draw('navigation-bar', { items: ITEMS }, mode, BAR);
      const [first, second] = all(d, 'rótulo');
      expect(fontOf(first)).toEqual(typo('label-medium'));
      expect(at(d, first).y).toBe(48);
      expect(at(d, first).h).toBe(16);
      expect(fillOf(first)).toBe(tok('secondary', mode));
      expect(fillOf(second)).toBe(tok('on-surface-variant', mode));
      const dest = at(d, all(d, 'destino')[0]);
      expect(at(d, first).x + at(d, first).w / 2).toBeCloseTo(dest.x + dest.w / 2, 5);
    }
  });

  it('alwaysShowLabel=false: o rótulo some nos não selecionados e o ícone dele fica centrado na altura (y = 28)', () => {
    const d = draw(
      'navigation-bar',
      { items: ITEMS, alwaysShowLabel: 'false' },
      'light',
      BAR,
    );
    expect(all(d, 'rótulo')).toHaveLength(1);
    expect(at(d, named(d, 'home')).y).toBe(16);
    expect(at(d, named(d, 'search')).y).toBe(28);
    const sem = draw(
      'navigation-bar',
      { items: ITEMS, alwaysShowLabel: 'true' },
      'light',
      BAR,
    );
    expect(all(sem, 'rótulo')).toHaveLength(3);
  });
});

describe('M4 grupo B — short-navigation-bar', () => {
  const SHORT = { width: 412, height: 64 };

  it('contêiner de 64 (NavigationBarTokens.ContainerHeight) em surface-container, sem sombra', () => {
    for (const mode of MODES) {
      const d = draw('short-navigation-bar', { items: ITEMS }, mode, SHORT);
      expect(at(d, d.root)).toMatchObject({ w: 412, h: 64 });
      expect(fillOf(d.root)).toBe(tok('surface-container', mode));
      expect(d.root.effects).toEqual([]);
    }
  });

  it('EqualWeight: os destinos dividem a largura por igual, sem espaço entre eles', () => {
    const d = draw('short-navigation-bar', { items: ITEMS, arrangement: 'EqualWeight' });
    const w = 412 / 3;
    const items = all(d, 'destino').map((n) => at(d, n));
    expect(items.map((i) => i.w)).toEqual([w, w, w]);
    expect(items.map((i) => i.x)).toEqual([0, w, 2 * w]);
  });

  it('ícone acima: indicador de 56 × 32 a 6 do topo (TopIconItemVerticalPadding), rótulo 4 abaixo, em label-medium', () => {
    for (const mode of MODES) {
      const d = draw(
        'short-navigation-bar',
        { items: ITEMS, iconPosition: 'Top' },
        mode,
        SHORT,
      );
      const [selected, other] = all(d, 'indicador');
      const ind = at(d, selected);
      expect([ind.w, ind.h, ind.y]).toEqual([56, 32, 6]);
      expect(radiusOf(selected)).toBeGreaterThanOrEqual(16);
      expect(fillOf(selected)).toBe(tok('secondary-container', mode));
      expect(fillOf(other)).toBeUndefined();
      const dest = at(d, all(d, 'destino')[0]);
      expect(ind.x).toBeCloseTo(dest.x + (dest.w - 56) / 2, 5);
      const home = at(d, named(d, 'home'));
      expect(home).toMatchObject({ w: 24, h: 24, y: 10 });
      const [label, otherLabel] = all(d, 'rótulo');
      expect(fontOf(label)).toEqual(typo('label-medium'));
      expect(at(d, label).y).toBe(42);
      expect(fillOf(label)).toBe(tok('secondary', mode));
      expect(fillOf(otherLabel)).toBe(tok('on-surface-variant', mode));
      expect(iconColor(named(d, 'home'))).toBe(tok('on-secondary-container', mode));
      expect(iconColor(named(d, 'search'))).toBe(tok('on-surface-variant', mode));
    }
  });

  it('ícone ao lado: pílula de 40 (16 de respiro, 4 entre ícone e rótulo), forma full, centrada na altura', () => {
    for (const mode of MODES) {
      const d = draw(
        'short-navigation-bar',
        { items: ITEMS, iconPosition: 'Start' },
        mode,
        SHORT,
      );
      const [selected, other] = all(d, 'indicador');
      const pill = at(d, selected);
      expect([pill.h, pill.y]).toEqual([40, 12]);
      expect(radiusOf(selected)).toBeGreaterThanOrEqual(20);
      expect(fillOf(selected)).toBe(tok('secondary-container', mode));
      expect(fillOf(other)).toBeUndefined();
      const icon = at(d, named(d, 'home'));
      expect(icon).toMatchObject({ w: 24, h: 24, x: pill.x + 16, y: 20 });
      const label = at(d, all(d, 'rótulo')[0]);
      expect(label.x).toBe(icon.x + 24 + 4);
      expect(label.y + label.h / 2).toBe(32);
      // largura da pílula = 16 + 24 + 4 + rótulo + 16
      expect(pill.w).toBeCloseTo(16 + 24 + 4 + label.w + 16, 5);
      expect(fontOf(all(d, 'rótulo')[0])).toEqual(typo('label-medium'));
      expect(fillOf(all(d, 'rótulo')[0])).toBe(tok('secondary', mode));
    }
  });

  it('Centered: agrupa os destinos no centro, com margens iguais nos dois lados', () => {
    const d = draw('short-navigation-bar', { items: ITEMS, arrangement: 'Centered' });
    const items = all(d, 'destino').map((n) => at(d, n));
    const left = items[0]!.x;
    const right = 412 - (items[2]!.x + items[2]!.w);
    expect(left).toBeGreaterThan(0);
    expect(right).toBeCloseTo(left, 5);
    const equal = draw('short-navigation-bar', {
      items: ITEMS,
      arrangement: 'EqualWeight',
    });
    expect(at(equal, all(equal, 'destino')[0]).x).toBe(0);
  });
});

describe('M4 grupo B — navigation-rail', () => {
  const RAIL = { width: 220, height: 400 };
  const rail = (values: Values, mode: Mode = 'light') =>
    draw('navigation-rail', { items: ITEMS, ...values }, mode, RAIL);

  it('rail estreita: folha de 80 em surface, 4 de padding vertical e destinos de 56 com 4 entre eles', () => {
    for (const mode of MODES) {
      const d = rail({ style: 'rail' }, mode);
      const sheet = named(d, 'folha da rail');
      expect(at(d, sheet)).toMatchObject({ x: 0, y: 0, w: 80, h: 400 });
      expect(fillOf(sheet)).toBe(tok('surface', mode));
      expect(radiusOf(sheet)).toBe(0);
      expect(all(d, 'destino').map((n) => [at(d, n).y, at(d, n).h, at(d, n).w])).toEqual([
        [4, 56, 80],
        [64, 56, 80],
        [124, 56, 80],
      ]);
    }
  });

  it('rail estreita: indicador de 56 × 32 no topo do destino, ícone a 4, rótulo a 36 (label-medium)', () => {
    for (const mode of MODES) {
      const d = rail({ style: 'rail' }, mode);
      const ind = at(d, all(d, 'indicador')[0]);
      expect(ind).toEqual({ x: 12, y: 4, w: 56, h: 32 });
      expect(radiusOf(all(d, 'indicador')[0])).toBeGreaterThanOrEqual(16);
      expect(fillOf(all(d, 'indicador')[0])).toBe(tok('secondary-container', mode));
      expect(fillOf(all(d, 'indicador')[1])).toBeUndefined();
      expect(at(d, named(d, 'home'))).toEqual({ x: 28, y: 8, w: 24, h: 24 });
      const [label, other] = all(d, 'rótulo');
      expect(at(d, label).y).toBe(4 + 36);
      expect(fontOf(label)).toEqual(typo('label-medium'));
      expect(fillOf(label)).toBe(tok('secondary', mode));
      expect(fillOf(other)).toBe(tok('on-surface-variant', mode));
      expect(iconColor(named(d, 'home'))).toBe(tok('on-secondary-container', mode));
      expect(iconColor(named(d, 'search'))).toBe(tok('on-surface-variant', mode));
    }
  });

  it('alwaysShowLabel=false: o rótulo some nos não selecionados e o ícone fica centrado no destino de 56 (y = 16)', () => {
    const d = rail({ style: 'rail', alwaysShowLabel: 'false' });
    expect(all(d, 'rótulo')).toHaveLength(1);
    expect(at(d, named(d, 'home')).y).toBe(4 + 4);
    expect(at(d, named(d, 'search')).y).toBe(64 + 16);
  });

  it('wide recolhida: folha de 96 em surface, 44 de topo, destinos de 64 com 4 entre eles e indicador de 56 a 20 da borda', () => {
    for (const mode of MODES) {
      const d = rail({ style: 'wide', initialValue: 'Collapsed' }, mode);
      const sheet = named(d, 'folha da rail');
      expect(at(d, sheet)).toMatchObject({ w: 96, h: 400 });
      expect(fillOf(sheet)).toBe(tok('surface', mode));
      expect(all(d, 'destino').map((n) => [at(d, n).y, at(d, n).h, at(d, n).w])).toEqual([
        [44, 64, 96],
        [112, 64, 96],
        [180, 64, 96],
      ]);
      expect(at(d, all(d, 'indicador')[0])).toEqual({ x: 20, y: 44, w: 56, h: 32 });
      expect(at(d, all(d, 'rótulo')[0]).y).toBe(44 + 36);
      expect(fontOf(all(d, 'rótulo')[0])).toEqual(typo('label-medium'));
    }
  });

  it('wide expandida: folha de 220, destinos de 56 sem espaço, pílula a 20 da borda com 16 de respiro e 8 entre ícone e rótulo', () => {
    for (const mode of MODES) {
      const d = rail({ style: 'wide', initialValue: 'Expanded' }, mode);
      const sheet = named(d, 'folha da rail');
      expect(at(d, sheet)).toMatchObject({ w: 220, h: 400 });
      expect(fillOf(sheet)).toBe(tok('surface', mode));
      expect(all(d, 'destino').map((n) => [at(d, n).y, at(d, n).h])).toEqual([
        [44, 56],
        [100, 56],
        [156, 56],
      ]);
      const [selected, other] = all(d, 'indicador');
      const pill = at(d, selected);
      expect([pill.x, pill.y, pill.h]).toEqual([20, 44, 56]);
      expect(radiusOf(selected)).toBeGreaterThanOrEqual(28);
      expect(fillOf(selected)).toBe(tok('secondary-container', mode));
      expect(fillOf(other)).toBeUndefined();
      const icon = at(d, named(d, 'home'));
      expect(icon).toEqual({ x: 36, y: 60, w: 24, h: 24 });
      const label = at(d, all(d, 'rótulo')[0]);
      expect(label.x).toBe(36 + 24 + 8);
      expect(label.y + label.h / 2).toBe(44 + 28);
      expect(pill.w).toBeCloseTo(16 + 24 + 8 + label.w + 16, 5);
      expect(fontOf(all(d, 'rótulo')[0])).toEqual(typo('label-large'));
      expect(fillOf(all(d, 'rótulo')[0])).toBe(tok('secondary', mode));
      expect(iconColor(named(d, 'home'))).toBe(tok('on-secondary-container', mode));
      expect(iconColor(named(d, 'search'))).toBe(tok('on-surface-variant', mode));
    }
  });

  it('largura segue o conteúdo: wide expandida cresce até 360 (ContainerWidthMaximum), e a recolhida fica em 96', () => {
    const items = [
      { label: 'Um rótulo bem comprido para a rail', icon: 'Home', selected: 'true' },
    ];
    const big = { width: 500, height: 400 };
    const drawn = (values: Values) =>
      draw('navigation-rail', { items, ...values }, 'light', big);
    const sheetWidth = (d: Drawing) => at(d, named(d, 'folha da rail')).w;
    const open = drawn({ style: 'wide', initialValue: 'Expanded' });
    const pill = at(open, named(open, 'indicador'));
    // pílula + 20 de cada lado (ItemHorizontalPadding) passaria de 360: o rail para no máximo
    expect(pill.x + pill.w + 20).toBeGreaterThan(360);
    expect(sheetWidth(open)).toBe(360);
    expect(sheetWidth(drawn({ style: 'wide', initialValue: 'Collapsed' }))).toBe(96);
  });

  it('modal-wide: expandida em surface-container com cantos de 16 (CornerLarge); recolhida igual à wide, em surface', () => {
    for (const mode of MODES) {
      const open = named(
        rail({ style: 'modal-wide', initialValue: 'Expanded' }, mode),
        'folha da rail',
      );
      expect(fillOf(open)).toBe(tok('surface-container', mode));
      expect(radiusOf(open)).toBe(16);
      const closed = named(
        rail({ style: 'modal-wide', initialValue: 'Collapsed' }, mode),
        'folha da rail',
      );
      expect(fillOf(closed)).toBe(tok('surface', mode));
      expect(radiusOf(closed)).toBe(0);
    }
  });
});

describe('M4 grupo B — navigation-drawer', () => {
  const DRAWER = { width: 360, height: 400 };
  const drawer = (values: Values, mode: Mode = 'light') =>
    draw(
      'navigation-drawer',
      {
        items: [
          { label: 'Caixa de entrada', icon: 'Email', selected: 'true', badge: '24' },
          { label: 'Favoritos', icon: 'Favorite', selected: 'false', badge: '' },
          { label: 'Configurações', icon: 'Settings', selected: 'false', badge: '' },
        ],
        ...values,
      },
      mode,
      DRAWER,
    );

  it('modal: surface-container-low com cantos finais de 16 (CornerLargeEnd); dismissible e permanent: surface, sem canto', () => {
    for (const mode of MODES) {
      const modal = drawer({ style: 'modal' }, mode);
      expect(at(modal, modal.root)).toMatchObject({ w: 360 });
      expect(fillOf(modal.root)).toBe(tok('surface-container-low', mode));
      expect(radiusOf(modal.root)).toEqual([0, 16, 16, 0]);
      expect(modal.root.effects).toEqual([]);
      for (const style of ['dismissible', 'permanent']) {
        const d = drawer({ style }, mode);
        expect(fillOf(d.root)).toBe(tok('surface', mode));
        expect(radiusOf(d.root)).toBe(0);
      }
    }
  });

  it('itens de 56 com 12 de margem (ItemPadding), 336 de largura, forma full e sem espaço entre eles', () => {
    for (const mode of MODES) {
      const d = drawer({ style: 'modal' }, mode);
      const items = all(d, 'destino');
      expect(items.map((n) => at(d, n))).toEqual([
        { x: 12, y: 12, w: 336, h: 56 },
        { x: 12, y: 68, w: 336, h: 56 },
        { x: 12, y: 124, w: 336, h: 56 },
      ]);
      expect(radiusOf(items[0])).toBeGreaterThanOrEqual(28);
      expect(fillOf(items[0])).toBe(tok('secondary-container', mode));
      expect(fillOf(items[1])).toBeUndefined();
    }
  });

  it('ícone de 24 a 16 da borda do item e rótulo 12 depois, em label-large; selecionado on-secondary-container', () => {
    for (const mode of MODES) {
      const d = drawer({ style: 'modal' }, mode);
      expect(at(d, named(d, 'email'))).toEqual({ x: 28, y: 28, w: 24, h: 24 });
      expect(iconColor(named(d, 'email'))).toBe(tok('on-secondary-container', mode));
      expect(iconColor(named(d, 'favorite'))).toBe(tok('on-surface-variant', mode));
      const [first, second] = all(d, 'rótulo');
      expect(at(d, first).x).toBe(28 + 24 + 12);
      expect(at(d, first).y + at(d, first).h / 2).toBe(12 + 28);
      expect(fontOf(first)).toEqual(typo('label-large'));
      expect(fillOf(first)).toBe(tok('on-secondary-container', mode));
      expect(fillOf(second)).toBe(tok('on-surface-variant', mode));
    }
  });

  it('selo no fim do item (24 de respiro à direita), na cor do rótulo e em label-large', () => {
    for (const mode of MODES) {
      const d = drawer({ style: 'modal' }, mode);
      const badge = named(d, 'selo');
      expect(at(d, badge).x + at(d, badge).w).toBe(360 - 12 - 24);
      expect(fontOf(badge)).toEqual(typo('label-large'));
      expect(fillOf(badge)).toBe(tok('on-secondary-container', mode));
      expect(all(d, 'selo')).toHaveLength(1);
    }
  });

  it('cabeçalho de 56 em title-small e on-surface-variant, com 16 de margem; os itens descem 56', () => {
    for (const mode of MODES) {
      const d = drawer({ style: 'modal', headline: 'Mapping' }, mode);
      const title = named(d, 'título');
      expect(fontOf(title)).toEqual(typo('title-small'));
      expect(fillOf(title)).toBe(tok('on-surface-variant', mode));
      expect(at(d, title).x).toBe(12 + 16);
      expect(at(d, title).y + at(d, title).h / 2).toBe(12 + 28);
      expect(at(d, all(d, 'destino')[0]).y).toBe(12 + 56);
    }
    expect(named(drawer({ style: 'modal' }), 'título')).toBeUndefined();
  });
});
