import { execFileSync } from 'node:child_process';

/** The `APPEND_ONLY` list of painel.py (stage #2314), read by importing the module (no regex over the source). */
export function appendOnlyList(): string[] {
  const code =
    'import json, sys; sys.path.insert(0, ".claude/skills/implementar-fila/painel"); import painel; print(json.dumps(list(painel.APPEND_ONLY)))';
  return JSON.parse(
    execFileSync('python3', ['-I', '-c', code], { encoding: 'utf8' }),
  ) as string[];
}
