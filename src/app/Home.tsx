import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import type { DirectoryHandleLike, ExistingImage } from '../storage/folder';
import { projectNotice } from '../store/banners';
import { Button, TextField } from '../ui/controls';
import { Dialog } from '../ui/Dialog';
import { DialogSlotContext, FOCUSABLE, useDialogSlot } from '../ui/focus';
import { HELP_SHORTCUTS, HelpDialog } from '../ui/HelpDialog';
import { Icon } from '../ui/icons';
import { InconsistentProjectDialog } from '../ui/InconsistentProjectDialog';
import { InstallHint } from '../ui/InstallHint';
import { PreviewBadge } from '../ui/PreviewBanner';
import { SettingsDialog } from '../ui/SettingsDialog';
import { guideUrl } from '../utils/guideLink';
import { matchesSearch } from '../utils/search';
import { fulfillHomeFocus } from './homeFocus';
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
import { ProjectNameDialog } from './HomeDialogs';
import { ProjectTable, type FolderRecent, type LocalRecent } from './HomeProjectTable';
import { NarrowWindowNotice, useNarrowWindow } from './NarrowWindow';
import { recentRowIndex, recentRowTarget } from './recentRows';
import { useReopenTrace } from './reopenTrace';

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
      /** "Locate folder…" chose a folder without `mapping.json`. */
      readonly noProject: boolean;
    }
  | { readonly kind: 'inconsistent'; readonly inconsistent: InconsistentProject }
  | { readonly kind: 'help'; readonly section?: string }
  | { readonly kind: 'settings' };

export function Home() {
  const narrow = useNarrowWindow();
  // The home screen dialogs are a slot: the swap (Settings › View shortcuts) keeps
  // whoever opened the first, where focus returns to.
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
  // Row that leaves the list (Remove from list, Delete): its position, so that focus goes to the
  // row that stayed in its place, and not to `body` (stage 7, G4). One owner per close (stage
  // 8, F2): through the dialog, its `returnFocus` (the dialog closes after the action, already without the
  // row); directly on the row, without a dialog, this effect, on the commit of the new list.
  const removedAt = useRef(0);
  const focusRowAfter = useRef<number | null>(null);
  useLayoutEffect(() => {
    const index = focusRowAfter.current;
    if (busy || index === null) return;
    focusRowAfter.current = null;
    recentRowTarget(listSection.current, index)?.focus();
  });

  const available = features.value;
  // Came back from the Library Catalog: focus goes to "Open library" (or the first
  // control), on the commit in which the screen already has controls.
  const mainRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (available && mainRef.current) fulfillHomeFocus(mainRef.current, FOCUSABLE);
  }, [available]);
  if (!available) {
    return (
      <main class="home">
        <p class="muted">{t('app.loading')}</p>
      </main>
    );
  }

  /**
   * Runs an action showing the translated error, if any. An inconsistent project opens the dialog
   * with the list of problems (and "Repair and open", when possible).
   */
  const run = async <T,>(action: () => Promise<AppResult<T>>): Promise<T | null> => {
    setBusy(true);
    setMessage(null);
    projectNotice.value = null;
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
    // The source row, so the notice returns focus to it when closing without removing: Open
    // stays disabled while the folder opens and loses focus, so the dialog does not keep it.
    removedAt.current = recentRowIndex(listSection.current, `folder:${project.id}`);
    // Directly on the click: the browser only shows the permission prompt inside the gesture.
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
      // The error appears on the home screen (or the inconsistent project dialog already came in).
      dialogs.closeIf((current) => current.kind === 'folder-unavailable');
    }
  };

  /**
   * Removes the folder from the list. Through the "Folder unavailable" notice, the notice closes afterwards and returns
   * focus to the row that stayed; directly on the row, Home itself moves focus to it.
   */
  const onForget = async (id: string, viaDialog: boolean) => {
    const index = recentRowIndex(listSection.current, `folder:${id}`);
    if (viaDialog) removedAt.current = index;
    else focusRowAfter.current = index;
    await run(() => forgetFolder(id));
    if (viaDialog) dialogs.closeIf((current) => current.kind === 'folder-unavailable');
  };

  /** Delete through the dialog: it closes after the deletion, already without the row (F2). */
  const onDelete = async (id: string) => {
    removedAt.current = recentRowIndex(listSection.current, `local:${id}`);
    await run(() => deleteLocalProject(id));
    dialogs.closeIf((current) => current.kind === 'delete');
  };

  /** Focus target when the dialog closes without the row that opened it. */
  const rowLeft = () => recentRowTarget(listSection.current, removedAt.current);

  const onZipChosen = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';
    if (file) await run(() => importZip(file));
  };

  /** Message of a package that could not be read; cancelling the picker says nothing. */
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
  // "Repair and open" of the inconsistent project (`null`: there is a problem with no repair).
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
    // Folder where the browser lets you choose one; otherwise, the package zip.
    onOpenLibrary: () =>
      canPickDirectory()
        ? void onOpenLibrary({ kind: 'folder' })
        : libraryZipInput.current?.click(),
  };
  const guide = guideUrl();
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
          {/*
           * Navigation items of the side strip (own role, with `aria-current`): they stay
           * as `<button class="home-nav-item">`, and not as `Button`, which is for common action
           * (exception recorded in `docs/DESIGN-SYSTEM.md`, "Loose buttons").
           */}
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
            {guide !== null && (
              <a
                class="home-nav-item"
                href={guide}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon name="info" />
                {t('home.guide')}
              </a>
            )}
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

        <main class="home-main" ref={mainRef}>
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
            <ProjectNameDialog
              title={t('home.newProject')}
              formId="new-project-form"
              busy={busy}
              name={name}
              placeholder={t('project.untitled')}
              onName={setName}
              onCancel={closeDialog}
              onSubmit={() => {
                closeDialog();
                void run(() => createLocalProject(name));
              }}
            />
          )}

          {dialog?.kind === 'folder-setup' && (
            <ProjectNameDialog
              title={t('home.folderSetupTitle')}
              formId="folder-setup-form"
              busy={busy}
              name={name}
              placeholder={dialog.handle.name}
              onName={setName}
              onCancel={closeDialog}
              onSubmit={() => {
                const { handle, images } = dialog;
                closeDialog();
                void run(() => createFolderProject(handle, name, images)).then(
                  (result) => {
                    if (result?.existing) projectNotice.value = 'home.folderHasProject';
                    else if (result && result.skipped.length > 0) {
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
            </ProjectNameDialog>
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

interface HomeActions {
  readonly busy: boolean;
  readonly available: NonNullable<typeof features.value>;
  readonly onNew: () => void;
  readonly onOpenFolder: () => void;
  readonly onOpenZip: () => void;
  readonly onOpenLibrary: () => void;
}

/** The three entry points as header buttons. */
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
      <Button
        disabled={busy}
        title={t('catalog.home.openHint')}
        data-home-open-library=""
        onClick={onOpenLibrary}
      >
        <Icon name="library" />
        {t('catalog.home.open')}
      </Button>
    </div>
  );
}

/**
 * Below the actions. Open folder unavailable: the reason is written on the screen (a disabled
 * button does not explain); available: the recommendation of the folder format for those who use git.
 */
function FolderReason({ available }: HomeActions) {
  if (available.folder) return <p class="muted home-reason">{t('home.gitHint')}</p>;
  if (!available.local) return null;
  return <p class="muted home-reason">{t('home.folderUnavailable')}</p>;
}
