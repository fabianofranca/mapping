import { computed, signal, type ReadonlySignal } from '@preact/signals';
import { reportedErrors, type ReportedError } from '../utils/report';

// "Visto até" do Diagnóstico (B4): o último erro que o usuário já viu. Enquanto o
// registro tiver um erro mais novo, a faixa mostra o ponto de alerta. Estado de UI
// (por sessão do navegador): fora do projeto, do histórico e do `localStorage`.

const seen = signal<ReportedError | null>(null);

/** Há erro registrado que ainda não foi visto (a janela Diagnóstico não esteve aberta). */
export const diagnosticsUnseen: ReadonlySignal<boolean> = computed(() => {
  const last = reportedErrors.value.at(-1);
  return last !== undefined && last !== seen.value;
});

/** Marca todos os erros registrados até agora como vistos. */
export function markDiagnosticsSeen(): void {
  seen.value = reportedErrors.peek().at(-1) ?? null;
}

// Falhas e bloqueios de imagem remota no Diagnóstico (RI3). Em memória, por sessão.
export type RemoteImageIssueReason =
  'blocked-consent' | 'invalid' | 'failed' | 'too-large' | 'timeout';

export interface RemoteImageIssue {
  /** URL encurtada (sem consulta nem fragmento, no máximo 80 caracteres). */
  readonly url: string;
  readonly reason: RemoteImageIssueReason;
}

const SHORT_URL_MAX = 80;

function shortenUrl(url: string): string {
  let text = url;
  try {
    const parsed = new URL(url);
    text = `${parsed.origin}${parsed.pathname}`;
  } catch {
    // URL ilegível: encurta o texto como está.
  }
  return text.length > SHORT_URL_MAX ? `${text.slice(0, SHORT_URL_MAX - 1)}…` : text;
}

const issues = signal<readonly RemoteImageIssue[]>([]);
const reportedUrls = new Set<string>();

/** Falhas e bloqueios de imagem remota desta sessão, na ordem em que apareceram. */
export const remoteImageIssues: ReadonlySignal<readonly RemoteImageIssue[]> = issues;

/** Registra uma falha ou bloqueio de imagem remota; só a primeira vez por URL conta. */
export function reportRemoteImageIssue(
  url: string,
  reason: RemoteImageIssueReason,
): void {
  if (reportedUrls.has(url)) return;
  reportedUrls.add(url);
  issues.value = [...issues.peek(), { url: shortenUrl(url), reason }];
}

/** Só para testes. */
export function clearRemoteImageIssues(): void {
  reportedUrls.clear();
  issues.value = [];
}
