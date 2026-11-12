import type { ComponentCatalog } from '../../src/model';
import { SPEC_ID, testCatalog } from './componentFixtures';

/**
 * O catálogo de teste com o slot do tipo `typeId` (um container `row`/`column` de `COMPONENTS`)
 * trocado por um slot em grade: `layout` entra no `layout` do slot, com `gap` e `padding` dos campos
 * do container (`spacing`, `padding`). A troca é no componente já carregado, sem passar pelo
 * analisador.
 */
export function gridCatalog(
  typeId: string,
  layout: Record<string, unknown>,
): ComponentCatalog {
  const base = testCatalog();
  const loaded = base.get(SPEC_ID);
  if (loaded === undefined) throw new Error('sem especialização de teste');
  const byType = new Map(loaded.byType);
  const component = byType.get(typeId);
  if (component === undefined || component.template.type !== 'frame')
    throw new Error(`sem componente ${typeId}`);
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
