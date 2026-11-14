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

// External document in the Catalog (stage #559, decisions 23 to 25): the page reads the `.md` from the
// folder the person connected and, without it, shows what to do or just the link.

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
  if (!entry) throw new Error('m3-button missing');
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

/** Fake access: `reads` are the responses of `read`, in order (the last one repeats). */
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
  locale.value = 'en-US';
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('external document: states', () => {
  it('1. folder connected and file found: shows the document and a discreet link', async () => {
    const access = fakeAccess([{ status: 'found', text: '# Button\n\nButton text.' }]);
    page(access);
    expect(await within(docSection()).findByText('Button text.')).toBeTruthy();
    expect(access.read).toHaveBeenCalledWith(REPO_URL, 'components/button.md');
    const link = within(docSection()).getByRole('link', {
      name: t('catalog.doc.openRepo'),
    });
    expect(link.getAttribute('href')).toBe(URL_FILE);
    expect(within(docSection()).queryByRole('button')).toBeNull();
  });

  it('2. permission pending: "Allow access to <repo>" calls request and then shows the document', async () => {
    const access = fakeAccess([
      { status: 'permission' },
      { status: 'found', text: 'Unlocked text.' },
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
    expect(await within(docSection()).findByText('Unlocked text.')).toBeTruthy();
    expect(access.read).toHaveBeenCalledTimes(2);
  });

  it('2b. permission denied on click: also offers "Change folder…"', async () => {
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

  it('3. file missing: "<path> is not in <repo>" with "Change folder…" that calls pick and rereads', async () => {
    const access = fakeAccess([
      { status: 'missing' },
      { status: 'found', text: 'Found now.' },
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
    expect(await within(docSection()).findByText('Found now.')).toBeTruthy();
  });

  it('4. no folder: "Connect the <repo> folder…" calls pick and rereads', async () => {
    const access = fakeAccess([
      { status: 'no-folder' },
      { status: 'found', text: 'Connected.' },
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
    expect(await within(docSection()).findByText('Connected.')).toBeTruthy();
  });

  it('4b. cancelling the picker neither changes the state nor rereads', async () => {
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

  it('5a. browser without a folder picker: only the link, no buttons and no reading', async () => {
    const access = fakeAccess([{ status: 'no-folder' }], false);
    page(access);
    const link = await within(docSection()).findByRole('link', {
      name: t('catalog.doc.openRepo'),
    });
    expect(link.getAttribute('href')).toBe(URL_FILE);
    expect(within(docSection()).queryByRole('button')).toBeNull();
    expect(access.read).not.toHaveBeenCalled();
  });

  it('5b. no urlTemplate: only "<repo>: <path>" in mono font (token), no link', async () => {
    const access = fakeAccess([{ status: 'no-folder' }]);
    page(access, { ...EXTERNAL, url: null });
    const label = await within(docSection()).findByText(
      'design-docs: components/button.md',
    );
    expect(label.classList.contains('external-doc-path')).toBe(true);
    expect(within(docSection()).queryByRole('link')).toBeNull();
  });

  it('5c. no support and no url: only the path', async () => {
    const access = fakeAccess([{ status: 'no-folder' }], false);
    page(access, { ...EXTERNAL, url: null });
    expect(
      await within(docSection()).findByText('design-docs: components/button.md'),
    ).toBeTruthy();
    expect(within(docSection()).queryByRole('link')).toBeNull();
    expect(within(docSection()).queryByRole('button')).toBeNull();
  });

  it('5d. repository not declared (null repoUrl): no buttons, only the link', async () => {
    const access = fakeAccess([{ status: 'no-folder' }]);
    page(access, { ...EXTERNAL, repoUrl: null });
    expect(
      await within(docSection()).findByRole('link', { name: t('catalog.doc.openRepo') }),
    ).toBeTruthy();
    expect(within(docSection()).queryByRole('button')).toBeNull();
    expect(access.read).not.toHaveBeenCalled();
  });

  it('shows "Reading the document…" while the read has not finished', async () => {
    const access = fakeAccess([{ status: 'no-folder' }]);
    access.read.mockReturnValue(new Promise(() => undefined));
    page(access);
    expect(within(docSection()).getByText(t('catalog.doc.loading'))).toBeTruthy();
  });
});

describe('external document: link', () => {
  it('opens in another tab, without referrer, and the href comes from the urlTemplate', async () => {
    page(fakeAccess([{ status: 'missing' }]));
    const link = await within(docSection()).findByRole('link', {
      name: t('catalog.doc.openRepo'),
    });
    expect(link.getAttribute('href')).toBe(URL_FILE);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('never uses fetch', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    page(fakeAccess([{ status: 'found', text: 'x' }]));
    await within(docSection()).findByText('x');
    vi.unstubAllGlobals();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('external document: Markdown', () => {
  it('image becomes the alt text, relative link becomes text and the absolute one is a link', async () => {
    const text =
      '![diagram alt](rel.png)\n\nSee [other](./other.md) and [site](https://x.com).';
    page(fakeAccess([{ status: 'found', text }]));
    const section = docSection();
    expect(await within(section).findByText(/diagram alt/)).toBeTruthy();
    expect(section.querySelector('img')).toBeNull();
    expect(section.textContent).toContain('See other and site.');
    const anchors = [...section.querySelectorAll('a')];
    expect(anchors.map((a) => a.getAttribute('href'))).toEqual([
      'https://x.com',
      URL_FILE,
    ]);
    expect(anchors[0]?.textContent).toBe('site');
    expect(anchors[0]?.getAttribute('target')).toBe('_blank');
    expect(anchors[0]?.getAttribute('rel')).toBe('noopener noreferrer');
  });
});

describe('package document', () => {
  it('text doc stays as today: Markdown, no buttons or link and no folder reading', () => {
    const access = fakeAccess([{ status: 'found', text: 'never' }]);
    page(access, null, { docText: 'Package document.' });
    expect(within(docSection()).getByText('Package document.')).toBeTruthy();
    expect(within(docSection()).queryByRole('button')).toBeNull();
    expect(within(docSection()).queryByRole('link')).toBeNull();
    expect(access.read).not.toHaveBeenCalled();
  });

  it('no doc at all: the usual notice', () => {
    page(fakeAccess([{ status: 'missing' }]), null);
    expect(within(docSection()).getByText(t('catalog.page.noDoc'))).toBeTruthy();
  });
});
