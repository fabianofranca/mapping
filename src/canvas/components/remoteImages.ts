// A ponte entre o desenho e as imagens remotas (RI3, decisões 5, 6 e 7 do PLAN.md): resolve cada
// URL pelas duas portas da app (política de URL e consentimento) e, liberada, pelo carregador.
// Usada pelo canvas principal e pela galeria do Catálogo; o `renderScene` só recebe o resultado.
import { computed, type ReadonlySignal } from '@preact/signals';
import { allowNoCors, remoteImageGate } from '../../store/imagePermissions';
import { reportRemoteImageIssue } from '../../store/diagnostics';
import {
  type RemoteImageLoader,
  type RemoteImageView,
  sharedRemoteImageLoader,
} from './imageLoader';

/** O que o canvas e a galeria precisam para desenhar imagens remotas. */
export interface RemoteImageSource {
  /** O estado da URL (inicia a carga se for preciso; nunca lança). */
  resolve(url: string): RemoteImageView;
  /** Avisa (com a URL) quando o estado de uma imagem muda no carregador. */
  subscribe(listener: (url: string) => void): () => void;
  /**
   * Muda (outro valor) quando o consentimento ou um interruptor muda: tudo que usa imagem
   * remota precisa ser refeito. Lido dentro de `effect`/`computed`.
   */
  readonly gate: ReadonlySignal<unknown>;
  /** Sobe quando uma imagem termina de carregar. */
  readonly epoch: ReadonlySignal<number>;
}

export interface RemoteImageSourceDeps {
  readonly loader: RemoteImageLoader;
  readonly gate: typeof remoteImageGate;
  readonly allowNoCors: typeof allowNoCors;
  readonly report: typeof reportRemoteImageIssue;
}

export function createRemoteImageSource(
  deps: Partial<RemoteImageSourceDeps> = {},
): RemoteImageSource {
  const loader = deps.loader ?? sharedRemoteImageLoader();
  const gateSignal = deps.gate ?? remoteImageGate;
  const noCorsSignal = deps.allowNoCors ?? allowNoCors;
  const report = deps.report ?? reportRemoteImageIssue;
  // O carregador usa a URL normalizada pela política; o desenho, a do campo: o aviso traduz.
  const rawUrls = new Map<string, Set<string>>();
  return {
    resolve(url) {
      // `peek`: o desenho roda fora de `effect`; quem precisa reagir lê `gate`.
      const gate = gateSignal.peek()(url);
      if (!gate.allowed) {
        report(url, gate.state);
        return { state: gate.state };
      }
      const known = rawUrls.get(gate.url);
      if (known) known.add(url);
      else rawUrls.set(gate.url, new Set([url]));
      const view = loader.request(gate.url, { allowNoCors: noCorsSignal.peek() });
      if (view.state === 'failed')
        report(url, view.reason === 'timeout' ? 'timeout' : 'failed');
      else if (view.state === 'too-large') report(url, 'too-large');
      return view;
    },
    subscribe: (listener) =>
      loader.subscribe((loaded) => {
        for (const url of rawUrls.get(loaded) ?? [loaded]) listener(url);
      }),
    gate: computed(() => ({ gate: gateSignal.value, noCors: noCorsSignal.value })),
    epoch: loader.epoch,
  };
}

let shared: RemoteImageSource | null = null;

/** A fonte de produção, única para o canvas e a galeria. */
export function sharedRemoteImageSource(): RemoteImageSource {
  shared ??= createRemoteImageSource();
  return shared;
}
