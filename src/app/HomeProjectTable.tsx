import { t } from '../i18n';
import { locale } from '../store/settings';
import { Button } from '../ui/controls';
import type { RecentProject } from './controller';

export type LocalRecent = Extract<RecentProject, { kind: 'local' }>;
export type FolderRecent = Extract<RecentProject, { kind: 'folder' }>;

/** Um formatador por idioma: criar um `Intl.DateTimeFormat` por linha a cada render é caro. */
const dateFormats = new Map<string, Intl.DateTimeFormat>();

function dateFormat(lang: string): Intl.DateTimeFormat {
  let format = dateFormats.get(lang);
  if (!format) {
    format = new Intl.DateTimeFormat(lang, { dateStyle: 'short', timeStyle: 'short' });
    dateFormats.set(lang, format);
  }
  return format;
}

/** Data e hora com segundos, só para a descrição do leitor de tela (TE1): distingue usos do mesmo minuto. */
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
    // Data ilegível (ou idioma que o `Intl` recusa): mostra o texto como está.
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
 * Lista única (projetos deste dispositivo e pastas), do uso mais recente ao mais antigo:
 * Nome | Origem (selo) | Último uso, com Abrir e Excluir (ou Remover da lista) na linha.
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

/** Id de elemento estável da linha, derivado de `kind:id` sem caracteres inválidos. */
function rowDomId(project: RecentProject, part: string): string {
  return `recent-${project.kind}-${project.id.replace(/[^A-Za-z0-9_-]/g, '_')}-${part}`;
}

/**
 * Uma linha da lista. Os botões levam o nome do projeto no nome acessível (o texto visível
 * vem primeiro, WCAG 2.5.3) e apontam por `aria-describedby` para a origem, a pasta (quando
 * aparece) e o último uso, que já estão na tela: linhas de mesmo nome se distinguem.
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
