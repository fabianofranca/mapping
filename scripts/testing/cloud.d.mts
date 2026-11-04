// Declaração de tipos de `cloud.mjs` (JS puro) para quem o importa de TypeScript
// (ex.: tests/tooling/cloudHelpers.test.ts). Os parâmetros do Playwright (`page`, `browser`) ficam
// como `unknown`: quem os usa de verdade já tem o valor com o tipo certo vindo do `connect()`.
export function connect(
  apoioDir: string,
  cdpUrl?: string,
): Promise<{ browser: unknown; page: unknown }>;
export function clickNoWait(
  page: unknown,
  name: string,
  options?: { scope?: unknown; exact?: boolean },
): Promise<void>;
export function waitForWindow(
  names: string[],
  options?: {
    timeoutMs?: number;
    stepMs?: number;
    find?: (names: string[]) => string | null | undefined;
    activeTitle?: () => string;
  },
): Promise<string>;
export function selectFolder(
  apoioDir: string,
  targetPath: string,
  options?: { timeoutMs?: number },
): Promise<{ hadAutocomplete: boolean; permission: string }>;
export function openFile(
  apoioDir: string,
  targetPath: string,
  options?: { timeoutMs?: number },
): Promise<{ hadAutocomplete: boolean }>;
export function saveFile(
  apoioDir: string,
  targetPath: string,
  options?: { timeoutMs?: number },
): Promise<void>;
export function cancelDialog(
  apoioDir: string,
  options?: { timeoutMs?: number },
): Promise<void>;
export function allowPermission(apoioDir: string): Promise<string>;
export function screenshot(apoioDir: string, name: string): Promise<string>;
export function windowShortcut(page: unknown, n: number): Promise<void>;
export function makeCadastroPng(dest: string): Promise<void>;
export function mark(apoioDir: string, roteiro: string, fase: 'start' | 'end'): void;
