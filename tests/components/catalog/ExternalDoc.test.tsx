import { cleanup, render, screen, waitFor, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../../src/i18n';
import {
  type Catalog,
  type CatalogDocExternal,
  type CatalogEntry,
  approximateMeasurer,
  buildCatalog,
} from '../../../src/model';
import type { DocFolderAccess, DocReadResult } from '../../../src/storage/docRepoFolders';
import { locale } from '../../../src/store/settings';
import { CatalogPage } from '../../../src/ui/catalog/CatalogPage';
import { createCatalogRenderer } from '../../../src/ui/catalog/renderer';
import { material3Package } from '../../storage/packageFixture';

// Documento externo no Catálogo (etapa #559, decisões 23 a 25): a página lê o `.md` da pasta
// que a pessoa conectou e, sem ela, mostra o que fazer ou só o link.

const files = [...material3Package()].map(([path, content]) =>
  typeof content === 'string' ? { path, text: content } : { path, binary: true },
);
const base: Catalog = buildCatalog(files);

const REPO_URL = 'https://gitlab.empresa.com/grupo/design-docs';
const URL_FILE = `${REPO_URL}/-/blob/main/components/button.md`;
const EXTERNAL: CatalogDocExternal = {
  repo: 'design-docs',
  path: 'components/button.md',
  repoUrl: REPO_URL,
  url: URL_FILE,
};

function patched(patch: Partial<CatalogEntry>): {
  catalog: Catalog;
  entry: CatalogEntry;
} {
  const catalog: Catalog = {
    ...base,
    layers: base.layers.map((layer) => ({
      ...layer,
      entries: layer.entries.map((e) =>
        e.type.id === 'm3-button' ? { ...e, ...patch } : e,
      ),
    })),
  };
  const entry = catalog.layers
    .flatMap((l) => l.entries)
    .find((e) => e.type.id === 'm3-button');
  if (!entry) throw new Error('m3-button ausente');
  return { catalog, entry };
}

interface Fake extends DocFolderAccess {
  supported: ReturnType<typeof vi.fn<() => boolean>>;
  read: ReturnType<
    typeof vi.fn<(repoUrl: string, path: string) => Promise<DocReadResult>>
  >;
  pick: ReturnType<typeof vi.fn<(repoUrl: string) => Promise<boolean>>>;
  request: ReturnType<typeof vi.fn<(repoUrl: string) => Promise<boolean>>>;
}

/** Acesso falso: `reads` são as respostas de `read`, em ordem (a última se repete). */
function fakeAccess(reads: DocReadResult[], supported = true): Fake {
  let n = 0;
  return {
    supported: vi.fn(() => supported),
    read: vi.fn(async () => reads[Math.min(n++, reads.length - 1)] as DocReadResult),
    pick: vi.fn(async () => true),
    request: vi.fn(async () => true),
  };
}

function page(
  access: DocFolderAccess,
  external: CatalogDocExternal | null = EXTERNAL,
  extra: Partial<CatalogEntry> = {},
) {
  const { catalog, entry } = patched({
    docText: null,
    docExternal: external,
    ...extra,
  });
  const user = userEvent.setup();
  render(
    <CatalogPage
      catalog={catalog}
      entry={entry}
      specId="material3"
      version={1}
      renderer={createCatalogRenderer(
        approximateMeasurer,
        () => 'data:image/png;base64,x',
      )}
      docAccess={access}
    />,
  );
  return { user };
}

const docSection = () => screen.getByRole('region', { name: t('catalog.page.document') });

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('documento externo: estados', () => {
  it('1. pasta conectada e arquivo encontrado: mostra o documento e um link discreto', async () => {
    const access = fakeAccess([{ status: 'found', text: '# Botão\n\nTexto do botão.' }]);
    page(access);
    expect(await within(docSection()).findByText('Texto do botão.')).toBeTruthy();
    expect(access.read).toHaveBeenCalledWith(REPO_URL, 'components/button.md');
    const link = within(docSection()).getByRole('link', {
      name: t('catalog.doc.openRepo'),
    });
    expect(link.getAttribute('href')).toBe(URL_FILE);
    expect(within(docSection()).queryByRole('button')).toBeNull();
  });

  it('2. permissão pendente: "Permitir acesso a <repo>" chama request e depois mostra o documento', async () => {
    const access = fakeAccess([
      { status: 'permission' },
      { status: 'found', text: 'Texto liberado.' },
    ]);
    const { user } = page(access);
    const allow = await within(docSection()).findByRole('button', {
      name: t('catalog.doc.allow', { repo: 'design-docs' }),
    });
    expect(
      within(docSection()).getByRole('link', { name: t('catalog.doc.openRepo') }),
    ).toBeTruthy();
    await user.click(allow);
    expect(access.request).toHaveBeenCalledWith(REPO_URL);
    expect(await within(docSection()).findByText('Texto liberado.')).toBeTruthy();
    expect(access.read).toHaveBeenCalledTimes(2);
  });

  it('2b. permissão negada no clique: oferece também "Trocar pasta…"', async () => {
    const access = fakeAccess([{ status: 'permission' }]);
    access.request.mockResolvedValue(false);
    const { user } = page(access);
    expect(
      within(docSection()).queryByRole('button', { name: t('catalog.doc.change') }),
    ).toBeNull();
    await user.click(
      await within(docSection()).findByRole('button', {
        name: t('catalog.doc.allow', { repo: 'design-docs' }),
      }),
    );
    expect(
      await within(docSection()).findByRole('button', { name: t('catalog.doc.change') }),
    ).toBeTruthy();
  });

  it('3. arquivo ausente: "<path> não está em <repo>" com "Trocar pasta…" que chama pick e relê', async () => {
    const access = fakeAccess([
      { status: 'missing' },
      { status: 'found', text: 'Achou agora.' },
    ]);
    const { user } = page(access);
    expect(
      await within(docSection()).findByText(
        t('catalog.doc.missing', { path: 'components/button.md', repo: 'design-docs' }),
      ),
    ).toBeTruthy();
    expect(
      within(docSection()).getByRole('link', { name: t('catalog.doc.openRepo') }),
    ).toBeTruthy();
    await user.click(
      within(docSection()).getByRole('button', { name: t('catalog.doc.change') }),
    );
    expect(access.pick).toHaveBeenCalledWith(REPO_URL);
    expect(await within(docSection()).findByText('Achou agora.')).toBeTruthy();
  });

  it('4. sem pasta: "Conectar a pasta de <repo>…" chama pick e relê', async () => {
    const access = fakeAccess([
      { status: 'no-folder' },
      { status: 'found', text: 'Conectado.' },
    ]);
    const { user } = page(access);
    const connect = await within(docSection()).findByRole('button', {
      name: t('catalog.doc.connect', { repo: 'design-docs' }),
    });
    expect(
      within(docSection()).getByRole('link', { name: t('catalog.doc.openRepo') }),
    ).toBeTruthy();
    await user.click(connect);
    expect(access.pick).toHaveBeenCalledWith(REPO_URL);
    expect(await within(docSection()).findByText('Conectado.')).toBeTruthy();
  });

  it('4b. cancelar o seletor não troca o estado nem relê', async () => {
    const access = fakeAccess([{ status: 'no-folder' }]);
    access.pick.mockResolvedValue(false);
    const { user } = page(access);
    await user.click(
      await within(docSection()).findByRole('button', {
        name: t('catalog.doc.connect', { repo: 'design-docs' }),
      }),
    );
    await waitFor(() => expect(access.pick).toHaveBeenCalled());
    expect(access.read).toHaveBeenCalledTimes(1);
    expect(
      within(docSection()).getByRole('button', {
        name: t('catalog.doc.connect', { repo: 'design-docs' }),
      }),
    ).toBeTruthy();
  });

  it('5a. navegador sem seletor de pasta: só o link, sem botões e sem ler', async () => {
    const access = fakeAccess([{ status: 'no-folder' }], false);
    page(access);
    const link = await within(docSection()).findByRole('link', {
      name: t('catalog.doc.openRepo'),
    });
    expect(link.getAttribute('href')).toBe(URL_FILE);
    expect(within(docSection()).queryByRole('button')).toBeNull();
    expect(access.read).not.toHaveBeenCalled();
  });

  it('5b. sem urlTemplate: só "<repo>: <path>" em fonte mono (token), sem link', async () => {
    const access = fakeAccess([{ status: 'no-folder' }]);
    page(access, { ...EXTERNAL, url: null });
    const label = await within(docSection()).findByText(
      'design-docs: components/button.md',
    );
    expect(label.classList.contains('external-doc-path')).toBe(true);
    expect(within(docSection()).queryByRole('link')).toBeNull();
  });

  it('5c. sem suporte e sem url: só o caminho', async () => {
    const access = fakeAccess([{ status: 'no-folder' }], false);
    page(access, { ...EXTERNAL, url: null });
    expect(
      await within(docSection()).findByText('design-docs: components/button.md'),
    ).toBeTruthy();
    expect(within(docSection()).queryByRole('link')).toBeNull();
    expect(within(docSection()).queryByRole('button')).toBeNull();
  });

  it('5d. repositório não declarado (repoUrl nulo): sem botões, só o link', async () => {
    const access = fakeAccess([{ status: 'no-folder' }]);
    page(access, { ...EXTERNAL, repoUrl: null });
    expect(
      await within(docSection()).findByRole('link', { name: t('catalog.doc.openRepo') }),
    ).toBeTruthy();
    expect(within(docSection()).queryByRole('button')).toBeNull();
    expect(access.read).not.toHaveBeenCalled();
  });

  it('mostra "Lendo o documento…" enquanto a leitura não termina', async () => {
    const access = fakeAccess([{ status: 'no-folder' }]);
    access.read.mockReturnValue(new Promise(() => undefined));
    page(access);
    expect(within(docSection()).getByText(t('catalog.doc.loading'))).toBeTruthy();
  });
});

describe('documento externo: link', () => {
  it('abre em outra aba, sem referrer, e o href vem do urlTemplate', async () => {
    page(fakeAccess([{ status: 'missing' }]));
    const link = await within(docSection()).findByRole('link', {
      name: t('catalog.doc.openRepo'),
    });
    expect(link.getAttribute('href')).toBe(URL_FILE);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('nunca usa fetch', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    page(fakeAccess([{ status: 'found', text: 'x' }]));
    await within(docSection()).findByText('x');
    vi.unstubAllGlobals();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('documento externo: Markdown', () => {
  it('imagem vira o texto alternativo e link relativo vira texto', async () => {
    const text =
      '![diagrama alt](rel.png)\n\nVeja [outro](./outro.md) e [site](https://x.com).';
    page(fakeAccess([{ status: 'found', text }]));
    const section = docSection();
    expect(await within(section).findByText(/diagrama alt/)).toBeTruthy();
    expect(section.querySelector('img')).toBeNull();
    expect(within(section).getByText(/Veja outro e site\./)).toBeTruthy();
    const anchors = [...section.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(anchors).toEqual([URL_FILE]);
  });
});

describe('documento do pacote', () => {
  it('doc texto continua como hoje: Markdown, sem botões nem link e sem ler pasta', () => {
    const access = fakeAccess([{ status: 'found', text: 'nunca' }]);
    page(access, null, { docText: 'Documento do pacote.' });
    expect(within(docSection()).getByText('Documento do pacote.')).toBeTruthy();
    expect(within(docSection()).queryByRole('button')).toBeNull();
    expect(within(docSection()).queryByRole('link')).toBeNull();
    expect(access.read).not.toHaveBeenCalled();
  });

  it('sem doc nenhum: o aviso de sempre', () => {
    page(fakeAccess([{ status: 'missing' }]), null);
    expect(within(docSection()).getByText(t('catalog.page.noDoc'))).toBeTruthy();
  });
});
