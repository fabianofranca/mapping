import { useContext, useEffect, useState } from 'preact/hooks';
import { t } from '../i18n';
import { SCHEMA_VERSION } from '../model';
import { markDiagnosticsSeen } from '../store/diagnostics';
import { locale, theme } from '../store/settings';
import { BUILD_ID } from '../utils/build';
import { CHANNEL } from '../utils/channel';
import {
  clearReportedErrors,
  formatDiagnosticsReport,
  reportedErrors,
  type DiagnosticsInfo,
} from '../utils/report';
import { Button } from './controls';
import { EditorContext, type EditorContextValue } from './EditorContext';
import { LibraryIssueList } from './LibraryIssueList';
import { markingLabel } from './labels';

function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat(locale.value, { timeStyle: 'medium' }).format(
      new Date(iso),
    );
  } catch {
    // Data ilegível: mostra o texto como está.
    return iso;
  }
}

/** Ambiente do relato; os dados do projeto só existem dentro do editor. */
function diagnosticsInfo(editor: EditorContextValue | null): DiagnosticsInfo {
  const project = editor?.store.committed.peek() ?? null;
  return {
    build: BUILD_ID,
    channel: CHANNEL,
    schema: SCHEMA_VERSION,
    storage: editor?.open.kind ?? null,
    userAgent: navigator.userAgent,
    window: { width: window.innerWidth, height: window.innerHeight },
    language: locale.peek(),
    theme: theme.peek(),
    counts: project && {
      images: project.images.length,
      markings: project.markings.length,
      annotations: project.annotations.length,
    },
    pendingSave: editor ? editor.session.saveStatus.peek() !== 'saved' : null,
  };
}

/**
 * Copiar o cabeçalho do ambiente e o registro como texto; `copied` guarda o resultado
 * para o aviso.
 */
export function useCopyErrors() {
  const editor = useContext(EditorContext);
  const [copied, setCopied] = useState<'ok' | 'failed' | null>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        formatDiagnosticsReport(diagnosticsInfo(editor), reportedErrors.peek()),
      );
      setCopied('ok');
    } catch {
      // Sem a API (ou sem permissão): a tabela continua na tela para copiar à mão.
      setCopied('failed');
    }
  };
  return { copied, copy };
}

/** Copiar e Limpar (e o resultado da cópia): vão no cabeçalho da janela ou no rodapé do diálogo. */
export function DiagnosticsActions({ copied, copy }: ReturnType<typeof useCopyErrors>) {
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
      <Button size="sm" disabled={empty} onClick={clearReportedErrors}>
        {t('diagnostics.clear')}
      </Button>
      {/* Copiar vale mesmo sem erros: o cabeçalho identifica o ambiente do relato. */}
      <Button size="sm" onClick={() => void copy()}>
        {t('diagnostics.copy')}
      </Button>
    </>
  );
}

/** Registro de erros em tabela (Hora | Contexto | Mensagem), do mais recente ao mais antigo. */
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
 * Problemas da biblioteca aplicada (níveis 1 e 2 sobre a cópia, lidos ao abrir o projeto),
 * por especialização. Sem problemas, ou fora do editor, não mostra nada.
 */
export function DiagnosticsLibrary() {
  const editor = useContext(EditorContext);
  const issues = editor?.session.libraryIssues.value;
  const project = editor?.store.project.value;
  const rows = [...(issues ?? [])].filter(([, list]) => list.length > 0);
  if (rows.length === 0) return null;
  return (
    <section class="diagnostics-library" aria-label={t('diagnostics.library')}>
      <h3>{t('diagnostics.library')}</h3>
      <p class="muted">{t('diagnostics.libraryHint')}</p>
      {rows.map(([specId, list]) => (
        <div key={specId}>
          <p>
            {t('diagnostics.libraryItem', {
              name:
                project?.specializations.find((s) => s.id === specId)?.spec?.name ??
                specId,
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

/**
 * Componentes (etapa Biblioteca, B3): fontes que faltam ou não carregaram, componentes das
 * especializações que não carregaram e os avisos do desenho por marcação (com um botão para
 * selecioná-la), contando os "não cabe". Só aparece com algo a mostrar.
 */
export function DiagnosticsComponents() {
  const editor = useContext(EditorContext);
  if (!editor) return null;
  const { session, derived, ui, canvas } = editor;
  const fonts = session.components.fonts.value.filter((f) => f.status !== 'loaded');
  const problems = [...derived.catalog.value.values()].flatMap((c) =>
    c.problems.map((problem) => ({ specId: c.specId, problem })),
  );
  const warnings = derived.componentWarnings.value;
  if (fonts.length === 0 && problems.length === 0 && warnings.length === 0) return null;

  // Os nomes e a contagem vêm do projeto à vista (lido pelo derivado de pendências).
  const shown = editor.review.derived.shownProject.value;
  const nameOf = (markingId: string) => {
    const marking = shown?.markings.find((m) => m.id === markingId);
    return marking ? markingLabel(marking) : markingId;
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
            {fonts.map(({ font, status, detail }) => (
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
                {status === 'missing'
                  ? t('diagnostics.fontMissing')
                  : t('diagnostics.fontFailed', { detail: detail ?? '' })}
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
              <li key={`${specId}|${problem}`}>
                <code>{specId}</code> {problem}
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
                {list.join('; ')}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/**
 * Conteúdo da janela Diagnóstico (B4). Enquanto está à vista, os erros novos contam
 * como vistos: o ponto de alerta da faixa só acende com a janela fechada.
 */
export function DiagnosticsView() {
  const last = reportedErrors.value.at(-1);
  useEffect(markDiagnosticsSeen, [last]);
  return (
    <div class="diagnostics-view">
      <DiagnosticsLibrary />
      <DiagnosticsComponents />
      <DiagnosticsTable />
    </div>
  );
}
