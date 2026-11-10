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
export function connectGuide(
  apoioDir: string,
  cdpUrl?: string,
  options?: ConnectOptions,
): Promise<{ browser: unknown; page: unknown }>;
export const OPEN_DIALOG_TITLES: string[];
export interface X11Window {
  id: string;
  name: string;
}
export function pickAutocompletePopup(
  windows: X11Window[],
  geometryOf: (id: string) => { HEIGHT: number },
  dialogWindowId: string,
): { window: X11Window; geometry: { HEIGHT: number } } | null;
export function openButtonPoints(geometry: {
  X: number;
  Y: number;
  WIDTH: number;
  HEIGHT: number;
}): { x: number; y: number }[];
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
    dir?: string;
    error?: string;
  } | null;
}
export function formatState(state: TesterState): string;
export function state(
  page: unknown,
  apoioDir: string,
  options?: { projectDir?: string | null },
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
  options?: { timeoutMs?: number; cancel?: (apoioDir: string) => Promise<unknown> },
): Promise<{ hadAutocomplete: boolean; permission: string }>;
export function openFile(
  apoioDir: string,
  targetPath: string,
  options?: { timeoutMs?: number; cancel?: (apoioDir: string) => Promise<unknown> },
): Promise<{ hadAutocomplete: boolean }>;
export function saveFile(
  apoioDir: string,
  targetPath: string,
  options?: { timeoutMs?: number; cancel?: (apoioDir: string) => Promise<unknown> },
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

export interface TempoItem {
  nome: string;
  /** Duração do primeiro `start` ao último `end`; `null` quando falta uma marca (tempo não medido). */
  segundos: number | null;
}
export interface Tempos {
  itens: TempoItem[];
  avisos: string[];
  totalSegundos: number;
}
export function temposFromLog(text: string): Tempos;
export function temposFromDir(apoioDir: string): Tempos;
/** A `apoio/` da rodada mais recente em `~/mapping-testes`, ou `null` (usada quando `APOIO` não está exportado). */
export function defaultApoioDir(home?: string): string | null;
export function formatTempos(tempos: Tempos): string;

export function containerScreenPoint(args: {
  mapping: {
    markings?: {
      id: string;
      name: string;
      containerId: string | null;
      rect: { x: number; y: number };
    }[];
    containers?: {
      id: string;
      name: string;
      placement: { x: number; y: number; scale: number };
    }[];
    perspectives?: { name: string; items: { root: string; x: number; y: number }[] }[];
  };
  container: string;
  x: number;
  y: number;
  viewport: string;
  host: { x: number; y: number };
  perspective?: string;
  marking?: boolean;
}): { x: number; y: number };
export function ponto(
  page: unknown,
  projectDir: string,
  container: string,
  x: number,
  y: number,
  options?: { perspective?: string; marking?: boolean },
): Promise<{ x: number; y: number }>;

export interface Candidate {
  role: string;
  name: string;
  region: string;
}
export function settle(
  page: unknown,
  options?: { timeoutMs?: number; warn?: (message: string) => void },
): Promise<string | null>;
export const TOOL_WINDOW_IDS: string[];
export function openWindow(page: unknown, id: string): Promise<void>;
export function closeWindow(page: unknown, id: string): Promise<void>;
export function nearHandle(
  box: { x: number; y: number; width: number; height: number },
  point: { x: number; y: number },
  options?: { container?: boolean },
): string | null;
export function paletteDrag(
  page: unknown,
  tipo: string,
  para: { x: number; y: number },
  options?: { capture?: string; steps?: number },
): Promise<{ via: 'nativo' | 'sintetico' }>;
export function drag(
  page: unknown,
  de: { x: number; y: number },
  para: { x: number; y: number },
  options?: { select?: boolean; steps?: number; warn?: (message: string) => void },
): Promise<void>;
export function setViewport(
  page: unknown,
  largura: number,
  altura: number,
): Promise<void>;
export function find(page: unknown, texto: string): Promise<Candidate[]>;
export function formatCandidates(candidates: Candidate[], texto: string): string;
export function locatorTextFromError(message: string): string | null;

export interface HelpEntry {
  sig: string;
  desc: string;
}
export const HELP: Record<string, HelpEntry>;
export function formatHelp(): string;
export function runStep(
  body: string,
  options?: {
    apoioDir?: string;
    projectDir?: string;
    prazoSeconds?: number;
    connectFn?: (apoioDir?: string) => Promise<{ browser: unknown; page: unknown }>;
    io?: { log: (message: string) => void; error: (message: string) => void };
  },
): Promise<number>;
