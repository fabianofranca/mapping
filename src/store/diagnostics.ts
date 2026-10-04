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
