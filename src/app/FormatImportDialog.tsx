import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import { Dialog, type FocusReturn } from '../ui/Dialog';
import { useEditor } from '../ui/EditorContext';
import { Button } from '../ui/controls';
import {
  formatChoices,
  importSelection,
  previewImport,
  type FormatChoice,
  type ImportCounts,
  type ImportPreview,
} from '../store/formatActions';
import { selectItems } from '../store/ui';
import { textMeasurer } from '../store/textMeasure';
import { reportError } from '../utils/report';
import { importActionErrorText, importErrorText } from './formatErrors';
import {
  ContainerSelect,
  FormatSelect,
  hasContainer,
  selectedContainer,
} from './formatDialogParts';
import { runFormat } from './formatRunner';

// Import from a format (stage #2035, AF4, decisions 4, 5, 7 and 12). The dialog keeps no project state:
// what it holds is what a person picked (the format, the target, the file) and the preview of the last
// "Preview". Import applies that preview's checked result through the `importFormat` store action, once,
// in one undo entry, without running the plugin again.

const KINDS = ['containers', 'markings', 'annotations', 'arrows'] as const;

function isEmpty(counts: ImportCounts): boolean {
  return KINDS.every((kind) => counts[kind] === 0);
}

/** What Import will do: the counts by kind, the plugin's warnings and the rules' notes. */
function PreviewSummary({ preview }: { readonly preview: ImportPreview }) {
  const { created, updated, warnings, notes } = preview;
  const nothing = isEmpty(created) && isEmpty(updated);
  return (
    <section class="import-preview" aria-label={t('format.import.previewTitle')}>
      <h3 class="import-preview-title">{t('format.import.previewTitle')}</h3>
      {nothing ? (
        <p class="notice" role="status">
          {t('format.import.nothing')}
        </p>
      ) : (
        <table class="import-preview-table">
          <thead>
            <tr>
              <th scope="col">{t('format.import.kind')}</th>
              <th scope="col">{t('format.import.created')}</th>
              <th scope="col">{t('format.import.changed')}</th>
            </tr>
          </thead>
          <tbody>
            {KINDS.map((kind) => (
              <tr key={kind}>
                <th scope="row">{t(`format.import.${kind}`)}</th>
                <td>{created[kind]}</td>
                <td>{updated[kind]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <MessageList title={t('format.import.warnings')} items={warnings} />
      <MessageList title={t('format.import.notes')} items={notes} />
    </section>
  );
}

function MessageList({
  title,
  items,
}: {
  readonly title: string;
  readonly items: readonly string[];
}) {
  if (items.length === 0) return null;
  return (
    <div class="import-preview-list">
      <p class="muted">{title}</p>
      <ul>
        {items.map((item, i) => (
          <li key={i} class="wrap-anywhere">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** What the dialog says besides the pickers: reading, none, locked, running and the error line. */
function Messages({
  choices,
  locked,
  running,
  error,
}: {
  readonly choices: readonly FormatChoice[] | null;
  readonly locked: boolean;
  readonly running: boolean;
  readonly error: string | null;
}) {
  return (
    <>
      {choices === null && <p class="muted">{t('format.import.loading')}</p>}
      {choices?.length === 0 && <p class="notice">{t('format.import.none')}</p>}
      {locked && <p class="notice">{t('format.import.locked')}</p>}
      {running && (
        <p class="muted" role="status">
          {t('format.import.running')}
        </p>
      )}
      {error !== null && (
        <p class="notice notice-error wrap-anywhere" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

/** What is picked: the format (the first one by default), the target container and the file. */
function useImportPick() {
  const { session, store, ui } = useEditor();
  const project = store.committed.value;
  const entries = session.catalogs.entries.value;
  const choices = entries === null ? null : formatChoices(entries, 'parse');
  const [pickedRef, setPickedRef] = useState<string | null>(null);
  // `undefined`: not chosen yet, so the selection's container; `null`: "None".
  const [target, setTarget] = useState<string | null | undefined>(undefined);
  const [file, setFile] = useState<File | null>(null);
  useEffect(() => {
    session.catalogs.request();
  }, [session]);
  const containers = project?.containers ?? [];
  const index = Math.max(choices?.findIndex((c) => c.ref === pickedRef) ?? 0, 0);
  const choice = choices?.[index] ?? null;
  const fallback = selectedContainer(project, ui.selection.value);
  const wanted = target === undefined ? fallback : target;
  const containerId = hasContainer(containers, wanted) ? wanted : null;
  return {
    choices,
    index,
    choice,
    containers,
    file,
    containerId: choice?.scope === 'container' ? containerId : null,
    needsContainer: choice?.scope === 'container',
    setFormatRef: setPickedRef,
    setTarget: (id: string) => setTarget(id === '' ? null : id),
    setFile,
  };
}

type Pick = ReturnType<typeof useImportPick>;

/** The Preview and Import runs and the state they leave: running, the preview and the error line. */
function useImportRun(pick: Pick, onDone: () => void) {
  const { session, store, derived, ui, canvas, actions } = useEditor();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  // The dialog may close while the plugin runs: whatever comes after is dropped.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  // Another format, target or file is another preview.
  const { choice, containerId, file } = pick;
  useEffect(() => {
    setPreview(null);
    setError(null);
  }, [choice?.ref, containerId, file]);

  const runPreview = async () => {
    if (!choice || !file || running) return;
    setRunning(true);
    setError(null);
    setPreview(null);
    try {
      const result = await previewImport(
        {
          flush: () => session.flush(),
          project: () => store.committed.peek(),
          run: runFormat,
          drawings: (p) => derived.drawingsOf(p),
          catalog: () => session.components.catalog.peek(),
          measure: () => textMeasurer.peek(),
          page: () => session.page.openId(),
        },
        choice,
        file,
        containerId,
      );
      if (!alive.current) return;
      if (result.ok) setPreview(result.preview);
      else setError(importErrorText(result.error));
    } catch (failure) {
      reportError('formatImport.preview', failure);
      if (alive.current) setError(t('format.import.error.unexpected'));
    } finally {
      if (alive.current) setRunning(false);
    }
  };

  const runImport = () => {
    if (!preview || running) return;
    const result = actions.importFormat(preview.input, preview.result);
    if (!result.ok) return setError(importActionErrorText(result));
    const project = store.committed.peek();
    const selected = project ? importSelection(project, result.value.created) : [];
    if (selected.length > 0) {
      selectItems(ui, selected);
      canvas.current?.centerSelection();
    }
    onDone();
  };
  return { running, error, preview, runPreview, runImport };
}

/** The file button and its chosen name; the hidden input takes the format's extension. */
function FilePicker({
  extension,
  file,
  disabled,
  onFile,
}: {
  readonly extension: string;
  readonly file: File | null;
  readonly disabled: boolean;
  readonly onFile: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div class="row">
      <input
        ref={input}
        type="file"
        accept={`.${extension}`}
        hidden
        onChange={(e) => {
          const picked = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (picked) onFile(picked);
        }}
      />
      <Button disabled={disabled} onClick={() => input.current?.click()}>
        {t('format.import.chooseFile')}
      </Button>
      <span class="muted wrap-anywhere">{file?.name ?? t('format.import.noFile')}</span>
    </div>
  );
}

/**
 * Import from a format: the formats with `parse` of the applied specializations, the target container
 * for scope `container` ("None" lets the plugin create it; the selected container by default) and the
 * file. "Preview" saves the pending changes, runs the plugin isolated and shows what would be created
 * and changed; "Import" applies that result in one undo entry. Disabled while the project is read-only.
 */
export function FormatImportDialog({
  onClose,
  returnFocus,
}: {
  readonly onClose: () => void;
  readonly returnFocus?: FocusReturn;
}) {
  const { store } = useEditor();
  const pick = useImportPick();
  const { running, error, preview, runPreview, runImport } = useImportRun(pick, onClose);
  const locked = store.locked.value;
  const ready = pick.choice !== null && pick.file !== null && !locked;
  return (
    <Dialog
      title={t('format.import.title')}
      onCancel={onClose}
      returnFocus={returnFocus}
      actions={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button disabled={!ready || running} onClick={() => void runPreview()}>
            {t('format.import.preview')}
          </Button>
          <Button
            variant="primary"
            disabled={preview === null || running || locked}
            onClick={runImport}
          >
            {t('format.import.run')}
          </Button>
        </>
      }
    >
      <p class="muted">{t('format.isolation')}</p>
      <FormatSelect
        choices={pick.choices ?? []}
        value={pick.index}
        disabled={running}
        label={t('format.import.format')}
        onChange={(i) => pick.setFormatRef(pick.choices?.[i]?.ref ?? null)}
      />
      <ContainerSelect
        show={pick.needsContainer}
        containers={pick.containers}
        value={pick.containerId}
        disabled={running}
        label={t('format.import.target')}
        noneLabel={t('format.import.targetNone')}
        onChange={pick.setTarget}
      />
      {pick.choice && (
        <FilePicker
          extension={pick.choice.extension}
          file={pick.file}
          disabled={running}
          onFile={pick.setFile}
        />
      )}
      <Messages choices={pick.choices} locked={locked} running={running} error={error} />
      {preview && <PreviewSummary preview={preview} />}
    </Dialog>
  );
}
