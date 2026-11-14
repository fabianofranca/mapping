// Test signatures (decision 4 of stage #1079).
export type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The signature of the example of decision 4. */
export function buttonSignature(edit?: (s: Json) => void): Json {
  const s: Json = {
    format: 'mapping-signature',
    formatVersion: 1,
    source: {
      kind: 'code',
      platform: 'compose',
      language: 'kotlin',
      symbol: 'androidx.compose.material3.Button',
      path: 'compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Button.kt',
      ref: '5113b82a4ed6416d6344efa50e41db8cb65928ff',
      extractor: 'mapping-signature/kotlin@1',
    },
    params: [
      { name: 'onClick', role: 'callback', type: '() -> Unit', required: true },
      { name: 'modifier', role: 'modifier', type: 'Modifier', default: 'Modifier' },
      {
        name: 'enabled',
        role: 'value',
        type: 'Boolean',
        default: 'true',
        value: { kind: 'boolean', default: true },
      },
      {
        name: 'shape',
        role: 'value',
        type: 'Shape',
        default: 'ButtonDefaults.shape',
        value: { kind: 'opaque' },
      },
      {
        name: 'colors',
        role: 'value',
        type: 'ButtonColors',
        default: 'ButtonDefaults.buttonColors()',
        factory: {
          call: 'androidx.compose.material3.ButtonDefaults.buttonColors',
          params: [
            {
              name: 'containerColor',
              role: 'value',
              type: 'Color',
              default: 'Color.Unspecified',
              value: { kind: 'color' },
            },
          ],
        },
      },
      {
        name: 'content',
        role: 'slot',
        type: '@Composable RowScope.() -> Unit',
        required: true,
      },
    ],
    doc: { shape: "defines the shape of this button's container…" },
  };
  edit?.(s);
  return s;
}
