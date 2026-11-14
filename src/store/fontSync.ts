import type { LoadedFont } from '../model/components/library';
import type { FontRegistry, FontStatus } from '../storage/fonts';
import { reportError } from '../utils/report';

// The font registry of a catalog: reads the bytes of each declared font (a read failure
// only leaves the font without bytes), registers in series and only notifies if the round is
// still the newest.

export interface FontSyncDeps {
  readonly registry: FontRegistry;
  /** `true` after the owner's `dispose`: nothing else is registered or notified. */
  readonly isDisposed: () => boolean;
  /** Called with the fonts' status when the registration of a current round finishes. */
  readonly onRegistered: (status: readonly FontStatus[]) => void;
}

export interface FontSync {
  /**
   * Opens a new round (the previous one becomes stale: if it has not registered yet, it does
   * not even register) and reads the bytes of each item, in parallel and in order. `read` returns the font's bytes or `null`.
   */
  start<T>(
    items: readonly T[],
    fontOf: (item: T) => LoadedFont,
    read: (item: T) => Promise<ArrayBuffer | null>,
  ): Promise<void>;
}

export function createFontSync(deps: FontSyncDeps): FontSync {
  let fontRun = 0;
  // Registrations run one after the other: a stale round's does not even start.
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
