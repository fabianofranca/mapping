import {
  LEGACY_SPEC_FORMAT,
  REMOVED_FIELD_TYPE,
  type IgnoredSpecField,
  type Spec,
  type SpecCode,
} from './spec';
import { templateMessage, type ModelMessageTemplateCode } from './messages';

// Avisos de uma especialização válida (etapa 4): coisas que não impedem a importação, mas
// costumam ser descuido de quem escreve o arquivo, ou campos lidos e ignorados (etapa 9). Puro:
// usado por `validate_specialization` (MCP), no ciclo "gerar, validar, corrigir" de um agente
// que cria especializações, e pela importação da app (só os campos ignorados).

export type SpecWarningCode =
  /** Plataforma declarada em `platforms` que nenhum tipo usa em `code`. */
  | 'unused-platform'
  /** Tipo sem `code` numa especialização que declara plataformas. */
  | 'type-without-code'
  /**
   * Plataforma declarada sem `repo` em que algum tipo tem `code.<plataforma>.path`: o agente
   * não sabe em que repositório estão esses arquivos (qualquer `formatVersion`; a v5 declara).
   */
  | 'path-without-repo'
  /** O `format` antigo (`mapeador-spec`), ainda aceito na importação. */
  | 'legacy-format'
  /** Campo de um tipo que saiu do formato (`REMOVED_FIELD_TYPE`): lido e ignorado. */
  | 'ignored-field'
  /** `allowedChildren` com muitos ids em texto: uma cláusula `{ layer, groups }` cobre o mesmo. */
  | 'many-children-ids'
  /** Grupo de `layers[].groups` que nenhum tipo da camada usa. */
  | 'unused-group'
  /** Repositório de `docRepos` que nenhum `doc` usa. */
  | 'unused-doc-repo';

export interface SpecWarning {
  readonly code: SpecWarningCode;
  /** Caminho no mesmo formato dos erros (ex: `layers[0].annotationTypes[2]`). */
  readonly path: string;
  readonly message: string;
  /** Código da mensagem no catálogo `versions` (a interface a traduz); `message` segue em pt-BR. */
  readonly messageCode: ModelMessageTemplateCode;
  /** Os `{parâmetros}` do `messageCode`. */
  readonly messageParams: Readonly<Record<string, string | number>>;
}

/** O aviso com a mensagem do catálogo (`message` é o texto pt-BR de sempre). */
function warning(
  code: SpecWarningCode,
  path: string,
  messageCode: ModelMessageTemplateCode,
  params: Readonly<Record<string, string | number>>,
): SpecWarning {
  return {
    code,
    path,
    message: templateMessage(messageCode, params).text,
    messageCode,
    messageParams: params,
  };
}

/** Aviso de cada campo ignorado na leitura (`parseSpec` devolve a lista em `ignored`). */
export function ignoredFieldWarnings(
  ignored: readonly IgnoredSpecField[],
): SpecWarning[] {
  return ignored.map((field) =>
    warning('ignored-field', field.path, 'versions.ignoredField', {
      key: field.key,
      typeId: field.typeId,
      removed: REMOVED_FIELD_TYPE,
    }),
  );
}

/** Quantos ids em texto no `allowedChildren` de um tipo bastam para sugerir uma cláusula. */
const MANY_CHILD_IDS = 20;

/** `many-children-ids`: tipos com 20 ids ou mais em texto no `allowedChildren`. */
function manyChildIdsWarnings(spec: Spec): SpecWarning[] {
  const warnings: SpecWarning[] = [];
  spec.layers.forEach((layer, li) => {
    layer.annotationTypes.forEach((type, ti) => {
      const ids = (type.allowedChildren ?? []).filter((c) => typeof c === 'string');
      if (ids.length < MANY_CHILD_IDS) return;
      warnings.push(
        warning(
          'many-children-ids',
          `layers[${li}].annotationTypes[${ti}].allowedChildren`,
          'versions.manyChildrenIds',
          { count: ids.length },
        ),
      );
    });
  });
  return warnings;
}

/** `unused-group`: grupos declarados numa camada que nenhum tipo dela usa. */
function unusedGroupWarnings(spec: Spec): SpecWarning[] {
  const warnings: SpecWarning[] = [];
  spec.layers.forEach((layer, li) => {
    const used = new Set(layer.annotationTypes.flatMap((type) => type.groups ?? []));
    (layer.groups ?? []).forEach((group, gi) => {
      if (used.has(group.id)) return;
      warnings.push(
        warning('unused-group', `layers[${li}].groups[${gi}]`, 'versions.unusedGroup', {
          group: group.id,
          layer: layer.id,
        }),
      );
    });
  });
  return warnings;
}

/** `unused-doc-repo`: repositórios de `docRepos` que nenhum `doc` objeto cita. */
function unusedDocRepoWarnings(spec: Spec): SpecWarning[] {
  const used = new Set<string>();
  for (const layer of spec.layers) {
    for (const type of layer.annotationTypes) {
      if (typeof type.doc === 'object') used.add(type.doc.repo);
    }
  }
  const warnings: SpecWarning[] = [];
  (spec.docRepos ?? []).forEach((repo, i) => {
    if (used.has(repo.id)) return;
    warnings.push(
      warning('unused-doc-repo', `docRepos[${i}]`, 'versions.unusedDocRepo', {
        repo: repo.id,
      }),
    );
  });
  return warnings;
}

/** Quantos `path` a entrada de `code` declara: o dela e o de cada caso de `variants`. */
function codePathCount(entry: SpecCode): number {
  const cases = Object.values(entry.variants?.cases ?? {});
  return (
    (entry.path !== undefined ? 1 : 0) + cases.filter((c) => c.path !== undefined).length
  );
}

/**
 * Avisos da especialização (já validada), na ordem do arquivo (os de tipo, depois
 * `unused-platform` e `path-without-repo`, por plataforma, e por fim os da v11:
 * `many-children-ids`, `unused-group` e `unused-doc-repo`); `ignored` são os campos
 * ignorados na leitura (`parseSpec`), que vêm logo depois do formato antigo.
 */
export function specWarnings(
  spec: Spec,
  ignored: readonly IgnoredSpecField[] = [],
): SpecWarning[] {
  const warnings: SpecWarning[] = [];
  if (spec.format === LEGACY_SPEC_FORMAT) {
    warnings.push(
      warning('legacy-format', 'format', 'versions.legacyFormat', {
        legacy: LEGACY_SPEC_FORMAT,
      }),
    );
  }

  warnings.push(...ignoredFieldWarnings(ignored));

  const platforms = spec.platforms ?? [];
  const used = new Set<string>();
  /** id da plataforma → quantos tipos têm `code.<plataforma>.path`. */
  const withPath = new Map<string, number>();
  spec.layers.forEach((layer, li) => {
    layer.annotationTypes.forEach((type, ti) => {
      for (const [platform, entry] of Object.entries(type.code ?? {})) {
        used.add(platform);
        const paths = codePathCount(entry);
        if (paths > 0) withPath.set(platform, (withPath.get(platform) ?? 0) + paths);
      }
      if (platforms.length > 0 && Object.keys(type.code ?? {}).length === 0) {
        warnings.push(
          warning(
            'type-without-code',
            `layers[${li}].annotationTypes[${ti}]`,
            'versions.typeWithoutCode',
            { typeId: type.id },
          ),
        );
      }
    });
  });
  platforms.forEach((platform, i) => {
    if (used.has(platform.id)) return;
    warnings.push(
      warning('unused-platform', `platforms[${i}]`, 'versions.unusedPlatform', {
        id: platform.id,
      }),
    );
  });
  platforms.forEach((platform, i) => {
    const count = withPath.get(platform.id) ?? 0;
    if (platform.repo !== undefined || count === 0) return;
    warnings.push(
      warning('path-without-repo', `platforms[${i}]`, 'versions.pathWithoutRepo', {
        id: platform.id,
        count,
      }),
    );
  });
  warnings.push(
    ...manyChildIdsWarnings(spec),
    ...unusedGroupWarnings(spec),
    ...unusedDocRepoWarnings(spec),
  );
  return warnings;
}
