import type { AnchorDefaultsUnits } from './anchorPlacement';
import { markingComponent, type ComponentCatalog } from './componentCatalog';
import { fileAnchorDefaults } from './components/anchor';
import type { Marking, Project } from './types';

// The snap defaults declared by the component (`anchor` at the file root), in the format that
// `snapToAnchor` and the new anchored instance read (`options.defaults`/`anchorDefaults`): the
// `offset` is in component UNITS (whoever uses it multiplies by the density).

/** The defaults of the `specId/typeId` type (for the instance that does not exist yet). */
export function typeAnchorDefaults(
  catalog: ComponentCatalog,
  specId: string,
  typeId: string,
): AnchorDefaultsUnits | undefined {
  const file = catalog.get(specId)?.byType.get(typeId);
  return file === undefined ? undefined : fileAnchorDefaults(file);
}

/**
 * Gives the component defaults of each marking in the project: serves as the `options.defaults` of
 * `snapToAnchor`. A marking with no component, or whose component has no `anchor`, yields `undefined`.

 */
export function markingAnchorDefaults(
  p: Project,
  catalog: ComponentCatalog,
): (marking: Marking) => AnchorDefaultsUnits | undefined {
  return (marking) => {
    const mc = markingComponent(p, catalog, marking.id);
    return mc === null ? undefined : fileAnchorDefaults(mc.component);
  };
}
