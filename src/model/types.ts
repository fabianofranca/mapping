import type { Spec } from './spec';

// Tipos do `mapping.json` (schema v7). Ver docs/FORMAT.md e docs/history/PLAN-etapas-1-2.md,
// seções 4, 12.1 e 13.3. Tudo é `readonly`: o modelo é imutável e as operações sempre
// devolvem um novo projeto.

export const SCHEMA_VERSION = 7;
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

export interface ProjectImage {
  readonly id: string;
  /** Rótulo editável; `null` = a app mostra o nome do arquivo. Não renomeia o arquivo. */
  readonly name: string | null;
  readonly file: string;
  readonly width: number;
  readonly height: number;
  readonly placement: Placement;
  /** Cor da borda das marcações desta imagem (`#RRGGBB`); `null` = cor neutra do tema. */
  readonly markingColor: string | null;
  /** Trancada (v5): não pode ser movida, redimensionada nem excluída. A seleção segue livre. */
  readonly locked: boolean;
}

export interface Marking {
  readonly id: string;
  readonly imageId: string;
  readonly parentId: string | null;
  readonly name: string | null;
  readonly rect: Rect;
  readonly needsReview: boolean;
  /**
   * Trancada (v5): não pode ser movida, redimensionada nem excluída, e trancar o pai
   * trava a geometria dos descendentes. A seleção e as anotações seguem livres.
   */
  readonly locked: boolean;
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

/** Valores de uma anotação tipada, por `key` do campo (ver docs/history/PLAN-etapas-1-2.md 13.3). */
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

/** Valor de um campo `ref`: um dos três formatos da 13.3. */
export type RefValue = EntryRef | RowRef | FieldRef;

/**
 * Entrada de um campo `codeRef` (v7): onde a instância foi implementada numa plataforma.
 * O valor do campo é uma lista delas; `_id` é estável e único dentro da lista, como o
 * das linhas de `table`.
 */
export type CodeRefEntry = {
  readonly _id: string;
  /** Id de uma plataforma declarada pela especialização do tipo. */
  readonly platform: string;
  /** Arquivo relativo à raiz do repositório da plataforma, com `/`; `null` = sem caminho (pendência). */
  readonly path: string | null;
  /** Componente, classe ou função no arquivo; `null` quando vazio. */
  readonly symbol: string | null;
  /** Linha (inteiro ≥ 1); `null` quando vazia. */
  readonly line: number | null;
};

/** Repositório do código de uma plataforma (v7), no nível do projeto. */
export interface PlatformRepo {
  /** URL de um arquivo, com `{path}` e (opcional) `{line}`; `null` = sem link. */
  readonly urlTemplate: string | null;
  /** Raiz do repositório, relativa à pasta do projeto (ex: `../..`); `null` = não informada. */
  readonly localPath: string | null;
}

/** `platformRepos` do `mapping.json`: repositório por id de plataforma. */
export type PlatformRepos = { readonly [platformId: string]: PlatformRepo };

export interface Annotation {
  readonly id: string;
  readonly markingId: string;
  readonly layerId: string;
  readonly name: string | null;
  /** `true`: a anotação também vale para todos os descendentes da marcação. */
  readonly inherit: boolean;
  /** Anotação "dona" (mesma marcação, outra camada, sem ciclos) ou `null`. */
  readonly parentAnnotationId: string | null;
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
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
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
  readonly layers: readonly Layer[];
  readonly images: readonly ProjectImage[];
  readonly markings: readonly Marking[];
  readonly annotations: readonly Annotation[];
}

/** O `mapping.json` como gravado: as especializações sem o conteúdo. */
export type ProjectFile = Omit<Project, 'specializations'> & {
  readonly specializations: readonly SpecializationRef[];
};
