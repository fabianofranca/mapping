/**
 * Imagens remotas do visualizador embutível (RI4, decisão 9 do PLAN.md). Desligadas por padrão:
 * sem a opção `remoteImages`, nenhum `Image` é criado e nada vai à rede.
 *
 * Ligadas, valem as duas portas, na versão do hospedeiro: a URL passa na política pura do
 * modelo (`checkRemoteImageUrl`: só `https:`, sem usuário e senha, sem rede local) **e** a
 * origem passa na função `allowOrigin(origin)` que o HOSPEDEIRO fornece (padrão: recusar tudo).
 * O visualizador não guarda consentimento nem tem interface para pedir: quem decide é o site.
 * Nunca usa o interruptor "servidor sem CORS" da app (a imagem é sempre pedida com
 * `crossOrigin = 'anonymous'`), de modo que nenhuma imagem contamina o canvas e o `toDataURL`
 * do visualizador continua válido (e roda com `pixelSafe`).
 *
 * O carregador é o do produto (`RemoteImageLoader`: concorrência, tempo limite, tamanho máximo,
 * bitmap reduzido, `no-referrer`), um por visualizador, destruído em `dispose()`.
 */
import {
  RemoteImageLoader,
  type RemoteImageView,
} from '../../src/canvas/components/imageLoader';
import { checkRemoteImageUrl } from '../../src/model/remoteImages';

/** O hospedeiro decide por origem (`https://cdn.exemplo.com`); lançar equivale a recusar. */
export type AllowOrigin = (origin: string) => boolean;

export interface ViewerRemoteImages {
  /** O estado da URL (inicia a carga se for preciso; nunca lança). */
  resolve(url: string): RemoteImageView;
  /** Avisa (com a URL como o componente a escreveu) quando o estado de uma imagem muda. */
  subscribe(listener: (url: string) => void): () => void;
  dispose(): void;
}

function isAllowed(allowOrigin: AllowOrigin | undefined, origin: string): boolean {
  try {
    return allowOrigin?.(origin) === true;
  } catch {
    return false;
  }
}

export function createViewerRemoteImages(
  allowOrigin: AllowOrigin | undefined,
  loader: RemoteImageLoader = new RemoteImageLoader(),
): ViewerRemoteImages {
  // O carregador trabalha com a URL normalizada pela política; o desenho, com a do campo.
  const rawUrls = new Map<string, Set<string>>();
  return {
    resolve(url) {
      const check = checkRemoteImageUrl(url, {
        allowHttp: false,
        allowLocalNetwork: false,
      });
      if (!check.ok) return { state: 'invalid' };
      if (!isAllowed(allowOrigin, check.origin)) return { state: 'blocked-consent' };
      const known = rawUrls.get(check.url);
      if (known) known.add(url);
      else rawUrls.set(check.url, new Set([url]));
      return loader.request(check.url, { allowNoCors: false });
    },
    subscribe: (listener) =>
      loader.subscribe((loaded) => {
        for (const url of rawUrls.get(loaded) ?? [loaded]) listener(url);
      }),
    dispose() {
      loader.dispose();
      rawUrls.clear();
    },
  };
}
