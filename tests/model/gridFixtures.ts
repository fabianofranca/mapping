import type { ComponentCatalog } from '../../src/model';
import { SPEC_ID, testCatalog } from './componentFixtures';

/**
 * The test catalog with the slot of type `typeId` (a `row`/`column` container of `COMPONENTS`)
 * replaced by a grid slot: `layout` goes into the slot's `layout`, with `gap` and `padding` from the
 * container fields (`spacing`, `padding`). The swap is made on the already loaded component, without
 * going through the parser.
 */
export function gridCatalog(
  typeId: string,
  layout: Record<string, unknown>,
): ComponentCatalog {
  const base = testCatalog();
  const loaded = base.get(SPEC_ID);
  if (loaded === undefined) throw new Error('no test specialization');
  const byType = new Map(loaded.byType);
  const component = byType.get(typeId);
  if (component === undefined || component.template.type !== 'frame')
    throw new Error(`no component ${typeId}`);
  const children = (component.template.children ?? []).map((child) =>
    child.type === 'slot'
      ? {
          ...child,
          layout: {
            type: 'grid',
            gap: { $field: 'spacing', default: 8 },
            padding: { $field: 'padding', default: 0 },
            ...layout,
          },
        }
      : child,
  );
  byType.set(typeId, {
    ...component,
    template: { ...component.template, children } as typeof component.template,
  });
  return new Map([[SPEC_ID, { ...loaded, byType }]]);
}
