// Declaração de tipos de `cloud.mjs` (JS puro) para quem o importa de TypeScript
// (ex.: tests/tooling/cloudHelpers.test.ts). Os parâmetros do Playwright (`page`, `browser`) ficam
// como `unknown`: quem os usa de verdade já tem o valor com o tipo certo vindo do `connect()`.
export interface ConnectOptions {
  /** Prazo padrão das ações da página (ms); 5000. */
  timeoutMs?: number;
  /** Prazo padrão das navegações (ms); 15000. */
  navigationTimeoutMs?: number;
  /** Origem da app; `http://localhost:8080`. */
  origin?: string;
  /** Injetável para teste: no lugar de `chromium.connectOverCDP`. */
  connectOverCDP?: (cdpUrl: string) => Promise<unknown>;
}
export function connect(
  apoioDir: string,
  cdpUrl?: string,
  options?: ConnectOptions,
): Promise<{ browser: unknown; page: unknown }>;
export interface PageInfo {
  url: string;
  title?: string;
  [key: string]: unknown;
}
export function pickAppPage<T extends PageInfo>(
  pages: T[],
  options?: { origin?: string },
): T;
export function parseEnvFile(text: string): Record<string, string>;
export function loadEnv(
  apoioDir: string,
  env?: Record<string, string | undefined>,
): Record<string, string | undefined>;
export function diffJson(
  before: unknown,
  after: unknown,
  options?: { limit?: number },
): string[];
export interface TesterState {
  title: string;
  url: string;
  dialogs: string[];
  notices: string[];
  saveStatus: string | null;
  focus: { role: string; name: string } | null;
  windows: string[];
  project?: {
    revision: number | null;
    changes: string[] | null;
    error?: string;
  } | null;
}
export function formatState(state: TesterState): string;
export function state(
  page: unknown,
  apoioDir: string,
  options?: { projectDir?: string },
): Promise<TesterState>;
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
