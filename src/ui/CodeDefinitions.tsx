import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import {
  codeLink,
  type CodeDefinition,
  type Project,
  type SpecAnnotationType,
  typeCodeDefinitions,
} from '../model';
import { writeClipboardText } from '../utils/clipboard';
import { IconButton, IconLink, Tooltip } from './controls';
import { Property } from './PropertyGrid';

// "Definição" de uma anotação tipada (etapa 9): o arquivo que define o símbolo do `code` do
// tipo em cada plataforma, com "Abrir no repositório" e "Copiar caminho". Os nomes de
// plataforma vêm da especialização; nada aqui conhece uma plataforma em particular.

/** Texto da definição: "<plataforma> · <arquivo>". */
export function codeDefinitionText(
  definition: Pick<CodeDefinition, 'platformName' | 'fileName'>,
): string {
  return `${definition.platformName} · ${definition.fileName}`;
}

/** Caminho completo e o símbolo, para a dica. */
export function codeDefinitionTooltip(
  definition: Pick<CodeDefinition, 'path' | 'symbol'>,
): string {
  return `${definition.path} · ${definition.symbol}`;
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

interface CodeDefinitionActionsProps {
  readonly project: Project;
  readonly definition: Pick<CodeDefinition, 'specId' | 'platform' | 'path' | 'fileName'>;
}

/**
 * "Abrir no repositório" (um link comum, só quando `codeLink` devolve a URL) e
 * "Copiar caminho".
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
 * Linha "Definição" de uma anotação tipada: uma entrada por plataforma cujo `code` do tipo
 * tem `path` ("<plataforma> · <arquivo>"), com as ações. Só leitura (vem da especialização);
 * sem `urlTemplate` no `repo` dela, mostra o caminho sem o link.
 */
export function CodeDefinitions({
  project,
  specId,
  type,
}: {
  readonly project: Project;
  /** Especialização dona do tipo: o `repo` dela dá o link. */
  readonly specId: string;
  readonly type: SpecAnnotationType;
}) {
  const definitions = typeCodeDefinitions(project, specId, type);
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
