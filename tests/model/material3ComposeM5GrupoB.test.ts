// M5 da etapa "Material 3 fiel", grupo B: tooltip, carousel, pull-to-refresh e swipe-to-dismiss contra o
// que `Tooltip.kt`, `Carousel.kt`, `PullToRefresh.kt`, `SwipeToDismissBox.kt`, `ListItem.kt` e os arquivos
// de tokens fixam no commit 5113b82a. As cores esperadas saem dos tokens da especialização (light e dark);
// a geometria, das constantes do Compose (dp = px do componente).
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import { resolveTokens } from '../../src/model/components/tokens';
import { defaultValues } from '../../src/model/libraryDrawing';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import type { PathNode, SceneNode, TextNode } from '../../src/model/components/scene';
import { drawIn, files, solid, spec, text } from '../support/material3Library';

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
const absOf = (d: Drawing, node: SceneNode) => absoluteBoxes(d.root).get(node.id)!;
const box = (d: Drawing, name: string) => {
  const node = named(d, name);
  if (node === undefined) throw new Error(`nó ausente: ${name}`);
  return { node, ...absOf(d, node) };
};
const fillOf = (d: Drawing, name: string): string | undefined =>
  solid(named(d, name)?.fills ?? []);
const radiusOf = (node: SceneNode | undefined) =>
  node !== undefined && 'cornerRadius' in node ? node.cornerRadius : undefined;
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
const numbers = (d: string): number[] =>
  [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));

describe('M5 grupo B — tooltip', () => {
  const rich = (extra: Record<string, unknown> = {}): Values =>
    ({ style: 'rich', text: 'Desliga o Wi-Fi.', ...extra }) as unknown as Values;

  it('plain: pílula de 24 em inverse-surface com forma extra-small, padding 8 × 4 e texto body-small em inverse-on-surface', () => {
    for (const mode of MODES) {
      const d = both('tooltip', { style: 'plain', text: 'Adicionar aos favoritos' })[
        mode
      ];
      const plain = box(d, 'plain');
      expect([plain.x, plain.y, plain.height]).toEqual([0, 0, 24]);
      expect(radiusOf(plain.node)).toBe(num('corner-extra-small'));
      expect(fillOf(d, 'plain')).toBe(tok('inverse-surface', mode));
      const label = textIn(d, 'plain')!;
      expect(fontOf(label)).toEqual(scale('body-small'));
      expect(solid(label.fills)).toBe(tok('inverse-on-surface', mode));
      const at = absOf(d, label);
      expect([at.x, at.y]).toEqual([8, 4]);
      expect(plain.width).toBe(8 + at.width + 8);
      expect(named(d, 'rich')).toBeUndefined();
    }
  });

  it('plain: largura mínima 40 (TooltipMinWidth) e máxima 200 (plainTooltipMaxWidth), com o texto quebrando em linhas de 16', () => {
    const short = drawBox('tooltip', { style: 'plain', text: 'Ok' }, 400, 100);
    expect(box(short, 'plain').width).toBe(40);
    expect(box(short, 'plain').height).toBe(24);
    const long = drawBox(
      'tooltip',
      {
        style: 'plain',
        text: 'Um texto de dica bem comprido que precisa quebrar em mais de uma linha dentro do tooltip',
      },
      400,
      100,
    );
    const plain = box(long, 'plain');
    expect(plain.width).toBe(200);
    expect((plain.height - 8) % 16).toBe(0);
    expect(plain.height).toBeGreaterThan(24);
    expect(textIn(long, 'plain')!.width).toBe(200 - 16);
  });

  it('rich: surface-container, forma medium (12), sombra do nível 2 e largura máxima 320 (richTooltipMaxWidth)', () => {
    for (const mode of MODES) {
      const d = drawBox('tooltip', rich(), 400, 200, mode);
      const card = box(d, 'rich');
      expect(radiusOf(card.node)).toBe(num('corner-medium'));
      expect(fillOf(d, 'rich')).toBe(tok('surface-container', mode));
      expect(card.node.effects[0]?.blur).toBe(num('elevation-2-blur'));
      expect(card.node.effects[0]?.offset.y).toBe(num('elevation-2-y'));
      expect(card.node.effects[0]?.color).toBe(tok('elevation-shadow', mode));
      expect(card.width).toBe(320);
      expect(named(d, 'plain')).toBeUndefined();
    }
    expect(box(drawBox('tooltip', rich(), 240, 200), 'rich').width).toBe(240);
  });

  it('rich só com texto: padding vertical 4 e horizontal 16, body-medium em on-surface-variant', () => {
    for (const mode of MODES) {
      const d = drawBox('tooltip', rich(), 240, 200, mode);
      expect(box(d, 'rich').height).toBe(4 + 20 + 4);
      const body = textIn(d, 'texto')!;
      expect(fontOf(body)).toEqual(scale('body-medium'));
      expect(solid(body.fills)).toBe(tok('on-surface-variant', mode));
      expect([absOf(d, body).x, absOf(d, body).y]).toEqual([16, 4]);
    }
  });

  it('rich com título: primeira linha de base a 28 do topo (HeightToSubheadFirstLine), texto 24 abaixo da base do título e 16 de fundo', () => {
    for (const mode of MODES) {
      const d = drawBox('tooltip', rich({ title: 'Modo avião' }), 240, 200, mode);
      const title = textIn(d, 'título')!;
      expect(fontOf(title)).toEqual(scale('title-small'));
      expect(solid(title.fills)).toBe(tok('on-surface-variant', mode));
      // 28 menos a linha de base do Roboto 14/20 (15)
      expect([absOf(d, title).x, absOf(d, title).y]).toEqual([16, 13]);
      // base do título (13 + 15) + 24 (HeightFromSubheadToTextFirstLine) - 15
      expect(absOf(d, textIn(d, 'texto')!).y).toBe(37);
      // 13 + 20 + 4 + 20 + 16 (TextBottomPadding)
      expect(box(d, 'rich').height).toBe(73);
    }
  });

  it('rich com ação: TextButton de 40 com label-large em primary, 12 de respiro, a 16 do texto e 8 do fundo', () => {
    for (const mode of MODES) {
      const d = drawBox(
        'tooltip',
        rich({ title: 'Sincronização', action: 'Saiba mais' }),
        240,
        200,
        mode,
      );
      const button = box(d, 'botão da ação');
      expect([button.x, button.y, button.height]).toEqual([16, 73, 40]);
      const label = textIn(d, 'botão da ação')!;
      expect(fontOf(label)).toEqual(scale('label-large'));
      expect(solid(label.fills)).toBe(tok('primary', mode));
      expect(absOf(d, label).x).toBe(16 + 12);
      expect(button.width).toBe(12 + absOf(d, label).width + 12);
      // 73 + 40 + ActionLabelBottomPadding (8)
      expect(box(d, 'rich').height).toBe(121);
    }
  });

  it('rich com ação e sem título: texto com a base a 24 do topo (9) e a ação 16 abaixo', () => {
    const d = drawBox('tooltip', rich({ action: 'Saiba mais' }), 240, 200);
    expect(absOf(d, textIn(d, 'texto')!).y).toBe(9);
    expect(box(d, 'botão da ação').y).toBe(9 + 20 + 16);
    expect(box(d, 'rich').height).toBe(9 + 20 + 16 + 40 + 8);
  });

  it('o padrão e os exemplos mantêm o minSize 40 × 24 e desenham sem aviso de corte', () => {
    expect(entryOf('tooltip').component!.minSize).toEqual({ width: 40, height: 24 });
    for (const mode of MODES) {
      const d = both('tooltip', {})[mode];
      expect(d.warnings.filter((w) => /não cabe|maior que a caixa/.test(w))).toEqual([]);
    }
  });
});

describe('M5 grupo B — pull-to-refresh', () => {
  /** Ponto do círculo de raio 6,75 (ArcRadius 5,5 + StrokeWidth 2,5 / 2) no ângulo do Compose (0 = 3h, horário). */
  const R = 6.75;
  const at = (deg: number, c: number) => [
    c + R * Math.cos((deg * Math.PI) / 180),
    c + R * Math.sin((deg * Math.PI) / 180),
  ];
  const close = (got: number[], want: number[]) =>
    want.forEach((v, i) => expect(got[i]!).toBeCloseTo(v, 1));

  it('indicador de 40 (SpinnerContainerSize), círculo em surface-container-high com sombra do nível 2, centrado no topo e a 40 (80 do limiar - 40)', () => {
    for (const mode of MODES) {
      for (const isRefreshing of ['true', 'false']) {
        const d = both('pull-to-refresh', { isRefreshing })[mode];
        const name =
          isRefreshing === 'true' ? 'indicador atualizando' : 'indicador puxando';
        const other =
          isRefreshing === 'true' ? 'indicador puxando' : 'indicador atualizando';
        const ind = box(d, name);
        expect([ind.x, ind.y, ind.width, ind.height]).toEqual([
          (360 - 40) / 2,
          40,
          40,
          40,
        ]);
        expect(radiusOf(ind.node)).toBe(num('corner-full'));
        expect(fillOf(d, name)).toBe(tok('surface-container-high', mode));
        expect(ind.node.effects[0]?.blur).toBe(num('elevation-2-blur'));
        expect(ind.node.effects[0]?.offset.y).toBe(num('elevation-2-y'));
        expect(ind.node.effects[0]?.color).toBe(tok('elevation-shadow', mode));
        expect(named(d, other)).toBeUndefined();
      }
    }
  });

  it('atualizando: spinner de 16 com traço de 2,5 de ponta redonda em on-surface-variant, raio 6,75 e arco das 12h até a metade do curso', () => {
    for (const mode of MODES) {
      const d = both('pull-to-refresh', { isRefreshing: 'true' })[mode];
      const ring = named(d, 'anel') as PathNode;
      expect(ring.stroke).toMatchObject({ width: 2.5, cap: 'round' });
      expect(solid(ring.stroke!.paints)).toBe(tok('on-surface-variant', mode));
      expect(ring.fills).toEqual([]);
      const holder = box(d, 'indicador atualizando');
      const at24 = absOf(d, ring);
      // 24 de caixa com o círculo de 16 no meio: o desenho cobre os 16 do SpinnerSize
      expect([at24.width, at24.height]).toEqual([24, 24]);
      expect([at24.x - holder.x, at24.y - holder.y]).toEqual([8, 8]);
      const n = numbers(ring.d);
      // M12 5.25 A6.75 6.75 0 0 1 x y: das 12h (270°) com o raio 6,75 do centro (12, 12)
      close([n[0]!, n[1]!], at(270, 12));
      expect([n[2], n[3]]).toEqual([R, R]);
      // (0,1 + 0,87) / 2 de volta: CircularIndeterminateMinProgress e MaxProgress
      const sweep = ((0.1 + 0.87) / 2) * 360;
      close([n[7]!, n[8]!], at(270 + sweep, 12));
      expect([n[5], n[6]]).toEqual([0, 1]);
    }
  });

  it('puxando: arco de 27° a 315° com ponta reta e a seta de 10 × 5 em traço de 2,5, no raio 6,75 e em on-surface-variant', () => {
    for (const mode of MODES) {
      const d = both('pull-to-refresh', { isRefreshing: 'false' })[mode];
      const ring = named(d, 'anel') as PathNode;
      const arrow = named(d, 'seta') as PathNode;
      for (const part of [ring, arrow]) {
        expect(part.stroke).toMatchObject({ width: 2.5, cap: 'butt' });
        expect(solid(part.stroke!.paints)).toBe(tok('on-surface-variant', mode));
        expect(part.fills).toEqual([]);
      }
      expect(arrow.stroke).toMatchObject({ join: 'miter' });
      // progress = 1: adjustedPercent 1, endTrim 0,8, rotation 0,075 volta: start 27°, end 315° (288° de varredura)
      const n = numbers(ring.d);
      close([n[0]!, n[1]!], at(27, 12));
      expect([n[2], n[3], n[5], n[6]]).toEqual([R, R, 1, 1]);
      close([n[7]!, n[8]!], at(315, 12));
      // seta: (0,0) (5,5) (10,0) levada ao fim do arco e girada em endAngle - strokeWidth (312,5°) em torno do centro
      const pts = numbers(arrow.d);
      expect(pts).toHaveLength(6);
      const rotate = (x: number, y: number) => {
        const a = (312.5 * Math.PI) / 180;
        const dx = x - 8;
        const dy = y - 8;
        return [
          4 + 8 + dx * Math.cos(a) - dy * Math.sin(a),
          4 + 8 + dx * Math.sin(a) + dy * Math.cos(a),
        ];
      };
      const want = [rotate(9.75, 5.5), rotate(14.75, 10.5), rotate(19.75, 5.5)].flat();
      close(pts, want);
    }
  });

  it('o conteúdo continua sendo o slot e o fundo é surface', () => {
    for (const mode of MODES) {
      const d = both('pull-to-refresh', {})[mode];
      expect(d.root.fills[0]).toMatchObject({ color: tok('surface', mode) });
      expect(text('components/pull-to-refresh.json')).toContain('"type": "slot"');
    }
  });
});

describe('M5 grupo B — swipe-to-dismiss', () => {
  /** O ícone do fundo: o nó `icon` não tem nome de nó, então é o único caminho visível do desenho. */
  const backdropIcon = (d: Drawing) => {
    const paths = [...walk(d.root)].filter(
      (n): n is PathNode => n.type === 'path' && n.visible,
    );
    return paths.length === 1
      ? { path: paths[0]!, color: solid(paths[0]!.fills), box: absOf(d, paths[0]!) }
      : undefined;
  };
  const item = (extra: Record<string, unknown> = {}): Values =>
    ({
      title: 'Reunião de equipe',
      supportingText: 'Hoje, 14:00',
      icon: 'Delete',
      ...extra,
    }) as unknown as Values;

  it('em repouso: item de ListItem em surface, título body-large em on-surface e apoio body-medium em on-surface-variant, com 16 de respiro', () => {
    for (const mode of MODES) {
      const d = both('swipe-to-dismiss', item({ direction: 'Settled' }))[mode];
      const row = box(d, 'item em repouso');
      expect([row.x, row.y, row.width, row.height]).toEqual([0, 0, 360, 72]);
      expect(fillOf(d, 'item em repouso')).toBe(tok('surface', mode));
      const title = textIn(d, 'título')!;
      const support = textIn(d, 'apoio')!;
      expect(fontOf(title)).toEqual(scale('body-large'));
      expect(fontOf(support)).toEqual(scale('body-medium'));
      expect(solid(title.fills)).toBe(tok('on-surface', mode));
      expect(solid(support.fills)).toBe(tok('on-surface-variant', mode));
      expect(absOf(d, title).x).toBe(16);
      // 24 + 20 centrados em 72
      expect(absOf(d, title).y).toBe(14);
      expect(title.style).toMatchObject({ maxLines: 1, ellipsis: true });
      expect(support.style).toMatchObject({ maxLines: 1, ellipsis: true });
      expect(backdropIcon(d)).toBeUndefined();
    }
  });

  it('EndToStart: o item sai 56 (positionalThreshold) para o início e revela error-container com o ícone de 24 a 24 do fim em on-error-container', () => {
    for (const mode of MODES) {
      const d = both('swipe-to-dismiss', item({ direction: 'EndToStart' }))[mode];
      expect(d.root.fills[0]).toMatchObject({ color: tok('error-container', mode) });
      const moved = box(d, 'item deslizado para o início');
      expect([moved.x, moved.width]).toEqual([-56, 360]);
      expect(fillOf(d, 'item deslizado para o início')).toBe(tok('surface', mode));
      const icon = backdropIcon(d)!;
      expect(icon.color).toBe(tok('on-error-container', mode));
      expect([icon.box.width, icon.box.height]).toEqual([24, 24]);
      expect([360 - (icon.box.x + icon.box.width), icon.box.y]).toEqual([24, 24]);
      expect(named(d, 'item em repouso')).toBeUndefined();
    }
  });

  it('StartToEnd: o item sai 56 para o fim e revela primary-container com o ícone a 24 do início em on-primary-container', () => {
    for (const mode of MODES) {
      const d = both('swipe-to-dismiss', item({ direction: 'StartToEnd', icon: 'Done' }))[
        mode
      ];
      expect(d.root.fills[0]).toMatchObject({ color: tok('primary-container', mode) });
      const moved = box(d, 'item deslizado para o fim');
      expect([moved.x, moved.width]).toEqual([56, 360]);
      const icon = backdropIcon(d)!;
      expect(icon.color).toBe(tok('on-primary-container', mode));
      expect([icon.box.x, icon.box.y, icon.box.width]).toEqual([24, 24, 24]);
    }
  });

  it('sentido desligado volta ao repouso, sobre surface', () => {
    for (const mode of MODES) {
      const d = both(
        'swipe-to-dismiss',
        item({ direction: 'EndToStart', enableDismissFromEndToStart: 'false' }),
      )[mode];
      expect(named(d, 'item em repouso')).toBeDefined();
      expect(named(d, 'item deslizado para o início')).toBeUndefined();
      expect(d.root.fills[0]).toMatchObject({ color: tok('surface', mode) });
    }
  });

  it('ícone do conjunto: Delete é o padrão do campo vazio, cada nome desenha o seu e o desconhecido avisa', () => {
    const base = item({ direction: 'EndToStart' });
    const del = backdropIcon(both('swipe-to-dismiss', base).light)!.path.d;
    const empty = both(
      'swipe-to-dismiss',
      item({ direction: 'EndToStart', icon: '' }),
    ).light;
    expect(backdropIcon(empty)!.path.d).toBe(del);
    expect(empty.warnings.filter((w) => /ícone desconhecido/.test(w))).toEqual([]);
    const star = both(
      'swipe-to-dismiss',
      item({ direction: 'EndToStart', icon: 'Star' }),
    ).light;
    expect(backdropIcon(star)!.path.d).not.toBe(del);
    const bad = both(
      'swipe-to-dismiss',
      item({ direction: 'EndToStart', icon: 'Nao-existe' }),
    ).light;
    expect(bad.warnings.some((w) => /ícone desconhecido/.test(w))).toBe(true);
  });

  it('o recorte da caixa esconde o que sai dela', () => {
    expect(
      (
        both('swipe-to-dismiss', item({ direction: 'EndToStart' })).light.root as {
          clip: boolean;
        }
      ).clip,
    ).toBe(true);
  });
});

describe('M5 grupo B — carousel', () => {
  const items = (n: number, label = true) =>
    Array.from({ length: n }, (_, i) => ({
      image: `https://example.com/${i}.jpg`,
      label: label ? `Item ${i}` : '',
    }));
  const withItems = (extra: Record<string, unknown>, n = 3): Values =>
    ({ items: items(n), ...extra }) as unknown as Values;
  const itemsOf = (d: Drawing): SceneNode[] =>
    [...walk(d.root)].filter((n) => n.name === 'item' && n.visible);

  it('itens com canto 28 (MaterialTheme.shapes.extraLarge, maskClip), recortados, com o reservado da imagem em surface-container-highest', () => {
    for (const mode of MODES) {
      const d = both('carousel', withItems({ style: 'multi-browse' }))[mode];
      const [first] = itemsOf(d);
      expect(radiusOf(first)).toBe(num('corner-extra-large'));
      expect((first as { clip: boolean }).clip).toBe(true);
      const image = named(d, 'imagem')!;
      expect(solid(image.fills)).toBe(tok('surface-container-highest', mode));
    }
  });

  it('multi-browse: largura do item é a preferredItemWidth, com itemSpacing entre eles', () => {
    for (const mode of MODES) {
      const d = both(
        'carousel',
        withItems({ style: 'multi-browse', preferredItemWidth: 150, itemSpacing: 12 }),
      )[mode];
      const boxes = itemsOf(d).map((n) => absOf(d, n));
      expect(boxes.map((b) => b.width)).toEqual([150, 150, 150]);
      expect(boxes.map((b) => b.x)).toEqual([0, 162, 324]);
      expect(boxes[0]!.height).toBe(205);
    }
  });

  it('uncontained: largura do item é o itemWidth, a partir da borda', () => {
    const d = both(
      'carousel',
      withItems({ style: 'uncontained', itemWidth: 140, itemSpacing: 12 }),
    ).light;
    expect(itemsOf(d).map((n) => absOf(d, n).x)).toEqual([0, 152, 304]);
    expect(itemsOf(d).map((n) => absOf(d, n).width)).toEqual([140, 140, 140]);
  });

  it('centered-hero: item grande de 232 (360 - 2 x 56 de itens pequenos - 2 x 8) com o espaço do item pequeno antes do primeiro (56 + 8)', () => {
    const d = both(
      'carousel',
      withItems({ style: 'centered-hero', itemSpacing: 8 }),
    ).light;
    const boxes = itemsOf(d).map((n) => absOf(d, n));
    expect(boxes[0]!.width).toBe(360 - 2 * 56 - 2 * 8);
    expect(boxes[0]!.x).toBe(56 + 8);
    expect(boxes[1]!.x).toBe(56 + 8 + 232 + 8);
  });

  it('rótulo sobre o item: label-large em cor fixa nos dois modos, sobre o véu de scrim a 0,32 (ScrimTokens.ContainerOpacity)', () => {
    const light = both('carousel', withItems({ style: 'multi-browse' })).light;
    const dark = both('carousel', withItems({ style: 'multi-browse' })).dark;
    for (const [mode, d] of [
      ['light', light],
      ['dark', dark],
    ] as const) {
      const label = textIn(d, 'item')!;
      expect(label.text).toBe('Item 0');
      expect(fontOf(label)).toEqual(scale('label-large'));
      expect(solid(label.fills)).toBe(tok('secondary-fixed', mode));
      expect(label.style).toMatchObject({ maxLines: 1, ellipsis: true });
      const veil = named(d, 'véu')!;
      expect(solid(veil.fills)).toBe(tok('scrim', mode));
      expect(veil.opacity).toBe(0.32);
    }
    expect(tok('secondary-fixed', 'light')).toBe(tok('secondary-fixed', 'dark'));
    const bare = both('carousel', {
      items: items(2, false),
      style: 'multi-browse',
    } as Values).light;
    expect(named(bare, 'véu')).toBeUndefined();
  });
});
