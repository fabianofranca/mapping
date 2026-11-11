// M5 da etapa "Material 3 fiel", grupo A: alert-dialog, bottom-sheet e snackbar contra o que
// `AlertDialog.kt`, `ModalBottomSheet.kt`, `BottomSheetScaffold.kt`, `SheetDefaults.kt`, `Snackbar.kt` e os
// arquivos de tokens (`DialogTokens`, `SheetBottomTokens`, `SnackbarTokens`, `ElevationTokens`) fixam no
// commit 5113b82a. As cores esperadas saem dos tokens da especialização (light e dark); a geometria, das
// constantes do Compose (dp = px do componente).
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import {
  approximateMeasurer,
  instantiate,
  measureComponent,
} from '../../src/model/components/instantiate';
import { resolveTokens } from '../../src/model/components/tokens';
import { defaultValues } from '../../src/model/libraryDrawing';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import type {
  PathNode,
  SceneNode,
  Shadow,
  TextNode,
} from '../../src/model/components/scene';
import { files, solid, spec } from '../support/material3Library';

const catalog = buildCatalog(files);
const entryOf = (id: string) => findEntry(catalog, id)!;
type Values = Record<string, unknown>;
type Mode = 'light' | 'dark';
type Drawing = ReturnType<typeof instantiate>;
const MODES: Mode[] = ['light', 'dark'];

const optionsOf = (mode: Mode) => {
  const library = catalog.library!;
  return {
    measure: approximateMeasurer,
    tokens: resolveTokens(library.tokens, {}, mode),
    ...(library.icons === undefined ? {} : { icons: library.icons }),
  };
};
const valuesOf = (id: string, values: Values) =>
  ({ ...defaultValues(entryOf(id).type), ...values }) as Parameters<
    typeof instantiate
  >[1];

/** Desenha numa caixa que não é a do `size` (a marcação tem o retângulo que a pessoa desenhou). */
function drawBox(
  id: string,
  values: Values,
  width: number,
  height: number,
  mode: Mode = 'light',
): Drawing {
  return instantiate(
    entryOf(id).component!,
    valuesOf(id, values),
    { x: 0, y: 0, width, height },
    optionsOf(mode),
  );
}
/** Altura que o componente abraça (`hug`) na largura dada. */
const hugHeight = (id: string, values: Values, width: number): number =>
  measureComponent(
    entryOf(id).component!,
    valuesOf(id, values),
    { width, height: null },
    optionsOf('light'),
  ).height;
/** Largura que o componente abraça com a altura livre (sem retângulo). */
const hugWidth = (id: string, values: Values): number =>
  measureComponent(
    entryOf(id).component!,
    valuesOf(id, values),
    { width: null, height: null },
    optionsOf('light'),
  ).width;
/** Desenha na altura que o componente abraça. */
const drawHug = (id: string, values: Values, width: number, mode: Mode = 'light') =>
  drawBox(id, values, width, hugHeight(id, values, width), mode);

const tokens = spec.tokens!.values as Record<string, unknown>;
/** Valor do token da especialização no modo (cor). */
const tok = (name: string, mode: Mode): string => {
  const value = tokens[name] as string | Record<Mode, string>;
  return typeof value === 'string' ? value : value[mode];
};
const num = (name: string): number => tokens[name] as number;
/** Confere as duas sombras do nível de elevação (ponto e ambiente): y, blur, spread e cor dos tokens. */
const expectElevation = (
  effects: readonly Shadow[],
  level: number,
  mode: Mode,
  where = '',
): void => {
  expect(effects, where).toHaveLength(2);
  for (const [i, kind] of (['point', 'ambient'] as const).entries()) {
    const shadow = effects[i];
    expect(shadow?.offset.y, `${where} ${kind}`).toBe(
      num(`elevation-${level}-${kind}-y`),
    );
    expect(shadow?.blur, `${where} ${kind}`).toBe(num(`elevation-${level}-${kind}-blur`));
    expect(shadow?.spread ?? 0, `${where} ${kind}`).toBe(
      num(`elevation-${level}-${kind}-spread`),
    );
    expect(shadow?.color, `${where} ${kind}`).toBe(tok(`elevation-${kind}-shadow`, mode));
  }
};

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
/** O ícone desenhado dentro do nó `name`: o `PathNode`, a caixa dele e a cor. */
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
const radiusOf = (node: SceneNode) =>
  'cornerRadius' in node ? node.cornerRadius : undefined;
const BAD_WARNING = /ícone desconhecido|não cabe|texto maior que a caixa|ícone esticado/;

describe('M5 grupo A — alert-dialog', () => {
  const WIDTH = 312;
  const full: Values = {
    icon: 'Delete',
    title: 'Descartar rascunho?',
    text: 'Seus dados estão salvos.',
    confirmButton: 'Descartar',
    dismissButton: 'Cancelar',
  };
  const dialog = (extra: Values = {}, mode: Mode = 'light') =>
    drawHug('alert-dialog', { ...full, ...extra }, WIDTH, mode);

  it('contêiner em surface-container-high com a forma extra-large (28), sem sombra e com 24 de margem', () => {
    for (const mode of MODES) {
      const d = dialog({}, mode);
      expect(fillOf(d, 'diálogo')).toBe(tok('surface-container-high', mode));
      expect(radiusOf(d.root)).toBe(num('corner-extra-large'));
      expect(num('corner-extra-large')).toBe(28);
      // AlertDialogDefaults.TonalElevation é 0 e o Surface não tem shadowElevation
      expect(d.root.effects).toEqual([]);
      expect(d.root.width).toBe(WIDTH);
      const icon = box(d, 'ícone');
      expect([icon.x, icon.y]).toEqual([24, 24]);
      expect(d.warnings.filter((w) => BAD_WARNING.test(w))).toEqual([]);
    }
  });

  it('altura abraça o conteúdo: 24 + ícone 24 + 16 + título 32 + 16 + texto 20 + 24 + botões 48 + 24', () => {
    expect(hugHeight('alert-dialog', full, WIDTH)).toBe(
      24 + (24 + 16) + (32 + 16) + (20 + 24) + 48 + 24,
    );
    // sem ícone, sem título e sem texto sobram a margem e a linha dos botões
    expect(hugHeight('alert-dialog', { confirmButton: 'OK' }, WIDTH)).toBe(24 + 48 + 24);
  });

  it('ícone de 24 centralizado, em secondary (DialogTokens.IconColor), com 16 até o título', () => {
    for (const mode of MODES) {
      const d = dialog({}, mode);
      const icon = iconIn(d, 'ícone')!;
      expect([icon.box.width, icon.box.height]).toEqual([24, 24]);
      expect(icon.box.x).toBe((WIDTH - 24) / 2);
      expect(icon.color).toBe(tok('secondary', mode));
      expect(box(d, 'título').y).toBe(24 + 24 + 16);
    }
  });

  it('título em headline-small (24/32/400/0) on-surface, centrado com ícone e à esquerda sem ele', () => {
    for (const mode of MODES) {
      const withIcon = dialog({}, mode);
      const title = textIn(withIcon, 'título')!;
      expect(fontOf(title)).toEqual(scale('headline-small'));
      expect(solid(title.fills)).toBe(tok('on-surface', mode));
      expect(title.style.align).toBe('center');
      const bare = dialog({ icon: '' }, mode);
      expect(textIn(bare, 'título')!.style.align).toBe('left');
      expect(named(bare, 'ícone')).toBeUndefined();
      expect(box(bare, 'título').y).toBe(24);
      expect(absOf(bare, textIn(bare, 'título')!).x).toBe(24);
    }
  });

  it('texto em body-medium (14/20) on-surface-variant, a 16 do título', () => {
    for (const mode of MODES) {
      const d = dialog({}, mode);
      const text = textIn(d, 'texto')!;
      expect(fontOf(text)).toEqual(scale('body-medium'));
      expect(solid(text.fills)).toBe(tok('on-surface-variant', mode));
      expect(box(d, 'texto').y).toBe(box(d, 'título').y + 32 + 16);
      expect(text.style.align).not.toBe('center');
    }
  });

  it('botões de texto à direita, label-large em primary, 8 entre eles e 24 do fundo', () => {
    for (const mode of MODES) {
      const d = dialog({}, mode);
      const confirm = box(d, 'confirmar');
      const dismiss = box(d, 'dispensar');
      for (const [name, label] of [
        ['confirmar', 'Descartar'],
        ['dispensar', 'Cancelar'],
      ] as const) {
        const text = textIn(d, name)!;
        expect(text.text).toBe(label);
        expect(fontOf(text)).toEqual(scale('label-large'));
        expect(solid(text.fills)).toBe(tok('primary', mode));
      }
      // o confirmar encosta na margem de 24; o dispensar vem antes, com 8 de folga
      expect(confirm.x + confirm.width).toBe(WIDTH - 24);
      expect(dismiss.x + dismiss.width + 8).toBe(confirm.x);
      // TextButton: 12 de cada lado e 40 de altura (ButtonDefaults.MinHeight)
      expect(absOf(d, textIn(d, 'confirmar')!).x - confirm.x).toBe(12);
      expect(confirm.height).toBe(40);
      // a linha mede 48 (minimumInteractiveComponentSize, ME2 da etapa Material 3 com estados); o botão fica com 40, centrado
      expect(box(d, 'botões').height).toBe(48);
      expect(box(d, 'botões').y + 48 + 24).toBe(d.root.height);
    }
  });

  it('botão curto mede 58 no mínimo (ButtonDefaults.MinWidth) e sem dispensar só há o confirmar', () => {
    const d = dialog({ confirmButton: 'OK', dismissButton: '' });
    expect(box(d, 'confirmar').width).toBe(58);
    expect(named(d, 'dispensar')).toBeUndefined();
    expect(box(d, 'confirmar').x + 58).toBe(WIDTH - 24);
  });

  it('largura sem retângulo vai de 280 a 560 (DialogMinWidth e DialogMaxWidth)', () => {
    expect(hugWidth('alert-dialog', { confirmButton: 'OK' })).toBe(280);
    expect(
      hugWidth('alert-dialog', {
        title: 'x'.repeat(200),
        confirmButton: 'OK',
      }),
    ).toBe(560);
  });

  it('o ícone fora do conjunto cai no reservado e avisa; os exemplos desenham limpos', () => {
    const bad = dialog({ icon: 'Nao-existe' });
    expect(bad.warnings.some((w) => /ícone desconhecido/.test(w))).toBe(true);
    const home = dialog({ icon: 'Home' });
    expect(home.warnings.filter((w) => BAD_WARNING.test(w))).toEqual([]);
    expect(iconIn(home, 'ícone')!.path.d).not.toBe(
      iconIn(dialog({ icon: 'Delete' }), 'ícone')!.path.d,
    );
  });
});

describe('M5 grupo A — bottom-sheet', () => {
  const WIDTH = 412;
  const items = [
    { label: 'Favoritos', icon: 'Favorite' },
    { label: 'Editar', icon: 'Edit' },
    { label: 'Configurações', icon: 'Settings' },
  ];
  const sheet = (extra: Values = {}, mode: Mode = 'light') =>
    drawHug(
      'bottom-sheet',
      { title: 'Compartilhar', style: 'modal', dragHandle: 'true', items, ...extra },
      WIDTH,
      mode,
    );

  it('folha em surface-container-low com os cantos de cima de 28 (ExpandedShape) e os de baixo retos', () => {
    for (const mode of MODES) {
      const d = sheet({}, mode);
      expect(fillOf(d, 'bottom sheet')).toBe(tok('surface-container-low', mode));
      const r = num('corner-extra-large');
      expect(radiusOf(d.root)).toEqual([r, r, 0, 0]);
      expect(num('corner-extra-large')).toBe(28);
      expect(d.warnings.filter((w) => BAD_WARNING.test(w))).toEqual([]);
    }
  });

  it('modal sem sombra (tonalElevation do Level1 não projeta); standard com a sombra do nível 1', () => {
    for (const mode of MODES) {
      expect(sheet({ style: 'modal' }, mode).root.effects).toEqual([]);
      const standard = sheet({ style: 'standard' }, mode).root.effects;
      expectElevation(standard, 1, mode);
    }
  });

  it('alça de 32 × 4 (DockedDragHandleWidth/Height) em on-surface-variant, centrada numa área de 48 (22 + 4 + 22)', () => {
    for (const mode of MODES) {
      const d = sheet({}, mode);
      const area = box(d, 'área da alça');
      expect([area.x, area.y, area.width, area.height]).toEqual([0, 0, WIDTH, 48]);
      const handle = box(d, 'alça');
      expect([handle.width, handle.height]).toEqual([32, 4]);
      expect([handle.x, handle.y]).toEqual([(WIDTH - 32) / 2, 22]);
      // cor cheia, sem a opacidade 0,4 de antes
      expect(fillOf(d, 'alça')).toBe(tok('on-surface-variant', mode));
      expect(named(d, 'alça')?.opacity).toBe(1);
      expect(radiusOf(handle.node)).toBe(num('corner-extra-large'));
    }
  });

  it('sem alça (dragHandle=false) a área some e o conteúdo sobe 48', () => {
    const withHandle = sheet({});
    const without = sheet({ dragHandle: 'false' });
    expect(named(without, 'área da alça')).toBeUndefined();
    expect(box(withHandle, 'cabeçalho').y - box(without, 'cabeçalho').y).toBe(48);
  });

  it('título em title-large (22/28/400/0) on-surface, a 16 das bordas', () => {
    for (const mode of MODES) {
      const d = sheet({}, mode);
      const title = textIn(d, 'cabeçalho')!;
      expect(title.text).toBe('Compartilhar');
      expect(fontOf(title)).toEqual(scale('title-large'));
      expect(solid(title.fills)).toBe(tok('on-surface', mode));
      expect(absOf(d, title).x).toBe(16);
    }
  });

  it('item de ListItem: 56 de altura, container surface, ícone de 24 em on-surface-variant a 16 e texto a 56 em body-large', () => {
    for (const mode of MODES) {
      const d = sheet({}, mode);
      const item = box(d, 'item');
      expect(item.height).toBe(56);
      expect(item.width).toBe(WIDTH);
      expect(fillOf(d, 'item')).toBe(tok('surface', mode));
      const icon = iconIn(d, 'item')!;
      expect([icon.box.width, icon.box.height, icon.box.x - item.x]).toEqual([
        24, 24, 16,
      ]);
      expect(icon.box.y - item.y).toBe((56 - 24) / 2);
      expect(icon.color).toBe(tok('on-surface-variant', mode));
      const label = textIn(d, 'item')!;
      expect(label.text).toBe('Favoritos');
      expect(fontOf(label)).toEqual(scale('body-large'));
      expect(solid(label.fills)).toBe(tok('on-surface', mode));
      // ListItemStartPadding 16 + ícone 24 + LeadingContentEndPadding 16
      expect(absOf(d, label).x - item.x).toBe(16 + 24 + 16);
    }
  });

  it('rótulo longo fica numa linha e termina em … (o item continua com 56)', () => {
    const d = sheet({
      items: [{ label: 'Um rótulo de ação bem comprido '.repeat(6), icon: 'Share' }],
    });
    const label = textIn(d, 'item')!;
    expect(label.style).toMatchObject({ maxLines: 1, ellipsis: true });
    expect(box(d, 'item').height).toBe(56);
  });

  it('altura abraça: alça 48 + cabeçalho (8 + 28 + 16) + 3 itens de 56 + 16', () => {
    expect(
      hugHeight(
        'bottom-sheet',
        { title: 'Compartilhar', dragHandle: 'true', style: 'modal', items },
        WIDTH,
      ),
    ).toBe(48 + (8 + 28 + 16) + 3 * 56 + 16);
  });

  it('standard abraça no mínimo a altura recolhida (requiredHeightIn(min = peekHeight)) e a largura chega a 640', () => {
    const size = { width: WIDTH, height: null };
    const high = (peek: number) =>
      measureComponent(
        entryOf('bottom-sheet').component!,
        valuesOf('bottom-sheet', {
          style: 'standard',
          sheetPeekHeight: peek,
          dragHandle: 'true',
        }),
        size,
        optionsOf('light'),
      ).height;
    expect(high(300)).toBe(300);
    expect(high(56)).toBeGreaterThanOrEqual(56);
    const modal = measureComponent(
      entryOf('bottom-sheet').component!,
      valuesOf('bottom-sheet', {
        style: 'modal',
        sheetPeekHeight: 300,
        dragHandle: 'true',
      }),
      size,
      optionsOf('light'),
    );
    expect(modal.height).toBeLessThan(300);
    expect(hugWidth('bottom-sheet', { title: 'x'.repeat(300) })).toBe(640);
  });

  it('ícone do item fora do conjunto avisa; item sem ícone começa a 16', () => {
    const bad = sheet({ items: [{ label: 'X', icon: 'Nao-existe' }] });
    expect(bad.warnings.some((w) => /ícone desconhecido/.test(w))).toBe(true);
    const none = sheet({ items: [{ label: 'X', icon: '' }] });
    expect(iconIn(none, 'item')).toBeUndefined();
    expect(absOf(none, textIn(none, 'item')!).x).toBe(16);
  });
});

describe('M5 grupo A — snackbar', () => {
  const WIDTH = 344;
  const ACTION = { message: 'Mensagem arquivada', actionLabel: 'Desfazer' };
  const snack = (values: Values, mode: Mode = 'light') =>
    drawHug('snackbar', values, WIDTH, mode);

  it('contêiner inverse-surface com a forma extra-small (4) e a sombra do nível 3, em light e dark', () => {
    for (const mode of MODES) {
      const d = snack({ message: 'Arquivo salvo' }, mode);
      expect(fillOf(d, 'snackbar')).toBe(tok('inverse-surface', mode));
      expect(radiusOf(d.root)).toBe(num('corner-extra-small'));
      expect(num('corner-extra-small')).toBe(4);
      expectElevation(d.root.effects, 3, mode);
      expect(d.warnings.filter((w) => BAD_WARNING.test(w))).toEqual([]);
    }
    // o fundo do dark é claro (inverse-surface escuro↔claro)
    expect(tok('inverse-surface', 'dark')).not.toBe(tok('inverse-surface', 'light'));
  });

  it('uma linha mede 48 (SingleLineContainerHeight), mensagem em body-medium inverse-on-surface a 16 e centrada', () => {
    for (const mode of MODES) {
      const d = snack({ message: 'Arquivo salvo' }, mode);
      expect(d.root.height).toBe(48);
      const message = textIn(d, 'mensagem')!;
      expect(fontOf(message)).toEqual(scale('body-medium'));
      expect(solid(message.fills)).toBe(tok('inverse-on-surface', mode));
      const abs = absOf(d, message);
      expect([abs.x, abs.y]).toEqual([16, (48 - 20) / 2]);
    }
  });

  it('só mensagem: respiro de 16 dos dois lados (8 de padding + 8 de TextEndExtraSpacing)', () => {
    const d = snack({ message: 'Arquivo salvo' });
    const message = absOf(d, textIn(d, 'mensagem')!);
    expect(WIDTH - (message.x + message.width)).toBe(16);
  });

  it('ação: label-large em inverse-primary, 48 de altura, 58 no mínimo, a 8 da direita e a mensagem termina a 8 dela', () => {
    for (const mode of MODES) {
      const d = snack(ACTION, mode);
      const action = box(d, 'ação');
      expect(action.height).toBe(48);
      expect(action.width).toBeGreaterThanOrEqual(58);
      expect(action.x + action.width).toBe(WIDTH - 8);
      const label = textIn(d, 'ação')!;
      expect(label.text).toBe('Desfazer');
      expect(fontOf(label)).toEqual(scale('label-large'));
      expect(solid(label.fills)).toBe(tok('inverse-primary', mode));
      expect(absOf(d, label).x - action.x).toBeCloseTo(12, 6);
      const message = absOf(d, textIn(d, 'mensagem')!);
      expect(action.x - (message.x + message.width)).toBe(8);
    }
  });

  it('fechar: ícone de 24 em inverse-on-surface numa área de 48 colada à direita, e a ação vem logo antes', () => {
    for (const mode of MODES) {
      const d = snack({ ...ACTION, dismissAction: 'true' }, mode);
      const close = box(d, 'fechar');
      expect([close.width, close.height, close.x + close.width]).toEqual([48, 48, WIDTH]);
      const icon = iconIn(d, 'fechar')!;
      expect([icon.box.width, icon.box.height]).toEqual([24, 24]);
      expect(WIDTH - (icon.box.x + icon.box.width)).toBe(12);
      expect(icon.color).toBe(tok('inverse-on-surface', mode));
      const action = box(d, 'ação');
      expect(action.x + action.width).toBe(close.x);
      // sem folga entre a mensagem e a ação quando há fechar (extraSpacing só sem dismiss)
      const message = absOf(d, textIn(d, 'mensagem')!);
      expect(message.x + message.width).toBe(action.x);
    }
  });

  it('mensagem longa quebra e a altura cresce de 20 em 20 a partir de 68 (duas linhas)', () => {
    const long = 'Mensagem que precisa quebrar em duas linhas';
    const d = snack({ message: long, actionLabel: 'Desfazer' });
    // MC5 (#1033): com duas linhas aparece o quadro `mensagem em várias linhas`, com a linha de base a 30
    // e 11 até o fundo da caixa do texto (30 + 20 + 11 = 61), e o texto não é mais o `mensagem` de uma linha
    expect(textIn(d, 'mensagem em várias linhas')!.style.maxLines).toBeUndefined();
    expect(textIn(d, 'mensagem')).toBeUndefined();
    expect(d.root.height).toBe(68);
    const message = absOf(d, textIn(d, 'mensagem em várias linhas')!);
    expect(message.height).toBe(30 + 20 + 11);
    // a ação continua centrada na altura
    const action = box(d, 'ação');
    expect(action.y + action.height / 2).toBe(34);
  });

  it('ação em nova linha: linha de base a 30 e 12 até o fim (30 + 12), ações à direita (8) e altura 30 + 12 + 48 + 2', () => {
    for (const mode of MODES) {
      const d = snack({ ...ACTION, actionOnNewLine: 'true' }, mode);
      expect(d.root.height).toBe(30 + 12 + 48 + 2);
      // MC5 (#1033): a caixa do texto leva o `baselinePadding` (30 e 12), não mais o padding estimado 15 e 7
      const text = textIn(d, 'mensagem com ação em nova linha')!;
      const message = absOf(d, text);
      expect([message.x, message.y, text.style.baselineTop]).toEqual([16, 0, 30]);
      expect(solid(text.fills)).toBe(tok('inverse-on-surface', mode));
      const action = box(d, 'ação');
      expect(action.y).toBe(30 + 12);
      expect(action.x + action.width).toBe(WIDTH - 8);
      expect(solid(textIn(d, 'ação')!.fills)).toBe(tok('inverse-primary', mode));
      // com o fechar, as duas áreas ficam na linha de baixo e a margem de 8 some
      const both = snack(
        { ...ACTION, actionOnNewLine: 'true', dismissAction: 'true' },
        mode,
      );
      expect(box(both, 'fechar').x + box(both, 'fechar').width).toBe(WIDTH);
      expect(iconIn(both, 'fechar')!.color).toBe(tok('inverse-on-surface', mode));
    }
  });

  it('actionOnNewLine sem ação cai na linha única, como o Compose (actionOnNewLine && action != null)', () => {
    const d = snack({ message: 'Sem ação', actionOnNewLine: 'true' });
    expect(d.root.height).toBe(48);
    expect(named(d, 'ação')).toBeUndefined();
  });

  it('declara o limite de 600 (ContainerMaxWidth) na raiz; o snackbar usa sizing fill, então só vale sem retângulo', () => {
    const template = entryOf('snackbar').component!.template as { maxWidth?: number };
    expect(template.maxWidth).toBe(600);
  });

  it('só fechar, sem ação: o texto vai até a área de fechar e não há aviso', () => {
    const d = snack({ message: 'Arquivo salvo', dismissAction: 'true' });
    const message = absOf(d, textIn(d, 'mensagem')!);
    expect(message.x + message.width).toBe(WIDTH - 48);
    expect(d.warnings.filter((w) => BAD_WARNING.test(w))).toEqual([]);
  });
});
