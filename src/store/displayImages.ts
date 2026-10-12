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
  /**
   * Libera (`close()`) os bitmaps dos arquivos fora de `paths` (arquivos que saíram
   * do projeto). Se um deles voltar (desfazer), `ensure` o carrega de novo.
   */
  retain(paths: ReadonlySet<string>): void;
  /** Descarta o bitmap para carregar de novo (ex.: arquivo reapontado). */
  invalidate(path: string): void;
  dispose(): void;
}

/**
 * Fecha o bitmap só no quadro seguinte. Quem o desenha (o canvas) ainda pode ter um
 * desenho pendente do quadro em que o bitmap estava no mapa: o mapa muda na hora e o
 * quadro seguinte deixa de referenciá-lo, antes de ele fechar. Desenhar um `ImageBitmap`
 * fechado lança `InvalidStateError` (achado 10 do relato de 2026-10-11).
 */
function closeAfterFrame(bitmap: { close(): void }): void {
  const close = () => bitmap.close();
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(close);
  else setTimeout(close, 0);
}

/**
 * Bitmaps de exibição por caminho de arquivo, carregados sob demanda e
 * liberados (`close()`) ao sair do projeto. O mapa nunca contém um bitmap fechado: o
 * caminho sai do mapa primeiro e o bitmap fecha depois do quadro seguinte.
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

  /** O bitmap de `path`, para fechar depois de tirá-lo do mapa (`undefined` se não há). */
  const bitmapOf = (path: string): T | undefined => {
    const current = images.value.get(path);
    return current?.status === 'ready' ? current.bitmap : undefined;
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
    retain(paths) {
      if (disposed) return;
      const dropped = [...images.value.keys()].filter((path) => !paths.has(path));
      if (dropped.length === 0) return;
      const next = new Map(images.value);
      const bitmaps: T[] = [];
      for (const path of dropped) {
        const bitmap = bitmapOf(path);
        if (bitmap) bitmaps.push(bitmap);
        // Um carregamento em andamento chega "velho": o bitmap é fechado ao chegar.
        loadingGeneration.delete(path);
        next.delete(path);
      }
      images.value = next;
      for (const bitmap of bitmaps) closeAfterFrame(bitmap);
    },
    invalidate(path) {
      const bitmap = bitmapOf(path);
      loadingGeneration.delete(path);
      set(path, null);
      if (bitmap) closeAfterFrame(bitmap);
    },
    dispose() {
      disposed = true;
      const bitmaps = [...images.value.keys()].flatMap((path) => bitmapOf(path) ?? []);
      images.value = new Map();
      for (const bitmap of bitmaps) closeAfterFrame(bitmap);
    },
  };
}
