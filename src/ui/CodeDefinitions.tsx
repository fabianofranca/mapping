import { t } from '../i18n';
import {
  codeLink,
  type CodeDefinition,
  type JsonValue,
  type Project,
  type SpecAnnotationType,
  typeCodeDefinitions,
} from '../model';
import { writeClipboardText } from '../utils/clipboard';
import { IconButton, IconLink, Tooltip } from './controls';
import { Property } from './PropertyGrid';
import { useCopyResult } from './useCopyResult';

// "Definition" of a typed annotation (stage 9): the file that defines the symbol of the type's
// `code` on each platform, with "Open in repository" and "Copy path". The platform
// names come from the specialization; nothing here knows a particular platform.

/** Definition text: "<platform> · <file>". */
export function codeDefinitionText(
  definition: Pick<CodeDefinition, 'platformName' | 'fileName'>,
): string {
  return `${definition.platformName} · ${definition.fileName}`;
}

/** Full path and the symbol, for the tooltip. */
export function codeDefinitionTooltip(
  definition: Pick<CodeDefinition, 'path' | 'symbol'>,
): string {
  return `${definition.path} · ${definition.symbol}`;
}

/** Copies the path: confirmation icon for a moment and the tooltip says the result. */
export function CopyPathButton({ path }: { readonly path: string }) {
  const { result: state, copy } = useCopyResult();

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
        onClick={() => void copy(() => writeClipboardText(path))}
      />
      <span class="visually-hidden" role="status">
        {result}
      </span>
    </>
  );
}

interface CodeDefinitionActionsProps {
  readonly project: Project;
  readonly definition: Pick<CodeDefinition, 'specId' | 'platform' | 'path' | 'fileName'>;
}

/**
 * "Open in repository" (a plain link, only when `codeLink` returns the URL) and
 * "Copy path".
 */
export function CodeDefinitionActions({
  project,
  definition,
}: CodeDefinitionActionsProps) {
  const url = codeLink(project, definition);
  return (
    <>
      {url !== null && (
        <IconLink
          icon="externalLink"
          label={t('code.openNamed', { file: definition.fileName })}
          tooltip={t('code.open')}
          href={url}
        />
      )}
      <CopyPathButton path={definition.path} />
    </>
  );
}

/**
 * "Definition" row of a typed annotation: one entry per platform whose type `code`
 * has a `path` ("<platform> · <file>"), with the actions. Read-only (comes from the specialization);
 * without a `urlTemplate` in its `repo`, it shows the path without the link.
 */
export function CodeDefinitions({
  project,
  specId,
  type,
  values,
}: {
  readonly project: Project;
  /** Specialization that owns the type: its `repo` gives the link. */
  readonly specId: string;
  readonly type: SpecAnnotationType;
  /** Annotation values: pick the `variants` case (the case's `path`). */
  readonly values?: Readonly<Record<string, JsonValue>> | null;
}) {
  const definitions = typeCodeDefinitions(project, specId, type, values);
  if (definitions.length === 0) return null;
  return (
    <Property label={t('code.definition')} hint={t('code.definitionHint')}>
      <span class="code-definitions">
        {definitions.map((definition) => (
          <span
            key={definition.platform}
            class="code-definition"
            data-definition={definition.platform}
          >
            <Tooltip label={codeDefinitionTooltip(definition)}>
              <span class="code-definition-name">{codeDefinitionText(definition)}</span>
            </Tooltip>
            <CodeDefinitionActions project={project} definition={definition} />
          </span>
        ))}
      </span>
    </Property>
  );
}
