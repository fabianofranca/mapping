// Tipos do `mapping.json` (schema v3). Ver PLAN.md, seção 4.
// Tudo é `readonly`: o modelo é imutável e as operações sempre devolvem um novo projeto.

export const SCHEMA_VERSION = 3;
export const APP_ID = 'mapeador-imagens';
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

export interface Layer {
  readonly id: string;
  readonly name: string;
  readonly color: string;
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
}

export interface Marking {
  readonly id: string;
  readonly imageId: string;
  readonly parentId: string | null;
  readonly name: string | null;
  readonly rect: Rect;
  readonly needsReview: boolean;
}

export interface Entry {
  readonly key: string;
  readonly value: string;
}

export interface Annotation {
  readonly id: string;
  readonly markingId: string;
  readonly layerId: string;
  readonly name: string | null;
  /** `true`: a anotação também vale para todos os descendentes da marcação. */
  readonly inherit: boolean;
  /** Anotação "dona" (mesma marcação, outra camada, sem ciclos) ou `null`. */
  readonly parentAnnotationId: string | null;
  readonly entries: readonly Entry[];
}

export interface ProjectInfo {
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Project {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly app: typeof APP_ID;
  readonly coordinateSystem: typeof COORDINATE_SYSTEM;
  readonly project: ProjectInfo;
  readonly layers: readonly Layer[];
  readonly images: readonly ProjectImage[];
  readonly markings: readonly Marking[];
  readonly annotations: readonly Annotation[];
}
