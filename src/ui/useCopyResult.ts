import { useEffect, useRef, useState } from 'preact/hooks';

/** Resultado de uma cópia para a área de transferência, até voltar ao normal. */
export type CopyResult = 'ok' | 'failed' | null;

/** Quanto tempo o resultado da cópia fica à vista. */
export const COPY_RESULT_MS = 2000;

/**
 * Estado ok/falhou de um botão de copiar: `copy` roda a gravação (que devolve `true` se
 * deu certo) e o resultado volta a `null` depois de 2 s. `reset` zera na hora.
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
