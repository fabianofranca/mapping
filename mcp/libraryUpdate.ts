import {
  checkSpecApply,
  fail,
  getSpecialization,
  packageDirOf,
  packageSpecNameOf,
  specWarnings,
  specializationUpdateImpact,
  type JsonValue,
  type MigrationLoss,
  type MigrationLossReason,
  type Project,
  type Spec,
  type SpecChange,
  type SpecUpdateImpact,
} from '../src/model';
import {
  validateLibrary,
  type LibraryIssue,
  type LibraryReport,
} from '../src/model/library';
import { ToolError } from './errors';
import { Refs } from './items';
import {
  MAX_ISSUES,
  issueView,
  readSpecInput,
  type ReadPackage,
  type SpecInput,
} from './library';
import { MODEL_ERROR_MESSAGES } from './modelErrors';
import type { Roots } from './paths';
import { findProject, loadProject } from './projects';

// Atualização de biblioteca pelo servidor (etapa Biblioteca, B4): o que `apply_specialization` e
// `update_specialization` precisam para levar um pacote v4 numa proposta (validar, conferir o
// contrato de versão, descrever a migração) e a tool `plan_library_update`, a prévia somente de
// leitura do impacto de subir a versão. O servidor nunca grava `specs/` nem o `mapping.json`:
// os arquivos do pacote esperam em `proposals/<id>/specs/<pasta>/…` até a pessoa aceitar.

type Json = Record<string, unknown>;

/** Listas de uma resposta de `plan_library_update` (perdas, pendências, mudanças…). */
const MAX_LIST = 100;
/** Perdas listadas dentro de cada passo (o total fica em `lossCount`). */
const MAX_STEP_LOSSES = 10;
/** Erros de validação citados na mensagem de `invalid-library`. */
const MAX_ERRORS_IN_ERROR = 10;
/** Valor perdido maior que isto vai só como prévia. */
const MAX_VALUE_PREVIEW = 200;

const plural = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------------------
// Validação do pacote lido

/** O pacote com a especialização lida (nível 1) e o nome do arquivo dela na raiz da pasta. */
export interface ParsedPackage {
  readonly spec: Spec;
  /** Nome do arquivo da especialização dentro do pacote (`material3.spec.json`). */
  readonly specName: string;
}

/** Erro de biblioteca inválida: os primeiros erros do validador, cada um com `file` e `path`. */
function invalidLibrary(report: LibraryReport): ToolError {
  const errors = report.errors.map(issueView);
  const first = report.errors[0];
  return new ToolError(
    'invalid-library',
    `a biblioteca tem ${plural(report.errors.length, 'erro', 'erros')} e não pode ser usada${
      first ? `: ${first.file === '' ? '' : `${first.file} `}${first.message}` : ''
    }`,
    {
      errors: errors.slice(0, MAX_ERRORS_IN_ERROR),
      ...(errors.length > MAX_ERRORS_IN_ERROR
        ? { moreErrors: errors.length - MAX_ERRORS_IN_ERROR }
        : {}),
      hint: 'rode validate_library na pasta (com `previous` numa atualização), corrija cada erro pelo `file` e `path` e proponha de novo',
    },
  );
}

/** Texto dos arquivos do pacote por caminho (para achar o arquivo da especialização). */
function textsOf(pkg: ReadPackage): Map<string, string> {
  const texts = new Map<string, string>();
  for (const file of pkg.files) {
    if (file.text !== undefined) texts.set(file.path, file.text);
  }
  return texts;
}

/**
 * Nível 1 do validador: lê a especialização do pacote (sem ela, não há como seguir). O resto
 * dos erros fica para `validatePackage`, depois de saber qual é a versão anterior.
 */
export function parsePackage(pkg: ReadPackage): ParsedPackage {
  const report = validateLibrary({
    files: pkg.files,
    ...(pkg.specPath === undefined ? {} : { specPath: pkg.specPath }),
    level: 1,
  });
  if (report.spec === undefined) throw invalidLibrary(report);
  return {
    spec: report.spec,
    specName: pkg.specPath ?? packageSpecNameOf(textsOf(pkg), report.spec.id),
  };
}

/** Os três níveis do validador, com `previous` (a cópia aplicada) ligando o contrato de versão. */
export function validatePackage(pkg: ReadPackage, previous?: Spec): LibraryReport {
  return validateLibrary({
    files: pkg.files,
    ...(pkg.specPath === undefined ? {} : { specPath: pkg.specPath }),
    ...(previous === undefined ? {} : { previous }),
  });
}

/** Erro do validador impede usar; aviso deixa usar e é devolvido. */
export function requireValid(report: LibraryReport): readonly LibraryIssue[] {
  if (!report.ok) throw invalidLibrary(report);
  return report.warnings;
}

// ---------------------------------------------------------------------------
// Atualização: o contrato antes de propor

/**
 * Confere o que `updateSpecialization` exigiria e devolve o impacto: a especialização precisa
 * estar aplicada, a versão precisa crescer, e uma quebra sem migração (v4 com a cópia aplicada
 * disponível) é recusada com a lista do que falta.
 */
export function checkUpdate(p: Project, spec: Spec): SpecUpdateImpact {
  const applied = getSpecialization(p, spec.id);
  if (!applied) {
    throw new ToolError(
      'not-found',
      `especialização não aplicada: ${spec.id} (use apply_specialization)`,
      { specId: spec.id },
    );
  }
  if (spec.version <= applied.version) fail('spec-not-newer', spec.id);
  const impact = specializationUpdateImpact(p, spec);
  if (impact.refused) {
    throw new ToolError(
      'spec-missing-migrations',
      MODEL_ERROR_MESSAGES['spec-missing-migrations'],
      {
        specId: spec.id,
        from: applied.version,
        to: spec.version,
        missingMigrations: missingView(impact.missingMigrations),
        hint: `declare em \`migrations\` uma entrada from ${applied.version} (até to ${spec.version}) com um passo para cada quebra listada, valide com validate_library (previous = a cópia aplicada) e confira com plan_library_update`,
      },
    );
  }
  return impact;
}

function missingView(changes: readonly SpecChange[]): Json[] {
  return changes.slice(0, MAX_LIST).map((c) => ({ message: c.message, path: c.path }));
}

/** O que a migração faz no projeto, em uma frase curta para a descrição da operação. */
export function updateSummary(impact: SpecUpdateImpact): string[] {
  const parts: string[] = [];
  if (impact.addedLayers.length > 0) {
    parts.push(
      `camadas novas: ${impact.addedLayers.map((l) => `"${l.name}"`).join(', ')}`,
    );
  }
  if (impact.freedLayers.length > 0) {
    parts.push(
      `camadas que viram livres: ${impact.freedLayers.map((l) => `"${l.name}"`).join(', ')}`,
    );
  }
  if (impact.steps.length > 0) {
    const values = impact.steps.reduce((n, s) => n + s.values, 0);
    const refs = impact.steps.reduce((n, s) => n + s.refs, 0);
    const migration = [`migração em ${plural(impact.steps.length, 'passo', 'passos')}`];
    if (values > 0) {
      migration.push(plural(values, 'valor alterado', 'valores alterados'));
    }
    if (impact.converted > 0) {
      migration.push(
        plural(
          impact.converted,
          'anotação convertida em livre',
          'anotações convertidas em livres',
        ),
      );
    }
    if (impact.deleted > 0) {
      migration.push(plural(impact.deleted, 'anotação apagada', 'anotações apagadas'));
    }
    if (refs > 0) {
      migration.push(plural(refs, 'referência reescrita', 'referências reescritas'));
    }
    parts.push(migration.join(', '));
  }
  const lost = valueLosses(impact.losses);
  if (lost > 0) parts.push(plural(lost, 'valor perdido', 'valores perdidos'));
  if (impact.pending.length > 0) {
    parts.push(plural(impact.pending.length, 'pendência nova', 'pendências novas'));
  }
  if (impact.brokenRefs > 0) {
    parts.push(plural(impact.brokenRefs, 'referência quebrada', 'referências quebradas'));
  }
  return parts;
}

/** Perdas de valor (a anotação apagada por `remove-type` já conta em `deleted`). */
function valueLosses(losses: readonly MigrationLoss[]): number {
  return losses.filter((l) => l.reason !== 'removed-type').length;
}

// ---------------------------------------------------------------------------
// Arquivos do pacote que acompanham a proposta

/**
 * Os arquivos da pasta com o caminho definitivo no projeto (`specs/<pasta>/<relativo>`), que
 * é o que a proposta guarda em `proposals/<id>/…`. O arquivo da especialização segue o nome do
 * `file` do projeto (o modelo limpa o nome para arquivo).
 */
export function packageFileEntries(
  pkg: ReadPackage,
  specName: string,
  entryFile: string,
): [string, Uint8Array][] {
  const dir = packageDirOf(entryFile);
  if (dir === null) {
    throw new Error(`o file da especialização não é de um pacote: ${entryFile}`);
  }
  const target = entryFile.slice(dir.length + 1);
  const entries: [string, Uint8Array][] = [];
  for (const [path, bytes] of pkg.bytes ?? []) {
    entries.push([`${dir}/${path === specName ? target : path}`, bytes]);
  }
  return entries;
}

// ---------------------------------------------------------------------------
// plan_library_update

const LOSS_TEXT: Record<MigrationLossReason, (field: string) => string> = {
  'removed-field': (field) => `o valor do campo "${field}" é apagado`,
  'removed-type': () => 'a anotação é apagada junto com o tipo removido',
  'replaced-value': (field) =>
    `o valor de "${field}" não vale mais no tipo do campo e é trocado pelo padrão`,
  'overwritten-value': (field) => `o campo "${field}" já tinha valor e é sobrescrito`,
};

function previewValue(value: JsonValue): JsonValue {
  const text = JSON.stringify(value);
  return text.length <= MAX_VALUE_PREVIEW
    ? value
    : `${text.slice(0, MAX_VALUE_PREVIEW)}…`;
}

function lossView(refs: Refs, loss: MigrationLoss): Json {
  const field = loss.field ?? '';
  return {
    reason: loss.reason,
    message: LOSS_TEXT[loss.reason](field),
    annotation: refs.ref('a', loss.annotationId),
    marking: refs.bare('m', loss.markingId),
    markingLabel: refs.label('m', loss.markingId),
    ...(loss.typeId === '' ? {} : { typeId: loss.typeId }),
    ...(loss.field === undefined ? {} : { field: loss.field }),
    ...(loss.rowId === undefined ? {} : { rowId: loss.rowId }),
    ...(loss.value === undefined ? {} : { value: previewValue(loss.value) }),
  };
}

function limited<T>(list: readonly T[]): T[] {
  return list.slice(0, MAX_LIST);
}

function changeView(change: SpecChange): Json {
  return {
    code: change.code,
    kind: change.kind,
    path: change.path,
    message: change.message,
  };
}

/** Os passos com as contagens e as perdas de cada um. */
function stepViews(refs: Refs, impact: SpecUpdateImpact): Json[] {
  return impact.steps.slice(0, MAX_LIST).map((s) => ({
    from: s.from,
    to: s.to,
    index: s.index,
    step: s.step,
    annotations: s.annotations,
    values: s.values,
    converted: s.converted,
    deleted: s.deleted,
    refs: s.refs,
    lossCount: s.losses.length,
    losses: s.losses.slice(0, MAX_STEP_LOSSES).map((l) => lossView(refs, l)),
  }));
}

function updateView(refs: Refs, impact: SpecUpdateImpact): Json {
  return {
    additive: impact.additive,
    refused: impact.refused,
    comparable: impact.comparable,
    missingMigrations: missingView(impact.missingMigrations),
    missingMigrationsTotal: impact.missingMigrations.length,
    changes: limited(impact.changes).map(changeView),
    changesTotal: impact.changes.length,
    steps: stepViews(refs, impact),
    stepsTotal: impact.steps.length,
    converted: impact.converted,
    deleted: impact.deleted,
    losses: limited(impact.losses).map((l) => lossView(refs, l)),
    lossesTotal: impact.losses.length,
    pending: limited(impact.pending).map(({ annotationId, issue }) => ({
      annotation: refs.ref('a', annotationId),
      label: refs.label('a', annotationId),
      code: issue.code,
      ...(issue.key === undefined ? {} : { field: issue.key }),
      ...(issue.rowId === undefined ? {} : { rowId: issue.rowId }),
      ...(issue.column === undefined ? {} : { column: issue.column }),
    })),
    pendingTotal: impact.pending.length,
    brokenRefs: impact.brokenRefs,
    addedLayers: impact.addedLayers.map((l) => ({ id: l.id, name: l.name })),
    freedLayers: impact.freedLayers.map((l) => ({ id: l.spec?.layerId, name: l.name })),
  };
}

function issuesView(issues: readonly LibraryIssue[]): {
  items: Json[];
  more: number;
} {
  const views = issues.map(issueView);
  return {
    items: views.slice(0, MAX_ISSUES),
    more: Math.max(0, views.length - MAX_ISSUES),
  };
}

/** O que a pessoa e o agente fazem em seguida, conforme o impacto. */
function updateHint(impact: SpecUpdateImpact, valid: boolean): string {
  const steps: string[] = [];
  if (!valid) {
    steps.push(
      'corrija os erros da validação (`file` e `path` apontam o trecho) antes de propor',
    );
  }
  if (!impact.comparable) {
    steps.push(
      'a cópia aplicada da especialização não está disponível: não dá para comparar as versões nem conferir as quebras; o impacto abaixo só traz as migrações declaradas',
    );
  }
  if (impact.refused) {
    steps.push(
      `declare \`migrations\` para cada quebra em \`missingMigrations\` (um passo rename-*, remove-*, map-values ou fill-field por quebra) e rode plan_library_update de novo; update_specialization é recusado enquanto faltar`,
    );
  } else if (impact.additive) {
    steps.push(
      'mudança aditiva: proponha update_specialization com `file` desta pasta (propose_changes); a pessoa aplica sem diálogo de impacto',
    );
  } else {
    steps.push(
      'as migrações declaradas cobrem as quebras: proponha update_specialization com `file` desta pasta (propose_changes) e descreva o que muda na proposta',
    );
  }
  const lost = valueLosses(impact.losses) > 0 || impact.deleted > 0;
  if (!impact.refused && lost) {
    steps.push(
      'a migração perde dados (`losses`): confirme com a pessoa antes de propor e diga na proposta o que se perde',
    );
  }
  if (!impact.refused && impact.pending.length > 0) {
    steps.push(
      'ficam pendências novas (`pending`): a pessoa as resolve na lista depois de aplicar',
    );
  }
  return steps.join('; ');
}

/**
 * `plan_library_update`: a prévia, somente leitura, de levar o pacote de `path` ao projeto
 * (aplicar, atualizar ou nada). Não grava nada, nem proposta.
 */
export async function planLibraryUpdate(
  roots: Roots,
  args: { project: string; path: string },
): Promise<Json> {
  const location = await findProject(roots, args.project);
  const loaded = await loadProject(roots, location);
  const p = loaded.project;
  const refs = new Refs(loaded);
  const input: SpecInput = await readSpecInput(roots, args.path);
  const base = { project: { name: location.name, path: location.path }, path: args.path };

  let spec: Spec;
  if (input.kind === 'file') {
    spec = input.spec;
  } else {
    try {
      spec = parsePackage(input.pkg).spec;
    } catch (error) {
      if (!(error instanceof ToolError) || error.code !== 'invalid-library') throw error;
      // Sem especialização legível: devolve a validação em vez de um erro.
      const report = validateLibrary({
        files: input.pkg.files,
        ...(input.pkg.specPath === undefined ? {} : { specPath: input.pkg.specPath }),
        level: 1,
      });
      const errors = issuesView(report.errors);
      return {
        ...base,
        validation: {
          valid: false,
          errors: errors.items,
          ...(errors.more > 0 ? { moreErrors: errors.more } : {}),
          warnings: [],
        },
        hint: 'corrija os erros da validação (`file` e `path` apontam o trecho): sem a especialização não há como planejar a atualização',
      };
    }
  }

  const decision = checkSpecApply(p, spec);
  const applied = getSpecialization(p, spec.id);

  // Validação: o pacote v4 com os três níveis (e o contrato de versão, quando é uma atualização);
  // um arquivo v1 a v3 só tem os avisos da especialização.
  let valid = true;
  let validation: Json;
  if (input.kind === 'package') {
    const previous = decision === 'update' ? (applied?.spec ?? undefined) : undefined;
    const report = validatePackage(input.pkg, previous);
    const errors = issuesView(report.errors);
    const warnings = issuesView(report.warnings);
    valid = report.ok;
    validation = {
      valid,
      errors: errors.items,
      ...(errors.more > 0 ? { moreErrors: errors.more } : {}),
      warnings: warnings.items,
      ...(warnings.more > 0 ? { moreWarnings: warnings.more } : {}),
    };
  } else {
    validation = { valid, errors: [], warnings: specWarnings(spec) };
  }

  const identity = {
    specId: spec.id,
    name: spec.name,
    formatVersion: spec.formatVersion,
    from: applied?.version ?? null,
    to: spec.version,
    decision,
    validation,
  };

  if (decision === 'apply') {
    return {
      ...base,
      ...identity,
      hint: `${valid ? '' : 'corrija os erros da validação antes de propor; '}a biblioteca ainda não está aplicada ao projeto: proponha apply_specialization com \`file\` desta ${input.kind === 'package' ? 'pasta' : 'arquivo'} (propose_changes)`,
    };
  }
  if (decision === 'not-newer') {
    return {
      ...base,
      ...identity,
      hint: `a versão (v${spec.version}) não é maior que a aplicada (v${applied?.version}): suba a \`version\` do pacote para atualizar`,
    };
  }
  const impact = specializationUpdateImpact(p, spec);
  return {
    ...base,
    ...identity,
    ...updateView(refs, impact),
    hint: updateHint(impact, valid),
  };
}
