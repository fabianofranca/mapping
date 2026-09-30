import { signal, type ReadonlySignal } from '@preact/signals';

export type DisplayImage<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly bitmap: T }
  /** O arquivo não existe no armazenamento (imagem ausente). */
  | { readonly status: 'missing' }
  /** O arquivo existe, mas não pôde ser decodificado. */
  | { readonly status: 'error' };

export interface DisplayImages<T> {
  readonly images: ReadonlySignal<ReadonlyMap<string, DisplayImage<T>>>;
  /** Começa a carregar a imagem, se ainda não estiver carregada ou carregando. */
  ensure(path: string): void;
  /** Descarta o bitmap para carregar de novo (ex.: arquivo reapontado). */
  invalidate(path: string): void;
  dispose(): void;
}

/**
 * Bitmaps de exibição por caminho de arquivo, carregados sob demanda e
 * liberados (`close()`) ao sair do projeto.
 */
export function createDisplayImages<T extends { close(): void }>(
  load: (path: string) => Promise<T | null>,
): DisplayImages<T> {
  const images = signal<ReadonlyMap<string, DisplayImage<T>>>(new Map());
  let disposed = false;
  let generation = 0;
  const loadingGeneration = new Map<string, number>();

  const set = (path: string, value: DisplayImage<T> | null) => {
    const next = new Map(images.value);
    if (value) next.set(path, value);
    else next.delete(path);
    images.value = next;
  };

  const release = (path: string) => {
    const current = images.value.get(path);
    if (current?.status === 'ready') current.bitmap.close();
  };

  return {
    images,
    ensure(path) {
      if (disposed || images.value.has(path)) return;
      const token = ++generation;
      loadingGeneration.set(path, token);
      set(path, { status: 'loading' });
      load(path).then(
        (bitmap) => {
          const stale = disposed || loadingGeneration.get(path) !== token;
          if (stale) {
            bitmap?.close();
            return;
          }
          set(path, bitmap ? { status: 'ready', bitmap } : { status: 'missing' });
        },
        () => {
          if (!disposed && loadingGeneration.get(path) === token) {
            set(path, { status: 'error' });
          }
        },
      );
    },
    invalidate(path) {
      release(path);
      loadingGeneration.delete(path);
      set(path, null);
    },
    dispose() {
      disposed = true;
      for (const path of images.value.keys()) release(path);
      images.value = new Map();
    },
  };
}
