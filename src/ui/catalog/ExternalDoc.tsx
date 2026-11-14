import { useEffect, useState } from 'preact/hooks';
import { t } from '../../i18n';
import type { CatalogDocExternal } from '../../model';
import type { DocFolderAccess, DocReadResult } from '../../storage/docRepoFolders';
import { Button } from '../controls';
import { Icon } from '../icons';
import { Markdown } from '../markdown/Markdown';

// Document of a type whose `.md` lives in an external repository (`doc` object, `docRepos`).
// The app reads the file from the folder the person connects (the picker only opens on click); the
// read state belongs to the UI and does not enter the project. With no folder, no support or
// no access, it shows what to do and the link to the repository.

export interface ExternalDocProps {
  readonly external: CatalogDocExternal;
  readonly access: DocFolderAccess;
  readonly onLink?: (href: string) => void;
}

/** Discreet link to the file in the repository (opens in another tab). */
function RepoLink({ url }: { readonly url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" class="external-doc-link">
      <Icon name="externalLink" />
      {t('catalog.doc.openRepo')}
    </a>
  );
}

function PathLabel({ external }: { readonly external: CatalogDocExternal }) {
  return <span class="external-doc-path">{`${external.repo}: ${external.path}`}</span>;
}

/** No repository or no folder picker: only the link, or only the path. */
function Reference({ external }: { readonly external: CatalogDocExternal }) {
  return external.url === null ? (
    <PathLabel external={external} />
  ) : (
    <RepoLink url={external.url} />
  );
}

interface Reading {
  /** `null` while reading. */
  readonly result: DocReadResult | null;
  /** Re-reads (after connecting the folder or after the permission is granted). */
  readonly reload: () => void;
}

/** Reads the document; a stale read (another type, another click) is discarded. */
function useDocRead(
  access: DocFolderAccess,
  repoUrl: string | null,
  path: string,
  enabled: boolean,
): Reading {
  const [result, setResult] = useState<DocReadResult | null>(null);
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (!enabled || repoUrl === null) return undefined;
    let stale = false;
    setResult(null);
    access
      .read(repoUrl, path)
      .catch((): DocReadResult => ({ status: 'missing' }))
      .then((r) => {
        if (!stale) setResult(r);
      });
    return () => {
      stale = true;
    };
  }, [access, repoUrl, path, enabled, round]);
  return { result, reload: () => setRound((n) => n + 1) };
}

interface ActionsProps {
  readonly external: CatalogDocExternal;
  readonly repoUrl: string;
  readonly access: DocFolderAccess;
  readonly status: 'permission' | 'missing' | 'no-folder';
  readonly reload: () => void;
}

/** The state's buttons (each is a click by the person: only then can the browser open the picker). */
function Actions({ external, repoUrl, access, status, reload }: ActionsProps) {
  const [denied, setDenied] = useState(false);
  const pick = async () => {
    if (await access.pick(repoUrl)) reload();
  };
  const allow = async () => {
    if (await access.request(repoUrl)) reload();
    else setDenied(true);
  };
  const change = status === 'missing' || (status === 'permission' && denied);
  return (
    <div class="external-doc-actions">
      {status === 'permission' && (
        <Button onClick={() => void allow()}>
          {t('catalog.doc.allow', { repo: external.repo })}
        </Button>
      )}
      {status === 'no-folder' && (
        <Button onClick={() => void pick()}>
          <Icon name="folder" />
          {t('catalog.doc.connect', { repo: external.repo })}
        </Button>
      )}
      {change && (
        <Button onClick={() => void pick()}>
          <Icon name="folder" />
          {t('catalog.doc.change')}
        </Button>
      )}
    </div>
  );
}

export function ExternalDoc({ external, access, onLink }: ExternalDocProps) {
  const { repo, path, repoUrl, url } = external;
  const canRead = repoUrl !== null && access.supported();
  const { result, reload } = useDocRead(access, repoUrl, path, canRead);
  if (!canRead || repoUrl === null) {
    return (
      <div class="external-doc">
        <Reference external={external} />
      </div>
    );
  }
  if (result === null) return <p class="muted">{t('catalog.doc.loading')}</p>;
  if (result.status === 'found') {
    return (
      <div class="external-doc">
        <Markdown text={result.text} onLink={onLink} />
        {url !== null && <RepoLink url={url} />}
      </div>
    );
  }
  return (
    <div class="external-doc">
      {result.status === 'missing' ? (
        <p>{t('catalog.doc.missing', { path, repo })}</p>
      ) : (
        url === null && <PathLabel external={external} />
      )}
      <Actions
        external={external}
        repoUrl={repoUrl}
        access={access}
        status={result.status}
        reload={reload}
      />
      {url !== null && <RepoLink url={url} />}
    </div>
  );
}
