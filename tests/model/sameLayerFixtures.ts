import {
  addContainer,
  addTypedAnnotation,
  applySpecialization,
  createMarking,
  parseSpec,
  type Project,
} from '../../src/model';
import { emptyProject } from './fixtures';
import { idGen, layerOf } from './specFixtures';

export type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// pt-BR kept: shared fixture data (layer ids/names, role names) asserted by tests/components and other model tests
/**
 * Test specialization for a same-layer link (`formatVersion` 13): `button`
 * (components) accepts `onClick`; in the `eventos` layer, `onClick` accepts `request`; `request`
 * (roles `onSuccess` and `onFailure`) accepts the whole layer, itself included; `navigate` does not
 * accept children.
 */
export function sameLayerSpec(formatVersion = 13, edit?: (s: Json) => void): Json {
  const spec: Json = {
    format: 'mapping-spec',
    formatVersion,
    id: 's',
    name: 'S',
    version: 1,
    platforms: [{ id: 'web', name: 'Web' }],
    layers: [
      {
        id: 'componentes',
        name: 'Componentes',
        color: '#112233',
        annotationTypes: [
          {
            id: 'button',
            name: 'Button',
            fields: [],
            allowedChildren: ['onClick'],
            code: { web: { symbol: 'Button', path: 'ui/Button.ts' } },
          },
        ],
      },
      {
        id: 'eventos',
        name: 'Eventos',
        color: '#445566',
        annotationTypes: [
          {
            id: 'onClick',
            name: 'onClick',
            fields: [],
            allowedChildren: ['request'],
            code: { web: { symbol: 'onClick', path: 'ui/events.ts' } },
          },
          {
            id: 'request',
            name: 'Request',
            fields: [],
            allowedChildren: [{ layer: 'eventos' }],
            childRoles: [
              { id: 'onSuccess', name: 'Sucesso' },
              { id: 'onFailure', name: 'Falha' },
            ],
            code: { web: { symbol: 'request', path: 'ui/http.ts' } },
          },
          {
            id: 'navigate',
            name: 'navigate',
            fields: [],
            code: { web: { symbol: 'navigate', path: 'ui/nav.ts' } },
          },
        ],
      },
    ],
  };
  edit?.(spec);
  return spec;
}

/** The `sameLayerSpec` specialization, already validated. */
export function sameLayerProject(formatVersion = 13, edit?: (s: Json) => void): Project {
  const parsed = parseSpec(sameLayerSpec(formatVersion, edit));
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  let p = applySpecialization(emptyProject(), parsed.spec, { newId: idGen('SL') });
  p = addContainer(p, { id: 'I1', file: 'a.png', width: 100, height: 100 });
  p = createMarking(p, {
    id: 'M1',
    containerId: 'I1',
    rect: { x: 0, y: 0, width: 50, height: 50 },
    name: 'M',
  });
  return p;
}

/** Creates the typed annotation `typeId` (layer `eventos` or `componentes`) on `M1`. */
export function add(
  p: Project,
  id: string,
  typeId: string,
  owner: string | null = null,
  role: string | null = null,
): Project {
  const layer = typeId === 'button' ? 'componentes' : 'eventos';
  return addTypedAnnotation(p, {
    id,
    markingId: 'M1',
    layerId: layerOf(p, 's', layer),
    type: { specId: 's', typeId },
    parentAnnotationId: owner,
    parentRole: role,
  });
}
