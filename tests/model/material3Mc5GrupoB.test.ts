// MC5 (#1033, etapa #898), grupo B: tabs, top-app-bar e list-item. As posições verticais que eram estimadas para o
// Roboto 14/20 passam à linha de base do Compose (`baselinePadding`) e a altura passa a seguir as linhas medidas
// (`$lines`) ou o `style` (`sizing` por expressão). Referência (commit 5113b82a…, androidx/compose/material3/
// material3/src/commonMain/kotlin/androidx/compose/material3):
//  - Tab.kt 367 a 417 (`placeTextAndIcon`: a última linha de base fica a `SingleLineTextBaselineWithIcon` 14 ou
//    `DoubleLineTextBaselineWithIcon` 6 mais o indicador de 3 do fundo da aba; o ícone fica a `IconDistanceFromBaseline`
//    20 acima da primeira linha de base) e 420 a 438 (as constantes);
//  - AppBar.kt 3213 a 3231 (o título grande tem a linha de base a `titleBottomPadding` do fundo da barra) e 3510 e 3511
//    (`MediumTitleBottomPadding` 24 e `LargeTitleBottomPadding` 28); tokens/AppBar{Small,Medium,Large}Tokens.kt
//    (`ContainerHeight` 64, 112 e 152);
//  - ListItem.kt 191 a 330 (`isSupportingMultiline` pelas linhas de base do apoio), 451 a 473 (`calculateHeight`),
//    475 a 524 (`place`: o item de três linhas prende o conteúdo ao topo, a `topPadding` 12) e 712 a 757 (`ListItemType`).
import { describe, expect, it } from 'vitest';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import type { SceneNode, TextNode } from '../../src/model/components/scene';
import {
  drawFitted,
  entryOf,
  fittedSize,
  templateNodes,
} from '../support/material3Fitted';
import type { Mode, Values } from '../support/material3Fitted';

type Drawing = ReturnType<typeof drawFitted>['drawing'];
type Row = Record<string, string>;
const MODES: Mode[] = ['light', 'dark'];

const near = (value: number | undefined, expected: number, digits = 3) =>
  expect(value).toBeCloseTo(expected, digits);

const visible = (d: Drawing, name: string): SceneNode[] =>
  [...walk(d.root)].filter((n) => n.name === name && n.visible);
const boxOf = (d: Drawing, node: SceneNode) => absoluteBoxes(d.root).get(node.id)!;
const boxesOf = (d: Drawing, name: string) =>
  visible(d, name).map((node) => ({ node, ...boxOf(d, node) }));
const textBox = (d: Drawing, text: string) => {
  const node = [...walk(d.root)].find(
    (n): n is TextNode => n.type === 'text' && n.visible && n.text === text,
  );
  if (node === undefined) throw new Error(`texto ausente: ${text}`);
  return { node, ...boxOf(d, node) };
};
/** Os ícones desenhados (o nó `icon` é um grupo de 24 com um caminho), na ordem do desenho. */
const iconBoxes = (d: Drawing) =>
  [...walk(d.root)]
    .filter(
      (n) =>
        n.visible && n.type === 'group' && [...walk(n)].some((c) => c.type === 'path'),
    )
    .map((node) => ({ node, ...boxOf(d, node) }));

/** Os nós `text` do template com `baselinePadding` (em qualquer ramo). */
function textsWithBaseline(id: string): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  const walkJson = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walkJson);
    if (node === null || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    if (record.type === 'text' && record.baselinePadding !== undefined)
      found.push(record);
    Object.values(record).forEach(walkJson);
  };
  walkJson(entryOf(id).component!.template);
  return found;
}

// ---------------------------------------------------------------------------------------------
// tabs
// ---------------------------------------------------------------------------------------------
const row = (label: string, selected = false, icon = 'Home'): Row => ({
  label,
  icon,
  selected: String(selected),
});
const THREE = [
  row('Início', true),
  row('Buscar', false, 'Search'),
  row('Perfil', false, 'Person'),
];
const TWO_LINES = [
  row('Configurações da conta', true),
  row('Buscar', false, 'Search'),
  row('Perfil', false, 'Person'),
];
const STYLES = ['primary', 'secondary', 'primary-scrollable', 'secondary-scrollable'];

/** A tabela de abas (uma linha só, ícone acima) na altura da marcação dada. */
const drawTabs = (
  items: Row[],
  style: string,
  height: number,
  mode: Mode = 'light',
): Drawing =>
  drawFitted('tabs', { items, style, iconPosition: 'top' } as unknown as Values, mode, {
    width: 412,
    height,
  }).drawing;

/** A linha de base do rótulo: só existe quando o nó leva `baselinePadding.top` (a estimativa não tinha). */
function baselineOf(node: TextNode, y: number): number {
  const top = node.style.baselineTop;
  if (top === undefined)
    throw new Error(`o rótulo não tem linha de base declarada (baselineTop)`);
  return y + top;
}

describe('MC5 grupo B — tabs, ícone acima do texto pela linha de base (Tab.kt 367 a 417)', () => {
  it('o rótulo empilhado leva baselinePadding.top 20 e a pilha perdeu o padding [0,0,12,0] estimado', () => {
    // Fixa e rolável: um nó de texto de cada, com o top = IconDistanceFromBaseline (Tab.kt 438).
    const labels = textsWithBaseline('tabs');
    expect(labels).toHaveLength(2);
    for (const label of labels)
      expect((label.baselinePadding as { top: number }).top).toBe(20);
    const pilhas = templateNodes('tabs', 'pilha');
    expect(pilhas.length).toBeGreaterThan(0);
    for (const pilha of pilhas)
      expect(
        JSON.stringify((pilha.layout as { padding?: unknown }).padding),
      ).not.toContain('12');
  });

  it.each(STYLES)(
    '%s, uma linha: a última linha de base fica a 17 do fundo (14 + indicador de 3) e o ícone a 20 acima dela, em light e dark',
    (style) => {
      for (const mode of MODES) {
        const d = drawTabs(THREE, style, 72, mode);
        const label = textBox(d, 'Início');
        const baseline = baselineOf(label.node, label.y);
        near(72 - baseline, 17);
        const icon = iconBoxes(d)[0]!;
        near(icon.height, 24);
        // Tab.kt 399 a 411: o fundo do ícone fica IconDistanceFromBaseline (20) acima da primeira linha de base
        near(baseline - (icon.y + icon.height), 20);
        near(icon.y, 11);
      }
    },
  );

  it('a aba de 72 não mexe nas outras: o ícone de uma aba só de ícone e o de texto continuam centrados', () => {
    const only = drawFitted(
      'tabs',
      {
        items: [row('', true), row('', false, 'Search')],
        style: 'primary',
        iconPosition: 'top',
      } as unknown as Values,
      'light',
      { width: 412, height: 72 },
    ).drawing;
    near(iconBoxes(only)[0]!.y, 24);
  });

  it('duas linhas (fileira fixa): o rótulo quebra em duas, a última linha de base fica a 9 do fundo (6 + 3) e o ícone a 20 da primeira', () => {
    // Na aba do Compose a altura vira max(72, ícone + texto + 20) = 84; a marcação é que dá a altura aqui.
    for (const mode of MODES) {
      const d = drawTabs(TWO_LINES, 'primary', 84, mode);
      const long = boxesOf(d, 'rótulo empilhado').find(
        (b) => (b.node as TextNode).text === 'Configurações da conta',
      )!;
      expect(long, 'rótulo de duas linhas').toBeDefined();
      const first = baselineOf(long.node as TextNode, long.y);
      const last = first + 20;
      near(84 - last, 9);
      const icon = iconBoxes(d)[0]!;
      near(first - (icon.y + icon.height), 20);
      // A aba curta da mesma fileira segue a distância de uma linha (17), pela própria aba.
      const short = textBox(d, 'Buscar');
      near(84 - baselineOf(short.node, short.y), 17);
    }
  });

  it('duas linhas: o texto ocupa a largura da aba menos os 2 × 16 do HorizontalTextPadding', () => {
    const d = drawTabs(TWO_LINES, 'primary', 84);
    const tab = boxesOf(d, 'aba')[0]!;
    const long = textBox(d, 'Configurações da conta');
    expect(long.width).toBeLessThanOrEqual(tab.width - 32 + 1e-6);
    near(long.height, 49);
  });

  it('o indicador primário continua do tamanho do conteúdo (matchContentSize)', () => {
    const d = drawTabs(THREE, 'primary', 72);
    const indicator = boxesOf(d, 'indicador primário')[0]!;
    near(indicator.width, textBox(d, 'Início').width);
    const long = drawTabs(TWO_LINES, 'primary', 84);
    const wide = boxesOf(long, 'indicador primário')[0]!;
    const text = textBox(long, 'Configurações da conta');
    near(wide.width, text.width);
    const tab = boxesOf(long, 'aba')[0]!;
    expect(wide.width).toBeLessThanOrEqual(tab.width - 32 + 1e-6);
  });

  it.each(MODES)(
    'os exemplos do tabs desenham sem aviso, no size e no tamanho ajustado (%s)',
    (mode) => {
      for (const example of entryOf('tabs').examples) {
        const values = example.values as Values;
        const fit = fittedSize('tabs', values, mode);
        expect(fit.messages, example.name).toEqual([]);
        const { drawing } = drawFitted('tabs', values, mode);
        expect(drawing.warnings, example.name).toEqual([]);
        const size = entryOf('tabs').component!.size;
        const { drawing: atSize } = drawFitted('tabs', values, mode, size);
        expect(atSize.warnings, example.name).toEqual([]);
      }
    },
  );

  // as roláveis não quebram o rótulo (a aba tem a largura do conteúdo) e um rótulo comprido passa da fileira, como antes
  it.each(['primary', 'secondary'])(
    '%s: o rótulo de duas linhas desenha sem aviso, em light e dark',
    (style) => {
      for (const mode of MODES) {
        expect(drawTabs(TWO_LINES, style, 84, mode).warnings).toEqual([]);
        expect(drawTabs(TWO_LINES, style, 72, mode).warnings).toEqual([]);
      }
    },
  );
});

// ---------------------------------------------------------------------------------------------
// top-app-bar
// ---------------------------------------------------------------------------------------------
const BAR_HEIGHT: Record<string, number> = {
  small: 64,
  center: 64,
  medium: 112,
  large: 152,
};

describe('MC5 grupo B — top-app-bar, título grande pela linha de base e a altura pelo style', () => {
  it('os títulos grandes (medium e large) levam baselinePadding.bottom 24 e 28, sem a âncora de fundo estimada', () => {
    const nodes = templateNodes('top-app-bar', 'título grande');
    expect(nodes).toHaveLength(2);
    expect(
      nodes.map((n) => (n.baselinePadding as { bottom: number } | undefined)?.bottom),
    ).toEqual([24, 28]);
    // a âncora de 16 e de 20 era a conta do Roboto: a caixa agora desce até o fundo da barra
    for (const node of nodes) expect((node.anchors as { bottom: number }).bottom).toBe(0);
  });

  it.each([
    ['medium', 24, 24, 32],
    ['large', 28, 28, 36],
  ])(
    '%s: a linha de base do título fica a %i do fundo da barra (AppBar.kt 3213 a 3231)',
    (style, bottom, size, lineHeight) => {
      for (const mode of MODES) {
        const { box, drawing } = drawFitted(
          'top-app-bar',
          { title: 'Configurações', style, navigationIcon: 'ArrowBack' },
          mode,
        );
        expect(box.height).toBe(BAR_HEIGHT[style]);
        const title = boxesOf(drawing, 'título grande')[0]!;
        const first = lineHeight / 2 + ((0.93 - 0.24) * size) / 2;
        near(box.height - (title.y + first), bottom, 1);
      }
    },
  );

  it('o sizing.height é a expressão pelo style e o size continua 412 × 152', () => {
    const component = entryOf('top-app-bar').component!;
    expect(component.size).toEqual({ width: 412, height: 152 });
    expect(typeof component.sizing?.height).toBe('object');
  });

  it.each(Object.entries(BAR_HEIGHT))(
    'style %s: o tamanho ajustado tem %i de altura e a largura da marcação',
    (style, height) => {
      for (const mode of MODES) {
        const fit = fittedSize(
          'top-app-bar',
          { title: 'Início', style, navigationIcon: 'Menu' },
          mode,
        );
        expect(fit.height).toBe(height);
        expect(fit.messages).toEqual([]);
        const { drawing } = drawFitted(
          'top-app-bar',
          { title: 'Início', style, navigationIcon: 'Menu' },
          mode,
          { width: 412 },
        );
        expect(drawing.warnings, `${style} (${mode})`).toEqual([]);
      }
    },
  );

  it('sem style (o padrão é small) o ajuste dá 64', () => {
    expect(fittedSize('top-app-bar', { title: 'Início' }).height).toBe(64);
  });

  it.each(MODES)(
    'os exemplos da barra desenham sem aviso no size e no tamanho ajustado (%s)',
    (mode) => {
      for (const example of entryOf('top-app-bar').examples) {
        const values = example.values as Values;
        const { drawing } = drawFitted('top-app-bar', values, mode, { width: 412 });
        expect(drawing.warnings, example.name).toEqual([]);
        const size = entryOf('top-app-bar').component!.size;
        const { drawing: atSize } = drawFitted('top-app-bar', values, mode, {
          width: size.width,
          height: size.height,
        });
        expect(atSize.warnings, example.name).toEqual([]);
      }
    },
  );
});

// ---------------------------------------------------------------------------------------------
// list-item
// ---------------------------------------------------------------------------------------------
const LONG_SUPPORT =
  'Sala 3, com a equipe de produto, para combinar o planejamento do semestre e os próximos passos';
const twoLineSupport = {
  headlineContent: 'Reunião de planejamento',
  supportingContent: LONG_SUPPORT,
  leadingIcon: 'DateRange',
  trailingContent: '12:30',
};

describe('MC5 grupo B — list-item, o apoio de duas linhas faz o item de três linhas (ListItem.kt 191 a 330)', () => {
  it('o corpo cita as linhas do apoio (isSupportingMultiline) no minHeight, no padding e no alinhamento', () => {
    const [corpo] = templateNodes('list-item', 'corpo');
    expect(corpo).toBeDefined();
    const json = JSON.stringify(corpo);
    expect(json).toContain('"$lines":"apoio"');
    // o respiro de 12 e o 88 do item de três linhas passam a valer também por esse caminho
    const layout = JSON.stringify((corpo as { layout: unknown }).layout);
    expect(layout).toContain('"$lines":"apoio"');
    expect((corpo as { minHeight: unknown }).minHeight).toBeDefined();
    expect(JSON.stringify((corpo as { minHeight: unknown }).minHeight)).toContain(
      '"$lines":"apoio"',
    );
  });

  it('apoio de 2 linhas sem sobretítulo: o tamanho ajustado dá 88 (calculateHeight, três linhas)', () => {
    for (const mode of MODES) {
      const fit = fittedSize('list-item', twoLineSupport, mode);
      expect(fit.messages).toEqual([]);
      expect(fit.height).toBe(88);
    }
  });

  it('apoio de 1 linha dá 72; só o título, 56; sobretítulo e apoio, 88', () => {
    expect(
      fittedSize('list-item', {
        headlineContent: 'Ana',
        supportingContent: 'Vamos almoçar?',
      }).height,
    ).toBe(72);
    expect(fittedSize('list-item', { headlineContent: 'Ana' }).height).toBe(56);
    expect(
      fittedSize('list-item', {
        headlineContent: 'Ana',
        overlineContent: 'Hoje',
        supportingContent: 'Vamos almoçar?',
      }).height,
    ).toBe(88);
  });

  it('apoio de 2 linhas: o ícone inicial e o texto final começam a 12 do topo (o respiro de três linhas), não centrados em 88', () => {
    for (const mode of MODES) {
      const { box, drawing } = drawFitted('list-item', twoLineSupport, mode);
      expect(box.height).toBe(88);
      const icon = iconBoxes(drawing)[0]!;
      near(icon.y, 12);
      near(textBox(drawing, 'Reunião de planejamento').y, 12);
      const trailing = textBox(drawing, '12:30');
      near(trailing.y, 12);
    }
  });

  it('apoio de 2 linhas: o avatar também fica preso ao topo (12)', () => {
    const { drawing } = drawFitted('list-item', {
      ...twoLineSupport,
      leadingIcon: '',
      leadingImage: 'https://example.com/ana.jpg',
    });
    const avatar = boxesOf(drawing, 'avatar')[0]!;
    near(avatar.y, 12);
    near(avatar.height, 40);
  });

  it('apoio de 1 linha: 72 e o conteúdo inicial e final centrados como antes (respiro de 8)', () => {
    for (const mode of MODES) {
      const { box, drawing } = drawFitted(
        'list-item',
        {
          headlineContent: 'Ana Souza',
          supportingContent: 'Vamos almoçar?',
          leadingIcon: 'Person',
          trailingContent: '12:30',
        },
        mode,
      );
      expect(box.height).toBe(72);
      near(iconBoxes(drawing)[0]!.y, 24);
      const trailing = textBox(drawing, '12:30');
      near(trailing.y + trailing.height / 2, 36);
      const textos = boxesOf(drawing, 'textos')[0]!;
      near(textos.y + textos.height / 2, 36);
    }
  });

  it('o bloco de texto de três linhas por apoio fica no topo (12) e termina dentro do item de 88', () => {
    const { box, drawing } = drawFitted('list-item', twoLineSupport);
    const textos = boxesOf(drawing, 'textos')[0]!;
    near(textos.y, 12);
    near(textos.height, 24 + 40, 3);
    expect(textos.y + textos.height).toBeLessThanOrEqual(box.height - 12 + 1e-6);
  });

  it('o item de três linhas do sobretítulo continua igual (88, conteúdo preso ao topo)', () => {
    const { box, drawing } = drawFitted('list-item', {
      headlineContent: 'Reunião',
      overlineContent: 'Hoje',
      supportingContent: 'Sala 3',
      leadingIcon: 'DateRange',
    });
    expect(box.height).toBe(88);
    near(iconBoxes(drawing)[0]!.y, 12);
  });

  it.each(MODES)(
    'os exemplos do list-item desenham sem aviso no size e no ajustado (%s)',
    (mode) => {
      for (const example of entryOf('list-item').examples) {
        const values = example.values as Values;
        const fit = fittedSize('list-item', values, mode);
        expect(fit.messages, example.name).toEqual([]);
        const { drawing } = drawFitted('list-item', values, mode);
        expect(drawing.warnings, example.name).toEqual([]);
        const size = entryOf('list-item').component!.size;
        const { drawing: atSize } = drawFitted('list-item', values, mode, size);
        expect(atSize.warnings, example.name).toEqual([]);
      }
    },
  );

  it('o exemplo "Apoio de duas linhas" existe e mede 88', () => {
    const example = entryOf('list-item').examples.find(
      (e) => e.name === 'Apoio de duas linhas',
    );
    expect(example, 'exemplo Apoio de duas linhas').toBeDefined();
    expect(fittedSize('list-item', example!.values as Values).height).toBe(88);
  });
});
