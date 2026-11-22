// @vitest-environment node
// DX5 (stage #1903, decision 18): the component library hands the canvas and the Catalog the
// package images of the applied specializations. The bytes come from the session's in-memory copy
// (an apply or update not yet written) or from `specs/<id>/`, are decoded on demand with a limit
// and redrawn through an epoch; switching or removing a library frees its bitmaps.
import { signal } from '@preact/signals';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applySpecialization, type Project, type Spec } from '../../src/model';
import type { PackageImages } from '../../src/storage/packageImages';
import { createComponentLibrary } from '../../src/store/componentLibrary';
import { material3Spec } from '../storage/packageFixture';
import { emptyProject } from '../model/fixtures';
import { pngBytes } from '../support/imageBytes';

const DIR = 'specs/material3';
const LOGO = 'images/logo.png';

function withSpec(version = 1, spec: Spec = material3Spec()): Project {
  return applySpecialization(
    emptyProject(),
    { ...spec, version },
    {
      newId: (() => {
        let n = 0;
        return () => `LS${++n}`;
      })(),
      packageSpecName: 'material3.spec.json',
    },
  );
}

const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

function bitmap(width = 8, height = 4) {
  return { width, height, close: vi.fn() };
}

function setup(
  initial: Project | null,
  options: {
    files?: Record<string, Uint8Array>;
    cached?: (
      id: string,
      version: number,
    ) => ReadonlyMap<string, string | Blob> | undefined;
    images?: PackageImages;
  } = {},
) {
  const project = signal<Project | null>(initial);
  const files = options.files ?? { [`${DIR}/${LOGO}`]: pngBytes(8, 4) };
  const reads: string[] = [];
  const library = createComponentLibrary({
    project,
    readText: async () => null,
    readBytes: async (path) => {
      reads.push(path);
      const bytes = files[path];
      return bytes === undefined ? null : (bytes.slice().buffer as ArrayBuffer);
    },
    ...(options.cached ? { cached: options.cached } : {}),
    ...(options.images ? { images: options.images } : {}),
  });
  return { project, library, reads };
}

describe('component library package images', () => {
  const libraries: { dispose(): void }[] = [];
  afterEach(() => {
    for (const library of libraries.splice(0)) library.dispose();
    vi.unstubAllGlobals();
  });
  const start = (...args: Parameters<typeof setup>) => {
    const made = setup(...args);
    libraries.push(made.library);
    return made;
  };

  it('reads the cited file from specs/<id>/ and decodes it with createImageBitmap, once', async () => {
    const create = vi.fn(() => Promise.resolve(bitmap()));
    vi.stubGlobal('createImageBitmap', create);
    const { library, reads } = start(withSpec());
    const epoch = library.imagesEpoch.value;
    expect(library.images.resolve('material3', LOGO)).toEqual({ state: 'loading' });
    await settle();
    const view = library.images.resolve('material3', LOGO);
    expect(view.state).toBe('ready');
    expect(reads.filter((path) => path.endsWith('.png'))).toEqual([`${DIR}/${LOGO}`]);
    expect(create).toHaveBeenCalledTimes(1);
    // The drawings redo when the image arrives.
    expect(library.imagesEpoch.value).toBeGreaterThan(epoch);
  });

  it('prefers the session copy of an unwritten package (apply or update) to the disk', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.resolve(bitmap())),
    );
    const cached = new Map<string, string | Blob>([
      [LOGO, new Blob([pngBytes(8, 4) as BlobPart])],
    ]);
    const { library, reads } = start(withSpec(), {
      files: {},
      cached: (id, version) => (id === 'material3' && version === 1 ? cached : undefined),
    });
    library.images.resolve('material3', LOGO);
    await settle();
    expect(library.images.resolve('material3', LOGO).state).toBe('ready');
    expect(reads.filter((path) => path.endsWith('.png'))).toEqual([]);
  });

  it('a specialization that is not in the project, or a file that is not there, fails without decoding', async () => {
    const create = vi.fn(() => Promise.resolve(bitmap()));
    vi.stubGlobal('createImageBitmap', create);
    const { library } = start(withSpec());
    library.images.resolve('unknown', LOGO);
    library.images.resolve('material3', 'images/none.png');
    await settle();
    expect(library.images.resolve('unknown', LOGO)).toMatchObject({ state: 'failed' });
    expect(library.images.resolve('material3', 'images/none.png')).toMatchObject({
      state: 'failed',
    });
    expect(create).not.toHaveBeenCalled();
  });

  describe('freeing the bitmaps', () => {
    function spyImages() {
      const images: PackageImages = {
        resolve: vi.fn(() => ({ state: 'loading' as const })),
        subscribe: vi.fn(() => () => undefined),
        drop: vi.fn(),
        clear: vi.fn(),
        size: 0,
        bytes: 0,
      };
      return images;
    }

    it('a new version of the specialization drops its bitmaps; another edit does not', async () => {
      const images = spyImages();
      const { library, project } = start(withSpec(1), { images });
      await library.whenIdle();
      project.value = { ...(project.value as Project), revision: 9 };
      await library.whenIdle();
      expect(images.drop).not.toHaveBeenCalled();
      project.value = withSpec(2);
      await library.whenIdle();
      expect(images.drop).toHaveBeenCalledWith('material3');
    });

    it('removing the specialization drops its bitmaps', async () => {
      const images = spyImages();
      const { library, project } = start(withSpec(1), { images });
      await library.whenIdle();
      project.value = emptyProject();
      await library.whenIdle();
      expect(images.drop).toHaveBeenCalledWith('material3');
    });

    it('invalidate and dispose free everything', async () => {
      const images = spyImages();
      const { library } = start(withSpec(1), { images });
      await library.whenIdle();
      library.invalidate();
      expect(images.clear).toHaveBeenCalledTimes(1);
      library.dispose();
      expect(images.clear).toHaveBeenCalledTimes(2);
    });
  });
});
