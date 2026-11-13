import type { AnchorDefaults } from './anchorPlacement';
import { markingComponent, type ComponentCatalog } from './componentCatalog';
import type { ComponentFile } from './components/componentFormat';
import type { Marking, Project } from './types';

// Os padrões de encosto declarados pelo componente (`anchor` da raiz do arquivo), no formato que
// `snapToAnchor` e a instância nova ancorada leem (`options.defaults`/`anchorDefaults`): o
// `offset` fica em UNIDADES do componente (quem usa multiplica pela densidade).

/** O `anchor` da raiz do componente como `AnchorDefaults`; `undefined` quando ele não declara nenhum. */
export function fileAnchorDefaults(file: ComponentFile): AnchorDefaults | undefined {
  const { anchor } = file;
  if (anchor === undefined) return undefined;
  return {
    ...(anchor.side === undefined ? {} : { side: anchor.side }),
    ...(anchor.align === undefined ? {} : { align: anchor.align }),
    ...(anchor.offset === undefined
      ? {}
      : { offset: { main: anchor.offset.main ?? 0, cross: anchor.offset.cross ?? 0 } }),
  };
}

/** Os padrões do tipo `specId/typeId` (para a instância que ainda não existe). */
export function typeAnchorDefaults(
  catalog: ComponentCatalog,
  specId: string,
  typeId: string,
): AnchorDefaults | undefined {
  const file = catalog.get(specId)?.byType.get(typeId);
  return file === undefined ? undefined : fileAnchorDefaults(file);
}

/**
 * Quem diz os padrões do componente de cada marcação do projeto: serve de `options.defaults` do
 * `snapToAnchor`. Marcação sem componente ou de componente sem `anchor` devolve `undefined`.
 */
export function markingAnchorDefaults(
  p: Project,
  catalog: ComponentCatalog,
): (marking: Marking) => AnchorDefaults | undefined {
  return (marking) => {
    const mc = markingComponent(p, catalog, marking.id);
    return mc === null ? undefined : fileAnchorDefaults(mc.component);
  };
}
