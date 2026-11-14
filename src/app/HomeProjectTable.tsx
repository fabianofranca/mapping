import { t } from '../i18n';
import { locale } from '../store/settings';
import { Button } from '../ui/controls';
import type { RecentProject } from './controller';

export type LocalRecent = Extract<RecentProject, { kind: 'local' }>;
export type FolderRecent = Extract<RecentProject, { kind: 'folder' }>;

/** One formatter per language: creating an `Intl.DateTimeFormat` per row on every render is expensive. */
const dateFormats = new Map<string, Intl.DateTimeFormat>();

function dateFormat(lang: string): Intl.DateTimeFormat {
  let format = dateFormats.get(lang);
  if (!format) {
    format = new Intl.DateTimeFormat(lang, { dateStyle: 'short', timeStyle: 'short' });
    dateFormats.set(lang, format);
  }
  return format;
}

/** Date and time with seconds, only for the screen reader description (TE1): tells uses in the same minute apart. */
const fullDateFormats = new Map<string, Intl.DateTimeFormat>();

function fullDateFormat(lang: string): Intl.DateTimeFormat {
  let format = fullDateFormats.get(lang);
  if (!format) {
    format = new Intl.DateTimeFormat(lang, { dateStyle: 'short', timeStyle: 'medium' });
    fullDateFormats.set(lang, format);
  }
  return format;
}

function formatFullDate(iso: string): string {
  try {
    return fullDateFormat(locale.value).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatDate(iso: string): string {
  try {
    return dateFormat(locale.value).format(new Date(iso));
  } catch {
    // Unreadable date (or a language `Intl` rejects): shows the text as it is.
    return iso;
  }
}

interface ProjectListProps {
  readonly projects: readonly RecentProject[];
  readonly busy: boolean;
  readonly onOpen: (project: RecentProject) => void;
  readonly onDelete: (project: LocalRecent) => void;
  readonly onForget: (project: FolderRecent) => void;
}

function Unexported({ project }: { readonly project: RecentProject }) {
  return project.kind === 'local' && project.unexported ? (
    <span class="status status-warning">{t('status.unexported')}</span>
  ) : null;
}

/**
 * Single list (projects of this device and folders), from the most recent use to the oldest:
 * Name | Origin (badge) | Last used, with Open and Delete (or Remove from list) on the row.
 */
export function ProjectTable({
  projects,
  busy,
  onOpen,
  onDelete,
  onForget,
}: ProjectListProps) {
  return (
    <table class="project-table">
      <thead>
        <tr>
          <th scope="col">{t('home.colName')}</th>
          <th scope="col">{t('home.colOrigin')}</th>
          <th scope="col">{t('home.colUsed')}</th>
          <th scope="col">
            <span class="visually-hidden">{t('home.colActions')}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {projects.map((project) => (
          <ProjectRow
            key={`${project.kind}:${project.id}`}
            project={project}
            busy={busy}
            onOpen={onOpen}
            onDelete={onDelete}
            onForget={onForget}
          />
        ))}
      </tbody>
    </table>
  );
}

/** Stable element id of the row, derived from `kind:id` without invalid characters. */
function rowDomId(project: RecentProject, part: string): string {
  return `recent-${project.kind}-${project.id.replace(/[^A-Za-z0-9_-]/g, '_')}-${part}`;
}

/**
 * One row of the list. The buttons carry the project name in the accessible name (the visible
 * text comes first, WCAG 2.5.3) and point through `aria-describedby` to the origin, the folder (when
 * it shows) and the last use, which are already on screen: rows with the same name can be told apart.
 */
function ProjectRow({
  project,
  busy,
  onOpen,
  onDelete,
  onForget,
}: Omit<ProjectListProps, 'projects'> & { readonly project: RecentProject }) {
  const showFolder = project.kind === 'folder' && project.showFolderName;
  const describedBy = [
    rowDomId(project, 'origin'),
    ...(showFolder ? [rowDomId(project, 'folder')] : []),
    rowDomId(project, 'usedFull'),
  ].join(' ');
  const name = { name: project.name };
  return (
    <tr data-recent={`${project.kind}:${project.id}`}>
      <th scope="row">
        <span class="project-name">{project.name}</span>
        {project.kind === 'folder' && showFolder && (
          <span class="project-name muted" id={rowDomId(project, 'folder')}>
            {project.folderName}
          </span>
        )}
        <Unexported project={project} />
      </th>
      <td>
        <span class="badge" id={rowDomId(project, 'origin')}>
          {t(project.kind === 'folder' ? 'status.targetFolder' : 'status.targetLocal')}
        </span>
      </td>
      <td>
        {formatDate(project.usedAt)}
        <span class="visually-hidden" id={rowDomId(project, 'usedFull')}>
          {formatFullDate(project.usedAt)}
        </span>
      </td>
      <td>
        <div class="project-actions">
          <Button
            size="sm"
            data-recent-open=""
            disabled={busy}
            aria-label={t('home.openNamed', name)}
            aria-describedby={describedBy}
            onClick={() => onOpen(project)}
          >
            {t('common.open')}
          </Button>
          {project.kind === 'local' ? (
            <Button
              size="sm"
              variant="danger"
              disabled={busy}
              aria-label={t('home.deleteNamed', name)}
              aria-describedby={describedBy}
              onClick={() => onDelete(project)}
            >
              {t('common.delete')}
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={busy}
              aria-label={t('home.forgetNamed', name)}
              aria-describedby={describedBy}
              onClick={() => onForget(project)}
            >
              {t('home.forgetFolder')}
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
