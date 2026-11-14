import { useContext, useEffect } from 'preact/hooks';
import { t } from '../i18n';
import { SCHEMA_VERSION, projectIndex, undeclaredDrawingMode } from '../model';
import type { FontProblem } from '../storage/fonts';
import { markDiagnosticsSeen, remoteImageIssues } from '../store/diagnostics';
import { allowedOrigins } from '../store/imagePermissions';
import { locale, theme } from '../store/settings';
import { BUILD_ID } from '../utils/build';
import { writeClipboardText } from '../utils/clipboard';
import { CHANNEL } from '../utils/channel';
import {
  clearReportedErrors,
  formatDiagnosticsReport,
  reportedErrors,
  type DiagnosticsInfo,
} from '../utils/report';
import { Button } from './controls';
import { EditorContext, type EditorContextValue } from './EditorContext';
import { DiagnosticsDirection } from './DiagnosticsDirection';
import { declaredDrawingModes } from './drawingModes';
import { LibraryIssueList } from './LibraryIssueList';
import { markingLabel } from './labels';
import { useCopyResult } from './useCopyResult';
import { messageText } from './modelMessage';

function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat(locale.value, { timeStyle: 'medium' }).format(
      new Date(iso),
    );
  } catch {
    // Unreadable date: shows the text as it is.
    return iso;
  }
}

/** Environment of the report; the project data only exists inside the editor. */
function diagnosticsInfo(editor: EditorContextValue | null): DiagnosticsInfo {
  const project = editor?.store.committed.peek() ?? null;
  return {
    build: BUILD_ID,
    channel: CHANNEL,
    schema: SCHEMA_VERSION,
    remoteImageOrigins: allowedOrigins.peek().length,
    storage: editor?.open.kind ?? null,
    folder: editor?.session.folderCalls?.snapshot() ?? null,
    userAgent: navigator.userAgent,
    window: { width: window.innerWidth, height: window.innerHeight },
    language: locale.peek(),
    theme: theme.peek(),
    counts: project && {
      containers: project.containers.length,
      markings: project.markings.length,
      annotations: project.annotations.length,
    },
    pendingSave: editor ? editor.session.saveStatus.peek() !== 'saved' : null,
  };
}

/**
 * Copy the environment header and the log as text; `copied` holds the result
 * for the notice (goes back to empty after 2 s or on clearing the log).
 */
export function useCopyErrors() {
  const editor = useContext(EditorContext);
  const { result, copy, reset } = useCopyResult();
  // Without the API (or permission), `writeClipboardText` returns `false` and logs the error in
  // Diagnostics; the table stays on screen to copy by hand.
  const write = () =>
    writeClipboardText(
      formatDiagnosticsReport(diagnosticsInfo(editor), reportedErrors.peek()),
    );
  return { copied: result, copy: () => copy(write), reset };
}

/** Copy and Clear (and the copy result): go in the window header or the dialog footer. */
export function DiagnosticsActions({
  copied,
  copy,
  reset,
}: ReturnType<typeof useCopyErrors>) {
  const empty = reportedErrors.value.length === 0;
  return (
    <>
      <span class="muted diagnostics-status" role="status">
        {copied === 'ok'
          ? t('diagnostics.copied')
          : copied === 'failed'
            ? t('common.copyFailed')
            : ''}
      </span>
      <Button
        size="sm"
        disabled={empty}
        onClick={() => {
          clearReportedErrors();
          reset();
        }}
      >
        {t('diagnostics.clear')}
      </Button>
      {/* Copy applies even with no errors: the header identifies the report's environment. */}
      <Button size="sm" onClick={() => void copy()}>
        {t('diagnostics.copy')}
      </Button>
    </>
  );
}

/** Error log as a table (Time | Context | Message), from the most recent to the oldest. */
export function DiagnosticsTable() {
  const errors = reportedErrors.value;
  return (
    <>
      <p class="muted diagnostics-intro">{t('diagnostics.intro')}</p>
      {errors.length === 0 ? (
        <p class="diagnostics-empty">{t('diagnostics.empty')}</p>
      ) : (
        <div class="list-scroll">
          <table class="list-table diagnostics-table" aria-label={t('diagnostics.title')}>
            <thead>
              <tr>
                <th scope="col">{t('diagnostics.col.time')}</th>
                <th scope="col">{t('diagnostics.col.context')}</th>
                <th scope="col">{t('diagnostics.col.message')}</th>
              </tr>
            </thead>
            <tbody>
              {[...errors].reverse().map((error) => (
                <tr
                  key={`${error.at}|${error.context}|${error.message}`}
                  class="list-row"
                >
                  <td
                    class="list-cell diagnostics-nowrap"
                    data-label={t('diagnostics.col.time')}
                  >
                    <time class="muted" dateTime={error.at}>
                      {formatTime(error.at)}
                    </time>
                  </td>
                  <td
                    class="list-cell diagnostics-nowrap"
                    data-label={t('diagnostics.col.context')}
                  >
                    <code>{error.context}</code>
                  </td>
                  <td
                    class="list-cell diagnostics-message"
                    data-label={t('diagnostics.col.message')}
                  >
                    {error.message}
                    {error.count !== undefined && (
                      <span class="muted">
                        {' '}
                        {t('diagnostics.repeated', { count: error.count })}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/**
 * Problems of the applied library (levels 1 and 2 on the copy, read when opening the project),
 * per specialization. With no problems, or outside the editor, it shows nothing.
 */
export function DiagnosticsLibrary() {
  const editor = useContext(EditorContext);
  const issues = editor?.session.libraryIssues.value;
  const project = editor?.store.project.value;
  const rows = [...(issues ?? [])].filter(([, list]) => list.length > 0);
  if (rows.length === 0) return null;
  const specs = project && projectIndex(project).specializations;
  return (
    <section class="diagnostics-library" aria-label={t('diagnostics.library')}>
      <h3>{t('diagnostics.library')}</h3>
      <p class="muted">{t('diagnostics.libraryHint')}</p>
      {rows.map(([specId, list]) => (
        <div key={specId}>
          <p>
            {t('diagnostics.libraryItem', {
              name: specs?.get(specId)?.spec?.name ?? specId,
              errors: list.filter((i) => i.severity === 'error').length,
              warnings: list.filter((i) => i.severity === 'warning').length,
            })}
          </p>
          <LibraryIssueList issues={list} />
        </div>
      ))}
    </section>
  );
}

/** The reason a font failed to load, in the interface language. */
function fontProblemText(problem: FontProblem): string {
  switch (problem.code) {
    case 'missing':
      return t('diagnostics.fontMissing', { path: problem.path });
    case 'no-fontface':
      return t('diagnostics.fontNoFontFace');
    case 'load-failed':
      return t('diagnostics.fontFailed', { detail: problem.message });
  }
}

/**
 * Components (stage Library, B3): fonts that are missing or failed to load, components of the
 * specializations that failed to load and the per-marking drawing warnings (with a button to
 * select it), counting the "does not fit" ones. Only appears with something to show.
 */
export function DiagnosticsComponents() {
  const editor = useContext(EditorContext);
  if (!editor) return null;
  const { session, derived, ui, canvas } = editor;
  const fonts = session.components.fonts.value.filter((f) => f.status !== 'loaded');
  const problems = [...derived.catalog.value.values()].flatMap((c) =>
    c.problemMessages.map((problem) => ({ specId: c.specId, problem })),
  );
  const warnings = derived.componentWarnings.value;
  if (fonts.length === 0 && problems.length === 0 && warnings.length === 0) return null;

  // The names and the count come from the project in view (read by the pending-items derived
  // state).
  const shown = editor.review.derived.shownProject.value;
  const shownMarkings = shown && projectIndex(shown).markings;
  const nameOf = (markingId: string) => {
    const marking = shownMarkings?.get(markingId);
    return marking && shown ? markingLabel(shown, marking) : markingId;
  };
  const overflow = [...derived.componentScenes.value.values()].filter(
    (d) => d.overflow,
  ).length;
  const select = (markingId: string) => {
    ui.selection.value = { kind: 'marking', id: markingId };
    canvas.current?.centerSelection();
  };

  return (
    <section class="diagnostics-components" aria-label={t('diagnostics.components')}>
      <h3>{t('diagnostics.components')}</h3>
      <p class="muted">{t('diagnostics.componentsHint')}</p>
      {fonts.length > 0 && (
        <>
          <h4>{t('diagnostics.fonts')}</h4>
          <ul>
            {fonts.map(({ font, problem }) => (
              <li key={`${font.family}|${font.weight}|${font.style}|${font.path}`}>
                {t('diagnostics.fontItem', {
                  family: font.family,
                  weight: font.weight,
                  style: t(
                    font.style === 'italic'
                      ? 'diagnostics.fontStyle.italic'
                      : 'diagnostics.fontStyle.normal',
                  ),
                })}
                {': '}
                {problem ? fontProblemText(problem) : ''}
              </li>
            ))}
          </ul>
        </>
      )}
      {problems.length > 0 && (
        <>
          <h4>{t('diagnostics.catalogProblems')}</h4>
          <ul>
            {problems.map(({ specId, problem }) => (
              <li key={`${specId}|${problem.text}`}>
                <code>{specId}</code> {messageText(problem)}
              </li>
            ))}
          </ul>
        </>
      )}
      {warnings.length > 0 && (
        <>
          <h4>{t('diagnostics.drawWarnings')}</h4>
          {overflow > 0 && (
            <p class="muted">{t('diagnostics.overflowCount', { count: overflow })}</p>
          )}
          <ul>
            {warnings.map(({ markingId, warnings: list }) => (
              <li key={markingId}>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t('diagnostics.selectMarking', { name: nameOf(markingId) })}
                  onClick={() => select(markingId)}
                >
                  {nameOf(markingId)}
                </Button>{' '}
                {list.map(messageText).join('; ')}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/**
 * Drawing modes saved (in the project or in the containers) that no specialization declares:
 * the mode stays saved, the drawing uses the first mode of each specialization.
 */
export function DiagnosticsDrawingMode() {
  const project = useContext(EditorContext)?.store.project.value;
  if (!project) return null;
  const modes = undeclaredDrawingMode(project, declaredDrawingModes(project));
  if (modes.length === 0) return null;
  return (
    <section class="diagnostics-modes" aria-label={t('diagnostics.drawingMode')}>
      <h3>{t('diagnostics.drawingMode')}</h3>
      <p class="muted">{t('diagnostics.drawingModeHint')}</p>
      <ul>
        {modes.map((mode) => (
          <li key={mode}>{t('diagnostics.modeUndeclared', { mode })}</li>
        ))}
      </ul>
    </section>
  );
}

/** Reading direction of the real project, for the read-only section. */
function DiagnosticsDirectionSection() {
  const project = useContext(EditorContext)?.store.project.value;
  return project ? <DiagnosticsDirection project={project} /> : null;
}

/** Failures and blocks of remote images in the session (shortened URL and reason). */
export function DiagnosticsRemoteImages() {
  const issues = remoteImageIssues.value;
  if (issues.length === 0) return null;
  return (
    <section class="diagnostics-images" aria-label={t('diagnostics.remoteImages')}>
      <h3>{t('diagnostics.remoteImages')}</h3>
      <p class="muted">{t('diagnostics.remoteImagesHint')}</p>
      <ul>
        {issues.map((issue) => (
          <li key={issue.url}>
            <code>{issue.url}</code>
            {': '}
            {t(`diagnostics.imageReason.${issue.reason}`)}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Content of the Diagnostics window (B4). While it is in view, new errors count
 * as seen: the alert dot of the strip only lights up with the window closed.
 */
export function DiagnosticsView() {
  const last = reportedErrors.value.at(-1);
  useEffect(markDiagnosticsSeen, [last]);
  return (
    <div class="diagnostics-view">
      <DiagnosticsLibrary />
      <DiagnosticsComponents />
      <DiagnosticsDrawingMode />
      <DiagnosticsDirectionSection />
      <DiagnosticsRemoteImages />
      <DiagnosticsTable />
    </div>
  );
}
