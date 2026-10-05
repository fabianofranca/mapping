import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import type { DirectoryHandleLike, ExistingImage } from '../storage/folder';
import type { LocalProjectMeta } from '../storage/local';
import { DESKTOP_QUERY } from '../theme/breakpoints';
import { locale } from '../store/settings';
import { Button, IconButton, TextField } from '../ui/controls';
import { Dialog } from '../ui/Dialog';
import { HELP_SHORTCUTS, HelpDialog } from '../ui/HelpDialog';
import { Icon, type IconName } from '../ui/icons';
import { InstallHint } from '../ui/InstallHint';
import { PreviewBadge } from '../ui/PreviewBanner';
import { SettingsDialog } from '../ui/SettingsDialog';
import { useMediaQuery } from '../ui/useMediaQuery';
import { matchesSearch } from '../utils/search';
import {
  createFolderProject,
  createLocalProject,
  deleteLocalProject,
  features,
  importZip,
  localProjects,
  openFolder,
  openLocalProject,
  type AppResult,
} from './controller';

type HomeDialog =
  | { readonly kind: 'new' }
  | {
      readonly kind: 'folder-setup';
      readonly handle: DirectoryHandleLike;
      readonly images: readonly ExistingImage[];
    }
  | { readonly kind: 'delete'; readonly project: LocalProjectMeta }
  | { readonly kind: 'help'; readonly section?: string }
  | { readonly kind: 'settings' };

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(locale.value, {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    // Data ilegível: mostra o texto como está.
    return iso;
  }
}

export function Home() {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const [dialog, setDialog] = useState<HomeDialog | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const zipInput = useRef<HTMLInputElement>(null);

  const available = features.value;
  if (!available) {
    return (
      <main class="home">
        <p class="muted">{t('app.loading')}</p>
      </main>
    );
  }

  /** Roda uma ação mostrando o erro traduzido, se houver. */
  const run = async <T,>(action: () => Promise<AppResult<T>>): Promise<T | null> => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await action();
      if (result.ok) return result.value;
      setMessage(t(`error.${result.error}`));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const onOpenFolder = async () => {
    const result = await run(openFolder);
    if (result?.kind === 'needs-setup') {
      setName('');
      setDialog({ kind: 'folder-setup', handle: result.handle, images: result.images });
    }
  };

  const onZipChosen = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';
    if (file) await run(() => importZip(file));
  };

  const closeDialog = () => setDialog(null);
  const actions: HomeActions = {
    busy,
    available,
    onNew: () => {
      setName('');
      setDialog({ kind: 'new' });
    },
    onOpenFolder: () => void onOpenFolder(),
    onOpenZip: () => zipInput.current?.click(),
  };
  const projects = localProjects.value.filter((p) => matchesSearch(p.name, query));
  const list = available.local && (
    <section class="project-section" aria-labelledby="home-projects-title">
      <h2 id="home-projects-title">{t('home.localProjects')}</h2>
      {localProjects.value.length === 0 ? (
        <p class="muted">{t('home.noLocalProjects')}</p>
      ) : (
        <>
          <div class="home-search">
            <TextField
              type="search"
              aria-label={t('home.search')}
              placeholder={t('home.search')}
              value={query}
              onInput={(e) => setQuery(e.currentTarget.value)}
            />
          </div>
          {projects.length === 0 ? (
            <p class="muted">{t('home.noResults', { query: query.trim() })}</p>
          ) : desktop ? (
            <ProjectTable
              projects={projects}
              busy={busy}
              onOpen={(id) => void run(() => openLocalProject(id))}
              onDelete={(project) => setDialog({ kind: 'delete', project })}
            />
          ) : (
            <ProjectCards
              projects={projects}
              busy={busy}
              onOpen={(id) => void run(() => openLocalProject(id))}
              onDelete={(project) => setDialog({ kind: 'delete', project })}
            />
          )}
        </>
      )}
    </section>
  );
  const notices = (
    <>
      {!available.folder && !available.local && (
        <p class="notice notice-error">{t('home.unsupported')}</p>
      )}
      {available.fileProtocol && available.local && (
        <p class="notice">{t('home.fileProtocolWarning')}</p>
      )}
      {message && (
        <p class="notice notice-error" role="alert">
          {message}
        </p>
      )}
    </>
  );
  const zipField = (
    <input
      ref={zipInput}
      type="file"
      accept=".zip,application/zip,application/x-zip-compressed"
      hidden
      onChange={(e) => void onZipChosen(e.currentTarget)}
    />
  );

  return (
    <div class={desktop ? 'home home-desktop' : 'home home-mobile'}>
      {desktop ? (
        <aside class="home-side" aria-label={t('home.sideLabel')}>
          <div class="home-brand">
            <span class="main-bar-logo" aria-hidden="true">
              <Icon name="marking" />
            </span>
            <h1>{t('app.title')}</h1>
            <PreviewBadge />
          </div>
          <nav class="home-nav">
            <button type="button" class="home-nav-item" aria-current="page">
              <Icon name="folder" />
              {t('home.projects')}
            </button>
            <button
              type="button"
              class="home-nav-item"
              onClick={() => setDialog({ kind: 'help' })}
            >
              <Icon name="help" />
              {t('help.open')}
            </button>
            <button
              type="button"
              class="home-nav-item"
              onClick={() => setDialog({ kind: 'settings' })}
            >
              <Icon name="settings" />
              {t('settings.title')}
            </button>
          </nav>
          <div class="home-side-end">
            <InstallHint />
          </div>
        </aside>
      ) : (
        <header class="topbar">
          <h1>{t('app.title')}</h1>
          <PreviewBadge />
          <div class="toolbar home-bar-end">
            <IconButton
              icon="help"
              label={t('help.open')}
              onClick={() => setDialog({ kind: 'help' })}
            />
            <IconButton
              icon="settings"
              label={t('settings.title')}
              onClick={() => setDialog({ kind: 'settings' })}
            />
          </div>
        </header>
      )}

      <main class="home-main">
        {desktop ? (
          <div class="home-heading">
            <h2>{t('home.start')}</h2>
            <HomeButtons {...actions} />
          </div>
        ) : (
          <HomeCards {...actions} />
        )}
        <FolderReason {...actions} />
        {notices}
        {!desktop && <InstallHint />}
        {list}
        {zipField}
      </main>

      {dialog?.kind === 'help' && (
        <HelpDialog onClose={closeDialog} section={dialog.section} />
      )}

      {dialog?.kind === 'settings' && (
        <SettingsDialog
          onClose={closeDialog}
          onShowShortcuts={() => setDialog({ kind: 'help', section: HELP_SHORTCUTS })}
        />
      )}

      {dialog?.kind === 'new' && (
        <Dialog
          title={t('home.newProject')}
          onCancel={closeDialog}
          actions={
            <>
              <Button onClick={closeDialog}>{t('common.cancel')}</Button>
              <Button
                type="submit"
                form="new-project-form"
                variant="primary"
                disabled={busy}
              >
                {t('common.create')}
              </Button>
            </>
          }
        >
          <form
            id="new-project-form"
            onSubmit={(e) => {
              e.preventDefault();
              closeDialog();
              void run(() => createLocalProject(name));
            }}
          >
            <NameField
              value={name}
              placeholder={t('project.untitled')}
              onInput={setName}
            />
          </form>
        </Dialog>
      )}

      {dialog?.kind === 'folder-setup' && (
        <Dialog
          title={t('home.folderSetupTitle')}
          onCancel={closeDialog}
          actions={
            <>
              <Button onClick={closeDialog}>{t('common.cancel')}</Button>
              <Button
                type="submit"
                form="folder-setup-form"
                variant="primary"
                disabled={busy}
              >
                {t('common.create')}
              </Button>
            </>
          }
        >
          <form
            id="folder-setup-form"
            onSubmit={(e) => {
              e.preventDefault();
              const { handle, images } = dialog;
              closeDialog();
              void run(() => createFolderProject(handle, name, images)).then((result) => {
                if (result && result.skipped.length > 0) {
                  setMessage(t('home.folderSkipped', { count: result.skipped.length }));
                }
              });
            }}
          >
            <p>
              {dialog.images.length === 0
                ? t('home.folderSetupEmpty', { folder: dialog.handle.name })
                : t('home.folderSetupImages', {
                    folder: dialog.handle.name,
                    count: dialog.images.length,
                  })}
            </p>
            <NameField value={name} placeholder={dialog.handle.name} onInput={setName} />
          </form>
        </Dialog>
      )}

      {dialog?.kind === 'delete' && (
        <Dialog
          title={t('home.deleteTitle')}
          onCancel={closeDialog}
          actions={
            <>
              <Button onClick={closeDialog}>{t('common.cancel')}</Button>
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => {
                  const { id } = dialog.project;
                  closeDialog();
                  void run(() => deleteLocalProject(id));
                }}
              >
                {t('common.delete')}
              </Button>
            </>
          }
        >
          <p>{t('home.deleteMessage', { name: dialog.project.name })}</p>
        </Dialog>
      )}
    </div>
  );
}

/** Campo de nome: vazio usa o `placeholder` como nome (ver controller). */
function NameField({
  value,
  placeholder,
  onInput,
}: {
  readonly value: string;
  readonly placeholder: string;
  readonly onInput: (value: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  // `autoFocus` nem sempre vale dentro de um <dialog> reaberto; foca na montagem.
  useEffect(() => input.current?.focus(), []);
  return (
    <TextField
      label={t('project.name')}
      inputRef={input}
      type="text"
      value={value}
      placeholder={placeholder}
      onInput={(e) => onInput(e.currentTarget.value)}
    />
  );
}

interface HomeActions {
  readonly busy: boolean;
  readonly available: NonNullable<typeof features.value>;
  readonly onNew: () => void;
  readonly onOpenFolder: () => void;
  readonly onOpenZip: () => void;
}

/** Desktop: os três pontos de entrada como botões do cabeçalho. */
function HomeButtons({ busy, available, onNew, onOpenFolder, onOpenZip }: HomeActions) {
  return (
    <div class="home-buttons">
      {available.local && (
        <Button variant="primary" disabled={busy} onClick={onNew}>
          <Icon name="plus" />
          {t('home.newProject')}
        </Button>
      )}
      <Button disabled={busy || !available.folder} onClick={onOpenFolder}>
        <Icon name="folder" />
        {t('home.openFolder')}
      </Button>
      {available.local && (
        <Button disabled={busy} onClick={onOpenZip}>
          <Icon name="upload" />
          {t('home.openZip')}
        </Button>
      )}
    </div>
  );
}

/**
 * Abaixo das ações. Abrir pasta indisponível: o motivo fica escrito na tela (um botão
 * desabilitado não explica); disponível: a recomendação do formato pasta para quem usa git.
 */
function FolderReason({ available }: HomeActions) {
  if (available.folder) return <p class="muted home-reason">{t('home.gitHint')}</p>;
  if (!available.local) return null;
  return <p class="muted home-reason">{t('home.folderUnavailable')}</p>;
}

function ActionCard({
  icon,
  title,
  hint,
  disabled,
  onClick,
}: {
  readonly icon: IconName;
  readonly title: string;
  readonly hint: string;
  readonly disabled: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button type="button" class="action-card" disabled={disabled} onClick={onClick}>
      <span class="action-card-icon" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <span class="action-card-text">
        <strong>{title}</strong>
        <span>{hint}</span>
      </span>
    </button>
  );
}

/** Celular: três botões grandes; Abrir pasta desabilitado diz o motivo. */
function HomeCards({ busy, available, onNew, onOpenFolder, onOpenZip }: HomeActions) {
  return (
    <div class="home-actions">
      {available.local && (
        <ActionCard
          icon="plus"
          title={t('home.newProject')}
          hint={t('home.newProjectHint')}
          disabled={busy}
          onClick={onNew}
        />
      )}
      <ActionCard
        icon="folder"
        title={t('home.openFolder')}
        hint={available.folder ? t('home.openFolderHint') : t('home.folderUnavailable')}
        disabled={busy || !available.folder}
        onClick={onOpenFolder}
      />
      {available.local && (
        <ActionCard
          icon="upload"
          title={t('home.openZip')}
          hint={t('home.openZipHint')}
          disabled={busy}
          onClick={onOpenZip}
        />
      )}
    </div>
  );
}

interface ProjectListProps {
  readonly projects: readonly LocalProjectMeta[];
  readonly busy: boolean;
  readonly onOpen: (id: string) => void;
  readonly onDelete: (project: LocalProjectMeta) => void;
}

function Unexported({ project }: { readonly project: LocalProjectMeta }) {
  return project.unexported ? (
    <span class="status status-warning">{t('status.unexported')}</span>
  ) : null;
}

/** Desktop: tabela Nome | Origem | Alterado em, com Abrir e Excluir na linha. */
function ProjectTable({ projects, busy, onOpen, onDelete }: ProjectListProps) {
  return (
    <table class="project-table">
      <thead>
        <tr>
          <th scope="col">{t('home.colName')}</th>
          <th scope="col">{t('home.colOrigin')}</th>
          <th scope="col">{t('home.colUpdated')}</th>
          <th scope="col">
            <span class="visually-hidden">{t('home.colActions')}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {projects.map((project) => (
          <tr key={project.id}>
            <th scope="row">
              <span class="project-name">{project.name}</span>
              <Unexported project={project} />
            </th>
            <td>{t('status.targetLocal')}</td>
            <td>{formatDate(project.updatedAt)}</td>
            <td class="project-actions">
              <Button size="sm" disabled={busy} onClick={() => onOpen(project.id)}>
                {t('common.open')}
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={busy}
                onClick={() => onDelete(project)}
              >
                {t('common.delete')}
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Celular: um cartão por projeto. */
function ProjectCards({ projects, busy, onOpen, onDelete }: ProjectListProps) {
  return (
    <ul class="project-cards">
      {projects.map((project) => (
        <li key={project.id} class="project-item">
          <div class="project-info">
            <strong>{project.name}</strong>
            <span class="muted">
              {t('home.updatedAt', { date: formatDate(project.updatedAt) })}
            </span>
            <Unexported project={project} />
          </div>
          <div class="row">
            <Button disabled={busy} onClick={() => onOpen(project.id)}>
              {t('common.open')}
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => onDelete(project)}>
              {t('common.delete')}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
