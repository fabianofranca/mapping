// The trace of an Open of a folder from recents, for the Diagnostics (context `folders.reopen`).
// Return of the 8.4 gate (finding 1): renamed folder, permission request granted and
// no notice on screen. The trace keeps the path of `openRecentFolder`, what the Home did with
// the result, whether the notice is really on screen, the window events and how the notice closed, and
// only records when the path went through the request and did not open the project, or when the result
// became neither the visible notice nor the open project (`docs/ARCHITECTURE.md`, recents).
// The inconsistent project (repair dialog) is the normal path: it only records if there was a request.
// Technical texts, like the other Diagnostics contexts.
import type { RefObject } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import type { DialogCancelCause } from '../ui/Dialog';
import { reportError } from '../utils/report';
import type { AppResult } from './appResult';
import type { RecentFolderOpen, ReopenSteps } from './recents';

export const REOPEN_CONTEXT = 'folders.reopen';

/** Window events kept per trace (the first ones). */
const WINDOW_EVENTS_MAX = 8;

/** How the "Folder unavailable" notice closed. */
export type ReopenCloseCause =
  DialogCancelCause | 'cancel-button' | 'forget' | 'relocate' | 'unmount';

type Phase =
  /** Waiting for the result of `openRecentFolder`. */
  | 'pending'
  /** The result asks for the notice; waiting for the render that mounts it. */
  | 'awaiting-dialog'
  /** The notice of a recorded trace is open: the closing line is missing. */
  | 'dialog'
  | 'done';

const isCause = (value: unknown): value is DialogCancelCause =>
  value === 'cancel' || value === 'backdrop' || value === 'close-button';

/** `open,modal,visible`: is the mounted notice really on screen? `?` when it cannot be known. */
function describeDialog(dialog: HTMLDialogElement): {
  readonly text: string;
  readonly onScreen: boolean;
} {
  let modal = '?';
  try {
    modal = dialog.matches(':modal') ? 'modal' : 'nonmodal';
  } catch {
    // Selector unknown in this browser.
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
 * A trace: born on the Open click, listens to the window while it lives and ends when the project
 * opens, when the Home finishes handling the result with nothing to wait for, or when the notice of
 * a recorded trace closes. Outside that it keeps nothing.
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

  /** A step of the path, with the time since the click (ms). */
  step(label: string): void {
    if (this.phase !== 'done') this.steps.push(`${label}@${this.ms()}`);
  }

  /** The path called `requestPermission`. */
  get prompted(): boolean {
    return this.steps.some((s) => s.startsWith('request='));
  }

  /**
   * The result reached the Home. `mounted`: the Home is still on screen. The notice (`unavailable`)
   * waits for the render that mounts it (`shown`); the rest ends here.
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

  /** The render that mounted the notice (`null`: the notice did not mount). */
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

  /** This trace's notice closed. Only records if the first line was recorded. */
  closed(cause: ReopenCloseCause): void {
    if (this.phase !== 'dialog') return;
    reportError(
      REOPEN_CONTEXT,
      `notice closed: ${cause} after ${Math.round(this.now() - this.shownAt)}ms`,
    );
    this.finish();
  }

  /** Ends the trace (another Open, the Home left): what was missing becomes `never`/`unmount`. */
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
  /** For the `dialogRef` of the "Folder unavailable" notice. */
  readonly dialogRef: RefObject<HTMLDialogElement>;
  /** Creates the trace on the click and passes it to `openRecentFolder` (still in the same click). */
  track(
    open: (trace: ReopenTrace) => Promise<AppResult<RecentFolderOpen>>,
  ): Promise<AppResult<RecentFolderOpen>>;
  /**
   * A closing of the notice: keeps the cause (`fixed`, or the origin that the `Dialog` passes to
   * `onCancel`) and calls `close`. The line goes out when the notice leaves the screen.
   */
  closeWith(
    fixed: ReopenCloseCause | null,
    close: () => void,
  ): (cause?: DialogCancelCause | Event) => void;
}

/**
 * The trace of the Open on the Home. `dialogOpen`: the "Folder unavailable" notice is in the slot. The
 * Home only calls `track` and `closeWith`; the rest (did it mount? how did it close?) is read here, in the
 * commit of each render.
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
      // The notice leaves with the Home (Locate opened the project): closes with the kept cause.
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
