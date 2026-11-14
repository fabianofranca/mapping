import { useState } from 'preact/hooks';
import { t, type TranslationKey } from '../i18n';
import {
  docRepoOf,
  platformRepoOf,
  projectDocRepos,
  projectPlatforms,
  type Project,
  type ProjectDocRepo,
  type ProjectPlatform,
  type SpecRepo,
} from '../model';
import { IconButton, TextField } from './controls';
import { useEditor } from './EditorContext';

// Repositories, in the editor Settings, in two subsections (stage #559, PD5; decision 26).
// Code (stage 3b.3; schema v11): one row per platform declared by the applied
// specializations. Documents (schema v14): one row per documents repository (`docRepos`)
// declared by them. In both, the address (`url` and `ref`) belongs to the specialization and appears read-only;
// the only editable field is the local path of the clone root (`localPath`), saved in the
// project. The actions validate and return the reason for the error.

const ERROR_TEXT: Readonly<Record<string, TranslationKey>> = {
  'invalid-local-path': 'repos.invalidLocalPath',
};

interface PlatformReposProps {
  readonly project: Project;
  readonly readOnly: boolean;
}

/** `true` if there is something to show in the section (some platform or some documents repository). */
export function hasRepos(project: Project): boolean {
  return projectPlatforms(project).length > 0 || projectDocRepos(project).length > 0;
}

export function PlatformRepos({ project, readOnly }: PlatformReposProps) {
  const platforms = projectPlatforms(project);
  const docRepos = projectDocRepos(project);
  if (platforms.length === 0 && docRepos.length === 0) return null;
  return (
    <section class="repos" aria-labelledby="repos-title">
      <h3 id="repos-title" class="repos-title">
        {t('repos.title')}
      </h3>
      {platforms.length > 0 && (
        <section class="repos-group" aria-labelledby="repos-code-title">
          <h4 id="repos-code-title" class="repos-subtitle">
            {t('repos.code.title')}
          </h4>
          <p class="muted">{t('repos.intro')}</p>
          {platforms.map((platform) => (
            <PlatformRow
              key={platform.id}
              project={project}
              platform={platform}
              readOnly={readOnly}
            />
          ))}
        </section>
      )}
      {docRepos.length > 0 && (
        <section class="repos-group" aria-labelledby="repos-docs-title">
          <h4 id="repos-docs-title" class="repos-subtitle">
            {t('repos.docs.title')}
          </h4>
          <p class="muted">{t('repos.docs.intro')}</p>
          {docRepos.map((docRepo) => (
            <DocRepoRow
              key={docRepo.id}
              project={project}
              docRepo={docRepo}
              readOnly={readOnly}
            />
          ))}
        </section>
      )}
    </section>
  );
}

function specName(project: Project, specId: string): string {
  return project.specializations.find((s) => s.id === specId)?.spec?.name ?? specId;
}

interface RepoRowProps {
  /** Accessible name of the group. */
  readonly name: string;
  /** Unique prefix for the accessibility ids. */
  readonly idPrefix: string;
  readonly title: string;
  readonly detail?: string | null;
  readonly clearLabel: string;
  readonly declared: readonly { readonly specId: string; readonly repo: SpecRepo }[];
  readonly specNames: (specId: string) => string;
  /** Discreet text when the specialization declares no address. */
  readonly noneDeclared: string;
  /** Local path saved in the project; `null` if there is none. */
  readonly localPath: string | null;
  readonly readOnly: boolean;
  /** Saves the path; returns the error code or `null` if it saved. */
  readonly onSave: (text: string) => string | null;
  readonly onClear: () => void;
}

/** A repository row: the declared address read-only and the editable local path. */
function RepoRow(props: RepoRowProps) {
  const { name, idPrefix, declared, localPath, readOnly } = props;
  const [error, setError] = useState<string | null>(null);
  const hintId = `${idPrefix}-local-hint`;

  const save = (text: string): boolean => {
    const code = props.onSave(text);
    setError(code === null ? null : t(ERROR_TEXT[code] ?? 'repos.invalidValue'));
    return code === null;
  };

  return (
    <div class="repo-row" role="group" aria-label={name}>
      <div class="repo-head">
        <strong>{props.title}</strong>
        {props.detail && <span class="muted">{props.detail}</span>}
        <IconButton
          icon="close"
          label={props.clearLabel}
          disabled={readOnly || localPath === null}
          onClick={() => {
            setError(null);
            props.onClear();
          }}
        />
      </div>
      <div class="repo-declared">
        {declared.length === 0 ? (
          <small class="muted">{props.noneDeclared}</small>
        ) : (
          declared.map(({ specId, repo }) => (
            <div key={specId} class="repo-declared-item" data-spec={specId}>
              <small class="muted">{props.specNames(specId)}</small>
              <a
                href={repo.url}
                target="_blank"
                rel="noopener noreferrer"
                class="repo-declared-link"
              >
                {repo.url}
              </a>
              {repo.ref && (
                <small class="muted">{t('repos.ref', { ref: repo.ref })}</small>
              )}
            </div>
          ))
        )}
      </div>
      <TextField
        label={t('repos.localPath')}
        aria-describedby={hintId}
        invalid={error !== null}
        disabled={readOnly}
        value={localPath ?? ''}
        onCommit={save}
      />
      <small id={hintId} class="muted">
        {t('repos.localPathHint')}
      </small>
      {error && (
        <p class="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function PlatformRow({
  project,
  platform,
  readOnly,
}: {
  readonly project: Project;
  readonly platform: ProjectPlatform;
  readonly readOnly: boolean;
}) {
  const { actions } = useEditor();
  const { id, name } = platform;
  return (
    <RepoRow
      name={name}
      idPrefix={`repo-${id}`}
      title={t('repos.platform', { name, id })}
      detail={platform.language}
      clearLabel={t('repos.clear', { name })}
      declared={platform.repos}
      specNames={(specId) => specName(project, specId)}
      noneDeclared={t('repos.noneDeclared')}
      localPath={platformRepoOf(project, id)?.localPath ?? null}
      readOnly={readOnly}
      onSave={(text) => {
        const result = actions.setPlatformRepo(id, { localPath: text });
        return result.ok ? null : result.error;
      }}
      onClear={() => actions.removePlatformRepo(id)}
    />
  );
}

function DocRepoRow({
  project,
  docRepo,
  readOnly,
}: {
  readonly project: Project;
  readonly docRepo: ProjectDocRepo;
  readonly readOnly: boolean;
}) {
  const { actions } = useEditor();
  const { id } = docRepo;
  return (
    <RepoRow
      name={id}
      idPrefix={`doc-repo-${id}`}
      title={id}
      clearLabel={t('repos.docs.clear', { id })}
      declared={docRepo.repos}
      specNames={(specId) => specName(project, specId)}
      noneDeclared={t('repos.noneDeclared')}
      localPath={docRepoOf(project, id)?.localPath ?? null}
      readOnly={readOnly}
      onSave={(text) => {
        const result = actions.setDocRepo(id, text);
        return result.ok ? null : result.error;
      }}
      onClear={() => actions.removeDocRepo(id)}
    />
  );
}
