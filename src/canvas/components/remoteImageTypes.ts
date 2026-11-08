// Tipos do estado de uma imagem remota para o desenho. Sem imports de propósito: as declarações
// do pacote `mapping-viewer` os alcançam (via `renderScene`) e não podem puxar o carregador,
// que importa `@preact/signals`.

/** Estados que o carregador conhece. `blocked-consent` e `invalid` vêm das portas da app. */
export type RemoteImageState = 'loading' | 'loaded' | 'opaque' | 'failed' | 'too-large';

/** Estado de uma imagem para o desenho: os do carregador mais os das duas portas. */
export type RemoteImageViewState = RemoteImageState | 'blocked-consent' | 'invalid';

/** O que o desenho recebe de uma URL remota. Só `loaded` e `opaque` trazem `image`. */
export interface RemoteImageView {
  readonly state: RemoteImageViewState;
  /** Bitmap reduzido (ou o próprio elemento, sem `createImageBitmap`). */
  readonly image?: CanvasImageSource;
  /** Tamanho da fonte `image`, em pixels (é nele que o `fit` calcula o recorte). */
  readonly width?: number;
  readonly height?: number;
  /** Por que `failed`, para o Diagnóstico (`timeout` = estourou o tempo limite). */
  readonly reason?: 'failed' | 'timeout';
}
