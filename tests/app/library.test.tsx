import JSZip from 'jszip';
import { cleanup, render, screen, waitFor } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/app/App';
import {
  closeLibrary,
  features,
  openLibrary,
  openLibraryPackage,
} from '../../src/app/controller';
import { t } from '../../src/i18n';
import { MAX_PACKAGE_FILES } from '../../src/model';
import { locale } from '../../src/store/settings';
import { material3Package } from '../storage/packageFixture';
import { MemoryDirectory } from '../storage/memoryFs';

// B5: opening a library without a project (folder or zip) and the Catalog screen.

// The page drawing uses Konva, which jsdom does not run.
vi.mock('../../src/ui/catalog/renderer', async (original) => {
  const real = await original<typeof import('../../src/ui/catalog/renderer')>();
  const { approximateMeasurer } = await import('../../src/model');
  return {
    ...real,
    defaultCatalogRenderer: () =>
      real.createCatalogRenderer(approximateMeasurer, () => 'data:image/png;base64,fake'),
  };
});

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(() => {
  cleanup();
  closeLibrary();
  Reflect.deleteProperty(globalThis, 'showDirectoryPicker');
});

async function memoryDir(files: ReadonlyMap<string, string | Blob>) {
  const root = new MemoryDirectory('material3');
  for (const [path, data] of files) {
    const parts = path.split('/');
    let dir = root;
    for (const part of parts.slice(0, -1)) {
      dir = (await dir.getDirectoryHandle(part, { create: true })) as MemoryDirectory;
    }
    dir.files.set(parts.at(-1) ?? '', data instanceof Blob ? data : new Blob([data]));
  }
  return root;
}

function fakePicker(dir: MemoryDirectory | null) {
  Object.defineProperty(globalThis, 'showDirectoryPicker', {
    value: vi.fn(async () => {
      if (!dir) throw new DOMException('cancelled', 'AbortError');
      return dir;
    }),
    configurable: true,
    writable: true,
  });
}

async function zipOf(files: ReadonlyMap<string, string | Blob>): Promise<File> {
  const zip = new JSZip();
  for (const [path, data] of files) zip.file(path, data);
  return new File([await zip.generateAsync({ type: 'blob' })], 'package.zip');
}

describe('openLibraryPackage', () => {
  it('opens the package folder and builds the catalog', async () => {
    fakePicker(await memoryDir(material3Package()));
    expect(await openLibraryPackage({ kind: 'folder' })).toEqual({ kind: 'opened' });
    const library = openLibrary.value;
    expect(library?.specId).toBe('material3');
    expect(library?.name).toBe('Material Design 3 (baseline)');
    expect(library?.catalog.layers.length).toBeGreaterThan(0);
  });

  it('opens the package zip', async () => {
    const file = await zipOf(material3Package());
    expect(await openLibraryPackage({ kind: 'zip', file })).toEqual({ kind: 'opened' });
    expect(openLibrary.value?.specId).toBe('material3');
  });

  it('cancelling the picker opens nothing', async () => {
    fakePicker(null);
    expect(await openLibraryPackage({ kind: 'folder' })).toEqual({ kind: 'cancelled' });
    expect(openLibrary.value).toBeNull();
  });

  it('empty package and package too big', async () => {
    expect(
      await openLibraryPackage({ kind: 'zip', file: await zipOf(new Map()) }),
    ).toEqual({ kind: 'failed', reason: 'empty' });
    const many = new Map<string, string>();
    for (let i = 0; i <= MAX_PACKAGE_FILES; i++) many.set(`docs/${i}.md`, 'x');
    expect(await openLibraryPackage({ kind: 'zip', file: await zipOf(many) })).toEqual({
      kind: 'failed',
      reason: 'too-big',
    });
    expect(openLibrary.value).toBeNull();
  });

  it('a file that is not a zip does not open', async () => {
    const file = new File(['this is not a zip'], 'x.zip');
    expect(await openLibraryPackage({ kind: 'zip', file })).toEqual({
      kind: 'failed',
      reason: 'unreadable',
    });
  });

  it('a package with errors still opens, with the problems in the catalog', async () => {
    const files = new Map(material3Package());
    files.set('material3.spec.json', '{ "format": "mapping-spec"');
    expect(await openLibraryPackage({ kind: 'zip', file: await zipOf(files) })).toEqual({
      kind: 'opened',
    });
    expect(openLibrary.value?.catalog.report.errors.length).toBeGreaterThan(0);
  });
});

describe('Catalog screen (no project)', () => {
  it('shows the library in place of the home screen and Back closes it', async () => {
    fakePicker(await memoryDir(material3Package()));
    await openLibraryPackage({ kind: 'folder' });
    render(<App />);
    expect(screen.getByRole('main', { name: t('catalog.home.screen') })).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Material Design 3 (baseline)' }),
    ).toBeTruthy();
    // Without a project there is nowhere to add to.
    expect(
      screen.queryByRole('button', { name: t('catalog.page.addToScreen') }),
    ).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: t('catalog.home.back') }));
    await waitFor(() => expect(openLibrary.value).toBeNull());
    expect(screen.queryByRole('main', { name: t('catalog.home.screen') })).toBeNull();
  });

  // Stage #515 (FN1, #497 part 1): Back disappears with the screen; focus goes to the home
  // screen control that opened the library, never to the body.
  it('Back by Enter moves the focus to the home screen "Open library"', async () => {
    features.value = { folder: true, local: true, fileProtocol: false };
    fakePicker(await memoryDir(material3Package()));
    await openLibraryPackage({ kind: 'folder' });
    render(<App />);
    const back = screen.getByRole('button', { name: t('catalog.home.back') });
    back.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(openLibrary.value).toBeNull());
    const opener = await screen.findByRole('button', { name: t('catalog.home.open') });
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(opener);
  });
});
