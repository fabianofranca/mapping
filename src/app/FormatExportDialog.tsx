import { useEffect, useState } from 'preact/hooks';
import { t } from '../i18n';
import { Dialog, type FocusReturn } from '../ui/Dialog';
import { useEditor } from '../ui/EditorContext';
import { imageLabel } from '../ui/labels';
import { Button, Select } from '../ui/controls';
import { exportInFormat, formatChoices } from '../store/formatActions';
import { resolveSelection } from '../store/ui';
import { exportErrorText } from './formatErrors';
import { runFormat } from './formatRunner';

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
  const { session, store, ui, derived } = useEditor();
  const project = store.committed.value;
  const entries = session.catalogs.entries.value;
  const choices = entries === null ? null : formatChoices(entries, 'generate');
  const [formatIndex, setFormatIndex] = useState(0);
  const [container, setContainer] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    session.catalogs.request();
  }, [session]);

  const containers = project?.containers ?? [];
  const choice = choices?.[formatIndex] ?? choices?.[0] ?? null;
  const selected = resolveSelection(project, ui.selection.value);
  const defaultContainer =
    selected?.kind === 'image'
      ? selected.image.id
      : selected?.kind === 'marking'
        ? (selected.image?.id ?? null)
        : null;
  const containerId =
    container !== null && containers.some((c) => c.id === container)
      ? container
      : (defaultContainer ?? containers[0]?.id ?? null);
  const needsContainer = choice?.scope === 'container';

  const run = async () => {
    if (!choice || running) return;
    setRunning(true);
    setError(null);
    const result = await exportInFormat(
      {
        flush: () => session.flush(),
        project: () => store.committed.peek(),
        run: runFormat,
        drawings: (p) => derived.drawingsOf(p),
      },
      choice,
      needsContainer ? containerId : null,
    );
    setRunning(false);
    if (result.ok) onGenerated(result.file);
    else setError(exportErrorText(result.error));
  };

  return (
    <Dialog
      title={t('format.export.title')}
      onCancel={onClose}
      returnFocus={returnFocus}
      actions={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={choice === null || running || (needsContainer && !containerId)}
            onClick={() => void run()}
          >
            {t('format.export.run')}
          </Button>
        </>
      }
    >
      <p class="muted">{t('format.isolation')}</p>
      {choices === null && <p class="muted">{t('format.export.loading')}</p>}
      {choices !== null && choices.length === 0 && (
        <p class="notice">{t('format.export.none')}</p>
      )}
      {choices !== null && choices.length > 0 && (
        <Select
          label={t('format.export.format')}
          value={String(choices.indexOf(choice ?? choices[0]!))}
          disabled={running}
          onChange={(e) => setFormatIndex(Number(e.currentTarget.value))}
        >
          {choices.map((c, i) => (
            <option key={c.ref} value={String(i)}>
              {t('format.export.option', {
                spec: c.specName,
                format: c.name,
                extension: c.extension,
              })}
            </option>
          ))}
        </Select>
      )}
      {needsContainer && (
        <Select
          label={t('format.export.container')}
          value={containerId ?? ''}
          disabled={running}
          onChange={(e) => setContainer(e.currentTarget.value)}
        >
          {containers.map((c) => (
            <option key={c.id} value={c.id}>
              {imageLabel(c)}
            </option>
          ))}
        </Select>
      )}
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
    </Dialog>
  );
}
