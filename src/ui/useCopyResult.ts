import { useEffect, useRef, useState } from 'preact/hooks';

/** Result of a copy to the clipboard, until it goes back to normal. */
export type CopyResult = 'ok' | 'failed' | null;

/** How long the copy result stays in view. */
export const COPY_RESULT_MS = 2000;

/**
 * Ok/failed state of a copy button: `copy` runs the write (which returns `true` if it
 * worked) and the result goes back to `null` after 2 s. `reset` clears it immediately.
 */
export function useCopyResult() {
  const [result, setResult] = useState<CopyResult>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  const reset = () => {
    clearTimeout(timer.current);
    setResult(null);
  };
  const copy = async (write: () => Promise<boolean>) => {
    const ok = await write();
    setResult(ok ? 'ok' : 'failed');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setResult(null), COPY_RESULT_MS);
  };
  return { result, copy, reset };
}
