// Zoom semântico: quando e o que escrever em cada marcação. Funções puras: o
// CanvasController só desenha o resultado (cartão com uma seção por camada).
import type { Annotation, Layer, Marking } from '../model';

/** Tamanho mínimo na tela (px) da área do texto para o cartão aparecer. Ajustáveis. */
export const SEMANTIC_MIN_WIDTH = 180;
export const SEMANTIC_MIN_HEIGHT = 100;

/**
 * `none`: sem texto. `header`: só a linha de cabeçalho (nome + indicadores) com
 * "…", porque a área do texto é pequena demais. `full`: cabeçalho e cartão.
 */
export type SemanticMode = 'none' | 'header' | 'full';

export interface SemanticInput {
  readonly enabled: boolean;
  /** Tamanho do retângulo da marcação na tela, em px. */
  readonly screenWidth: number;
  readonly screenHeight: number;
  /**
   * Tamanho na tela da área onde o cartão vai: o próprio retângulo (sem filhas)
   * ou a maior área livre das filhas; `null` quando não sobra área livre.
   */
  readonly areaWidth: number | null;
  readonly areaHeight: number | null;
}

/** Avaliado por marcação: o texto aparece quando a área dele é grande o bastante na tela. */
export function semanticMode(input: SemanticInput): SemanticMode {
  if (
    !input.enabled ||
    input.screenWidth < SEMANTIC_MIN_WIDTH ||
    input.screenHeight < SEMANTIC_MIN_HEIGHT
  ) {
    return 'none';
  }
  const fits =
    input.areaWidth !== null &&
    input.areaHeight !== null &&
    input.areaWidth >= SEMANTIC_MIN_WIDTH &&
    input.areaHeight >= SEMANTIC_MIN_HEIGHT;
  return fits ? 'full' : 'header';
}

/** Anotação herdada de um ancestral (`inherit: true`). */
export interface CardInherited {
  readonly annotation: Annotation;
  readonly source: Marking;
}

/** O que o cartão mostra numa camada visível: anotações próprias e herdadas. */
export interface CardSection {
  readonly layer: Layer;
  readonly own: readonly Annotation[];
  readonly inherited: readonly CardInherited[];
}

/** Textos traduzidos que o cartão usa (o chamador passa `t()`). */
export interface CardLabels {
  /** Título neutro de anotação sem nome: "Anotação 1", "Anotação 2"… dentro da camada. */
  untitled(index: number): string;
  /** "↳ de Button". */
  linkedTo(owner: Annotation): string;
  /** "↳ herdado de Porta". */
  inheritedFrom(source: Marking): string;
}

/**
 * Uma linha do cartão. `section` é o índice da camada (para a barra lateral na
 * cor dela). `inherited`: herdada, desenhada em itálico e esmaecida.
 */
export type CardRow =
  | { readonly kind: 'layer'; readonly section: number; readonly text: string }
  | {
      readonly kind: 'title';
      readonly section: number;
      readonly text: string;
      /** Sem nome: título neutro em itálico. */
      readonly untitled: boolean;
      readonly inherited: boolean;
    }
  | {
      readonly kind: 'note';
      readonly section: number;
      readonly text: string;
      readonly inherited: boolean;
    }
  | {
      readonly kind: 'entry';
      readonly section: number;
      readonly text: string;
      readonly inherited: boolean;
    }
  | { readonly kind: 'separator'; readonly section: number }
  | { readonly kind: 'more'; readonly section: number };

export type CardRowKind = CardRow['kind'];

/** Altura de cada tipo de linha, em px de tela. */
export const CARD_ROW_HEIGHT: Readonly<Record<CardRowKind, number>> = {
  layer: 14,
  title: 16,
  note: 13,
  entry: 15,
  separator: 7,
  more: 14,
};

/** Espaço entre duas seções (camadas), em px de tela. */
export const CARD_SECTION_GAP = 6;

/**
 * Seções do cartão nas camadas dadas (as visíveis, na ordem delas): as
 * próprias da marcação e as herdadas dos ancestrais. Camadas sem nenhuma ficam de fora.
 */
export function cardSections(
  layers: readonly Layer[],
  own: readonly Annotation[],
  inherited: readonly CardInherited[],
): CardSection[] {
  const sections: CardSection[] = [];
  for (const layer of layers) {
    const ownHere = own.filter((a) => a.layerId === layer.id);
    const inheritedHere = inherited.filter((i) => i.annotation.layerId === layer.id);
    if (ownHere.length + inheritedHere.length === 0) continue;
    sections.push({ layer, own: ownHere, inherited: inheritedHere });
  }
  return sections;
}

/**
 * Linhas do cartão: por camada, o nome dela; por anotação, o título (nome em
 * negrito ou "Anotação N" em itálico), "↳ de …" quando vinculada, "↳ herdado de …"
 * quando herdada e os pares `chave: valor`. Uma linha fina separa as anotações
 * da mesma camada. `owners` resolve a dona de uma anotação vinculada.
 */
export function cardRows(
  sections: readonly CardSection[],
  owners: ReadonlyMap<string, Annotation>,
  labels: CardLabels,
): CardRow[] {
  const rows: CardRow[] = [];
  sections.forEach(({ layer, own, inherited }, section) => {
    rows.push({ kind: 'layer', section, text: layer.name });
    const items = [
      ...own.map((annotation) => ({ annotation, source: null })),
      ...inherited.map(({ annotation, source }) => ({ annotation, source })),
    ];
    let untitled = 0;
    items.forEach(({ annotation, source }, i) => {
      if (i > 0) rows.push({ kind: 'separator', section });
      const isInherited = source !== null;
      const name = annotation.name;
      rows.push({
        kind: 'title',
        section,
        text: name ?? labels.untitled(++untitled),
        untitled: name === null,
        inherited: isInherited,
      });
      const owner =
        annotation.parentAnnotationId === null
          ? undefined
          : owners.get(annotation.parentAnnotationId);
      if (owner) {
        rows.push({
          kind: 'note',
          section,
          text: labels.linkedTo(owner),
          inherited: isInherited,
        });
      }
      if (source) {
        rows.push({
          kind: 'note',
          section,
          text: labels.inheritedFrom(source),
          inherited: true,
        });
      }
      for (const entry of annotation.entries) {
        rows.push({
          kind: 'entry',
          section,
          text: `${entry.key}: ${entry.value}`,
          inherited: isInherited,
        });
      }
    });
  });
  return rows;
}

/** Linha do cartão já posicionada (`y` em px de tela, a partir do topo do conteúdo). */
export type PlacedRow = CardRow & { readonly y: number; readonly height: number };

export interface CardLayout {
  readonly rows: readonly PlacedRow[];
  /** Altura total do conteúdo, em px de tela. */
  readonly height: number;
  /** Algo ficou de fora: a última linha é "…". */
  readonly truncated: boolean;
}

/**
 * Empilha as linhas até `maxHeight` (px de tela). Se não couber tudo, corta e
 * termina com a linha "…" (o detalhe completo fica no painel); separadores e
 * nomes de camada órfãos no fim do corte saem. Se nem uma linha de conteúdo
 * couber, o cartão fica vazio.
 */
export function layoutCard(rows: readonly CardRow[], maxHeight: number): CardLayout {
  const placed: PlacedRow[] = [];
  let y = 0;
  let previousSection = -1;
  let truncated = false;
  for (const row of rows) {
    const gap =
      previousSection >= 0 && row.section !== previousSection ? CARD_SECTION_GAP : 0;
    const height = CARD_ROW_HEIGHT[row.kind];
    if (y + gap + height > maxHeight) {
      truncated = true;
      break;
    }
    y += gap;
    placed.push({ ...row, y, height });
    y += height;
    previousSection = row.section;
  }
  if (!truncated) return { rows: placed, height: y, truncated };

  // Abre espaço para o "…" e tira o que ficaria sem conteúdo no fim.
  const moreHeight = CARD_ROW_HEIGHT.more;
  const dangling = (row: PlacedRow) => row.kind === 'separator' || row.kind === 'layer';
  let last = placed[placed.length - 1];
  while (last && (last.y + last.height + moreHeight > maxHeight || dangling(last))) {
    placed.pop();
    last = placed[placed.length - 1];
  }
  const top = last ? last.y + last.height : 0;
  // Só o "…", sem conteúdo nenhum, não vale um cartão: o cabeçalho já indica o corte.
  if (!last || top + moreHeight > maxHeight) return { rows: [], height: 0, truncated };
  placed.push({ kind: 'more', section: last?.section ?? 0, y: top, height: moreHeight });
  return { rows: placed, height: top + moreHeight, truncated };
}
