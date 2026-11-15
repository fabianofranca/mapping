// The fake 2D context of the canvas tests, apart from the harness so that a test outside the app's
// stores (the MCP's, which has no `vite/client` types) can use it without importing them.
import { vi } from 'vitest';

/** 2D context that accepts any call; `measureText` estimates by the number of letters. */
export function fakeContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const state: Record<string | symbol, unknown> = { canvas };
  return new Proxy(state, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'measureText') {
        return (text: string) => ({ width: text.length * 6 });
      }
      if (key === 'getImageData' || key === 'createImageData') {
        return () => ({ data: new Uint8ClampedArray(4) });
      }
      // Konva reads the current matrix when isolating a shape (the review stamps): identity.
      if (key === 'getTransform') {
        return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      }
      if (key === 'createLinearGradient' || key === 'createRadialGradient') {
        return () => ({ addColorStop: () => undefined });
      }
      return () => undefined;
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

/** Replaces jsdom's `getContext` (which does not draw) with the fake context. */
export function installFakeCanvas(): void {
  const getContext = function (this: HTMLCanvasElement) {
    return fakeContext(this);
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    getContext as unknown as typeof HTMLCanvasElement.prototype.getContext,
  );
}
