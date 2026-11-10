// M4 da etapa "Material 3 fiel", grupo C: tabs e list-item contra o que `Tab.kt`, `TabRow.kt`, `ListItem.kt` e os
// arquivos de tokens (`PrimaryNavigationTabTokens`, `SecondaryNavigationTabTokens`, `ListTokens`, `DividerTokens`)
// fixam no commit 5113b82a. As cores esperadas saem dos tokens da especialização (light e dark); a geometria, das
// constantes do Compose (dp = px do componente).
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import {
  approximateMeasurer,
  instantiate,
  measureComponent,
} from '../../src/model/components/instantiate';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import type { PathNode, SceneNode, TextNode } from '../../src/model/components/scene';
import { resolveTokens } from '../../src/model/components/tokens';
import { defaultValues } from '../../src/model/libraryDrawing';
import { files, solid, spec } from '../support/material3Library';

const catalog = buildCatalog(files);
const entryOf = (id: string) => findEntry(catalog, id)!;
type Values = Parameters<typeof instantiate>[1];
type Mode = 'light' | 'dark';
type Drawing = ReturnType<typeof instantiate>;
type Row = Record<string, string>;

/** Desenha o componente numa caixa de `width` por `height` (o padrão é o `size` do componente). */
function draw(
  id: string,
  values: Values,
  mode: Mode = 'light',
  size?: { width: number; height: number },
): Drawing {
  const entry = entryOf(id);
  const library = catalog.library!;
  const box = { x: 0, y: 0, ...(size ?? entry.component!.size) };
  return instantiate(entry.component!, { ...defaultValues(entry.type), ...values }, box, {
    measure: approximateMeasurer,
    tokens: resolveTokens(library.tokens, {}, mode),
    ...(library.icons === undefined ? {} : { icons: library.icons }),
  });
}
const both = (
  id: string,
  values: Values,
  size?: { width: number; height: number },
): Record<Mode, Drawing> => ({
  light: draw(id, values, 'light', size),
  dark: draw(id, values, 'dark', size),
});

const tokens = spec.tokens!.values as Record<string, unknown>;
/** Valor do token da especialização no modo (cor ou número). */
const tok = (name: string, mode: Mode): string => {
  const value = tokens[name] as string | number | Record<Mode, string>;
  return typeof value === 'object' ? value[mode] : String(value);
};

const named = (d: Drawing, name: string): SceneNode | undefined =>
  [...walk(d.root)].find((n) => n.name === name && n.visible);
const allNamed = (d: Drawing, name: string): SceneNode[] =>
  [...walk(d.root)].filter((n) => n.name === name && n.visible);
const boxOf = (d: Drawing, node: SceneNode) => absoluteBoxes(d.root).get(node.id)!;
const box = (d: Drawing, name: string) => {
  const node = named(d, name);
  if (node === undefined) throw new Error(`nó ausente: ${name}`);
  return { node, ...boxOf(d, node) };
};
const boxesOf = (d: Drawing, name: string) =>
  allNamed(d, name).map((node) => ({ node, ...boxOf(d, node) }));
/** Cor do nó: o preenchimento ou, sem ele, a do traço. */
const paintOf = (node: SceneNode | undefined): string | undefined =>
  solid(node?.fills ?? []) ?? solid(node?.stroke?.paints ?? []);
const texts = (d: Drawing): TextNode[] =>
  [...walk(d.root)].filter((n): n is TextNode => n.type === 'text' && n.visible);
const textBox = (d: Drawing, text: string) => {
  const node = texts(d).find((n) => n.text === text);
  if (node === undefined) throw new Error(`texto ausente: ${text}`);
  return { node, ...boxOf(d, node) };
};
/** Os ícones (nó `icon`) desenhados, na ordem do desenho: cada um é um grupo com o caminho `icon-path`. */
const iconsOf = (d: Drawing): { node: SceneNode; color?: string }[] =>
  [...walk(d.root)]
    .filter((n) => n.visible && n.type === 'group')
    .map((node) => {
      const path = [...walk(node)].find((n): n is PathNode => n.type === 'path');
      return { node, color: path === undefined ? undefined : solid(path.fills) };
    })
    .filter((icon) => icon.color !== undefined);

const near = (value: number | undefined, expected: number) =>
  expect(value).toBeCloseTo(expected, 3);

const W = 412;
const rows = (
  labels: [string, string, string],
  icons: [string, string, string],
  selected = 0,
) =>
  labels.map((label, i) => ({
    label,
    icon: icons[i]!,
    selected: i === selected ? 'true' : 'false',
  })) as Row[];
const ICONS: [string, string, string] = ['Home', 'Search', 'Person'];
const LABELS: [string, string, string] = ['Início', 'Buscar', 'Perfil'];
const THREE = rows(LABELS, ICONS);
const textOnly = rows(LABELS, ['', '', '']);
const iconOnly = rows(['', '', ''], ICONS);

describe('M4 grupo C — tabs', () => {
  it('fileira fixa: abas de largura igual que ocupam a largura toda, no fundo surface e com a divisória de 1 em outline-variant', () => {
    const d = both('tabs', { items: THREE, style: 'primary', iconPosition: 'top' });
    for (const mode of ['light', 'dark'] as const) {
      const tabs = boxesOf(d[mode], 'aba');
      expect(tabs).toHaveLength(3);
      tabs.forEach((tab, i) => {
        near(tab.width, W / 3);
        near(tab.x, (i * W) / 3);
        // a fileira com ícone acima passa de 48 para 72 (LargeTabHeight, Tab.kt:421)
        expect(tab.height).toBe(72);
      });
      expect(paintOf(d[mode].root)).toBe(tok('surface', mode));
      const divider = box(d[mode], 'divisória');
      expect([divider.x, divider.y, divider.width, divider.height]).toEqual([
        0,
        71,
        W,
        1,
      ]);
      expect(paintOf(divider.node)).toBe(tok('outline-variant', mode));
      expect(divider.node.stroke).toMatchObject({ width: 1, sides: ['bottom'] });
    }
  });

  it('fileira fixa com 2 e com 4 abas divide a largura por igual', () => {
    for (const n of [2, 4]) {
      const items = Array.from({ length: n }, (_, i) => ({
        label: `Aba ${i + 1}`,
        icon: '',
        selected: i === 0 ? 'true' : 'false',
      }));
      const d = draw('tabs', { items, style: 'secondary', iconPosition: 'top' });
      const tabs = boxesOf(d, 'aba');
      expect(tabs).toHaveLength(n);
      tabs.forEach((tab) => near(tab.width, W / n));
    }
  });

  it('rótulo em title-small pelos tokens (14, linha 20, peso 500, espaçamento 0,1) e sem family', () => {
    const d = draw('tabs', { items: THREE, style: 'primary', iconPosition: 'top' });
    const style = textBox(d, 'Início').node.style;
    expect([
      style.fontSize,
      style.lineHeight,
      style.fontWeight,
      style.letterSpacing,
    ]).toEqual([14, 20, 500, 0.1]);
  });

  it('primárias: selecionada em primary e as outras em on-surface-variant, rótulo e ícone, em light e dark', () => {
    const d = both('tabs', { items: THREE, style: 'primary', iconPosition: 'top' });
    for (const mode of ['light', 'dark'] as const) {
      const selected = tok('primary', mode);
      const inactive = tok('on-surface-variant', mode);
      expect(solid(textBox(d[mode], 'Início').node.fills)).toBe(selected);
      expect(solid(textBox(d[mode], 'Buscar').node.fills)).toBe(inactive);
      expect(solid(textBox(d[mode], 'Perfil').node.fills)).toBe(inactive);
      expect(iconsOf(d[mode]).map((i) => i.color)).toEqual([
        selected,
        inactive,
        inactive,
      ]);
    }
  });

  it('secundárias: a selecionada em on-surface (SecondaryNavigationTabTokens.ActiveLabelTextColor) e as outras em on-surface-variant', () => {
    const d = both('tabs', { items: THREE, style: 'secondary', iconPosition: 'top' });
    for (const mode of ['light', 'dark'] as const) {
      expect(solid(textBox(d[mode], 'Início').node.fills)).toBe(tok('on-surface', mode));
      expect(solid(textBox(d[mode], 'Buscar').node.fills)).toBe(
        tok('on-surface-variant', mode),
      );
      expect(iconsOf(d[mode]).map((i) => i.color)).toEqual([
        tok('on-surface', mode),
        tok('on-surface-variant', mode),
        tok('on-surface-variant', mode),
      ]);
    }
  });

  it('indicador primário: só na aba selecionada, 3 de altura, raio 3, primary, do tamanho do rótulo e centrado na aba', () => {
    const d = both('tabs', { items: THREE, style: 'primary', iconPosition: 'top' });
    for (const mode of ['light', 'dark'] as const) {
      const indicators = boxesOf(d[mode], 'indicador primário');
      expect(indicators).toHaveLength(1);
      const [indicator] = indicators;
      const tab = boxesOf(d[mode], 'aba')[0]!;
      const label = textBox(d[mode], 'Início');
      expect(indicator!.height).toBe(3);
      expect(indicator!.y + indicator!.height).toBe(72);
      // matchContentSize = true: a largura do conteúdo (texto), no mínimo 24 (TabRow.kt:431-436)
      near(indicator!.width, Math.max(label.width, 24));
      near(indicator!.x + indicator!.width / 2, tab.x + tab.width / 2);
      expect(paintOf(indicator!.node)).toBe(tok('primary', mode));
      expect('cornerRadius' in indicator!.node && indicator!.node.cornerRadius).toBe(3);
      expect(allNamed(d[mode], 'indicador secundário')).toHaveLength(0);
    }
  });

  it('indicador primário de aba só com ícone ou com rótulo curto mede o mínimo de 24', () => {
    const icon = draw(
      'tabs',
      {
        items: iconOnly.map((r, i) => ({ ...r, label: i === 0 ? '' : '' })),
        style: 'primary',
        iconPosition: 'top',
      },
      'light',
      { width: W, height: 48 },
    );
    near(box(icon, 'indicador primário').width, 24);
    const short = draw(
      'tabs',
      {
        items: [{ label: 'A', icon: '', selected: 'true' }],
        style: 'primary',
        iconPosition: 'top',
      },
      'light',
      { width: W, height: 48 },
    );
    near(box(short, 'indicador primário').width, 24);
  });

  it('indicador secundário: 3 de altura (SecondaryIndicator usa ActiveIndicatorHeight), primary, na largura toda da aba e sem canto arredondado', () => {
    const d = both('tabs', { items: THREE, style: 'secondary', iconPosition: 'top' });
    for (const mode of ['light', 'dark'] as const) {
      const indicators = boxesOf(d[mode], 'indicador secundário');
      expect(indicators).toHaveLength(1);
      const [indicator] = indicators;
      const tab = boxesOf(d[mode], 'aba')[0]!;
      near(indicator!.x, tab.x);
      near(indicator!.width, tab.width);
      expect(indicator!.height).toBe(3);
      expect(indicator!.y + indicator!.height).toBe(72);
      expect(paintOf(indicator!.node)).toBe(tok('primary', mode));
      expect(allNamed(d[mode], 'indicador primário')).toHaveLength(0);
    }
  });

  it('ícone acima do texto (Tab): ícone de 24 e rótulo centrados na aba de 72, o texto a 12 do fundo e 5 abaixo do ícone', () => {
    const d = draw('tabs', { items: THREE, style: 'primary', iconPosition: 'top' });
    const tab = boxesOf(d, 'aba')[0]!;
    const [icon] = iconsOf(d);
    const iconBox = boxOf(d, icon!.node);
    const label = textBox(d, 'Início');
    // placeTextAndIcon (Tab.kt:380-417): textY = altura - baseline(15) - (14 + indicador 3); ícone 20 acima da baseline
    expect([iconBox.width, iconBox.height]).toEqual([24, 24]);
    expect(iconBox.y).toBe(11);
    expect(label.y + label.height).toBe(72 - 12);
    near(label.y - (iconBox.y + 24), 5);
    near(iconBox.x + 12, tab.x + tab.width / 2);
    near(label.x + label.width / 2, tab.x + tab.width / 2);
  });

  it('só rótulo ou só ícone ficam centrados na aba de 48 (placeTextOrIcon)', () => {
    const size = { width: W, height: 48 };
    const t = draw(
      'tabs',
      { items: textOnly, style: 'primary', iconPosition: 'top' },
      'light',
      size,
    );
    const label = textBox(t, 'Início');
    // o rótulo ocupa a altura da aba (fill) e o `cap-middle` centra a maiúscula (FX6)
    near(label.y, 0);
    expect(label.height).toBe(48);
    const i = draw(
      'tabs',
      { items: iconOnly, style: 'primary', iconPosition: 'top' },
      'light',
      size,
    );
    near(boxOf(i, iconsOf(i)[0]!.node).y, 12);
  });

  it('ícone à esquerda (LeadingIconTab): ícone, 8 e rótulo lado a lado, centrados na aba de 48', () => {
    const d = draw(
      'tabs',
      { items: THREE, style: 'primary', iconPosition: 'leading' },
      'light',
      {
        width: W,
        height: 48,
      },
    );
    const tab = boxesOf(d, 'aba')[0]!;
    const iconBox = boxOf(d, iconsOf(d)[0]!.node);
    const label = textBox(d, 'Início');
    near(iconBox.y, 12);
    near(label.y, 0);
    near(label.x - (iconBox.x + 24), 8);
    near((iconBox.x + label.x + label.width) / 2, tab.x + tab.width / 2);
    // o indicador cobre o ícone, o espaço e o texto
    const indicator = box(d, 'indicador primário');
    near(indicator.width, 24 + 8 + label.width);
    near(indicator.x, iconBox.x);
  });

  it('roláveis: recuo inicial de 52, abas com a largura do conteúdo (rótulo mais 2 vezes 16) e no mínimo 90', () => {
    const items = [
      { label: 'Início', icon: 'Home', selected: 'true' },
      { label: 'Configurações da conta', icon: 'Settings', selected: 'false' },
      { label: 'Perfil', icon: 'Person', selected: 'false' },
    ];
    const d = draw('tabs', { items, style: 'primary-scrollable', iconPosition: 'top' });
    const tabs = boxesOf(d, 'aba');
    expect(tabs).toHaveLength(3);
    near(tabs[0]!.x, 52);
    near(tabs[0]!.width, 90);
    near(tabs[1]!.x, 52 + 90);
    near(tabs[1]!.width, textBox(d, 'Configurações da conta').width + 32);
    near(tabs[2]!.width, 90);
    const indicator = box(d, 'indicador primário');
    near(indicator.x + indicator.width / 2, tabs[0]!.x + tabs[0]!.width / 2);
    near(indicator.width, textBox(d, 'Início').width);
  });

  it('rolável com ícone à esquerda: a aba mede 16 + ícone + 8 + rótulo + 16 e o indicador secundário ocupa a aba', () => {
    const d = draw(
      'tabs',
      { items: THREE, style: 'secondary-scrollable', iconPosition: 'leading' },
      'light',
      {
        width: W,
        height: 48,
      },
    );
    const tabs = boxesOf(d, 'aba');
    const label = textBox(d, 'Início');
    near(tabs[0]!.x, 52);
    near(tabs[0]!.width, Math.max(90, 16 + 24 + 8 + label.width + 16));
    const indicator = box(d, 'indicador secundário');
    near(indicator.x, tabs[0]!.x);
    near(indicator.width, tabs[0]!.width);
    expect(indicator.height).toBe(3);
  });
});

describe('M4 grupo C — list-item', () => {
  const H1 = 56; // ListItemOneLineContainerHeight
  const H2 = 72; // ListItemTwoLineContainerHeight
  const H3 = 88; // ListItemThreeLineContainerHeight
  const size = (height: number) => ({ width: W, height });

  it('uma linha em 56: título centrado, ícone inicial de 24 a 16 da borda e título a 16 do ícone', () => {
    const d = both(
      'list-item',
      { headlineContent: 'Wi-Fi', leadingIcon: 'Settings' },
      size(H1),
    );
    for (const mode of ['light', 'dark'] as const) {
      expect([d[mode].root.width, d[mode].root.height]).toEqual([W, H1]);
      expect(paintOf(d[mode].root)).toBe(tok('surface', mode));
      const icon = boxOf(d[mode], iconsOf(d[mode])[0]!.node);
      expect([icon.x, icon.y, icon.width, icon.height]).toEqual([16, 16, 24, 24]);
      const title = textBox(d[mode], 'Wi-Fi');
      expect(title.x).toBe(16 + 24 + 16);
      expect(title.height).toBe(24);
      expect(title.y).toBe((H1 - 24) / 2);
      expect(solid(title.node.fills)).toBe(tok('on-surface', mode));
      expect(iconsOf(d[mode])[0]!.color).toBe(tok('on-surface-variant', mode));
    }
  });

  it('título em body-large (16, linha 24, peso 400, espaçamento 0,5) pelos tokens', () => {
    const d = draw('list-item', { headlineContent: 'Título' }, 'light', size(H1));
    const style = textBox(d, 'Título').node.style;
    expect([
      style.fontSize,
      style.lineHeight,
      style.fontWeight,
      style.letterSpacing,
    ]).toEqual([16, 24, 400, 0.5]);
  });

  it('duas linhas em 72: título e apoio centrados juntos, apoio em body-medium e on-surface-variant, texto final em label-small', () => {
    const d = both(
      'list-item',
      {
        headlineContent: 'Ana Souza',
        supportingContent: 'Vamos almoçar?',
        trailingContent: '12:30',
        leadingImage: 'https://example.com/ana.jpg',
      },
      size(H2),
    );
    for (const mode of ['light', 'dark'] as const) {
      const top = (H2 - (24 + 20)) / 2;
      const title = textBox(d[mode], 'Ana Souza');
      const support = textBox(d[mode], 'Vamos almoçar?');
      near(title.y, top);
      near(support.y, top + 24);
      expect(title.x).toBe(16 + 40 + 16);
      expect(solid(support.node.fills)).toBe(tok('on-surface-variant', mode));
      expect([
        support.node.style.fontSize,
        support.node.style.lineHeight,
        support.node.style.fontWeight,
        support.node.style.letterSpacing,
      ]).toEqual([14, 20, 400, 0.2]);
      // avatar de 40, redondo, centrado na altura, a 16 da borda; sem imagem baixada vale o reservado em primary-container
      const avatar = box(d[mode], 'avatar');
      expect([avatar.x, avatar.y, avatar.width, avatar.height]).toEqual([16, 16, 40, 40]);
      // texto final à direita, 16 da borda, label-small em on-surface-variant e centrado
      const trailing = textBox(d[mode], '12:30');
      near(trailing.x + trailing.width, W - 16);
      near(trailing.y, (H2 - trailing.height) / 2);
      expect(solid(trailing.node.fills)).toBe(tok('on-surface-variant', mode));
      expect([
        trailing.node.style.fontSize,
        trailing.node.style.lineHeight,
        trailing.node.style.fontWeight,
        trailing.node.style.letterSpacing,
      ]).toEqual([11, 16, 500, 0.5]);
      // 16 entre o texto e o conteúdo final
      near(title.x + title.width + 16, trailing.x);
    }
  });

  it('três linhas em 88 (sobretítulo e apoio): tudo alinhado ao topo com 12 de respiro; ícones inicial e final no topo', () => {
    const d = both(
      'list-item',
      {
        overlineContent: 'Hoje',
        headlineContent: 'Reunião de planejamento',
        supportingContent: 'Sala 3, com a equipe de produto.',
        leadingIcon: 'Settings',
        trailingIcon: 'Info',
      },
      size(H3),
    );
    for (const mode of ['light', 'dark'] as const) {
      const overline = textBox(d[mode], 'Hoje');
      const title = textBox(d[mode], 'Reunião de planejamento');
      const support = textBox(d[mode], 'Sala 3, com a equipe de produto.');
      expect([overline.y, overline.height]).toEqual([12, 16]);
      expect([title.y, title.height]).toEqual([28, 24]);
      expect([support.y, support.height]).toEqual([52, 20]);
      expect(solid(overline.node.fills)).toBe(tok('on-surface-variant', mode));
      expect([
        overline.node.style.fontSize,
        overline.node.style.lineHeight,
        overline.node.style.fontWeight,
        overline.node.style.letterSpacing,
      ]).toEqual([11, 16, 500, 0.5]);
      const [lead, trail] = iconsOf(d[mode]).map((i) => boxOf(d[mode], i.node));
      expect([lead!.x, lead!.y]).toEqual([16, 12]);
      expect([trail!.x + trail!.width, trail!.y, trail!.width]).toEqual([W - 16, 12, 24]);
      expect(iconsOf(d[mode]).map((i) => i.color)).toEqual([
        tok('on-surface-variant', mode),
        tok('on-surface-variant', mode),
      ]);
    }
  });

  it('só sobretítulo e título (duas linhas) ficam centrados; o sobretítulo vem antes do título', () => {
    const d = draw(
      'list-item',
      { overlineContent: 'Hoje', headlineContent: 'Reunião' },
      'light',
      size(H2),
    );
    const overline = textBox(d, 'Hoje');
    const title = textBox(d, 'Reunião');
    near(overline.y, (H2 - 40) / 2);
    near(title.y, overline.y + 16);
  });

  it('título de uma linha só: texto longo é cortado com reticências, sem aviso de texto maior que a caixa', () => {
    const long =
      'Reunião de planejamento trimestral com toda a equipe de produto e engenharia da empresa'.repeat(
        2,
      );
    const d = draw(
      'list-item',
      { headlineContent: long, leadingIcon: 'Settings' },
      'light',
      size(H1),
    );
    const title = textBox(d, long);
    expect(title.node.style).toMatchObject({ maxLines: 1, ellipsis: true });
    expect(title.height).toBe(24);
    expect(d.warnings.filter((w) => /texto maior que a caixa|não cabe/.test(w))).toEqual(
      [],
    );
  });

  it('sobretítulo de uma linha; apoio de uma linha com sobretítulo e de até duas sem ele, com reticências', () => {
    const long =
      'Apoio muito longo que não cabe numa linha da lista e precisa terminar com reticências no final do texto. '.repeat(
        3,
      );
    const withOverline = draw(
      'list-item',
      { overlineContent: 'Hoje', headlineContent: 'Título', supportingContent: long },
      'light',
      size(H3),
    );
    expect(textBox(withOverline, long).node.style).toMatchObject({
      maxLines: 1,
      ellipsis: true,
    });
    expect(textBox(withOverline, 'Hoje').node.style).toMatchObject({
      maxLines: 1,
      ellipsis: true,
    });
    const alone = draw(
      'list-item',
      { headlineContent: 'Título', supportingContent: long },
      'light',
      size(H3),
    );
    const support = textBox(alone, long);
    expect(support.node.style).toMatchObject({ maxLines: 2, ellipsis: true });
    expect(support.height).toBe(40);
    expect(
      alone.warnings.filter((w) => /texto maior que a caixa|não cabe/.test(w)),
    ).toEqual([]);
  });

  it('o ícone inicial e o final usam o nó icon do conjunto (sem caminho SVG repetido) e o nome fora do conjunto não passa em silêncio', () => {
    const raw = files.find((f) => f.path === 'components/list-item.json')!.text!;
    expect(raw).toContain('"type": "icon"');
    expect(raw).not.toMatch(/"M\d[^"]{40,}"/);
  });

  it('sem retângulo a altura é a do tipo, no mínimo: 56 com uma linha, 72 com duas e 88 com três', () => {
    const entry = entryOf('list-item');
    const library = catalog.library!;
    const options = {
      measure: approximateMeasurer,
      tokens: resolveTokens(library.tokens, {}, 'light'),
      icons: library.icons!,
    };
    const height = (values: Values) =>
      measureComponent(
        entry.component!,
        { ...defaultValues(entry.type), ...values },
        { width: W, height: null },
        options,
      ).height;
    expect(height({ headlineContent: 'Wi-Fi', leadingIcon: 'Settings' })).toBe(H1);
    expect(height({ headlineContent: 'Ana', supportingContent: 'Vamos almoçar?' })).toBe(
      H2,
    );
    expect(height({ overlineContent: 'Hoje', headlineContent: 'Ana' })).toBe(H2);
    expect(
      height({
        overlineContent: 'Hoje',
        headlineContent: 'Ana',
        supportingContent: 'Sala 3',
      }),
    ).toBe(H3);
    // o avatar de 40 não passa dos 56 (8 de respiro em cima e embaixo, 40 + 16)
    expect(
      height({ headlineContent: 'Ana', leadingImage: 'https://example.com/a.jpg' }),
    ).toBe(H1);
  });

  it('avatar de 40 com CornerFull e placeholder primary-container (ListItemLeadingAvatarSize, Color e Shape)', () => {
    const d = both(
      'list-item',
      { headlineContent: 'Ana', leadingImage: 'https://example.com/a.jpg' },
      size(H1),
    );
    for (const mode of ['light', 'dark'] as const) {
      const avatar = box(d[mode], 'avatar');
      expect([avatar.width, avatar.height]).toEqual([40, 40]);
      expect(paintOf(avatar.node)).toBe(tok('primary-container', mode));
      expect('cornerRadius' in avatar.node && avatar.node.cornerRadius).toBe(
        tokens['corner-full'],
      );
    }
  });
});

describe('M4 grupo C — o padrão e os exemplos desenham sem aviso', () => {
  const BAD =
    /não cabe|texto maior que a caixa|conteúdo maior que a caixa|ícone desconhecido|ícone esticado|token inexistente|token desconhecido|campo não informado/i;
  it.each(['tabs', 'list-item'])('%s: preview e exemplos, em light e dark', (id) => {
    const entry = entryOf(id);
    const preview = entry.component!.preview ?? {};
    const cases = [{}, ...(entry.examples ?? []).map((e) => e.values ?? {})];
    for (const mode of ['light', 'dark'] as const) {
      for (const values of cases) {
        const d = draw(id, { ...preview, ...values } as Values, mode);
        expect(d.warnings.filter((w) => BAD.test(w))).toEqual([]);
      }
    }
  });
});
