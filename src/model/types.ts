import type { Spec } from './spec';

// Tipos do `mapping.json` (schema v18). Ver docs/FORMAT.md. Tudo é `readonly`: o modelo é imutável e as operações sempre
// devolvem um novo projeto.

export const SCHEMA_VERSION = 18;
export const APP_ID = 'mapping';
/** Valor gravado antes do renome do produto: ainda é aceito na leitura e vira `APP_ID`. */
export const LEGACY_APP_ID = 'mapeador-imagens';
export const COORDINATE_SYSTEM = 'image-pixels-exif-oriented';

/** Retângulo em pixels inteiros da imagem original. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Posição da imagem no canvas. `scale` = unidades do canvas por pixel da imagem. */
export interface Placement {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

/**
 * Identidade do item num sistema externo (v8), para uma reexportação reconhecer os mesmos
 * elementos. O núcleo não interpreta `system` (ex: `"figma"`): é só um texto.
 */
export interface ExternalSource {
  /** Sistema de origem (texto livre, não vazio). */
  readonly system: string;
  /** Id do elemento no sistema de origem (não vazio). */
  readonly id: string;
  /** Endereço do elemento na origem; `null` quando não há. */
  readonly url: string | null;
}

/** Valor JSON nativo (valores das anotações tipadas). */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/** Camada de origem numa especialização aplicada. */
export interface LayerSpecRef {
  readonly specId: string;
  readonly layerId: string;
}

export interface Layer {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  /** `null` = camada livre; senão, a camada da especialização de onde ela veio. */
  readonly spec: LayerSpecRef | null;
}

export interface ProjectContainer {
  readonly id: string;
  /** Rótulo editável; `null` = a app mostra o nome do arquivo. Não renomeia o arquivo. */
  readonly name: string | null;
  /**
   * Arquivo em `images/`; `null` = container sem arquivo (v10): sem arquivo, só `width`, `height` e
   * `background`.
   */
  readonly file: string | null;
  readonly width: number;
  readonly height: number;
  readonly placement: Placement;
  /**
   * Marcação do canvas que contém o container (v13), derivada da geometria pelo assentar
   * (`settleHierarchy`); `null` = nenhuma. Nunca é escolhida à mão.
   */
  readonly parentId: string | null;
  /** Cor da borda das marcações desta imagem (`#RRGGBB`); `null` = cor neutra do tema. */
  readonly markingColor: string | null;
  /** Trancada (v5): não pode ser movida, redimensionada nem excluída. A seleção segue livre. */
  readonly locked: boolean;
  /** Identidade no sistema de origem (v8); `null` = sem origem. */
  readonly source: ExternalSource | null;
  /** Cor de fundo (`#RRGGBB`) do container sem arquivo (v10); `null` na imagem com arquivo. */
  readonly background: string | null;
  /**
   * Modo do desenho que o container fixa (v18); ausente ou `null` = segue o do projeto. O modo
   * escolhe os valores dos `tokens` das especializações, não depende do tema da interface.
   */
  readonly drawingMode?: string | null;
}

export interface Marking {
  readonly id: string;
  /**
   * Espaço da marcação (v13): o container (`rect` em pixels inteiros dele) ou `null`, a
   * marcação do canvas (`rect` em unidades inteiras do canvas, coordenadas podem ser negativas).
   * Decidido pela geometria ao assentar (`settleHierarchy`).
   */
  readonly containerId: string | null;
  /**
   * A menor marcação do mesmo espaço que a contém inteira (v13: derivada pelo assentar, nunca
   * escolhida à mão); `null` = nenhuma.
   */
  readonly parentId: string | null;
  readonly name: string | null;
  readonly rect: Rect;
  readonly needsReview: boolean;
  /**
   * Trancada (v5): não pode ser movida, redimensionada nem excluída, e trancar o pai
   * trava a geometria dos descendentes. A seleção e as anotações seguem livres.
   */
  readonly locked: boolean;
  /**
   * Flutuante (v13): comentário sobre o canvas (uma nota), fora da árvore de pertencimento nos
   * dois sentidos. Vive sempre no canvas (`containerId` e `parentId` nulos) e é desenhada acima
   * de tudo.
   */
  readonly floating: boolean;
  /** Identidade no sistema de origem (v8); `null` = sem origem. */
  readonly source: ExternalSource | null;
}

/** Lado de uma marcação onde a seta se prende (v13). */
export type ArrowSide = 'top' | 'right' | 'bottom' | 'left';

/** Estilo do traço da seta (v13): `curve` é o padrão. */
export type ArrowStyle = 'straight' | 'curve' | 'elbow';

export const ARROW_SIDES: readonly ArrowSide[] = ['top', 'right', 'bottom', 'left'];
export const ARROW_STYLES: readonly ArrowStyle[] = ['straight', 'curve', 'elbow'];
export const DEFAULT_ARROW_STYLE: ArrowStyle = 'curve';

/**
 * Seta (v13, decisão 14): uma marcação que aponta. Liga duas marcações (`from`, `to`), tem
 * rota e estilo próprios e pode ter anotações por camada (`annotations[].markingId` = id da
 * seta; ids no mesmo espaço das marcações). Fica fora da árvore de pertencimento: não tem
 * `rect`, container nem pai.
 */
export interface Arrow {
  readonly id: string;
  /** Marcação de origem. */
  readonly from: string;
  /** Marcação de destino (diferente de `from`). */
  readonly to: string;
  /** Lado da origem; `null` = o padrão borda a borda. */
  readonly fromSide: ArrowSide | null;
  /** Lado do destino; `null` = o padrão borda a borda. */
  readonly toSide: ArrowSide | null;
  /**
   * Pontos de passagem, só da pessoa. Espaço derivado das duas pontas, nunca gravado
   * (decisão (d)): pixels do container quando as duas estão no mesmo container; senão,
   * unidades do canvas. `[]` = rota padrão.
   */
  readonly points: readonly ArrowPoint[];
  readonly style: ArrowStyle;
  /** Rótulo sobre a seta; `null` = sem rótulo. */
  readonly name: string | null;
  /** Trancada: a rota e as pontas não mudam; a seleção e as anotações seguem livres. */
  readonly locked: boolean;
}

/** Ponto (pixels do container ou unidades do canvas, conforme quem o usa). */
export interface ArrowPoint {
  readonly x: number;
  readonly y: number;
}

export interface Entry {
  /** Id estável da tupla: as referências (`ref`) sobrevivem a renomear a chave. */
  readonly id: string;
  readonly key: string;
  readonly value: string;
}

/** Tipo de uma anotação tipada. */
export interface AnnotationTypeRef {
  readonly specId: string;
  readonly typeId: string;
}

/** Valores de uma anotação tipada, por `key` do campo (ver docs/FORMAT.md, "Referências (`ref`)"). */
export type TypedValues = { readonly [key: string]: JsonValue };

/** Linha de um campo `table`: as chaves das colunas mais o id interno `_id`. */
export type TableRow = { readonly _id: string; readonly [key: string]: JsonValue };

/** Referência a uma tupla de anotação livre. */
export interface EntryRef {
  readonly annotationId: string;
  readonly entryId: string;
}

/** Referência a uma linha de `table` com etiqueta. */
export interface RowRef {
  readonly annotationId: string;
  readonly key: string;
  readonly rowId: string;
}

/** Referência a um campo simples com etiqueta. */
export interface FieldRef {
  readonly annotationId: string;
  readonly key: string;
}

/**
 * Referência à anotação inteira (v17): só o `annotationId`, sem `key`, `entryId` nem `rowId`.
 * (`AnnotationRef` já é a referência de saída de `refs.ts`.)
 */
export interface WholeRef {
  readonly annotationId: string;
}

/** Valor de um campo `ref`: um dos quatro formatos (docs/FORMAT.md, "Referências (`ref`)"). */
export type RefValue = EntryRef | RowRef | FieldRef | WholeRef;

/**
 * Sobreposição local do repositório de uma plataforma (v11), no nível do projeto: onde está
 * o clone. O endereço do repositório é da especialização (`platforms[].repo`).
 */
export interface PlatformRepo {
  /** Raiz do clone, relativa à pasta do projeto (ex: `../..`); `null` = não informada. */
  readonly localPath: string | null;
}

/** `platformRepos` do `mapping.json`: sobreposição local por id de plataforma. */
export type PlatformRepos = { readonly [platformId: string]: PlatformRepo };

/**
 * Sobreposição local do repositório de documentos de uma especialização (v14), no nível do
 * projeto: onde está o clone. O endereço do repositório é da especialização (`docRepos`).
 */
export interface DocRepo {
  /** Raiz do clone, relativa à pasta do projeto (ex: `../docs`). */
  readonly localPath: string;
}

/** `docRepos` do `mapping.json`: sobreposição local por id de repositório de documentos. */
export type DocRepos = { readonly [docRepoId: string]: DocRepo };

export interface Annotation {
  readonly id: string;
  /** Marcação (ou seta, v13) dona da anotação. */
  readonly markingId: string;
  readonly layerId: string;
  readonly name: string | null;
  /** Anotação "dona" (mesma marcação, outra camada, sem ciclos) ou `null`. */
  readonly parentAnnotationId: string | null;
  /**
   * Papel que esta anotação ocupa na dona (v14): id de um `childRoles` do tipo da dona, ou `null`
   * = sem papel. Só existe com dona (`parentAnnotationId` não nulo). Falta e papel que a dona não
   * oferece viram pendência (`missing-role`, `unknown-role`), não erro.
   */
  readonly parentRole: string | null;
  /** `null` = anotação livre (pares em `entries`). */
  readonly type: AnnotationTypeRef | null;
  /** Valores da anotação tipada; `null` na anotação livre. */
  readonly values: TypedValues | null;
  /** Pares da anotação livre; sempre `[]` na tipada. */
  readonly entries: readonly Entry[];
}

/** Especialização aplicada, como gravada no `mapping.json`. */
export interface SpecializationRef {
  readonly id: string;
  readonly version: number;
  /** Cópia da especialização, relativa à raiz (`specs/sdui.json`). */
  readonly file: string;
}

/**
 * Especialização aplicada, em memória: a referência do `mapping.json` mais o
 * conteúdo de `file`. `spec` não vai para o `mapping.json` (fica em `specs/`);
 * `null` quando o arquivo está ausente ou inválido.
 */
export interface ProjectSpecialization extends SpecializationRef {
  readonly spec: Spec | null;
}

export interface ProjectInfo {
  /**
   * Identidade do projeto (v16): um UUID criado na migração e na criação do projeto, que nunca
   * muda. Chaveia o que fica no navegador (a perspectiva aberta, as perspectivas "Só eu").
   */
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Posição de uma raiz numa perspectiva (v16): o canto de cima à esquerda, em unidades do canvas. */
export interface PerspectiveItem {
  /** Id de uma raiz: container sem pai, marcação do canvas sem pai ou flutuante. */
  readonly root: string;
  readonly x: number;
  readonly y: number;
}

/**
 * Perspectiva (v16): um recorte do projeto. Quais raízes aparecem (`items`), onde ficam no canvas
 * e quais camadas ficam escondidas. O conteúdo é o do projeto; só a posição das raízes muda. O
 * `mapping.json` guarda só as "Para todos"; as "Só eu" ficam no navegador, no mesmo formato.
 */
export interface Perspective {
  readonly id: string;
  /** Único entre as perspectivas, sem diferença de caixa. */
  readonly name: string;
  /** Camadas escondidas nesta perspectiva (camada nova nasce visível). */
  readonly hiddenLayers: readonly string[];
  /** Uma entrada por raiz, sem repetir. */
  readonly items: readonly PerspectiveItem[];
}

/** Marca "Veio de…" (v16): uma raiz criada fora da Principal que chegou a ela. */
export interface Arrival {
  readonly root: string;
  /** Id da perspectiva de origem (pode não existir mais). */
  readonly from: string;
  /** Nome da perspectiva de origem, guardado para a marca sobreviver a ela. */
  readonly fromName: string;
}

export interface Project {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  /**
   * Contador de gravações do arquivo (v6). Quem grava (app ou MCP) confere se o
   * valor no disco ainda é o que carregou e grava `revision + 1`; assim percebe
   * uma alteração feita por outro processo. As operações do modelo não o alteram.
   */
  readonly revision: number;
  readonly app: typeof APP_ID;
  readonly coordinateSystem: typeof COORDINATE_SYSTEM;
  readonly project: ProjectInfo;
  readonly specializations: readonly ProjectSpecialization[];
  /**
   * Repositório de cada plataforma (v7). Fica no projeto, não na especialização: a mesma
   * especialização serve a produtos diferentes. Plataformas de mesmo id em especializações
   * diferentes são a mesma e usam a mesma configuração.
   */
  readonly platformRepos: PlatformRepos;
  /**
   * Clone local de cada repositório de documentos (v14), por id do `docRepos` da especialização.
   * Mesmas regras do `platformRepos`: o mesmo id em especializações diferentes é a mesma entrada.
   */
  readonly docRepos: DocRepos;
  /**
   * Modo do desenho do projeto (v18): escolhe o modo dos `tokens` das especializações. Ausente =
   * o primeiro modo de cada especialização. Um modo que nenhuma declara fica gravado (Diagnóstico).
   */
  readonly drawingMode?: string;
  readonly layers: readonly Layer[];
  readonly containers: readonly ProjectContainer[];
  readonly markings: readonly Marking[];
  /** Setas (v13, ME4): marcações que apontam. */
  readonly arrows: readonly Arrow[];
  /** Perspectivas "Para todos" (v16). A Principal é implícita e não está aqui. */
  readonly perspectives: readonly Perspective[];
  /** Marcas "Veio de…" da Principal (v16). */
  readonly arrivals: readonly Arrival[];
  readonly annotations: readonly Annotation[];
}

/** O `mapping.json` como gravado: as especializações sem o conteúdo. */
export type ProjectFile = Omit<Project, 'specializations'> & {
  readonly specializations: readonly SpecializationRef[];
};
