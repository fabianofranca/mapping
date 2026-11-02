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
/** Posição de cada URL em `issues`, para trocar a razão no lugar quando ela muda. */
const issueIndex = new Map<string, number>();

/** Falhas e bloqueios de imagem remota desta sessão, na ordem em que apareceram. */
export const remoteImageIssues: ReadonlySignal<readonly RemoteImageIssue[]> = issues;

/**
 * Registra uma falha ou bloqueio de imagem remota. Cada URL aparece uma vez, na ordem da
 * primeira vez; se a razão muda (ex.: "endereço não aceito" vira "não carregou" depois que a
 * pessoa liga um interruptor da Privacidade), a linha ganha a razão nova no mesmo lugar.
 */
export function reportRemoteImageIssue(
  url: string,
  reason: RemoteImageIssueReason,
): void {
  const at = issueIndex.get(url);
  const current = issues.peek();
  if (at === undefined) {
    issueIndex.set(url, current.length);
    issues.value = [...current, { url: shortenUrl(url), reason }];
    return;
  }
  const known = current[at];
  if (known === undefined || known.reason === reason) return;
  issues.value = current.map((item, i) => (i === at ? { ...item, reason } : item));
}

/** Só para testes. */
export function clearRemoteImageIssues(): void {
  issueIndex.clear();
  issues.value = [];
}
