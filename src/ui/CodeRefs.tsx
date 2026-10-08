import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import {
  codeLink,
  type DisplayCodeEntry,
  type DisplayCodeLine,
  type Project,
} from '../model';
import { writeClipboardText } from '../utils/clipboard';
import { IconButton, IconLink, Tooltip } from './controls';

// Referências de código (etapa 3b): a exibição de uma entrada de `codeRef` (Lista e
// herdadas) e as ações dela, "Abrir no repositório" e "Copiar caminho". Os nomes de
// plataforma vêm da especialização; nada aqui conhece uma plataforma em particular.

/** Texto da entrada: "<plataforma> · <arquivo>[:linha]". */
export function codeEntryText(
  entry: Pick<DisplayCodeEntry, 'platformName' | 'fileName' | 'line'>,
): string {
  const file = entry.fileName ?? t('code.noPath');
  const line = entry.line === null || entry.fileName === null ? '' : `:${entry.line}`;
  return `${entry.platformName} · ${file}${line}`;
}

/** Caminho completo (com a linha e o símbolo, se houver), para a dica. */
export function codeEntryTooltip(
  entry: Pick<DisplayCodeEntry, 'path' | 'line' | 'symbol'>,
): string {
  const path = entry.path === null ? t('code.noPath') : entry.path;
  const where =
    entry.line === null || entry.path === null ? path : `${path}:${entry.line}`;
  return entry.symbol === null ? where : `${where} · ${entry.symbol}`;
}

/** Copia o caminho: ícone de confirmação por um instante e a dica diz o resultado. */
export function CopyPathButton({ path }: { readonly path: string }) {
  const [state, setState] = useState<'ok' | 'failed' | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    const ok = await writeClipboardText(path);
    setState(ok ? 'ok' : 'failed');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState(null), 2000);
  };

  const result =
    state === 'ok'
      ? t('code.pathCopied')
      : state === 'failed'
        ? t('code.copyFailed')
        : '';
  return (
    <>
      <IconButton
        icon={state === 'ok' ? 'check' : state === 'failed' ? 'warning' : 'copy'}
        label={t('code.copyPathNamed', { path })}
        tooltip={result || t('code.copyPath')}
        onClick={() => void copy()}
      />
      <span class="visually-hidden" role="status">
        {result}
      </span>
    </>
  );
}

interface CodeEntryActionsProps {
  readonly project: Project;
  readonly entry: Pick<DisplayCodeEntry, 'platform' | 'path' | 'line' | 'fileName'>;
}

/**
 * "Abrir no repositório" (um link comum, só quando `codeLink` devolve a URL) e
 * "Copiar caminho" (só com caminho).
 */
export function CodeEntryActions({ project, entry }: CodeEntryActionsProps) {
  const url = codeLink(project, entry);
  return (
    <>
      {url !== null && (
        <IconLink
          icon="externalLink"
          label={t('code.openNamed', { file: entry.fileName ?? '' })}
          tooltip={t('code.open')}
          href={url}
        />
      )}
      {entry.path !== null && <CopyPathButton path={entry.path} />}
    </>
  );
}

interface CodeEntriesProps {
  readonly project: Project;
  readonly line: DisplayCodeLine;
  readonly lineClass: string;
  readonly keyClass?: string;
}

/** Campo `codeRef` na Lista e nas herdadas: uma linha por entrada, com as ações. */
export function CodeEntries({ project, line, lineClass, keyClass }: CodeEntriesProps) {
  return (
    <span class={lineClass}>
      <span
        class={
          line.alert && !line.entries.some((e) => e.alert)
            ? `${keyClass ?? ''} value-alert`
            : keyClass
        }
      >
        {line.label}:
      </span>
      <span class="code-entries">
        {line.entries.map((entry) => (
          <span
            key={entry.id}
            class={entry.alert ? 'code-entry-line value-alert' : 'code-entry-line'}
          >
            <Tooltip label={codeEntryTooltip(entry)}>
              <span class="code-entry-name">{codeEntryText(entry)}</span>
            </Tooltip>
            <CodeEntryActions project={project} entry={entry} />
            {entry.path !== null && (
              <span class="code-entry-path muted">{entry.path}</span>
            )}
          </span>
        ))}
      </span>
    </span>
  );
}
