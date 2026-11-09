import type { LoadedFont } from '../model/components/library';
import type { FontRegistry, FontStatus } from '../storage/fonts';
import { reportError } from '../utils/report';

// O registro de fontes de um catálogo: lê os bytes de cada fonte declarada (uma falha de leitura
// só deixa a fonte sem bytes), registra em série e só avisa se a rodada ainda é a mais nova.

export interface FontSyncDeps {
  readonly registry: FontRegistry;
  /** `true` depois do `dispose` do dono: nada mais é registrado nem avisado. */
  readonly isDisposed: () => boolean;
  /** Chamado com a situação das fontes quando o registro de uma rodada vigente termina. */
  readonly onRegistered: (status: readonly FontStatus[]) => void;
}

export interface FontSync {
  /**
   * Abre uma rodada nova (a anterior fica velha: se ainda não registrou, nem registra) e lê os
   * bytes de cada item, em paralelo e na ordem. `read` devolve os bytes da fonte ou `null`.
   */
  start<T>(
    items: readonly T[],
    fontOf: (item: T) => LoadedFont,
    read: (item: T) => Promise<ArrayBuffer | null>,
  ): Promise<void>;
}

export function createFontSync(deps: FontSyncDeps): FontSync {
  let fontRun = 0;
  // Os registros correm um depois do outro: o de uma rodada velha nem começa.
  let registerChain: Promise<unknown> = Promise.resolve();

  async function loadFont<T>(
    item: T,
    fontOf: (item: T) => LoadedFont,
    read: (item: T) => Promise<ArrayBuffer | null>,
  ): Promise<LoadedFont> {
    const font = fontOf(item);
    let bytes: ArrayBuffer | undefined;
    try {
      bytes = (await read(item)) ?? undefined;
    } catch (error) {
      reportError('components.font', error);
    }
    return bytes ? { ...font, bytes } : font;
  }

  async function sync<T>(
    items: readonly T[],
    fontOf: (item: T) => LoadedFont,
    read: (item: T) => Promise<ArrayBuffer | null>,
    run: number,
  ): Promise<void> {
    await Promise.resolve();
    try {
      const fonts = await Promise.all(items.map((item) => loadFont(item, fontOf, read)));
      const task = registerChain.then(() =>
        deps.isDisposed() || run !== fontRun ? null : deps.registry.register(fonts),
      );
      registerChain = task.catch(() => undefined);
      const status = await task;
      if (status === null || deps.isDisposed() || run !== fontRun) return;
      deps.onRegistered(status);
    } catch (error) {
      reportError('components.fonts', error);
    }
  }

  return {
    start(items, fontOf, read) {
      fontRun += 1;
      return sync(items, fontOf, read, fontRun);
    },
  };
}
