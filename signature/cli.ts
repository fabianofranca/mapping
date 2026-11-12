// Esboço (testes primeiro): a CLI de verdade vem depois.
export interface CliIo {
  readFile(path: string): string;
  writeFile(path: string, text: string): void;
  stdout(text: string): void;
  stderr(text: string): void;
}

export function runCli(_argv: readonly string[], io?: CliIo): number {
  io?.stderr('não implementado\n');
  return 1;
}
