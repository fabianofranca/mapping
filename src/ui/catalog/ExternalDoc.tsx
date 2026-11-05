import { useEffect, useState } from 'preact/hooks';
import { t } from '../../i18n';
import type { CatalogDocExternal } from '../../model';
import type { DocFolderAccess, DocReadResult } from '../../storage/docRepoFolders';
import { Button } from '../controls';
import { Icon } from '../icons';
import { Markdown } from '../markdown/Markdown';

// Documento de um tipo cujo `.md` vive num repositório externo (`doc` objeto, `docRepos`).
// A app lê o arquivo da pasta que a pessoa conecta (o seletor só abre por clique); o estado
// da leitura é da UI e não entra no projeto. Sem pasta, sem suporte ou sem acesso, mostra o
// que fazer e o link para o repositório.

export interface ExternalDocProps {
  readonly external: CatalogDocExternal;
  readonly access: DocFolderAccess;
  readonly onLink?: (href: string) => void;
}

/** Link discreto para o arquivo no repositório (abre em outra aba). */
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

/** Sem repositório ou sem seletor de pasta: só o link, ou só o caminho. */
function Reference({ external }: { readonly external: CatalogDocExternal }) {
  return external.url === null ? (
    <PathLabel external={external} />
  ) : (
    <RepoLink url={external.url} />
  );
}

interface Reading {
  /** `null` enquanto lê. */
  readonly result: DocReadResult | null;
  /** Relê (depois de conectar a pasta ou de a permissão ser dada). */
  readonly reload: () => void;
}

/** Lê o documento; a leitura obsoleta (outro tipo, outro clique) é descartada. */
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

/** Os botões do estado (cada um é um clique da pessoa: o navegador só abre o seletor assim). */
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
