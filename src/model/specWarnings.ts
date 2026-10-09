import { LEGACY_SPEC_FORMAT, type Spec } from './spec';

// Avisos de uma especialização válida (etapa 4): coisas que não impedem a importação, mas
// costumam ser descuido de quem escreve o arquivo. Puro: usado por `validate_specialization`
// (MCP), no ciclo "gerar, validar, corrigir" de um agente que cria especializações.

export type SpecWarningCode =
  /** Plataforma declarada em `platforms` que nenhum tipo (`code`) nem campo `codeRef` usa. */
  | 'unused-platform'
  /** Tipo sem `code` numa especialização que declara plataformas. */
  | 'type-without-code'
  /** O `format` antigo (`mapeador-spec`), ainda aceito na importação. */
  | 'legacy-format';

export interface SpecWarning {
  readonly code: SpecWarningCode;
  /** Caminho no mesmo formato dos erros (ex: `layers[0].annotationTypes[2]`). */
  readonly path: string;
  readonly message: string;
}

/** Avisos da especialização (já validada), na ordem do arquivo. */
export function specWarnings(spec: Spec): SpecWarning[] {
  const warnings: SpecWarning[] = [];
  if (spec.format === LEGACY_SPEC_FORMAT) {
    warnings.push({
      code: 'legacy-format',
      path: 'format',
      message: `"${LEGACY_SPEC_FORMAT}" é o nome antigo do formato; use "mapping-spec"`,
    });
  }

  const platforms = spec.platforms ?? [];
  const used = new Set<string>();
  spec.layers.forEach((layer, li) => {
    layer.annotationTypes.forEach((type, ti) => {
      for (const platform of Object.keys(type.code ?? {})) used.add(platform);
      for (const field of type.fields) {
        if (field.type !== 'codeRef') continue;
        for (const platform of field.platforms ?? []) used.add(platform);
      }
      if (platforms.length > 0 && Object.keys(type.code ?? {}).length === 0) {
        warnings.push({
          code: 'type-without-code',
          path: `layers[${li}].annotationTypes[${ti}]`,
          message: `o tipo "${type.id}" não tem \`code\`: nenhuma plataforma saberá implementá-lo`,
        });
      }
    });
  });
  platforms.forEach((platform, i) => {
    if (used.has(platform.id)) return;
    warnings.push({
      code: 'unused-platform',
      path: `platforms[${i}]`,
      message: `a plataforma "${platform.id}" é declarada, mas nenhum tipo a usa em \`code\` nem em campo codeRef`,
    });
  });
  return warnings;
}
