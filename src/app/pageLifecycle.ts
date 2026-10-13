// Gravar ao sair da página (fase 8.4: saiu do controller, sem mudança de comportamento).
import type { ProjectSession } from '../store/session';

let bound = false;

/**
 * Grava ao sair da página e avisa antes de fechar com alterações não gravadas. A gravação é
 * assíncrona e pode morrer com a aba, por isso começa já em `visibilitychange: hidden` e em
 * `pagehide` (o iOS Safari não dispara `beforeunload`), sem esperar o debounce. `flush()`
 * entra na fila da sessão (atrás de uma conferência ou gravação em curso) e nunca rejeita.
 * `currentSession`: a sessão do projeto aberto agora, lida a cada evento. Chamar uma vez.
 */
export function bindPageLifecycle(
  currentSession: () => ProjectSession | undefined,
): void {
  if (bound) return;
  bound = true;
  const flushNow = () => void currentSession()?.flush();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNow();
  });
  window.addEventListener('pagehide', flushNow);
  window.addEventListener('beforeunload', (event) => {
    const status = currentSession()?.saveStatus.value;
    if (status && status !== 'saved') {
      // `flushNow()` só agenda a gravação: o diálogo de confirmação é modal e pausa a página,
      // então a escrita (assíncrona) só anda se a pessoa escolher ficar. A proteção é essa
      // escolha; confirmar a saída perde o que ainda não foi gravado.
      flushNow();
      event.preventDefault();
    }
  });
}
