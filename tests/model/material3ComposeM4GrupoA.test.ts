// M4 da etapa "Material 3 fiel", grupo A: top-app-bar, bottom-app-bar e dropdown-menu contra o que
// `AppBar.kt`, `Menu.kt`, `ExposedDropdownMenu.kt`, `FloatingActionButton.kt` e os arquivos de tokens fixam
// no commit 5113b82a. As cores esperadas saem dos tokens da especialização (light e dark); a geometria, das
// constantes do Compose (dp = px do componente).
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

/** Desenha numa caixa que não é a do `size` (a marcação tem o retângulo que a pessoa desenhou). */
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
/** Valor do token da especialização no modo (cor). */
const tok = (name: string, mode: Mode): string => {
  const value = tokens[name] as string | Record<Mode, string>;
  return typeof value === 'string' ? value : value[mode];
};
const num = (name: string): number => tokens[name] as number;

const named = (d: Drawing, name: string): SceneNode | undefined => {
  for (const node of walk(d.root)) if (node.name === name && node.visible) return node;
  return undefined;
};
const box = (d: Drawing, name: string) => {
  const node = named(d, name);
  if (node === undefined) throw new Error(`nó ausente: ${name}`);
  return { node, ...absoluteBoxes(d.root).get(node.id)! };
};
const fillOf = (d: Drawing, name: string): string | undefined =>
  solid(named(d, name)?.fills ?? []);
const strokeOf = (d: Drawing, name: string): string | undefined =>
  solid(named(d, name)?.stroke?.paints ?? []);
/** O ícone desenhado dentro do nó `name`: o `PathNode`, a caixa do nó do ícone e a cor. */
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

describe('M4 grupo A — top-app-bar', () => {
  it('barra de 64 (AppBarSmallTokens.ContainerHeight) com container surface, em light e dark', () => {
    for (const mode of MODES) {
      const d = both('top-app-bar', { title: 'Início', navigationIcon: 'Menu' })[mode];
      expect(box(d, 'barra').height).toBe(64);
      // a raiz tem a altura da large (152, ME2); a barra de uma linha fica no topo
      expect(d.root.height).toBe(152);
      expect(fillOf(d, 'top app bar')).toBe(tok('surface', mode));
      expect(d.warnings.filter((w) => /ícone desconhecido|não cabe/.test(w))).toEqual([]);
    }
  });

  it('ícone de navegação de 24 numa área de 48 a 4 da borda (TopAppBarHorizontalPadding), em on-surface', () => {
    for (const mode of MODES) {
      const d = both('top-app-bar', { title: 'Início', navigationIcon: 'Menu' })[mode];
      const area = box(d, 'navegação');
      expect([area.x, area.y, area.width, area.height]).toEqual([4, 8, 48, 48]);
      const icon = iconIn(d, 'navegação')!;
      expect([icon.box.width, icon.box.height]).toEqual([24, 24]);
      expect([icon.box.x, icon.box.y]).toEqual([16, 20]);
      expect(icon.color).toBe(tok('on-surface', mode));
    }
  });

  it('ações de 24 em on-surface-variant, áreas de 48 coladas à direita com 4 de margem', () => {
    for (const mode of MODES) {
      const d = both('top-app-bar', {
        title: 'Início',
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

  it('título pequeno: title-large (22/28/400/0) em on-surface, a 56 com navegação e a 16 sem, centrado na altura', () => {
    for (const mode of MODES) {
      const withNav = both('top-app-bar', { title: 'Início', navigationIcon: 'Menu' })[
        mode
      ];
      const title = textIn(withNav, 'título')!;
      expect(fontOf(title)).toEqual(scale('title-large'));
      expect(solid(title.fills)).toBe(tok('on-surface', mode));
      expect(absOf(withNav, title).x).toBe(56);
      // (64 - 28) / 2
      expect(absOf(withNav, title).y).toBe(18);
      const bare = both('top-app-bar', { title: 'Início' })[mode];
      expect(absOf(bare, textIn(bare, 'título')!).x).toBe(16);
    }
  });

  it('título longo fica numa linha e termina em … (maxLines 1 e overflow Ellipsis do TopAppBar)', () => {
    const d = both('top-app-bar', {
      title: 'Um título bem comprido que não cabe na largura da barra de topo',
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
    // a largura do título é o que sobra: 412 - (4 + 48 + 4) - (4 + 96 + 4)
    expect(title.width).toBe(412 - 56 - 104);
    expect(d.warnings.filter((w) => /texto maior que a caixa/.test(w))).toEqual([]);
  });

  it('centralizada: título centrado na largura da barra (margens iguais), em title-large e align center', () => {
    for (const mode of MODES) {
      const d = both('top-app-bar', {
        title: 'Perfil',
        style: 'center',
        navigationIcon: 'ArrowBack',
      })[mode];
      const title = textIn(d, 'título centralizado')!;
      expect(fontOf(title)).toEqual(scale('title-large'));
      expect(title.style.align).toBe('center');
      expect(solid(title.fills)).toBe(tok('on-surface', mode));
      const abs = absOf(d, title);
      expect(abs.x + abs.width / 2).toBe(412 / 2);
      // com 2 ações o lado das ações (4 + 96) manda: 104 + 4 de cada lado
      const two = both('top-app-bar', {
        title: 'Perfil',
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

  it('medium e large: título em headline-small (24/32) e headline-medium (28/36), a 16 da borda e com a base a 24 e 28 da base da barra', () => {
    const cases = [
      { style: 'medium', scale: 'headline-small', height: 112, bottom: 16 },
      { style: 'large', scale: 'headline-medium', height: 152, bottom: 20 },
    ];
    for (const c of cases) {
      for (const mode of MODES) {
        const d = drawBox(
          'top-app-bar',
          { title: 'Configurações', style: c.style, navigationIcon: 'ArrowBack' },
          412,
          c.height,
          mode,
        );
        const big = textIn(d, 'título grande')!;
        expect(fontOf(big)).toEqual(scale(c.scale));
        expect(solid(big.fills)).toBe(tok('on-surface', mode));
        const abs = absOf(d, big);
        expect(abs.x).toBe(16);
        // o Compose põe a linha de base a 24 (medium) ou 28 (large) do fundo: a caixa do texto
        // (linha cheia, Alignment.Center) fica a esses valores menos a parte abaixo da base
        expect(c.height - (abs.y + abs.height)).toBe(c.bottom);
        // a linha de cima (navegação) continua com 64
        expect(box(d, 'barra').height).toBe(64);
        expect(textIn(d, 'título')).toBeUndefined();
        expect(textIn(d, 'título centralizado')).toBeUndefined();
      }
    }
  });

  it('ícone fora do conjunto cai no reservado e avisa ícone desconhecido', () => {
    const d = both('top-app-bar', { title: 'X', navigationIcon: 'Nao-existe' }).light;
    expect(d.warnings.some((w) => /ícone desconhecido/.test(w))).toBe(true);
  });
});

describe('M4 grupo A — bottom-app-bar', () => {
  it('barra de 80 (BottomAppBarTokens.ContainerHeight) em surface-container, sem sombra nem forma', () => {
    for (const mode of MODES) {
      const d = both('bottom-app-bar', { actionIcon1: 'Check' })[mode];
      expect(d.root.height).toBe(80);
      expect(fillOf(d, 'bottom app bar')).toBe(tok('surface-container', mode));
      expect(d.root.effects).toEqual([]);
    }
  });

  it('ações de 48 a partir de 4 da esquerda, centradas na linha de 76 (padding de cima 4), ícones de 24 em on-surface', () => {
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

  it('FAB de 56 na forma large (16) em secondary-container, a 16 da direita e 12 do topo, sem sombra; ícone on-secondary-container', () => {
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
      // bottomAppBarFabElevation(): 0 em todos os estados
      expect(fab.node.effects).toEqual([]);
      const icon = iconIn(d, 'botão flutuante')!;
      expect(icon.color).toBe(tok('on-secondary-container', mode));
      expect([icon.box.width, icon.box.x - fab.x, icon.box.y - fab.y]).toEqual([
        24, 16, 16,
      ]);
    }
  });

  it('sem FAB e sem ação: só o container; ícone fora do conjunto avisa', () => {
    const empty = both('bottom-app-bar', {}).light;
    expect(named(empty, 'botão flutuante')).toBeUndefined();
    expect(named(empty, 'ação 1')).toBeUndefined();
    const bad = both('bottom-app-bar', { actionIcon1: 'Nao-existe' }).light;
    expect(bad.warnings.some((w) => /ícone desconhecido/.test(w))).toBe(true);
  });
});

describe('M4 grupo A — dropdown-menu', () => {
  const items = (rows: Record<string, string>[]): Values =>
    ({ items: rows }) as unknown as Values;
  const menu = (extra: Record<string, unknown> = {}): Values =>
    ({
      style: 'menu',
      expanded: 'true',
      items: [
        { text: 'Editar', leadingIcon: 'Edit', trailingIcon: '', enabled: 'true' },
        { text: 'Compartilhar', leadingIcon: 'Share', trailingIcon: '', enabled: 'true' },
        { text: 'Excluir', leadingIcon: 'Delete', trailingIcon: '', enabled: 'false' },
      ],
      ...extra,
    }) as unknown as Values;

  it('menu: surface-container, forma extra-small (4), sombra do nível 2 e padding vertical de 8', () => {
    for (const mode of MODES) {
      const d = both('dropdown-menu', menu())[mode];
      const m = box(d, 'menu');
      expect('cornerRadius' in m.node && m.node.cornerRadius).toBe(
        num('corner-extra-small'),
      );
      expect(fillOf(d, 'menu')).toBe(tok('surface-container', mode));
      expect(m.node.effects[0]?.blur).toBe(num('elevation-2-blur'));
      expect(m.node.effects[0]?.offset.y).toBe(num('elevation-2-y'));
      expect(m.node.effects[0]?.color).toBe(tok('elevation-shadow', mode));
      // 8 + 3 itens de 48 + 8
      expect(m.height).toBe(160);
      const first = box(d, 'item');
      expect([first.y - m.y, first.height]).toEqual([8, 48]);
    }
  });

  it('item: texto em label-large (14/20/500/0,1) on-surface, ícone à esquerda de 24 em on-surface-variant a 12 da borda e texto a 48', () => {
    for (const mode of MODES) {
      const d = both('dropdown-menu', menu())[mode];
      const label = textIn(d, 'item')!;
      expect(label.text).toBe('Editar');
      expect(fontOf(label)).toEqual(scale('label-large'));
      expect(solid(label.fills)).toBe(tok('on-surface', mode));
      const item = box(d, 'item');
      expect(absOf(d, label).x - item.x).toBe(12 + 24 + 12);
      const icon = iconIn(d, 'item')!;
      expect([icon.box.width, icon.box.x - item.x]).toEqual([24, 12]);
      expect(icon.color).toBe(tok('on-surface-variant', mode));
    }
  });

  it('item desabilitado: texto e ícones em on-surface a 0,38 (state-disabled-content)', () => {
    for (const mode of MODES) {
      const d = drawBox(
        'dropdown-menu',
        items([
          {
            text: 'Excluir',
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

  it('ícone à direita: 24 em on-surface-variant, a 12 da borda direita', () => {
    const d = drawBox(
      'dropdown-menu',
      items([
        { text: 'Salvar', leadingIcon: '', trailingIcon: 'Check', enabled: 'true' },
      ]),
      200,
      160,
    );
    const item = box(d, 'item');
    const icon = iconIn(d, 'item')!;
    expect(item.x + item.width - (icon.box.x + icon.box.width)).toBe(12);
    expect(icon.color).toBe(tok('on-surface-variant', 'light'));
    // sem ícone à esquerda o texto começa a 12
    expect(absOf(d, textIn(d, 'item')!).x - item.x).toBe(12);
  });

  it('item de uma linha tem 48 (minHeight) e o de texto longo cresce com as linhas', () => {
    const long =
      'Um texto de item bem comprido que precisa quebrar em mais de uma linha dentro do menu';
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

  it('menu: largura entre 112 e 280 (DropdownMenuItemDefaultMinWidth e MaxWidth)', () => {
    const wide = drawBox('dropdown-menu', menu(), 400, 200);
    expect(box(wide, 'menu').width).toBe(280);
    const narrow = drawBox('dropdown-menu', menu(), 80, 200);
    expect(box(narrow, 'menu').width).toBe(112);
    const regular = drawBox('dropdown-menu', menu(), 200, 160);
    expect(box(regular, 'menu').width).toBe(200);
  });

  it('exposed: campo de 56 (filled) em surface-container-highest com indicador de 1 em on-surface-variant, e o menu logo abaixo com a largura do campo', () => {
    for (const mode of MODES) {
      const d = drawBox(
        'dropdown-menu',
        menu({ style: 'exposed', label: 'Idioma', value: 'Português' }),
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
      // ExposedDropdownMenuDefaults.ItemContentPadding: 16 nos itens
      expect(box(d, 'item').x - m.x).toBe(0);
      expect(iconIn(d, 'item')!.box.x - box(d, 'item').x).toBe(16);
    }
  });

  it('exposed: rótulo de 12/16 sobre o valor de 16/24 quando há valor; em body-large quando vazio', () => {
    const filled = drawBox(
      'dropdown-menu',
      menu({ style: 'exposed', expanded: 'false', label: 'País', value: 'Brasil' }),
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
      menu({ style: 'exposed', expanded: 'false', label: 'País', value: '' }),
      280,
      200,
    );
    expect(fontOf(textIn(empty, 'rótulo')!)).toEqual(scale('body-large'));
    expect(textIn(empty, 'valor')).toBeUndefined();
  });

  it('exposed: seta de 24 em on-surface-variant a 12 da direita, para baixo fechado e para cima aberto; fechado esconde o menu', () => {
    for (const mode of MODES) {
      const closed = drawBox(
        'dropdown-menu',
        menu({ style: 'exposed', expanded: 'false', label: 'País', value: 'Brasil' }),
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
        menu({ style: 'exposed', label: 'País', value: 'Brasil' }),
        280,
        300,
        mode,
      );
      expect(named(open, 'arrow_drop_up')).toBeDefined();
      expect(named(open, 'arrow_drop_down')).toBeUndefined();
    }
  });

  it('menu fechado (expanded=false) não desenha o menu; ícone fora do conjunto avisa', () => {
    const closed = drawBox('dropdown-menu', menu({ expanded: 'false' }), 200, 160);
    expect(named(closed, 'menu')).toBeUndefined();
    const bad = drawBox(
      'dropdown-menu',
      items([{ text: 'X', leadingIcon: 'Nao-existe', enabled: 'true' }]),
      200,
      160,
    );
    expect(bad.warnings.some((w) => /ícone desconhecido/.test(w))).toBe(true);
  });
});
