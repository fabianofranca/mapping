import {
  LEGACY_SPEC_FORMAT,
  REMOVED_FIELD_TYPE,
  type IgnoredSpecField,
  type Spec,
} from './spec';

// Avisos de uma especialização válida (etapa 4): coisas que não impedem a importação, mas
// costumam ser descuido de quem escreve o arquivo, ou campos lidos e ignorados (etapa 9). Puro:
// usado por `validate_specialization` (MCP), no ciclo "gerar, validar, corrigir" de um agente
// que cria especializações, e pela importação da app (só os campos ignorados).

export type SpecWarningCode =
  /** Plataforma declarada em `platforms` que nenhum tipo usa em `code`. */
  | 'unused-platform'
  /** Tipo sem `code` numa especialização que declara plataformas. */
  | 'type-without-code'
  /** O `format` antigo (`mapeador-spec`), ainda aceito na importação. */
  | 'legacy-format'
  /** Campo de um tipo que saiu do formato (`REMOVED_FIELD_TYPE`): lido e ignorado. */
  | 'ignored-field';

export interface SpecWarning {
  readonly code: SpecWarningCode;
  /** Caminho no mesmo formato dos erros (ex: `layers[0].annotationTypes[2]`). */
  readonly path: string;
  readonly message: string;
}

/** Aviso de cada campo ignorado na leitura (`parseSpec` devolve a lista em `ignored`). */
export function ignoredFieldWarnings(
  ignored: readonly IgnoredSpecField[],
): SpecWarning[] {
  return ignored.map((field) => ({
    code: 'ignored-field',
    path: field.path,
    message: `o campo "${field.key}" do tipo "${field.typeId}" é "${REMOVED_FIELD_TYPE}", que saiu do formato: foi ignorado (os valores dele não são gravados); remova-o do arquivo`,
  }));
}

/**
 * Avisos da especialização (já validada), na ordem do arquivo; `ignored` são os campos
 * ignorados na leitura (`parseSpec`), que vêm logo depois do formato antigo.
 */
export function specWarnings(
  spec: Spec,
  ignored: readonly IgnoredSpecField[] = [],
): SpecWarning[] {
  const warnings: SpecWarning[] = [];
  if (spec.format === LEGACY_SPEC_FORMAT) {
    warnings.push({
      code: 'legacy-format',
      path: 'format',
      message: `"${LEGACY_SPEC_FORMAT}" é o nome antigo do formato; use "mapping-spec"`,
    });
  }

  warnings.push(...ignoredFieldWarnings(ignored));

  const platforms = spec.platforms ?? [];
  const used = new Set<string>();
  spec.layers.forEach((layer, li) => {
    layer.annotationTypes.forEach((type, ti) => {
      for (const platform of Object.keys(type.code ?? {})) used.add(platform);
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
      message: `a plataforma "${platform.id}" é declarada, mas nenhum tipo a usa em \`code\``,
    });
  });
  return warnings;
}
