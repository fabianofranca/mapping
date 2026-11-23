import { signal, type ReadonlySignal } from '@preact/signals';
import {
  buildCatalog,
  packageSpecNameOf,
  type Catalog,
  type FormatRunner,
} from '../model';
import type { LibraryIssue } from '../model/library';
import { createFontRegistry, type FontRegistry } from '../storage/fonts';
import { createPackageImages, type PackageImages } from '../storage/packageImages';
import { reportError } from '../utils/report';
import { fontDeclaration } from './componentLibrary';
import { formatIssuesOf, libraryInputFiles } from './packageValidation';
import type { SpecPackageFiles } from './project';

// Library opened without a project (Library stage, B5): the package read into memory becomes a
// catalog for the Catalog screen. Nothing is written to disk or to the recents, and the package
// fonts only hold while the screen is open (`dispose` removes them from the document).

export interface LibraryPreview {
  /** Library name (the specialization's; empty if the package has no readable one). */
  readonly name: string;
  readonly specId: string;
  readonly version: number;
  readonly catalog: Catalog;
  /**
   * The problems the formats' checks found (stage #2035, decision 13): empty until they finish and for a
   * library without formats; the Catalog counts them in its validation line.
   */
  readonly formatIssues: ReadonlySignal<readonly LibraryIssue[]>;
  /** Rises when the fonts finish registering: the drawings are remeasured. */
  readonly fontsEpoch: ReadonlySignal<number>;
  /** The package images, decoded from the files in memory (decision 18 of stage #1903). */
  readonly images: PackageImages;
  /** Rises when a package image finishes (or fails): the gallery redraws. */
  readonly imagesEpoch: ReadonlySignal<number>;
  dispose(): void;
}

export function openLibraryPreview(
  files: SpecPackageFiles,
  options: {
    readonly fonts?: FontRegistry;
    /**
     * The executor of the formats' plugins (the sandbox): opening a library from the home screen is the
     * explicit action that runs their checks (decision 13); without it nothing runs.
     */
    readonly run?: FormatRunner;
  } = {},
): LibraryPreview {
  const catalog = buildCatalog(libraryInputFiles(files));
  const spec = catalog.spec;
  const registry = options.fonts ?? createFontRegistry();
  const epoch = signal(0);
  let disposed = false;

  if (spec?.fonts && spec.fonts.length > 0) {
    const specPath = packageSpecNameOf(files, spec.id);
    void (async () => {
      try {
        const fonts = await Promise.all(
          (spec.fonts ?? []).map(async (declared) => {
            const font = fontDeclaration(specPath, declared);
            const data = files.get(font.path);
            return data === undefined || typeof data === 'string'
              ? font
              : { ...font, bytes: await data.arrayBuffer() };
          }),
        );
        if (disposed) return;
        await registry.register(fonts);
        if (!disposed) epoch.value++;
        else registry.clear();
      } catch (error) {
        reportError('library.preview.fonts', error);
      }
    })();
  }

  const formatIssues = signal<readonly LibraryIssue[]>([]);
  const { run } = options;
  if (run !== undefined && catalog.formats.length > 0) {
    void (async () => {
      try {
        const issues = await formatIssuesOf(files, catalog.report, { run });
        if (!disposed) formatIssues.value = issues;
      } catch (error) {
        reportError('library.preview.formats', error);
      }
    })();
  }

  const imagesEpoch = signal(0);
  const images = createPackageImages({
    read: async (specId, asset) => {
      const data = specId === spec?.id ? files.get(asset) : undefined;
      return data === undefined || typeof data === 'string' ? null : data.arrayBuffer();
    },
  });
  const stopImagesEpoch = images.subscribe(() => {
    imagesEpoch.value++;
  });

  return {
    name: spec?.name ?? '',
    specId: spec?.id ?? '',
    version: spec?.version ?? 0,
    catalog,
    formatIssues,
    fontsEpoch: epoch,
    images,
    imagesEpoch,
    dispose() {
      disposed = true;
      stopImagesEpoch();
      images.clear();
      registry.clear();
    },
  };
}
