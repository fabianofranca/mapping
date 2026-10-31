import {
  addContainer,
  addTypedAnnotation,
  applySpecialization,
  createMarking,
  parseSpec,
  setFieldValue,
  type Project,
  type Spec,
} from '../../src/model';
import { emptyProject } from './fixtures';
import { idGen, layerOf } from './specFixtures';

// Especialização formatVersion 9 de teste (um Material em miniatura) e um projeto com botões
// em cada variante, para os testes de `variants` (codeBlueprint, findByCode, typedDisplay,
// Catálogo e MCP).

export const BUTTON_PATH = 'compose/material3/Button.kt';
export const TEXT_BUTTON_PATH = 'compose/material3/TextButton.kt';

export function variantsSpecJson(formatVersion = 9): Record<string, unknown> {
  return {
    format: 'mapping-spec',
    formatVersion,
    id: 'm3',
    name: 'M3',
    version: 1,
    platforms: [
      {
        id: 'compose',
        name: 'Compose',
        language: 'kotlin',
        repo: {
          url: 'https://github.com/androidx/androidx',
          urlTemplate: 'https://github.com/androidx/androidx/blob/main/{path}',
          ref: 'v1',
        },
      },
    ],
    layers: [
      {
        id: 'ui',
        name: 'UI',
        color: '#1E88E5',
        annotationTypes: [
          {
            id: 'button',
            name: 'Button',
            labelField: 'label',
            fields: [
              { key: 'label', type: 'string' },
              {
                key: 'style',
                type: 'enum',
                options: ['filled', 'outlined', 'text', 'tonal'],
                default: 'filled',
              },
              { key: 'size', type: 'enum', options: ['small', 'large'] },
            ],
            code: {
              compose: {
                symbol: 'androidx.compose.material3.Button',
                path: BUTTON_PATH,
                params: { label: 'text' },
                values: { size: { small: 'Small', large: 'Large' } },
                notes: 'content = { Text(label) }',
                variants: {
                  field: 'style',
                  cases: {
                    outlined: { symbol: 'androidx.compose.material3.OutlinedButton' },
                    text: {
                      symbol: 'androidx.compose.material3.TextButton',
                      path: TEXT_BUTTON_PATH,
                      notes: 'sem fundo',
                    },
                    tonal: {
                      symbol: 'androidx.compose.material3.FilledTonalButton',
                      params: { size: 'sizeHint' },
                      values: { size: { large: 'XL' } },
                    },
                  },
                },
              },
            },
          },
          {
            id: 'card',
            name: 'Card',
            fields: [{ key: 'title', type: 'string' }],
            code: {
              compose: { symbol: 'androidx.compose.material3.Card', path: BUTTON_PATH },
            },
          },
        ],
      },
    ],
  };
}

export function variantsSpec(): Spec {
  const result = parseSpec(variantsSpecJson());
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.spec;
}

/**
 * Botões `BF` (sem valor em `style`: usa o `default` filled), `BO` (outlined), `BT` (text),
 * `BN` (tonal, `size: large`) e um Card `CD`, todos no container `I1`.
 */
export function variantsProject(): Project {
  let p = applySpecialization(emptyProject(), variantsSpec(), { newId: idGen('LV') });
  p = addContainer(p, { id: 'I1', file: 'images/a.png', width: 1000, height: 1000 });
  const layerId = layerOf(p, 'm3', 'ui');
  const add = (
    id: string,
    typeId: string,
    x: number,
    values: Record<string, string>,
  ): void => {
    p = createMarking(p, {
      id: `M${id}`,
      containerId: 'I1',
      rect: { x, y: 0, width: 50, height: 50 },
      name: id,
    });
    p = addTypedAnnotation(p, {
      id,
      markingId: `M${id}`,
      layerId,
      type: { specId: 'm3', typeId },
    });
    for (const [key, value] of Object.entries(values))
      p = setFieldValue(p, id, key, value);
  };
  add('BF', 'button', 0, { label: 'Filled' });
  add('BO', 'button', 100, { label: 'Outlined', style: 'outlined' });
  add('BT', 'button', 200, { label: 'Text', style: 'text' });
  add('BN', 'button', 300, { label: 'Tonal', style: 'tonal', size: 'large' });
  add('CD', 'card', 400, { title: 'Cartão' });
  return p;
}
