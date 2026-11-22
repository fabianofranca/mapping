import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import { Dialog, type FocusReturn } from '../ui/Dialog';
import { useEditor } from '../ui/EditorContext';
import { Button } from '../ui/controls';
import { exportInFormat, formatChoices, type FormatChoice } from '../store/formatActions';
import type { ProjectContainer } from '../model';
import { reportError } from '../utils/report';
import { exportErrorText } from './formatErrors';
import {
  ContainerSelect,
  FormatSelect,
  hasContainer,
  selectedContainer,
} from './formatDialogParts';
import { runFormat } from './formatRunner';

/** The chosen container if the project still has it; else the selection's; else the first. */
function containerIdOf(
  containers: readonly ProjectContainer[],
  chosen: string | null,
  fallback: string | null,
): string | null {
  if (hasContainer(containers, chosen)) return chosen;
  return hasContainer(containers, fallback) ? fallback : (containers[0]?.id ?? null);
}

/** What the dialog says besides the pickers: reading, none, running and the error line. */
function Messages({
  choices,
  running,
  error,
}: {
  readonly choices: readonly FormatChoice[] | null;
  readonly running: boolean;
  readonly error: string | null;
}) {
  return (
    <>
      {choices === null && <p class="muted">{t('format.export.loading')}</p>}
      {choices?.length === 0 && <p class="notice">{t('format.export.none')}</p>}
      {running && (
        <p class="muted" role="status">
          {t('format.export.running')}
        </p>
      )}
      {error !== null && (
        <p class="notice notice-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

/** Runs the export of `choice` (and `container`, for scope `container`) and keeps the state of the run. */
function useFormatRun(
  choice: FormatChoice | null,
  container: string | null,
  onGenerated: (file: File) => void,
) {
  const { session, store, derived } = useEditor();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The dialog may close while the plugin runs: whatever comes after is dropped.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const run = async () => {
    if (!choice || running) return;
    setRunning(true);
    setError(null);
    try {
      const result = await exportInFormat(
        {
          flush: () => session.flush(),
          project: () => store.committed.peek(),
          run: runFormat,
          drawings: (p) => derived.drawingsOf(p),
        },
        choice,
        container,
      );
      if (!alive.current) return;
      if (result.ok) onGenerated(result.file);
      else setError(exportErrorText(result.error));
    } catch (failure) {
      reportError('formatExport.run', failure);
      if (alive.current) setError(t('format.error.unexpected'));
    } finally {
      if (alive.current) setRunning(false);
    }
  };
  return { running, error, run };
}

/** What is picked: the format (the first one by default) and, for scope `container`, the container. */
function useFormatPick() {
  const { session, store, ui } = useEditor();
  const project = store.committed.value;
  const entries = session.catalogs.entries.value;
  const choices = entries === null ? null : formatChoices(entries, 'generate');
  const [pickedRef, setPickedRef] = useState<string | null>(null);
  const [container, setContainer] = useState<string | null>(null);
  useEffect(() => {
    session.catalogs.request();
  }, [session]);
  const containers = project?.containers ?? [];
  // The pick follows the format's ref, not its position: the list reloads with the catalogs.
  const index = Math.max(choices?.findIndex((c) => c.ref === pickedRef) ?? 0, 0);
  const choice = choices?.[index] ?? null;
  const containerId = containerIdOf(
    containers,
    container,
    selectedContainer(project, ui.selection.value),
  );
  const needsContainer = choice?.scope === 'container';
  return {
    choices,
    index,
    choice,
    containers,
    containerId: needsContainer ? containerId : null,
    needsContainer,
    setFormatRef: setPickedRef,
    setContainer,
  };
}

/**
 * Export in a format (stage #2035, decisions 5, 7 and 11): the formats with `generate` of the
 * applied specializations (`<specialization> › <format> (.<extension>)`); with scope `container`,
 * the container (the selected one, or the one of the selected marking, by default). "Export" saves
 * the pending changes, runs the plugin isolated and hands the text over as a file
 * (`onGenerated`), which the export dialog offers to save or share. The project does not change.
 */
export function FormatExportDialog({
  onClose,
  onGenerated,
  returnFocus,
}: {
  readonly onClose: () => void;
  readonly onGenerated: (file: File) => void;
  readonly returnFocus?: FocusReturn;
}) {
  const pick = useFormatPick();
  const { running, error, run } = useFormatRun(
    pick.choice,
    pick.containerId,
    onGenerated,
  );
  const blocked =
    pick.choice === null || running || (pick.needsContainer && !pick.containerId);

  return (
    <Dialog
      title={t('format.export.title')}
      onCancel={onClose}
      returnFocus={returnFocus}
      actions={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={blocked} onClick={() => void run()}>
            {t('format.export.run')}
          </Button>
        </>
      }
    >
      <p class="muted">{t('format.isolation')}</p>
      <FormatSelect
        choices={pick.choices ?? []}
        value={pick.index}
        disabled={running}
        label={t('format.export.format')}
        onChange={(i) => pick.setFormatRef(pick.choices?.[i]?.ref ?? null)}
      />
      <ContainerSelect
        show={pick.needsContainer}
        containers={pick.containers}
        value={pick.containerId}
        disabled={running}
        label={t('format.export.container')}
        onChange={pick.setContainer}
      />
      <Messages choices={pick.choices} running={running} error={error} />
    </Dialog>
  );
}
