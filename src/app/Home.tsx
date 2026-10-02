import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import type { DirectoryHandleLike, ExistingImage } from '../storage/folder';
import type { LocalProjectMeta } from '../storage/local';
import { locale } from '../store/settings';
import { Dialog } from '../ui/Dialog';
import { InstallHint } from '../ui/InstallHint';
import { SpecHelpDialog } from '../ui/SpecHelpDialog';
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
  | { readonly kind: 'help' };

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(locale.value, {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function Home() {
  const [dialog, setDialog] = useState<HomeDialog | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [name, setName] = useState('');
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

  return (
    <main class="home">
      <h2>{t('home.start')}</h2>
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
      <InstallHint />
      <button type="button" class="button" onClick={() => setDialog({ kind: 'help' })}>
        {t('help.open')}
      </button>

      <div class="home-actions">
        {available.local && (
          <button
            type="button"
            class="action-card"
            disabled={busy}
            onClick={() => {
              setName('');
              setDialog({ kind: 'new' });
            }}
          >
            <strong>{t('home.newProject')}</strong>
            <span>{t('home.newProjectHint')}</span>
          </button>
        )}
        {available.folder && (
          <button
            type="button"
            class="action-card"
            disabled={busy}
            onClick={() => void onOpenFolder()}
          >
            <strong>{t('home.openFolder')}</strong>
            <span>{t('home.openFolderHint')}</span>
          </button>
        )}
        {available.local && (
          <button
            type="button"
            class="action-card"
            disabled={busy}
            onClick={() => zipInput.current?.click()}
          >
            <strong>{t('home.openZip')}</strong>
            <span>{t('home.openZipHint')}</span>
          </button>
        )}
        <input
          ref={zipInput}
          type="file"
          accept=".zip,application/zip,application/x-zip-compressed"
          hidden
          onChange={(e) => void onZipChosen(e.currentTarget)}
        />
      </div>

      {available.local && (
        <section class="project-list">
          <h2>{t('home.localProjects')}</h2>
          {localProjects.value.length === 0 ? (
            <p class="muted">{t('home.noLocalProjects')}</p>
          ) : (
            <ul>
              {localProjects.value.map((project) => (
                <li key={project.id} class="project-item">
                  <div class="project-info">
                    <strong>{project.name}</strong>
                    <span class="muted">
                      {t('home.updatedAt', { date: formatDate(project.updatedAt) })}
                    </span>
                    {project.unexported && (
                      <span class="status status-warning">{t('status.unexported')}</span>
                    )}
                  </div>
                  <div class="row">
                    <button
                      type="button"
                      class="button"
                      disabled={busy}
                      onClick={() => void run(() => openLocalProject(project.id))}
                    >
                      {t('common.open')}
                    </button>
                    <button
                      type="button"
                      class="button button-danger"
                      disabled={busy}
                      onClick={() => setDialog({ kind: 'delete', project })}
                    >
                      {t('common.delete')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {dialog?.kind === 'help' && <SpecHelpDialog onClose={closeDialog} />}

      {dialog?.kind === 'new' && (
        <Dialog
          title={t('home.newProject')}
          onCancel={closeDialog}
          actions={
            <>
              <button type="button" class="button" onClick={closeDialog}>
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                form="new-project-form"
                class="button button-primary"
                disabled={busy}
              >
                {t('common.create')}
              </button>
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
              <button type="button" class="button" onClick={closeDialog}>
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                form="folder-setup-form"
                class="button button-primary"
                disabled={busy}
              >
                {t('common.create')}
              </button>
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
              <button type="button" class="button" onClick={closeDialog}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                class="button button-danger"
                disabled={busy}
                onClick={() => {
                  const { id } = dialog.project;
                  closeDialog();
                  void run(() => deleteLocalProject(id));
                }}
              >
                {t('common.delete')}
              </button>
            </>
          }
        >
          <p>{t('home.deleteMessage', { name: dialog.project.name })}</p>
        </Dialog>
      )}
    </main>
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
    <label class="field">
      {t('project.name')}
      <input
        ref={input}
        type="text"
        class="input"
        value={value}
        placeholder={placeholder}
        onInput={(e) => onInput(e.currentTarget.value)}
      />
    </label>
  );
}
