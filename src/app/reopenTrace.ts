// O rastro de um Abrir de pasta dos recentes, para o Diagnóstico (contexto `folders.reopen`).
// Devolução do portão da 8.4 (achado 1): pasta renomeada, pedido de permissão concedido e
// nenhum aviso na tela. O rastro guarda o caminho do `openRecentFolder`, o que a Home fez com
// o resultado, se o aviso está mesmo na tela, os eventos da janela e como o aviso fechou, e
// só grava quando o caminho passou pelo pedido e não abriu o projeto, ou quando o resultado
// não virou nem o aviso visível nem o projeto aberto (`docs/ARCHITECTURE.md`, recentes).
// O projeto inconsistente (diálogo de reparo) é o caminho normal: só grava se houve pedido.
// Textos técnicos, como os outros contextos do Diagnóstico.
import type { RefObject } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import type { DialogCancelCause } from '../ui/Dialog';
import { reportError } from '../utils/report';
import type { AppResult } from './appResult';
import type { RecentFolderOpen, ReopenSteps } from './recents';

export const REOPEN_CONTEXT = 'folders.reopen';

/** Eventos da janela guardados por rastro (os primeiros). */
const WINDOW_EVENTS_MAX = 8;

/** Como o aviso "Pasta indisponível" fechou. */
export type ReopenCloseCause =
  DialogCancelCause | 'cancel-button' | 'forget' | 'relocate' | 'unmount';

type Phase =
  /** Esperando o resultado do `openRecentFolder`. */
  | 'pending'
  /** O resultado pede o aviso; esperando a renderização que o monta. */
  | 'awaiting-dialog'
  /** O aviso de um rastro gravado está aberto: falta a linha do fechamento. */
  | 'dialog'
  | 'done';

const isCause = (value: unknown): value is DialogCancelCause =>
  value === 'cancel' || value === 'backdrop' || value === 'close-button';

/** `open,modal,visible`: o aviso montado está mesmo na tela? `?` quando não dá para saber. */
function describeDialog(dialog: HTMLDialogElement): {
  readonly text: string;
  readonly onScreen: boolean;
} {
  let modal = '?';
  try {
    modal = dialog.matches(':modal') ? 'modal' : 'nonmodal';
  } catch {
    // Seletor desconhecido neste navegador.
  }
  const visible =
    typeof dialog.checkVisibility === 'function'
      ? dialog.checkVisibility()
        ? 'visible'
        : 'hidden'
      : '?';
  const open = dialog.open ? 'open' : 'closed';
  return {
    text: `${open},${modal},${visible}`,
    onScreen: open === 'open' && visible !== 'hidden',
  };
}

/**
 * Um rastro: nasce no clique em Abrir, ouve a janela enquanto vive e acaba quando o projeto
 * abre, quando a Home termina de tratar o resultado sem nada a esperar, ou quando o aviso de
 * um rastro gravado fecha. Fora disso não guarda nada.
 */
export class ReopenTrace implements ReopenSteps {
  private readonly steps: string[] = [];
  private readonly events: string[] = [];
  private readonly start: number;
  private phase: Phase = 'pending';
  private reported = false;
  private shownAt = 0;
  private readonly detach: () => void;

  constructor(private readonly now: () => number = () => performance.now()) {
    this.start = now();
    const onWindow = (event: Event) => {
      if (event.type === 'pagehide') this.pagehide();
      const label =
        event.type === 'visibilitychange'
          ? `visibilitychange:${document.visibilityState}`
          : event.type;
      if (this.events.length < WINDOW_EVENTS_MAX)
        this.events.push(`${label}@${this.ms()}`);
    };
    const windowEvents = ['blur', 'focus', 'pagehide'] as const;
    for (const type of windowEvents) window.addEventListener(type, onWindow);
    document.addEventListener('visibilitychange', onWindow);
    this.detach = () => {
      for (const type of windowEvents) window.removeEventListener(type, onWindow);
      document.removeEventListener('visibilitychange', onWindow);
    };
  }

  /** Um passo do caminho, com o tempo desde o clique (ms). */
  step(label: string): void {
    if (this.phase !== 'done') this.steps.push(`${label}@${this.ms()}`);
  }

  /** O caminho chamou `requestPermission`. */
  get prompted(): boolean {
    return this.steps.some((s) => s.startsWith('request='));
  }

  /**
   * O resultado chegou à Home. `mounted`: a Home ainda está na tela. O aviso (`unavailable`)
   * espera a renderização que o monta (`shown`); o resto acaba aqui.
   */
  settle(result: AppResult<RecentFolderOpen>, mounted: boolean): void {
    if (this.phase !== 'pending') return;
    const value = result.ok ? result.value : null;
    if (value?.kind === 'opened') {
      this.finish();
      return;
    }
    if (!mounted) return this.conclude('unmounted', true);
    if (!value) {
      const failed = result.ok ? null : result;
      if (failed?.inconsistent) return this.conclude('inconsistent', false);
      return this.conclude(`message:${failed?.error ?? '?'}`, true);
    }
    this.step(`home=dialog:${value.reason}`);
    this.phase = 'awaiting-dialog';
  }

  /** A renderização que montou o aviso (`null`: o aviso não montou). */
  shown(dialog: HTMLDialogElement | null): void {
    if (this.phase !== 'awaiting-dialog') return;
    const seen = dialog ? describeDialog(dialog) : { text: 'never', onScreen: false };
    this.step(`shown=${seen.text}`);
    this.shownAt = this.now();
    if (!this.prompted && seen.onScreen) return this.finish();
    this.report();
    if (dialog && seen.onScreen) this.phase = 'dialog';
    else this.finish();
  }

  /** O aviso deste rastro fechou. Só grava se a primeira linha foi gravada. */
  closed(cause: ReopenCloseCause): void {
    if (this.phase !== 'dialog') return;
    reportError(
      REOPEN_CONTEXT,
      `aviso fechado: ${cause} após ${Math.round(this.now() - this.shownAt)}ms`,
    );
    this.finish();
  }

  /** Acaba o rastro (outro Abrir, a Home saiu): o que faltava vira `never`/`unmount`. */
  end(): void {
    if (this.phase === 'awaiting-dialog') this.shown(null);
    if (this.phase === 'dialog') this.closed('unmount');
    this.finish();
  }

  private conclude(home: string, anomalous: boolean): void {
    this.step(`home=${home}`);
    if (anomalous || this.prompted) this.report();
    this.finish();
  }

  private pagehide(): void {
    if (this.phase === 'pending') {
      reportError(REOPEN_CONTEXT, `pagehide com o Abrir em curso: ${this.line()}`);
    } else if (this.phase === 'dialog') {
      reportError(REOPEN_CONTEXT, `pagehide com o aviso aberto: ${this.line()}`);
    }
  }

  private report(): void {
    if (this.reported) return;
    this.reported = true;
    reportError(REOPEN_CONTEXT, this.line());
  }

  private line(): string {
    const events = this.events.length > 0 ? ` window=${this.events.join(',')}` : '';
    return `${this.steps.join(' ')}${events}`;
  }

  private ms(): number {
    return Math.round(this.now() - this.start);
  }

  private finish(): void {
    if (this.phase === 'done') return;
    this.phase = 'done';
    this.detach();
  }
}

export interface ReopenTracking {
  /** Para o `dialogRef` do aviso "Pasta indisponível". */
  readonly dialogRef: RefObject<HTMLDialogElement>;
  /** Cria o rastro no clique e o passa ao `openRecentFolder` (ainda no mesmo clique). */
  track(
    open: (trace: ReopenTrace) => Promise<AppResult<RecentFolderOpen>>,
  ): Promise<AppResult<RecentFolderOpen>>;
  /**
   * Um fechamento do aviso: guarda a causa (`fixed`, ou a origem que o `Dialog` passa ao
   * `onCancel`) e chama `close`. A linha sai quando o aviso deixa a tela.
   */
  closeWith(
    fixed: ReopenCloseCause | null,
    close: () => void,
  ): (cause?: DialogCancelCause | Event) => void;
}

/**
 * O rastro do Abrir na Home. `dialogOpen`: o aviso "Pasta indisponível" está no slot. A
 * Home só chama `track` e `closeWith`; o resto (montou? fechou como?) é lido aqui, no
 * commit de cada renderização.
 */
export function useReopenTrace(dialogOpen: boolean): ReopenTracking {
  const current = useRef<ReopenTrace | null>(null);
  const mounted = useRef(true);
  const wasOpen = useRef(false);
  const cause = useRef<ReopenCloseCause | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const trace = current.current;
    if (dialogOpen && !wasOpen.current) trace?.shown(dialogRef.current);
    if (!dialogOpen && wasOpen.current) {
      trace?.closed(cause.current ?? 'cancel');
      cause.current = null;
    }
    wasOpen.current = dialogOpen;
  });
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // O aviso sai com a Home (Localizar abriu o projeto): fecha com a causa guardada.
      if (cause.current) current.current?.closed(cause.current);
      current.current?.end();
    };
  }, []);

  return {
    dialogRef,
    track(open) {
      current.current?.end();
      const trace = new ReopenTrace();
      current.current = trace;
      return open(trace).then((result) => {
        trace.settle(result, mounted.current);
        return result;
      });
    },
    closeWith(fixed, close) {
      return (origin) => {
        cause.current = fixed ?? (isCause(origin) ? origin : 'cancel');
        close();
      };
    },
  };
}
