import { useState } from 'preact/hooks';

/** Progresso de uma operação longa e a mensagem de erro/aviso sobre o canvas. */
export interface EditorNotices {
  readonly progress: string | null;
  readonly message: string | null;
  /** Há uma operação em andamento (importar, trocar, exportar). */
  readonly busy: boolean;
  setProgress(progress: string | null): void;
  setMessage(message: string | null): void;
}

export function useEditorNotices(): EditorNotices {
  const [progress, setProgress] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  return { progress, message, busy: progress !== null, setProgress, setMessage };
}
