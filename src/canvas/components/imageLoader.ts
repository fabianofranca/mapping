// Único lugar que cria imagem a partir de uma URL fora de `src/storage/` (PLAN.md, etapa
// "Imagens remotas", decisão 14; regra `imageCreationSyntaxRules` em eslint.config.js): nenhum
// código monta URL de imagem por fora da política de URL e do consentimento. A RI3 acrescentou
// aqui as imagens remotas (`crossOrigin`, `referrerPolicy`, limites, cache).

import { signal, type ReadonlySignal } from '@preact/signals';

const DATA_URL = /^data:/i;

export interface EmbeddedImageHandlers {
  onLoad(element: HTMLImageElement): void;
  onError?(): void;
}

/**
 * Carrega uma imagem embutida (`data:`). Devolve `null` para qualquer outro esquema
 * (defesa a mais: o renderizador já cai no reservado antes de chamar).
 */
export function loadEmbeddedImage(
  src: string,
  handlers: EmbeddedImageHandlers,
): HTMLImageElement | null {
  if (!DATA_URL.test(src)) return null;
  const element = new Image();
  element.onload = () => handlers.onLoad(element);
  if (handlers.onError) element.onerror = () => handlers.onError?.();
  element.src = src;
  return element;
}

// ---------------------------------------------------------------------------------------------
// Imagens remotas (RI3, decisões 6 e 17 do PLAN.md). A classe não conhece o consentimento nem a
// política de URL: quem a chama (`remoteImages.ts`) só pede uma URL que já passou pelas duas
// portas da app. Aqui ficam os limites (concorrência, tempo, tamanho), o bitmap reduzido, o
// cache em memória e a única nova tentativa sem CORS.

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

export interface RemoteImageRequest {
  /** Interruptor "Mostrar imagens de servidores sem CORS" (decisão 17). */
  readonly allowNoCors: boolean;
}

/** Limites do carregador (decisão 6). */
export const REMOTE_IMAGE_LIMITS = {
  parallel: 6,
  timeoutMs: 20_000,
  maxSide: 8192,
  maxPixels: 40_000_000,
  displaySide: 2048,
  cacheEntries: 64,
  /** Falhas lembradas na sessão (só a URL e o motivo; despeja a mais antiga). */
  failureEntries: 512,
} as const;

/** Dependências trocáveis nos testes (o jsdom não carrega imagem de verdade). */
export interface RemoteImageLoaderDeps {
  createImage(): HTMLImageElement;
  /** `undefined` = o navegador não tem `createImageBitmap`: usa o próprio elemento. */
  createBitmap:
    | ((image: HTMLImageElement, options?: ImageBitmapOptions) => Promise<ImageBitmap>)
    | undefined;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  requestFrame(callback: () => void): void;
}

function defaultDeps(): RemoteImageLoaderDeps {
  return {
    createImage: () => new Image(),
    createBitmap:
      typeof createImageBitmap === 'function'
        ? (image, options) => createImageBitmap(image, options)
        : undefined,
    setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
    clearTimeout: (handle) => globalThis.clearTimeout(handle as number),
    requestFrame: (callback) => {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(callback);
      else globalThis.setTimeout(callback, 16);
    },
  };
}

interface Ready {
  readonly image: CanvasImageSource;
  /** O mesmo `image` quando é bitmap (tem `close()`), senão `null`. */
  readonly bitmap: ImageBitmap | null;
  readonly width: number;
  readonly height: number;
  readonly opaque: boolean;
}

interface Pending {
  readonly url: string;
  /** Tentativa sem `crossOrigin` (a única, decisão 17). */
  readonly noCors: boolean;
  element: HTMLImageElement | null;
  timer: unknown;
}

interface Failure {
  readonly state: 'failed' | 'too-large';
  readonly timeout: boolean;
  /** A nova tentativa sem CORS já foi feita (ou não adiantaria): não se repete. */
  readonly triedNoCors: boolean;
}

export class RemoteImageLoader {
  private readonly deps: RemoteImageLoaderDeps;
  /** Carregadas (`loaded` e `opaque`), da menos para a mais recente (LRU pela ordem do Map). */
  private readonly ready = new Map<string, Ready>();
  private readonly failures = new Map<string, Failure>();
  private readonly inFlight = new Map<string, Pending>();
  private readonly queue: Pending[] = [];
  private active = 0;
  private readonly listeners = new Set<(url: string) => void>();
  private readonly toClose: ImageBitmap[] = [];
  private closeScheduled = false;
  /** Último valor do interruptor de CORS visto num `request` (a nova tentativa depende dele). */
  private noCorsAllowed = false;
  private readonly epochSignal = signal(0);

  /** Sobe quando uma imagem termina de carregar (a galeria do Catálogo invalida o cache). */
  readonly epoch: ReadonlySignal<number> = this.epochSignal;

  constructor(deps: Partial<RemoteImageLoaderDeps> = {}) {
    this.deps = { ...defaultDeps(), ...deps };
  }

  /**
   * O estado atual de uma URL; inicia a carga se for preciso. Nunca lança. `url` precisa ter
   * passado pelas duas portas da app (política de URL e consentimento).
   */
  request(url: string, { allowNoCors }: RemoteImageRequest): RemoteImageView {
    this.noCorsAllowed = allowNoCors;
    const ready = this.ready.get(url);
    if (ready) {
      // Imagem carregada sem CORS só aparece com o interruptor ligado.
      if (ready.opaque && !allowNoCors) return { state: 'failed', reason: 'failed' };
      this.ready.delete(url);
      this.ready.set(url, ready);
      return {
        state: ready.opaque ? 'opaque' : 'loaded',
        image: ready.image,
        width: ready.width,
        height: ready.height,
      };
    }
    const failure = this.failures.get(url);
    if (failure) {
      // A única nova tentativa: o interruptor foi ligado depois da falha com CORS.
      if (failure.state === 'failed' && !failure.triedNoCors && allowNoCors) {
        this.failures.delete(url);
        this.enqueue(url, true);
        return { state: 'loading' };
      }
      return failure.state === 'too-large'
        ? { state: 'too-large' }
        : { state: 'failed', reason: failure.timeout ? 'timeout' : 'failed' };
    }
    if (!this.inFlight.has(url)) this.enqueue(url, false);
    return { state: 'loading' };
  }

  /** Avisa (com a URL) cada mudança de estado: carregou, falhou ou saiu do cache. */
  subscribe(listener: (url: string) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Solta o cache e cancela o que está em andamento (testes e encerramento da app). */
  dispose(): void {
    for (const pending of this.inFlight.values()) this.cancel(pending);
    this.inFlight.clear();
    this.queue.length = 0;
    this.active = 0;
    for (const entry of this.ready.values()) this.release(entry);
    this.ready.clear();
    this.failures.clear();
    this.listeners.clear();
  }

  private enqueue(url: string, noCors: boolean): void {
    const pending: Pending = { url, noCors, element: null, timer: null };
    this.inFlight.set(url, pending);
    this.queue.push(pending);
    this.pump();
  }

  private pump(): void {
    while (this.active < REMOTE_IMAGE_LIMITS.parallel) {
      const next = this.queue.shift();
      if (!next) return;
      this.active += 1;
      this.start(next);
    }
  }

  private start(pending: Pending): void {
    const element = this.deps.createImage();
    pending.element = element;
    // Sem cookies entre origens (a menos da única nova tentativa sem CORS) e sem `Referer`.
    if (!pending.noCors) element.crossOrigin = 'anonymous';
    element.referrerPolicy = 'no-referrer';
    element.onload = () => {
      if (!this.owns(pending)) return;
      this.settle(pending);
      void this.onLoaded(pending, element);
    };
    element.onerror = () => {
      if (!this.owns(pending)) return;
      this.settle(pending);
      // Servidor sem CORS: com o interruptor ligado, uma só nova tentativa sem `crossOrigin`.
      if (!pending.noCors && this.noCorsAllowed) {
        this.enqueue(pending.url, true);
        return;
      }
      this.fail(pending.url, 'failed', false, pending.noCors);
    };
    pending.timer = this.deps.setTimeout(() => {
      if (!this.owns(pending)) return;
      this.cancel(pending);
      this.settle(pending);
      // Estourar o tempo não é falta de CORS: não há nova tentativa.
      this.fail(pending.url, 'failed', true, true);
    }, REMOTE_IMAGE_LIMITS.timeoutMs);
    element.src = pending.url;
  }

  private owns(pending: Pending): boolean {
    return this.inFlight.get(pending.url) === pending;
  }

  /** Para o relógio e libera a vaga (a próxima da fila começa já). */
  private settle(pending: Pending): void {
    if (pending.timer !== null) this.deps.clearTimeout(pending.timer);
    pending.timer = null;
    this.active = Math.max(0, this.active - 1);
    this.pump();
  }

  private cancel(pending: Pending): void {
    if (pending.timer !== null) this.deps.clearTimeout(pending.timer);
    pending.timer = null;
    const element = pending.element;
    if (!element) return;
    element.onload = null;
    element.onerror = null;
    // Abandona a transferência (só a string vazia: nunca monta URL por fora da política).
    element.src = '';
  }

  private fail(
    url: string,
    state: Failure['state'],
    timeout: boolean,
    triedNoCors: boolean,
  ): void {
    this.inFlight.delete(url);
    this.failures.delete(url);
    this.failures.set(url, { state, timeout, triedNoCors });
    while (this.failures.size > REMOTE_IMAGE_LIMITS.failureEntries) {
      const oldest = this.failures.keys().next();
      if (oldest.done) break;
      this.failures.delete(oldest.value);
    }
    this.emit(url);
  }

  private async onLoaded(pending: Pending, element: HTMLImageElement): Promise<void> {
    const { url } = pending;
    const width = element.naturalWidth;
    const height = element.naturalHeight;
    const { maxSide, maxPixels } = REMOTE_IMAGE_LIMITS;
    if (width <= 0 || height <= 0) {
      this.fail(url, 'failed', false, true);
      return;
    }
    if (width > maxSide || height > maxSide || width * height > maxPixels) {
      // Nada é decodificado para bitmap.
      this.fail(url, 'too-large', false, true);
      return;
    }
    let shown: Omit<Ready, 'opaque'>;
    try {
      shown = await this.display(element, width, height);
    } catch {
      if (this.owns(pending)) this.fail(url, 'failed', false, pending.noCors);
      return;
    }
    // Pode ter sido cancelada (`dispose`) enquanto o bitmap era feito.
    if (!this.owns(pending)) {
      if (shown.bitmap) this.defer(shown.bitmap);
      return;
    }
    this.inFlight.delete(url);
    this.store(url, { ...shown, opaque: pending.noCors });
    this.epochSignal.value += 1;
    this.emit(url);
  }

  /** O que se desenha: bitmap reduzido a 2048 px no lado maior, ou o próprio elemento. */
  private async display(
    element: HTMLImageElement,
    width: number,
    height: number,
  ): Promise<Omit<Ready, 'opaque'>> {
    const createBitmap = this.deps.createBitmap;
    if (!createBitmap) return { image: element, bitmap: null, width, height };
    const longest = Math.max(width, height);
    const limit = REMOTE_IMAGE_LIMITS.displaySide;
    try {
      const bitmap =
        longest <= limit
          ? await createBitmap(element)
          : await createBitmap(element, {
              resizeWidth: Math.max(1, Math.round((width * limit) / longest)),
              resizeHeight: Math.max(1, Math.round((height * limit) / longest)),
              resizeQuality: 'high',
            });
      return { image: bitmap, bitmap, width: bitmap.width, height: bitmap.height };
    } catch {
      // Bitmap não saiu: o elemento carregado serve.
      return { image: element, bitmap: null, width, height };
    }
  }

  private store(url: string, entry: Ready): void {
    this.ready.set(url, entry);
    while (this.ready.size > REMOTE_IMAGE_LIMITS.cacheEntries) {
      const oldest = this.ready.entries().next();
      if (oldest.done) break;
      const [evictedUrl, evicted] = oldest.value;
      this.ready.delete(evictedUrl);
      // Um nó do Konva pode estar usando o bitmap neste quadro: o `close()` espera o próximo.
      this.release(evicted);
      this.emit(evictedUrl);
    }
  }

  private release(entry: Ready): void {
    if (entry.bitmap) this.defer(entry.bitmap);
  }

  private defer(bitmap: ImageBitmap): void {
    this.toClose.push(bitmap);
    if (this.closeScheduled) return;
    this.closeScheduled = true;
    this.deps.requestFrame(() => {
      this.closeScheduled = false;
      for (const item of this.toClose.splice(0)) item.close();
    });
  }

  private emit(url: string): void {
    for (const listener of [...this.listeners]) listener(url);
  }
}

let shared: RemoteImageLoader | null = null;

/** O carregador único da app (o cache sobrevive a trocas de projeto e a reaberturas). */
export function sharedRemoteImageLoader(): RemoteImageLoader {
  shared ??= new RemoteImageLoader();
  return shared;
}
