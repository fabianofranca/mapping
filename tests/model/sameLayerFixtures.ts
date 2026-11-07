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

/**
 * Especialização de teste para vínculo na mesma camada (`formatVersion` 13): `button`
 * (componentes) aceita `onClick`; na camada `eventos`, `onClick` aceita `request`; `request`
 * (papéis `onSuccess` e `onFailure`) aceita a camada inteira, inclusive ele mesmo; `navigate` não
 * aceita filhos.
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

/** A especialização de `sameLayerSpec` já validada. */
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

/** Cria a anotação tipada `typeId` (camada `eventos` ou `componentes`) na `M1`. */
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
