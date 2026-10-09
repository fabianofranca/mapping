import { readFile, stat } from 'node:fs/promises';
import { parseSpecText, specWarnings, type Spec } from '../src/model';
import { ToolError } from './errors';
import type { Roots } from './paths';

// `validate_specialization` (etapa 4.2): o ciclo "gerar, validar, corrigir" de um agente que
// cria especializações. Usa a mesma validação da importação da app (`parseSpecText`, em
// `src/model/spec.ts`), então os erros são os mesmos, com o caminho exato; os avisos
// (`specWarnings`) são só do servidor e não impedem nada. Não aplica a nenhum projeto.

type Json = Record<string, unknown>;

/** Arquivo de especialização maior que isto é recusado. */
const MAX_SPEC_BYTES = 16 * 1024 * 1024;
/** Erros devolvidos de uma vez; a importação da app também mostra só os primeiros. */
const MAX_ERRORS = 100;

async function readSpecFile(roots: Roots, path: string): Promise<string> {
  const { real } = await roots.resolveExisting(path);
  const info = await stat(real);
  if (!info.isFile()) {
    throw new ToolError('not-a-file', `não é um arquivo: ${path}`, { path });
  }
  if (info.size > MAX_SPEC_BYTES) {
    throw new ToolError('file-too-large', `arquivo grande demais: ${path}`, { path });
  }
  return readFile(real, 'utf8');
}

function summary(spec: Spec): Json {
  const types = spec.layers.flatMap((layer) => layer.annotationTypes);
  const fieldsWithSources = types.reduce(
    (sum, type) => sum + type.fields.filter((f) => (f.sources ?? []).length > 0).length,
    0,
  );
  return {
    id: spec.id,
    name: spec.name,
    version: spec.version,
    formatVersion: spec.formatVersion,
    platforms: (spec.platforms ?? []).map((p) => p.id),
    layers: spec.layers.length,
    types: types.length,
    typesWithSources: types.filter((t) => (t.sources ?? []).length > 0).length,
    fieldsWithSources,
  };
}

export async function validateSpecialization(
  roots: Roots,
  args: { path?: string | undefined; text?: string | undefined },
): Promise<Json> {
  if ((args.path === undefined) === (args.text === undefined)) {
    throw new ToolError(
      'invalid-arguments',
      'informe exatamente um de `path` (arquivo dentro das raízes) ou `text` (o JSON)',
    );
  }
  const text =
    args.path !== undefined ? await readSpecFile(roots, args.path) : args.text!;
  const parsed = parseSpecText(text);
  const origin = args.path !== undefined ? { path: args.path } : {};
  if (!parsed.ok) {
    return {
      valid: false,
      ...origin,
      errorCount: parsed.errors.length,
      errors: parsed.errors.slice(0, MAX_ERRORS),
      issues: parsed.issues.slice(0, MAX_ERRORS),
      ...(parsed.errors.length > MAX_ERRORS
        ? { moreErrors: parsed.errors.length - MAX_ERRORS }
        : {}),
      hint: 'corrija os erros (o caminho de cada um aponta o trecho do JSON) e valide de novo; o arquivo não foi aplicado a nenhum projeto',
    };
  }
  const warnings = specWarnings(parsed.spec);
  return {
    valid: true,
    ...origin,
    spec: summary(parsed.spec),
    errors: [],
    warnings,
    hint:
      warnings.length > 0
        ? 'a especialização é válida; os avisos não impedem a importação, mas costumam apontar descuidos'
        : 'a especialização é válida e pode ser aplicada (apply_specialization em propose_changes)',
  };
}
