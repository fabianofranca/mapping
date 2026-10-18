import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import type { DirectoryHandleLike, ExistingImage } from '../storage/folder';
import { locale } from '../store/settings';
import { Button, TextField } from '../ui/controls';
import { Dialog } from '../ui/Dialog';
import { DialogSlotContext, useDialogSlot } from '../ui/focus';
import { HELP_SHORTCUTS, HelpDialog } from '../ui/HelpDialog';
import { Icon } from '../ui/icons';
import { InconsistentProjectDialog } from '../ui/InconsistentProjectDialog';
import { InstallHint } from '../ui/InstallHint';
import { PreviewBadge } from '../ui/PreviewBanner';
import { SettingsDialog } from '../ui/SettingsDialog';
import { matchesSearch } from '../utils/search';
import { MAX_PACKAGE_BYTES, MAX_PACKAGE_FILES } from '../model';
import { canPickDirectory } from '../ui/specPackageImport';
import {
  createFolderProject,
  createLocalProject,
  deleteLocalProject,
  features,
  forgetFolder,
  importZip,
  openFolder,
  openLibraryPackage,
  openLocalProject,
  openRecentFolder,
  recentProjects,
  relocateFolder,
  type AppResult,
  type InconsistentProject,
  type LibraryOpenResult,
  type RecentProject,
} from './controller';
import { NarrowWindowNotice, useNarrowWindow } from './NarrowWindow';
import { recentRowIndex, recentRowTarget } from './recentRows';
import { useReopenTrace } from './reopenTrace';

type LocalRecent = Extract<RecentProject, { kind: 'local' }>;
type FolderRecent = Extract<RecentProject, { kind: 'folder' }>;

type HomeDialog =
  | { readonly kind: 'new' }
  | {
      readonly kind: 'folder-setup';
      readonly handle: DirectoryHandleLike;
      readonly images: readonly ExistingImage[];
    }
  | { readonly kind: 'delete'; readonly project: LocalRecent }
  | {
      readonly kind: 'folder-unavailable';
      readonly folder: FolderRecent;
      readonly reason: 'denied' | 'missing';
      /** "Localizar pasta…" escolheu uma pasta sem `mapping.json`. */
      readonly noProject: boolean;
    }
  | { readonly kind: 'inconsistent'; readonly inconsistent: InconsistentProject }
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
  const narrow = useNarrowWindow();
  // Os diálogos da tela inicial são um slot: a troca (Configurações › Ver atalhos) mantém
  // quem abriu o primeiro, para onde o foco volta.
  const dialogs = useDialogSlot<HomeDialog>();
  const dialog = dialogs.current;
  const reopen = useReopenTrace(dialog?.kind === 'folder-unavailable');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const zipInput = useRef<HTMLInputElement>(null);
  const libraryZipInput = useRef<HTMLInputElement>(null);
  const listSection = useRef<HTMLElement>(null);
  // Linha que sai da lista (Remover da lista, Excluir): a posição dela, para o foco ir à
  // linha que ficou no lugar, e não ao `body` (etapa 7, G4). Um dono por fechamento (etapa
  // 8, F2): pelo diálogo, o `returnFocus` dele (o diálogo fecha depois da ação, já sem a
  // linha); direto na linha, sem diálogo, este efeito, no commit da lista nova.
  const removedAt = useRef(0);
  const focusRowAfter = useRef<number | null>(null);
  useLayoutEffect(() => {
    const index = focusRowAfter.current;
    if (busy || index === null) return;
    focusRowAfter.current = null;
    recentRowTarget(listSection.current, index)?.focus();
  });

  const available = features.value;
  if (!available) {
    return (
      <main class="home">
        <p class="muted">{t('app.loading')}</p>
      </main>
    );
  }

  /**
   * Roda uma ação mostrando o erro traduzido, se houver. Projeto inconsistente abre o diálogo
   * com a lista de problemas (e o "Reparar e abrir", quando dá).
   */
  const run = async <T,>(action: () => Promise<AppResult<T>>): Promise<T | null> => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await action();
      if (result.ok) return result.value;
      if (result.inconsistent)
        dialogs.show({ kind: 'inconsistent', inconsistent: result.inconsistent });
      else setMessage(t(`error.${result.error}`));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const onOpenFolder = async () => {
    const result = await run(openFolder);
    if (result?.kind === 'needs-setup') {
      setName('');
      dialogs.show({
        kind: 'folder-setup',
        handle: result.handle,
        images: result.images,
      });
    }
  };

  const onOpenRecent = async (project: RecentProject) => {
    if (project.kind === 'local') {
      await run(() => openLocalProject(project.id));
      return;
    }
    // Direto no clique: o navegador só mostra o pedido de permissão dentro do gesto.
    const result = await run(() =>
      reopen.track((trace) => openRecentFolder(project.id, trace)),
    );
    if (result?.kind === 'unavailable') {
      dialogs.show({
        kind: 'folder-unavailable',
        folder: project,
        reason: result.reason,
        noProject: false,
      });
    }
  };

  const onRelocate = async (folder: FolderRecent, reason: 'denied' | 'missing') => {
    const result = await run(() => relocateFolder(folder.id));
    if (result?.kind === 'no-project') {
      dialogs.show({ kind: 'folder-unavailable', folder, reason, noProject: true });
    } else if (result === null) {
      // O erro aparece na tela inicial (ou o diálogo do projeto inconsistente já entrou).
      dialogs.closeIf((current) => current.kind === 'folder-unavailable');
    }
  };

  /**
   * Tira a pasta da lista. Pelo aviso "Pasta indisponível", o aviso fecha depois e devolve
   * o foco à linha que ficou; direto na linha, a própria Home leva o foco até ela.
   */
  const onForget = async (id: string, viaDialog: boolean) => {
    const index = recentRowIndex(listSection.current, `folder:${id}`);
    if (viaDialog) removedAt.current = index;
    else focusRowAfter.current = index;
    await run(() => forgetFolder(id));
    if (viaDialog) dialogs.closeIf((current) => current.kind === 'folder-unavailable');
  };

  /** Excluir pelo diálogo: ele fecha depois da exclusão, já sem a linha (F2). */
  const onDelete = async (id: string) => {
    removedAt.current = recentRowIndex(listSection.current, `local:${id}`);
    await run(() => deleteLocalProject(id));
    dialogs.closeIf((current) => current.kind === 'delete');
  };

  /** Alvo do foco quando o diálogo fecha sem a linha que o abriu. */
  const rowLeft = () => recentRowTarget(listSection.current, removedAt.current);

  const onZipChosen = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';
    if (file) await run(() => importZip(file));
  };

  /** Mensagem de um pacote que não pôde ser lido; o cancelamento do seletor não diz nada. */
  const showLibraryResult = (result: LibraryOpenResult) => {
    if (result.kind !== 'failed') return;
    setMessage(
      result.reason === 'too-big'
        ? t('spec.packageTooBig', {
            files: MAX_PACKAGE_FILES,
            mb: Math.round(MAX_PACKAGE_BYTES / (1024 * 1024)),
          })
        : result.reason === 'empty'
          ? t('spec.packageEmpty')
          : t('spec.packageReadFailed'),
    );
  };

  const onOpenLibrary = async (source: Parameters<typeof openLibraryPackage>[0]) => {
    setBusy(true);
    setMessage(null);
    try {
      showLibraryResult(await openLibraryPackage(source));
    } finally {
      setBusy(false);
    }
  };

  const onLibraryZipChosen = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';
    if (file) await onOpenLibrary({ kind: 'zip', file });
  };

  const closeDialog = () => dialogs.close();
  // "Reparar e abrir" do projeto inconsistente (`null`: há problema sem reparo).
  const repair = dialog?.kind === 'inconsistent' ? dialog.inconsistent.repair : null;
  const actions: HomeActions = {
    busy,
    available,
    onNew: () => {
      setName('');
      dialogs.show({ kind: 'new' });
    },
    onOpenFolder: () => void onOpenFolder(),
    onOpenZip: () => zipInput.current?.click(),
    // Pasta onde o navegador deixa escolher uma; senão, o zip do pacote.
    onOpenLibrary: () =>
      canPickDirectory()
        ? void onOpenLibrary({ kind: 'folder' })
        : libraryZipInput.current?.click(),
  };
  const recents = recentProjects.value;
  const projects = recents.filter(
    (p) =>
      matchesSearch(p.name, query) ||
      (p.kind === 'folder' && matchesSearch(p.folderName, query)),
  );
  const list = (available.local || recents.length > 0) && (
    <section
      ref={listSection}
      class="project-section"
      aria-labelledby="home-projects-title"
    >
      <h2 id="home-projects-title" tabIndex={-1}>
        {t('home.recentProjects')}
      </h2>
      {recents.length === 0 ? (
        <p class="muted">{t('home.noRecentProjects')}</p>
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
          ) : (
            <ProjectTable
              projects={projects}
              busy={busy}
              onOpen={(project) => void onOpenRecent(project)}
              onDelete={(project) => dialogs.show({ kind: 'delete', project })}
              onForget={(project) => void onForget(project.id, false)}
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
    <>
      <input
        ref={zipInput}
        type="file"
        accept=".zip,application/zip,application/x-zip-compressed"
        hidden
        onChange={(e) => void onZipChosen(e.currentTarget)}
      />
      <input
        ref={libraryZipInput}
        type="file"
        accept=".zip,application/zip,application/x-zip-compressed"
        hidden
        data-library-zip
        onChange={(e) => void onLibraryZipChosen(e.currentTarget)}
      />
    </>
  );

  return (
    <>
      <div class="home home-desktop" hidden={narrow}>
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
              onClick={() => dialogs.show({ kind: 'help' })}
            >
              <Icon name="help" />
              {t('help.open')}
            </button>
            <button
              type="button"
              class="home-nav-item"
              onClick={() => dialogs.show({ kind: 'settings' })}
            >
              <Icon name="settings" />
              {t('settings.title')}
            </button>
          </nav>
          <div class="home-side-end">
            <InstallHint />
          </div>
        </aside>

        <main class="home-main">
          <div class="home-heading">
            <h2>{t('home.start')}</h2>
            <HomeButtons {...actions} />
          </div>
          <FolderReason {...actions} />
          {notices}
          {list}
          {zipField}
        </main>

        <DialogSlotContext.Provider value={dialogs.slot}>
          {dialog?.kind === 'inconsistent' && (
            <InconsistentProjectDialog
              details={dialog.inconsistent}
              busy={busy}
              onRepair={
                repair &&
                (() => {
                  closeDialog();
                  void run(repair);
                })
              }
              onClose={closeDialog}
            />
          )}

          {dialog?.kind === 'help' && (
            <HelpDialog onClose={closeDialog} section={dialog.section} />
          )}

          {dialog?.kind === 'settings' && (
            <SettingsDialog
              onClose={closeDialog}
              onShowShortcuts={() =>
                dialogs.show({ kind: 'help', section: HELP_SHORTCUTS })
              }
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
                  void run(() => createFolderProject(handle, name, images)).then(
                    (result) => {
                      if (result && result.skipped.length > 0) {
                        setMessage(
                          t('home.folderSkipped', { count: result.skipped.length }),
                        );
                      }
                    },
                  );
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
                <NameField
                  value={name}
                  placeholder={dialog.handle.name}
                  onInput={setName}
                />
              </form>
            </Dialog>
          )}

          {dialog?.kind === 'folder-unavailable' && (
            <Dialog
              title={t('home.folderUnavailableTitle')}
              dialogRef={reopen.dialogRef}
              onCancel={reopen.closeWith(null, closeDialog)}
              returnFocus={rowLeft}
              actions={
                <>
                  <Button onClick={reopen.closeWith('cancel-button', closeDialog)}>
                    {t('common.cancel')}
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={reopen.closeWith('forget', () => {
                      void onForget(dialog.folder.id, true);
                    })}
                  >
                    {t('home.forgetFolder')}
                  </Button>
                  <Button
                    variant="primary"
                    disabled={busy || !available.folder}
                    onClick={reopen.closeWith('relocate', () => {
                      void onRelocate(dialog.folder, dialog.reason);
                    })}
                  >
                    {t('home.relocateFolder')}
                  </Button>
                </>
              }
            >
              <p>
                {t(
                  dialog.reason === 'denied' ? 'home.folderDenied' : 'home.folderMissing',
                  {
                    folder: dialog.folder.folderName,
                  },
                )}
              </p>
              <p class="muted">{t('home.forgetFolderHint')}</p>
              {dialog.noProject && (
                <p class="notice notice-error" role="alert">
                  {t('home.folderNoProject', { name: dialog.folder.name })}
                </p>
              )}
            </Dialog>
          )}

          {dialog?.kind === 'delete' && (
            <Dialog
              title={t('home.deleteTitle')}
              alert
              onCancel={closeDialog}
              returnFocus={rowLeft}
              actions={
                <>
                  <Button onClick={closeDialog}>{t('common.cancel')}</Button>
                  <Button
                    variant="danger"
                    disabled={busy}
                    onClick={() => void onDelete(dialog.project.id)}
                  >
                    {t('common.delete')}
                  </Button>
                </>
              }
            >
              <p>{t('home.deleteMessage', { name: dialog.project.name })}</p>
            </Dialog>
          )}
        </DialogSlotContext.Provider>
      </div>
      {narrow && <NarrowWindowNotice />}
    </>
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
  // Sem foco próprio: o diálogo dá o foco inicial ao primeiro controle do corpo (F9).
  return (
    <TextField
      label={t('project.name')}
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
  readonly onOpenLibrary: () => void;
}

/** Os três pontos de entrada como botões do cabeçalho. */
function HomeButtons({
  busy,
  available,
  onNew,
  onOpenFolder,
  onOpenZip,
  onOpenLibrary,
}: HomeActions) {
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
      <Button disabled={busy} title={t('catalog.home.openHint')} onClick={onOpenLibrary}>
        <Icon name="library" />
        {t('catalog.home.open')}
      </Button>
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
function ProjectTable({ projects, busy, onOpen, onDelete, onForget }: ProjectListProps) {
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
          <tr
            key={`${project.kind}:${project.id}`}
            data-recent={`${project.kind}:${project.id}`}
          >
            <th scope="row">
              <span class="project-name">{project.name}</span>
              {project.kind === 'folder' && project.showFolderName && (
                <span class="project-name muted">{project.folderName}</span>
              )}
              <Unexported project={project} />
            </th>
            <td>
              <span class="badge">
                {t(
                  project.kind === 'folder'
                    ? 'status.targetFolder'
                    : 'status.targetLocal',
                )}
              </span>
            </td>
            <td>{formatDate(project.usedAt)}</td>
            <td class="project-actions">
              <Button
                size="sm"
                data-recent-open=""
                disabled={busy}
                onClick={() => onOpen(project)}
              >
                {t('common.open')}
              </Button>
              {project.kind === 'local' ? (
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy}
                  onClick={() => onDelete(project)}
                >
                  {t('common.delete')}
                </Button>
              ) : (
                <Button size="sm" disabled={busy} onClick={() => onForget(project)}>
                  {t('home.forgetFolder')}
                </Button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
