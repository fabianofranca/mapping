import { signal, type ReadonlySignal } from '@preact/signals';
import { buildCatalog, packageSpecNameOf, type Catalog } from '../model';
import { createFontRegistry, type FontRegistry } from '../storage/fonts';
import { reportError } from '../utils/report';
import { fontDeclaration } from './componentLibrary';
import { libraryInputFiles } from './packageValidation';
import type { SpecPackageFiles } from './project';

// Biblioteca aberta sem projeto (etapa Biblioteca, B5): o pacote lido para a memória vira um
// catálogo para a tela do Catálogo. Nada é gravado em disco nem nos recentes, e as fontes do
// pacote só valem enquanto a tela está aberta (`dispose` as tira do documento).

export interface LibraryPreview {
  /** Nome da biblioteca (o da especialização; vazio se o pacote não tem uma legível). */
  readonly name: string;
  readonly specId: string;
  readonly version: number;
  readonly catalog: Catalog;
  /** Sobe quando as fontes terminam de registrar: os desenhos remedem. */
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
        const fonts = [];
        for (const declared of spec.fonts ?? []) {
          const font = fontDeclaration(specPath, declared);
          const data = files.get(font.path);
          fonts.push(
            data === undefined || typeof data === 'string'
              ? font
              : { ...font, bytes: await data.arrayBuffer() },
          );
        }
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
