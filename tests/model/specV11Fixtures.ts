import { parseSpec, type Spec } from '../../src/model';

export type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Path of the first type of the first layer (the owners: `button`). */
export const OWNER = 'layers[0].annotationTypes[0]';

/**
 * Test v11 specialization: the `componentes` layer (owners `button`, `image`, `text`) and the
 * `eventos` layer (the `button` accepts the whole layer), with two groups (`navegacao` and `dados`),
 * in order: onClick (navegacao), onHold, navigate (navegacao), track (dados) and both (navegacao
 * and dados).
 * pt-BR kept: shared fixture data (ids and names asserted by tests/mcp, tests/components and tests/model)
 */
export function v11Json(edit?: (spec: Json) => void, formatVersion = 11): Json {
  const spec: Json = {
    format: 'mapping-spec',
    formatVersion,
    id: 's',
    name: 'S',
    version: 1,
    layers: [
      {
        id: 'componentes',
        name: 'Componentes',
        color: '#112233',
        annotationTypes: [
          { id: 'button', name: 'Button', fields: [] },
          { id: 'image', name: 'Image', fields: [] },
          { id: 'text', name: 'Text', fields: [] },
        ],
      },
      {
        id: 'eventos',
        name: 'Eventos',
        color: '#445566',
        annotationTypes: [
          { id: 'onClick', name: 'onClick', fields: [], groups: ['navegacao'] },
          { id: 'onHold', name: 'onHold', fields: [] },
          { id: 'navigate', name: 'navigate', groups: ['navegacao'], fields: [] },
          { id: 'track', name: 'track', fields: [], groups: ['dados'] },
          { id: 'both', name: 'both', fields: [], groups: ['dados', 'navegacao'] },
        ],
      },
    ],
  };
  if (formatVersion >= 11) {
    // pt-BR kept: shared fixture data (group names asserted by tests/mcp), outside this phase
    spec.layers[1].groups = [
      { id: 'navegacao', name: 'Navegação' },
      { id: 'dados', name: 'Dados', description: 'Eventos de dados' },
    ];
    spec.layers[0].annotationTypes[0].allowedChildren = [{ layer: 'eventos' }];
  } else {
    spec.layers[0].annotationTypes[0].allowedChildren = ['onClick', 'navigate'];
    for (const type of spec.layers[1].annotationTypes) delete type.groups;
  }
  edit?.(spec);
  return spec;
}

export function issuesOf(input: unknown): { path: string; message: string }[] {
  const result = parseSpec(input);
  return result.ok ? [] : result.issues.map(({ path, message }) => ({ path, message }));
}

/** The already validated JSON, as `Spec`. */
export function parsedV11(edit?: (spec: Json) => void): Spec {
  const result = parseSpec(v11Json(edit));
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.spec;
}
