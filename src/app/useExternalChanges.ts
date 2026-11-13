import { effect } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { t } from '../i18n';
import { resolveShownSelection } from '../store/shownSelection';
import { showToast } from '../store/ui';
import { useEditor } from '../ui/EditorContext';
import { reportError } from '../utils/report';

/** Intervalo mínimo entre as conferências do `mapping.json` (só com a janela visível). */
export const EXTERNAL_POLL_MS = 3000;
/** Intervalo máximo: numa pasta lenta (Android, nuvem) a conferência espaça até aqui. */
export const EXTERNAL_POLL_MAX_MS = 30_000;
/** O próximo ciclo começa `EXTERNAL_POLL_FACTOR` × a duração do último depois que ele terminou. */
export const EXTERNAL_POLL_FACTOR = 4;

/**
 * Quanto esperar depois de um ciclo de `durationMs`: `clamp(4 × duração, mínimo, 30 s)`. Numa
 * pasta rápida o ciclo dura bem menos que 750 ms e o intervalo fica no mínimo (3 s); numa lenta,
 * a pasta nunca fica ocupada o tempo todo (no máximo ~1/5 do tempo conferindo).
 */
export function nextPollDelay(durationMs: number, minMs = EXTERNAL_POLL_MS): number {
  const wanted = EXTERNAL_POLL_FACTOR * durationMs;
  return Math.min(Math.max(wanted, minMs), Math.max(EXTERNAL_POLL_MAX_MS, minMs));
}

/**
 * Percebe mudanças feitas por fora (o servidor MCP, um editor de texto, o git) em projetos
 * de pasta: confere o `mapping.json` enquanto a janela está visível e, ao voltar o foco, confere
 * também os arquivos de imagem e as propostas finais. O ciclo é um `setTimeout` encadeado: o
 * próximo começa `nextPollDelay(duração do último)` depois que o último terminou (3 s numa pasta
 * rápida, até 30 s numa lenta), e com trabalho em curso (`session.busy()`: gravação, gesto,
 * decisão ou aplicação de proposta) é adiado para o próximo intervalo mínimo. Sem alterações locais
 * pendentes o projeto é recarregado sozinho, com um aviso discreto; com a gravação em erro, a
 * sessão abre o diálogo "Projeto alterado fora da app" (`session.conflict`), sem recarregar. As
 * chamadas a `session.sync` entram na fila da sessão e as concorrentes são juntadas (um `focus`
 * durante o ciclo não perde a conferência das imagens), então este hook não controla
 * concorrência. Seleção, camadas visíveis e viewport ficam como estão (são estado da UI); a
 * seleção só é limpa se o item deixou de existir.
 */
export function useExternalChanges(interval = EXTERNAL_POLL_MS): void {
  const { session, review, ui } = useEditor();

  useEffect(() => {
    if (!session.watchable) return;
    const visible = () => document.visibilityState === 'visible';
    const check = (images: boolean): Promise<void> =>
      session.sync({ images }).then(
        (result) => {
          if (result === 'reloaded') showToast(ui, t('editor.externalUpdated'));
        },
        (e: unknown) => reportError('session.sync', e),
      );
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cycle = async () => {
      let delay = interval;
      if (visible() && !session.busy()) {
        const started = performance.now();
        await check(false);
        delay = nextPollDelay(performance.now() - started, interval);
      }
      if (!stopped) timer = setTimeout(() => void cycle(), delay);
    };
    timer = setTimeout(() => void cycle(), interval);
    const onFocus = () => {
      if (visible()) void check(true);
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [session, ui, interval]);

  // Depois de recarregar (sozinho ou pelo diálogo), a seleção que sumiu do arquivo é limpa.
  // Pelo projeto à vista: na visão Proposto da revisão, o item que só existe na prévia
  // continua selecionado (fase 8.2, P1), e o de uma criação rejeitada também.
  useEffect(
    () =>
      effect(() => {
        void session.reloads.value;
        if (!resolveShownSelection(review, ui.selection.peek(), true)) {
          ui.selection.value = null;
        }
      }),
    [session, review, ui],
  );
}
