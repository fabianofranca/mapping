import { useState } from 'preact/hooks';
import { t, type TranslationKey } from '../i18n';
import {
  platformRepoOf,
  projectPlatforms,
  type PlatformRepoWarning,
  type ProjectPlatform,
  type Project,
} from '../model';
import { IconButton, TextField } from './controls';
import { useEditor } from './EditorContext';

// Repositórios por plataforma (etapa 3b.3), nas Configurações do editor: uma linha por
// plataforma declarada pelas especializações aplicadas, com o endereço do arquivo
// (`urlTemplate`), o caminho local da raiz (`localPath`) e o aviso de plataforma usada em
// algum `codeRef` sem repositório. As actions validam e devolvem o motivo do erro.

type Property = 'urlTemplate' | 'localPath';

const ERROR_TEXT: Readonly<Record<string, TranslationKey>> = {
  'invalid-url-template': 'repos.invalidUrlTemplate',
  'invalid-local-path': 'repos.invalidLocalPath',
};

interface PlatformReposProps {
  readonly project: Project;
  readonly readOnly: boolean;
}

export function PlatformRepos({ project, readOnly }: PlatformReposProps) {
  const { derived } = useEditor();
  const platforms = projectPlatforms(project);
  if (platforms.length === 0) return null;
  const warnings = derived.platformRepoWarnings.value;
  return (
    <section class="repos" aria-labelledby="repos-title">
      <h3 id="repos-title" class="repos-title">
        {t('repos.title')}
      </h3>
      <p class="muted">{t('repos.intro')}</p>
      {platforms.map((platform) => (
        <RepoRow
          key={platform.id}
          project={project}
          platform={platform}
          warning={warnings.find((w) => w.platform === platform.id)}
          readOnly={readOnly}
        />
      ))}
    </section>
  );
}

function RepoRow({
  project,
  platform,
  warning,
  readOnly,
}: {
  readonly project: Project;
  readonly platform: ProjectPlatform;
  readonly warning: PlatformRepoWarning | undefined;
  readonly readOnly: boolean;
}) {
  const { actions } = useEditor();
  const [error, setError] = useState<{ property: Property; text: string } | null>(null);
  const repo = platformRepoOf(project, platform.id);
  const name = platform.name;

  const save = (property: Property, text: string): boolean => {
    const result = actions.setPlatformRepo(platform.id, { [property]: text });
    if (result.ok) {
      setError(null);
      return true;
    }
    setError({ property, text: t(ERROR_TEXT[result.error] ?? 'repos.invalidValue') });
    return false;
  };

  return (
    <div class="repo-row" role="group" aria-label={name}>
      <div class="repo-head">
        <strong>{t('repos.platform', { name, id: platform.id })}</strong>
        {platform.language && <span class="muted">{platform.language}</span>}
        <IconButton
          icon="close"
          label={t('repos.clear', { name })}
          disabled={readOnly || repo === null}
          onClick={() => {
            setError(null);
            actions.removePlatformRepo(platform.id);
          }}
        />
      </div>
      {warning && (
        <p class="notice repo-warning" role="status">
          {warning.entries === 1
            ? t('repos.missingOne', { name })
            : t('repos.missingMany', { name, count: warning.entries })}
        </p>
      )}
      <TextField
        label={t('repos.urlTemplate')}
        aria-describedby={`repo-url-hint-${platform.id}`}
        invalid={error?.property === 'urlTemplate'}
        disabled={readOnly}
        value={repo?.urlTemplate ?? ''}
        onCommit={(text) => save('urlTemplate', text)}
      />
      <small id={`repo-url-hint-${platform.id}`} class="muted">
        {t('repos.urlTemplateHint')}
      </small>
      <TextField
        label={t('repos.localPath')}
        aria-describedby={`repo-local-hint-${platform.id}`}
        invalid={error?.property === 'localPath'}
        disabled={readOnly}
        value={repo?.localPath ?? ''}
        onCommit={(text) => save('localPath', text)}
      />
      <small id={`repo-local-hint-${platform.id}`} class="muted">
        {t('repos.localPathHint')}
      </small>
      {error && (
        <p class="field-error" role="alert">
          {error.text}
        </p>
      )}
    </div>
  );
}
