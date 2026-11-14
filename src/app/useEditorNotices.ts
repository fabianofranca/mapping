import { useState } from 'preact/hooks';

/** Progress of a long operation and the error/warning message over the canvas. */
export interface EditorNotices {
  readonly progress: string | null;
  readonly message: string | null;
  /** An operation is in progress (import, replace, export). */
  readonly busy: boolean;
  setProgress(progress: string | null): void;
  setMessage(message: string | null): void;
}

export function useEditorNotices(): EditorNotices {
  const [progress, setProgress] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  return { progress, message, busy: progress !== null, setProgress, setMessage };
}
