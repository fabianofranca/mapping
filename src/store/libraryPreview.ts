import { signal, type ReadonlySignal } from '@preact/signals';
import { buildCatalog, packageSpecNameOf, type Catalog } from '../model';
import { createFontRegistry, type FontRegistry } from '../storage/fonts';
import { reportError } from '../utils/report';
import { fontDeclaration } from './componentLibrary';
import { libraryInputFiles } from './packageValidation';
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
  /** Rises when the fonts finish registering: the drawings are remeasured. */
  readonly fontsEpoch: ReadonlySignal<number>;
  dispose(): void;
}

export function openLibraryPreview(
  files: SpecPackageFiles,
  options: { readonly fonts?: FontRegistry } = {},
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

  return {
    name: spec?.name ?? '',
    specId: spec?.id ?? '',
    version: spec?.version ?? 0,
    catalog,
    fontsEpoch: epoch,
    dispose() {
      disposed = true;
      registry.clear();
    },
  };
}
