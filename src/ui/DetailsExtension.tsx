import { createContext, type ComponentChildren } from 'preact';
import { useContext } from 'preact/hooks';
import type { Entry, Layer } from '../model';
import type { DetailsSection } from '../store/ui';

// Ponto de extensão dos Detalhes (fase 9.5): os painéis normais (`MarkingPanel`,
// `SelectionPanel`, `AnnotationsPanel`, `AnnotationEditor`, `TypedFields`,
// `KeyValueGrid`, `TableField`, `MarkingColorField`) perguntam aqui, campo a campo, o que
// desenhar além do controle (um marcador, um selo, uma linha que sai), sem saber quem
// responde. Fora de um provedor o valor é `null` e o painel é o de sempre: uma leitura de
// contexto por componente, nada mais. Quem fornece hoje é a revisão de propostas
// (`ui/review/ReviewItemPanel.tsx`).

/** Uma linha que não está mais no valor mostrado, desenhada no lugar onde estava. */
export interface RemovedEntry {
  readonly entry: Entry;
  /** Posição que o par tinha na lista. */
  readonly index: number;
}

/** Uma anotação que não está mais na marcação mostrada, com o desenho dela. */
export interface RemovedAnnotation {
  readonly id: string;
  /** Posição que a anotação tinha entre as da camada. */
  readonly index: number;
  readonly node: ComponentChildren;
}

/** Linhas de uma tabela que o valor mostrado ganhou e a nota das que saíram. */
export interface TableRowsExtra {
  readonly added: ReadonlySet<string>;
  /** Nome do selo + das linhas novas ("Linha nova"). */
  readonly addedLabel: string;
  /** Texto embaixo da tabela (ex.: as linhas que saem); `null` sem nada a dizer. */
  readonly note: ComponentChildren;
}

export interface DetailsExtension {
  /**
   * O que acompanha o campo `field` da entidade `entityId` (o marcador), ou `null`. Os
   * campos são os de `Change.field` (`name`, `rect`, `parentId`, `file`, `markingColor`,
   * `inherit`, `parentAnnotationId`, `markingId`, `layerId`, `type`, `values.<chave>`,
   * `entries.<id>`); `''` é a entidade inteira (o cabeçalho da anotação).
   */
  readonly mark: (entityId: string, field: string) => ComponentChildren;
  /** Selos embaixo do nome da entidade e se o nome sai riscado. */
  readonly identity: (entityId: string) => {
    readonly flags: ComponentChildren;
    readonly struck: boolean;
  } | null;
  /** Resumo extra do cabeçalho de uma seção recolhível ("3 mudanças"), ou `null`. */
  readonly sectionSummary: (section: DetailsSection) => string | null;
  /** Camadas cujos grupos o painel de anotações mostra, no lugar das visíveis do editor. */
  readonly layers: (visible: readonly Layer[]) => readonly Layer[];
  /** Selo extra no cabeçalho do grupo de uma camada. */
  readonly layerTag: (layerId: string) => ComponentChildren;
  /** Aviso no topo das anotações da marcação. */
  readonly annotationsNotice: (markingId: string) => ComponentChildren;
  /** Anotações que saíram da marcação nesta camada, para desenhar no lugar onde estavam. */
  readonly removedAnnotations: (
    markingId: string,
    layerId: string,
  ) => readonly RemovedAnnotation[];
  /** Pares que saíram da anotação livre, para desenhar riscados no lugar onde estavam. */
  readonly removedEntries: (annotationId: string) => readonly RemovedEntry[];
  /** Linhas novas e a nota das que saíram de um campo tabela, ou `null`. */
  readonly tableRows: (annotationId: string, key: string) => TableRowsExtra | null;
  /**
   * Grupos grandes: quantas anotações mostrar de início e de quantas em quantas o "mostrar
   * mais" acrescenta, com o texto do botão. `null`: todas.
   */
  readonly annotationPage: {
    readonly first: number;
    readonly step: number;
    readonly label: (count: number) => string;
  } | null;
  /** Nome (só para leitor de tela) da coluna das grades onde o marcador fica. */
  readonly markColumn: string;
}

export const DetailsExtensionContext = createContext<DetailsExtension | null>(null);

/** A extensão dos Detalhes em vigor (`null` no painel normal). */
export function useDetailsExtension(): DetailsExtension | null {
  return useContext(DetailsExtensionContext);
}
