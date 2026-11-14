// M4 of the "faithful Material 3" stage, group A: top-app-bar, bottom-app-bar and dropdown-menu against what
// `AppBar.kt`, `Menu.kt`, `ExposedDropdownMenu.kt`, `FloatingActionButton.kt` and the token files fix
// at commit 5113b82a. The expected colors come from the specialization tokens (light and dark); the geometry, from the
// Compose constants (dp = component px).
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import { resolveTokens } from '../../src/model/components/tokens';
import { defaultValues } from '../../src/model/libraryDrawing';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import type { PathNode, SceneNode, TextNode } from '../../src/model/components/scene';
import { drawIn, files, solid, spec } from '../support/material3Library';

const catalog = buildCatalog(files);
const entryOf = (id: string) => findEntry(catalog, id)!;
type Values = Parameters<typeof drawIn>[2];
type Mode = 'light' | 'dark';
type Drawing = ReturnType<typeof drawIn>;
const MODES: Mode[] = ['light', 'dark'];
const both = (id: string, values: Values) => ({
  light: drawIn(catalog, entryOf(id), values, 'light'),
  dark: drawIn(catalog, entryOf(id), values, 'dark'),
});

/** Draws in a box that is not the `size` one (the marking has the rectangle the person drew). */
function drawBox(
  id: string,
  values: Values,
  width: number,
  height: number,
  mode: Mode = 'light',
): Drawing {
  const entry = entryOf(id);
  const library = catalog.library!;
  return instantiate(
    entry.component!,
    { ...defaultValues(entry.type), ...values },
    { x: 0, y: 0, width, height },
    {
      measure: approximateMeasurer,
      tokens: resolveTokens(library.tokens, {}, mode),
      ...(library.icons === undefined ? {} : { icons: library.icons }),
    },
  );
}

const tokens = spec.tokens!.values as Record<string, unknown>;
/** Value of the specialization token in the mode (color). */
const tok = (name: string, mode: Mode): string => {
  const value = tokens[name] as string | Record<Mode, string>;
  return typeof value === 'string' ? value : value[mode];
};
const num = (name: string): number => tokens[name] as number;

// pt-BR kept: the quoted node names ('rótulo', 'trilho', ...) are the names in the material3-compose library (libraries/*.json, outside this phase)
const named = (d: Drawing, name: string): SceneNode | undefined => {
  for (const node of walk(d.root)) if (node.name === name && node.visible) return node;
  return undefined;
};
const box = (d: Drawing, name: string) => {
  const node = named(d, name);
  if (node === undefined) throw new Error(`missing node: ${name}`);
  return { node, ...absoluteBoxes(d.root).get(node.id)! };
};
const fillOf = (d: Drawing, name: string): string | undefined =>
  solid(named(d, name)?.fills ?? []);
const strokeOf = (d: Drawing, name: string): string | undefined =>
  solid(named(d, name)?.stroke?.paints ?? []);
/** The icon drawn inside the `name` node: the `PathNode`, the icon node's box and the color. */
const iconIn = (d: Drawing, name: string) => {
  const holder = named(d, name);
  if (holder === undefined) return undefined;
  const path = [...walk(holder)].find((n): n is PathNode => n.type === 'path');
  if (path === undefined) return undefined;
  return { path, color: solid(path.fills), box: absoluteBoxes(d.root).get(path.id)! };
};
const textIn = (d: Drawing, name: string): TextNode | undefined => {
  const holder = named(d, name);
  if (holder === undefined) return undefined;
  return [...walk(holder)].find((n): n is TextNode => n.type === 'text' && n.visible);
};
const fontOf = (node: TextNode | undefined) =>
  node === undefined
    ? undefined
    : [
        node.style.fontSize,
        node.style.lineHeight,
        node.style.fontWeight,
        node.style.letterSpacing,
      ];
const scale = (name: string): number[] => [
  num(`${name}-size`),
  num(`${name}-line-height`),
  num(`${name}-weight`),
  num(`${name}-tracking`),
];
const absOf = (d: Drawing, node: SceneNode) => absoluteBoxes(d.root).get(node.id)!;

describe('M4 group A — top-app-bar', () => {
  it('64 bar (AppBarSmallTokens.ContainerHeight) with a surface container, in light and dark', () => {
    for (const mode of MODES) {
      const d = both('top-app-bar', { title: 'Home', navigationIcon: 'Menu' })[mode];
      expect(box(d, 'barra').height).toBe(64);
      // the root has the height of the large one (152, ME2); the one-line bar sits at the top
      expect(d.root.height).toBe(152);
      expect(fillOf(d, 'top app bar')).toBe(tok('surface', mode));
      // pt-BR kept: 'não cabe' is the pt-BR text of the warning emitted by src/model
      expect(d.warnings.filter((w) => /unknown icon|não cabe/.test(w))).toEqual([]);
    }
  });

  it('24 navigation icon in a 48 area, 4 from the edge (TopAppBarHorizontalPadding), in on-surface', () => {
    for (const mode of MODES) {
      const d = both('top-app-bar', { title: 'Home', navigationIcon: 'Menu' })[mode];
      const area = box(d, 'navegação');
      expect([area.x, area.y, area.width, area.height]).toEqual([4, 8, 48, 48]);
      const icon = iconIn(d, 'navegação')!;
      expect([icon.box.width, icon.box.height]).toEqual([24, 24]);
      expect([icon.box.x, icon.box.y]).toEqual([16, 20]);
      expect(icon.color).toBe(tok('on-surface', mode));
    }
  });

  it('24 actions in on-surface-variant, 48 areas flush right with a 4 margin', () => {
    for (const mode of MODES) {
      const d = both('top-app-bar', {
        title: 'Home',
        actionIcon1: 'Search',
        actionIcon2: 'MoreVert',
      })[mode];
      const second = box(d, 'ação 2');
      const first = box(d, 'ação 1');
      expect([second.x, second.width, second.height]).toEqual([412 - 4 - 48, 48, 48]);
      expect(first.x).toBe(412 - 4 - 96);
      expect(iconIn(d, 'ação 1')!.color).toBe(tok('on-surface-variant', mode));
      expect(iconIn(d, 'ação 2')!.box.width).toBe(24);
    }
  });

  it('small title: title-large (22/28/400/0) in on-surface, at 56 with navigation and at 16 without, centered in height', () => {
    for (const mode of MODES) {
      const withNav = both('top-app-bar', { title: 'Home', navigationIcon: 'Menu' })[
        mode
      ];
      const title = textIn(withNav, 'título')!;
      expect(fontOf(title)).toEqual(scale('title-large'));
      expect(solid(title.fills)).toBe(tok('on-surface', mode));
      expect(absOf(withNav, title).x).toBe(56);
      // the node takes the bar's height (fill) and `cap-middle` centers the capital letter in it (FX6)
      expect(absOf(withNav, title).y).toBe(0);
      expect(title.height).toBe(64);
      expect(title.style.verticalAlign).toBe('cap-middle');
      const bare = both('top-app-bar', { title: 'Home' })[mode];
      expect(absOf(bare, textIn(bare, 'título')!).x).toBe(16);
    }
  });

  it('a long title stays on one line and ends in … (maxLines 1 and Ellipsis overflow of the TopAppBar)', () => {
    const d = both('top-app-bar', {
      title: 'A very long title that does not fit in the width of the top bar',
      navigationIcon: 'Menu',
      actionIcon1: 'Search',
      actionIcon2: 'MoreVert',
    }).light;
    const title = textIn(d, 'título')!;
    expect(title.style).toMatchObject({ wrap: 'none', ellipsis: true, maxLines: 1 });
    const metrics = approximateMeasurer(
      title.text,
      {
        family: title.style.fontFamily,
        size: title.style.fontSize,
        weight: title.style.fontWeight,
        italic: title.style.italic,
        lineHeight: title.style.lineHeight ?? 28,
        letterSpacing: title.style.letterSpacing ?? 0,
        wrap: 'none',
        ellipsis: true,
        maxLines: 1,
      },
      title.width,
    );
    expect(metrics.lines).toHaveLength(1);
    expect(metrics.lines![0]!.endsWith('…')).toBe(true);
    // the title's width is what is left: 412 - (4 + 48 + 4) - (4 + 96 + 4)
    expect(title.width).toBe(412 - 56 - 104);
    expect(d.warnings.filter((w) => /text larger than the box/.test(w))).toEqual([]);
  });

  it('centered: title centered in the width of the bar (equal margins), in title-large and align center', () => {
    for (const mode of MODES) {
      const d = both('top-app-bar', {
        title: 'Profile',
        style: 'center',
        navigationIcon: 'ArrowBack',
      })[mode];
      const title = textIn(d, 'título centralizado')!;
      expect(fontOf(title)).toEqual(scale('title-large'));
      expect(title.style.align).toBe('center');
      expect(solid(title.fills)).toBe(tok('on-surface', mode));
      const abs = absOf(d, title);
      expect(abs.x + abs.width / 2).toBe(412 / 2);
      // with 2 actions the actions side (4 + 96) wins: 104 + 4 on each side
      const two = both('top-app-bar', {
        title: 'Profile',
        style: 'center',
        actionIcon1: 'Search',
        actionIcon2: 'MoreVert',
      })[mode];
      const wide = absOf(two, textIn(two, 'título centralizado')!);
      expect(wide.x).toBe(104);
      expect(wide.x + wide.width / 2).toBe(412 / 2);
      expect(textIn(d, 'título')).toBeUndefined();
    }
  });

  it('medium and large: title in headline-small (24/32) and headline-medium (28/36), 16 from the edge and with the baseline 24 and 28 from the bottom of the bar', () => {
    const cases = [
      {
        style: 'medium',
        scale: 'headline-small',
        height: 112,
        bottom: 24,
        size: 24,
        line: 32,
      },
      {
        style: 'large',
        scale: 'headline-medium',
        height: 152,
        bottom: 28,
        size: 28,
        line: 36,
      },
    ];
    for (const c of cases) {
      for (const mode of MODES) {
        const d = drawBox(
          'top-app-bar',
          { title: 'Settings', style: c.style, navigationIcon: 'ArrowBack' },
          412,
          c.height,
          mode,
        );
        const big = textIn(d, 'título grande')!;
        expect(fontOf(big)).toEqual(scale(c.scale));
        expect(solid(big.fills)).toBe(tok('on-surface', mode));
        const abs = absOf(d, big);
        expect(abs.x).toBe(16);
        // Compose puts the baseline 24 (medium) or 28 (large) from the bottom (AppBar.kt 3213 to 3231): the node carries
        // `baselinePadding.bottom` and goes down to the bar's bottom (MC5, before: box 16 and 20 from the bottom, the Roboto 14/20)
        expect(c.height - (abs.y + abs.height)).toBe(0);
        const firstBaseline = c.line / 2 + ((0.93 - 0.24) * c.size) / 2;
        expect(c.height - (abs.y + firstBaseline)).toBeCloseTo(c.bottom, 6);
        // the top row (navigation) stays at 64
        expect(box(d, 'barra').height).toBe(64);
        expect(textIn(d, 'título')).toBeUndefined();
        expect(textIn(d, 'título centralizado')).toBeUndefined();
      }
    }
  });

  it('an icon outside the set falls back to the placeholder and warns unknown icon', () => {
    const d = both('top-app-bar', { title: 'X', navigationIcon: 'Does-not-exist' }).light;
    expect(d.warnings.some((w) => /unknown icon/.test(w))).toBe(true);
  });
});

describe('M4 group A — bottom-app-bar', () => {
  it('80 bar (BottomAppBarTokens.ContainerHeight) in surface-container, with no shadow or shape', () => {
    for (const mode of MODES) {
      const d = both('bottom-app-bar', { actionIcon1: 'Check' })[mode];
      expect(d.root.height).toBe(80);
      expect(fillOf(d, 'bottom app bar')).toBe(tok('surface-container', mode));
      expect(d.root.effects).toEqual([]);
    }
  });

  it('48 actions from 4 from the left, centered in the 76 row (top padding 4), 24 icons in on-surface', () => {
    for (const mode of MODES) {
      const d = both('bottom-app-bar', {
        actionIcon1: 'Home',
        actionIcon2: 'Search',
        actionIcon3: 'Person',
        actionIcon4: 'Settings',
      })[mode];
      [4, 52, 100, 148].forEach((x, i) => {
        const area = box(d, `ação ${i + 1}`);
        expect([area.x, area.y, area.width, area.height]).toEqual([x, 18, 48, 48]);
        const icon = iconIn(d, `ação ${i + 1}`)!;
        expect([icon.box.width, icon.box.height]).toEqual([24, 24]);
        expect(icon.box.x - area.x).toBe(12);
        expect(icon.color).toBe(tok('on-surface', mode));
      });
    }
  });

  it('56 FAB in the large shape (16) in secondary-container, 16 from the right and 12 from the top, no shadow; on-secondary-container icon', () => {
    for (const mode of MODES) {
      const d = both('bottom-app-bar', {
        actionIcon1: 'Check',
        floatingActionButton: 'Add',
      })[mode];
      const fab = box(d, 'botão flutuante');
      expect([fab.x, fab.y, fab.width, fab.height]).toEqual([412 - 16 - 56, 12, 56, 56]);
      expect('cornerRadius' in fab.node && fab.node.cornerRadius).toBe(
        num('corner-large'),
      );
      expect(fillOf(d, 'botão flutuante')).toBe(tok('secondary-container', mode));
      // bottomAppBarFabElevation(): 0 in every state
      expect(fab.node.effects).toEqual([]);
      const icon = iconIn(d, 'botão flutuante')!;
      expect(icon.color).toBe(tok('on-secondary-container', mode));
      expect([icon.box.width, icon.box.x - fab.x, icon.box.y - fab.y]).toEqual([
        24, 16, 16,
      ]);
    }
  });

  it('no FAB and no action: only the container; an icon outside the set warns', () => {
    const empty = both('bottom-app-bar', {}).light;
    expect(named(empty, 'botão flutuante')).toBeUndefined();
    expect(named(empty, 'ação 1')).toBeUndefined();
    const bad = both('bottom-app-bar', { actionIcon1: 'Does-not-exist' }).light;
    expect(bad.warnings.some((w) => /unknown icon/.test(w))).toBe(true);
  });
});

describe('M4 group A — dropdown-menu', () => {
  const items = (rows: Record<string, string>[]): Values =>
    ({ items: rows }) as unknown as Values;
  const menu = (extra: Record<string, unknown> = {}): Values =>
    ({
      style: 'menu',
      expanded: 'true',
      items: [
        { text: 'Edit', leadingIcon: 'Edit', trailingIcon: '', enabled: 'true' },
        { text: 'Share', leadingIcon: 'Share', trailingIcon: '', enabled: 'true' },
        { text: 'Delete', leadingIcon: 'Delete', trailingIcon: '', enabled: 'false' },
      ],
      ...extra,
    }) as unknown as Values;

  it('menu: surface-container, extra-small shape (4), level 2 shadow and vertical padding of 8', () => {
    for (const mode of MODES) {
      const d = both('dropdown-menu', menu())[mode];
      const m = box(d, 'menu');
      expect('cornerRadius' in m.node && m.node.cornerRadius).toBe(
        num('corner-extra-small'),
      );
      expect(fillOf(d, 'menu')).toBe(tok('surface-container', mode));
      // level 2: two shadows, point and ambient, each with y, blur, spread and token color
      expect(m.node.effects).toHaveLength(2);
      for (const [i, kind] of (['point', 'ambient'] as const).entries()) {
        const shadow = m.node.effects[i];
        expect(shadow?.blur, kind).toBe(num(`elevation-2-${kind}-blur`));
        expect(shadow?.offset.y, kind).toBe(num(`elevation-2-${kind}-y`));
        expect(shadow?.spread ?? 0, kind).toBe(num(`elevation-2-${kind}-spread`));
        expect(shadow?.color, kind).toBe(tok(`elevation-${kind}-shadow`, mode));
      }
      // 8 + 3 items of 48 + 8
      expect(m.height).toBe(160);
      const first = box(d, 'item');
      expect([first.y - m.y, first.height]).toEqual([8, 48]);
    }
  });

  it('item: text in label-large (14/20/500/0.1) on-surface, 24 leading icon in on-surface-variant 12 from the edge and text at 48', () => {
    for (const mode of MODES) {
      const d = both('dropdown-menu', menu())[mode];
      const label = textIn(d, 'item')!;
      expect(label.text).toBe('Edit');
      expect(fontOf(label)).toEqual(scale('label-large'));
      expect(solid(label.fills)).toBe(tok('on-surface', mode));
      const item = box(d, 'item');
      expect(absOf(d, label).x - item.x).toBe(12 + 24 + 12);
      const icon = iconIn(d, 'item')!;
      expect([icon.box.width, icon.box.x - item.x]).toEqual([24, 12]);
      expect(icon.color).toBe(tok('on-surface-variant', mode));
    }
  });

  it('disabled item: text and icons in on-surface at 0.38 (state-disabled-content)', () => {
    for (const mode of MODES) {
      const d = drawBox(
        'dropdown-menu',
        items([
          {
            text: 'Delete',
            leadingIcon: 'Delete',
            trailingIcon: 'Check',
            enabled: 'false',
          },
        ]),
        200,
        160,
        mode,
      );
      const label = textIn(d, 'item')!;
      expect(solid(label.fills)).toBe(tok('on-surface', mode));
      expect(label.opacity).toBe(num('state-disabled-content'));
      const holder = named(d, 'item')!;
      const icons = [...walk(holder)].filter(
        (n): n is PathNode => n.type === 'path' && n.visible,
      );
      expect(icons).toHaveLength(2);
      for (const icon of icons) expect(solid(icon.fills)).toBe(tok('on-surface', mode));
      const iconNodes = [...walk(holder)].filter(
        (n) => n.type !== 'text' && n.opacity === num('state-disabled-content'),
      );
      expect(iconNodes.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('trailing icon: 24 in on-surface-variant, 12 from the right edge', () => {
    const d = drawBox(
      'dropdown-menu',
      items([{ text: 'Save', leadingIcon: '', trailingIcon: 'Check', enabled: 'true' }]),
      200,
      160,
    );
    const item = box(d, 'item');
    const icon = iconIn(d, 'item')!;
    expect(item.x + item.width - (icon.box.x + icon.box.width)).toBe(12);
    expect(icon.color).toBe(tok('on-surface-variant', 'light'));
    // without a leading icon the text starts at 12
    expect(absOf(d, textIn(d, 'item')!).x - item.x).toBe(12);
  });

  it('a one-line item is 48 (minHeight) and the long-text one grows with the lines', () => {
    const long =
      'A very long item text that needs to wrap onto more than one line inside the menu';
    const d = drawBox(
      'dropdown-menu',
      items([{ text: long, enabled: 'true' }]),
      200,
      160,
    );
    expect(box(d, 'item').height).toBeGreaterThan(48);
    const short = drawBox(
      'dropdown-menu',
      items([{ text: 'Ok', enabled: 'true' }]),
      200,
      160,
    );
    expect(box(short, 'item').height).toBe(48);
  });

  it('menu: width between 112 and 280 (DropdownMenuItemDefaultMinWidth and MaxWidth)', () => {
    const wide = drawBox('dropdown-menu', menu(), 400, 200);
    expect(box(wide, 'menu').width).toBe(280);
    const narrow = drawBox('dropdown-menu', menu(), 80, 200);
    expect(box(narrow, 'menu').width).toBe(112);
    const regular = drawBox('dropdown-menu', menu(), 200, 160);
    expect(box(regular, 'menu').width).toBe(200);
  });

  it('exposed: 56 field (filled) in surface-container-highest with a 1 indicator in on-surface-variant, and the menu right below with the width of the field', () => {
    for (const mode of MODES) {
      const d = drawBox(
        'dropdown-menu',
        menu({ style: 'exposed', label: 'Language', value: 'Portuguese' }),
        412,
        300,
        mode,
      );
      const field = box(d, 'campo');
      expect([field.y, field.height]).toEqual([0, 56]);
      expect(fillOf(d, 'fundo')).toBe(tok('surface-container-highest', mode));
      expect(strokeOf(d, 'indicador')).toBe(tok('on-surface-variant', mode));
      expect(named(d, 'indicador')?.stroke).toMatchObject({
        width: 1,
        sides: ['bottom'],
      });
      const m = box(d, 'menu');
      expect([m.y, m.width]).toEqual([56, 412]);
      // ExposedDropdownMenuDefaults.ItemContentPadding: 16 on the items
      expect(box(d, 'item').x - m.x).toBe(0);
      expect(iconIn(d, 'item')!.box.x - box(d, 'item').x).toBe(16);
    }
  });

  it('exposed: 12/16 label over the 16/24 value when there is a value; in body-large when empty', () => {
    const filled = drawBox(
      'dropdown-menu',
      menu({ style: 'exposed', expanded: 'false', label: 'Country', value: 'Brazil' }),
      280,
      200,
    );
    expect(fontOf(textIn(filled, 'rótulo')!)).toEqual(scale('body-small'));
    expect(fontOf(textIn(filled, 'valor')!)).toEqual(scale('body-large'));
    expect(solid(textIn(filled, 'rótulo')!.fills)).toBe(
      tok('on-surface-variant', 'light'),
    );
    expect(solid(textIn(filled, 'valor')!.fills)).toBe(tok('on-surface', 'light'));
    const empty = drawBox(
      'dropdown-menu',
      menu({ style: 'exposed', expanded: 'false', label: 'Country', value: '' }),
      280,
      200,
    );
    expect(fontOf(textIn(empty, 'rótulo')!)).toEqual(scale('body-large'));
    expect(textIn(empty, 'valor')).toBeUndefined();
  });

  it('exposed: 24 arrow in on-surface-variant 12 from the right, down when closed and up when open; closed hides the menu', () => {
    for (const mode of MODES) {
      const closed = drawBox(
        'dropdown-menu',
        menu({ style: 'exposed', expanded: 'false', label: 'Country', value: 'Brazil' }),
        280,
        200,
        mode,
      );
      const arrow = iconIn(closed, 'campo')!;
      expect(named(closed, 'arrow_drop_down')).toBeDefined();
      expect(named(closed, 'arrow_drop_up')).toBeUndefined();
      expect(arrow.color).toBe(tok('on-surface-variant', mode));
      expect([arrow.box.width, 280 - (arrow.box.x + arrow.box.width)]).toEqual([24, 12]);
      expect(named(closed, 'menu')).toBeUndefined();
      const open = drawBox(
        'dropdown-menu',
        menu({ style: 'exposed', label: 'Country', value: 'Brazil' }),
        280,
        300,
        mode,
      );
      expect(named(open, 'arrow_drop_up')).toBeDefined();
      expect(named(open, 'arrow_drop_down')).toBeUndefined();
    }
  });

  it('closed menu (expanded=false) does not draw the menu; an icon outside the set warns', () => {
    const closed = drawBox('dropdown-menu', menu({ expanded: 'false' }), 200, 160);
    expect(named(closed, 'menu')).toBeUndefined();
    const bad = drawBox(
      'dropdown-menu',
      items([{ text: 'X', leadingIcon: 'Does-not-exist', enabled: 'true' }]),
      200,
      160,
    );
    expect(bad.warnings.some((w) => /unknown icon/.test(w))).toBe(true);
  });
});
