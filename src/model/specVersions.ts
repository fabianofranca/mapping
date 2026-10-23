import type {
  Spec,
  SpecAnnotationType,
  SpecField,
  SpecFont,
  SpecMigration,
  SpecMigrationStep,
} from './spec';

// Contrato de versão de um pacote de biblioteca (formatVersion 4): classifica a diferença entre
// duas versões da mesma especialização em aditiva ou quebra, e diz quais quebras as `migrations`
// declaradas cobrem. Ver docs/SPEC-FORMAT.md. Puro e sem APIs de navegador (reutilizado pelo MCP).
//
// O que é quebra (e só isto): remover ou renomear tipo, campo ou opção de `enum`; tornar um campo
// obrigatório (inclusive um campo novo que já nasce obrigatório); mudar o `type` de um campo.
// Todo o resto é aditivo. Ficam FORA do contrato, de propósito: camadas, `labelField`,
// `allowedChildren`, `requiresOwner`, `description`, `tags`, `code`, `platforms`, `sources`
// (e a troca de camada de um tipo; `appliesTo` gera só o aviso aditivo `changed-applies-to`), além de remover `component`/`doc`/exemplo/fonte: nada disso
// gera `SpecChange`. Renome é indistinguível de remover + acrescentar; quem renomeia o declara
// num passo `rename-*`, e é isso que o diferencia de uma remoção.
//
// Identidade, nunca posição: o tipo é o `id` (único na especialização inteira, em qualquer
// camada), o campo é a `key` dentro do tipo, a opção é o texto dentro do campo `enum`, o exemplo
// é o `name` dentro do tipo e a fonte é o par `family` + `weight` + `style`.
//
// Colunas de `table` contam como campos do tipo: coluna removida, com `type` trocado, que passa a
// obrigatória ou nova já obrigatória é quebra, com o mesmo código dos campos. O `path` aponta a
// coluna (`layers[0].annotationTypes[1].fields[2].columns[0]`) e o `fieldKey` tem o formato
// `tabela.coluna`; um passo de migração cobre a coluna citando o mesmo `tabela.coluna` em
// `field`/`from`.
//
// Ordem da lista de `diffSpecs` (fixa, os testes dependem dela):
//   1. o que existe na versão NOVA, na ordem do arquivo novo (camadas e tipos em ordem): em cada
//      tipo já existente, primeiro os campos (por campo: tipo trocado, passou a obrigatório e
//      depois as opções novas ou as colunas, recursivamente), depois `component`, `doc` e os
//      exemplos novos; um tipo novo gera só `added-type`; por fim as fontes novas;
//   2. o que DESAPARECEU, na ordem do arquivo ANTERIOR: tipos removidos e, nos tipos que
//      continuam, campos (e colunas) e opções removidos, na ordem em que apareciam.
// O `path` vale para a versão nova e, nos `removed-*`, para a anterior.

export type SpecChangeKind = 'additive' | 'breaking';

export type SpecChangeCode =
  | 'added-type'
  | 'added-field'
  | 'added-option'
  | 'added-component'
  | 'added-doc'
  | 'added-example'
  | 'added-font'
  | 'changed-component'
  | 'changed-applies-to'
  | 'removed-type'
  | 'removed-field'
  | 'removed-option'
  | 'field-required'
  | 'field-type';

export interface SpecChange {
  readonly kind: SpecChangeKind;
  readonly code: SpecChangeCode;
  /** Caminho na versão nova; na versão anterior quando a coisa deixou de existir. */
  readonly path: string;
  readonly typeId?: string;
  /** Chave do campo; `tabela.coluna` quando a mudança é numa coluna de `table`. */
  readonly fieldKey?: string;
  /** A opção de `enum` (em `added-option` e `removed-option`). */
  readonly option?: string;
  readonly message: string;
}

/** Onde estamos: o tipo e, dentro de uma `table`, o campo da tabela. */
interface Where {
  readonly typeId: string;
  /** Caminho da lista de campos (`...annotationTypes[1].fields`) ou de colunas (`...columns`). */
  readonly listPath: string;
  /** Chave da `table` quando a lista é a de colunas. */
  readonly tableKey?: string;
}

const fieldKeyOf = (w: Where, key: string): string =>
  w.tableKey === undefined ? key : `${w.tableKey}.${key}`;

/** `o campo "k" do tipo "t"` ou `a coluna "c" do campo "tabela" do tipo "t"`, com o gênero. */
function subject(w: Where, key: string): { text: string; g: 'o' | 'a' } {
  return w.tableKey === undefined
    ? { text: `o campo "${key}" do tipo "${w.typeId}"`, g: 'o' }
    : {
        text: `a coluna "${key}" do campo "${w.tableKey}" do tipo "${w.typeId}"`,
        g: 'a',
      };
}

/** Concorda o sufixo com o sujeito (`removid` + `o`/`a`). */
const ag = (g: 'o' | 'a', stem: string): string => `${stem}${g}`;

/** O pedido de passo; numa coluna, diz como o passo a cita (`tabela.coluna`). */
function declare(w: Where, key: string, steps: string): string {
  return w.tableKey === undefined
    ? `declare ${steps} em migrations`
    : `declare ${steps} em migrations com field "${fieldKeyOf(w, key)}"`;
}

const FILL = 'um passo "fill-field"';

function forwardFields(
  previous: readonly SpecField[],
  next: readonly SpecField[],
  w: Where,
  out: SpecChange[],
): void {
  const before = new Map(previous.map((f) => [f.key, f]));
  next.forEach((field, i) => {
    const path = `${w.listPath}[${i}]`;
    const base = { path, typeId: w.typeId, fieldKey: fieldKeyOf(w, field.key) };
    const { text, g } = subject(w, field.key);
    const old = before.get(field.key);

    if (old === undefined) {
      if (field.required === true) {
        out.push({
          kind: 'breaking',
          code: 'field-required',
          ...base,
          message: `${text} é ${ag(g, 'nov')} e já ${ag(g, 'obrigatóri')}; ${declare(w, field.key, FILL)}`,
        });
      } else {
        out.push({
          kind: 'additive',
          code: 'added-field',
          ...base,
          message: `${text} é ${ag(g, 'nov')}`,
        });
      }
      return;
    }

    if (old.type !== field.type) {
      out.push({
        kind: 'breaking',
        code: 'field-type',
        ...base,
        message: `${text} mudou de tipo ("${old.type}" para "${field.type}"); ${declare(w, field.key, FILL)}`,
      });
    }
    if (field.required === true && old.required !== true) {
      out.push({
        kind: 'breaking',
        code: 'field-required',
        ...base,
        message: `${text} passou a ser ${ag(g, 'obrigatóri')}; ${declare(w, field.key, FILL)}`,
      });
    }
    if (old.type !== field.type) return;

    if (old.type === 'enum' && field.type === 'enum') {
      const had = new Set(old.options);
      field.options.forEach((option, j) => {
        if (had.has(option)) return;
        out.push({
          kind: 'additive',
          code: 'added-option',
          path: `${path}.options[${j}]`,
          typeId: w.typeId,
          fieldKey: base.fieldKey,
          option,
          message: `${text} ganhou a opção "${option}"`,
        });
      });
    } else if (old.type === 'table' && field.type === 'table') {
      forwardFields(
        old.columns,
        field.columns,
        { typeId: w.typeId, listPath: `${path}.columns`, tableKey: field.key },
        out,
      );
    }
  });
}

function goneFields(
  previous: readonly SpecField[],
  next: readonly SpecField[],
  w: Where,
  out: SpecChange[],
): void {
  const after = new Map(next.map((f) => [f.key, f]));
  previous.forEach((old, i) => {
    const path = `${w.listPath}[${i}]`;
    const fieldKey = fieldKeyOf(w, old.key);
    const { text, g } = subject(w, old.key);
    const field = after.get(old.key);

    if (field === undefined) {
      out.push({
        kind: 'breaking',
        code: 'removed-field',
        path,
        typeId: w.typeId,
        fieldKey,
        message: `${text} foi ${ag(g, 'removid')}; ${declare(w, old.key, 'um passo "remove-field" ou "rename-field"')}`,
      });
      return;
    }
    if (field.type !== old.type) return;

    if (old.type === 'enum' && field.type === 'enum') {
      const kept = new Set(field.options);
      old.options.forEach((option, j) => {
        if (kept.has(option)) return;
        out.push({
          kind: 'breaking',
          code: 'removed-option',
          path: `${path}.options[${j}]`,
          typeId: w.typeId,
          fieldKey,
          option,
          message: `a opção "${option}" d${text} foi removida; ${declare(w, old.key, `um passo "map-values" com "${option}" em values`)}`,
        });
      });
    } else if (old.type === 'table' && field.type === 'table') {
      goneFields(
        old.columns,
        field.columns,
        { typeId: w.typeId, listPath: `${path}.columns`, tableKey: old.key },
        out,
      );
    }
  });
}

interface TypeEntry {
  readonly type: SpecAnnotationType;
  readonly path: string;
}

/** Os tipos por `id`, na ordem do arquivo (camadas e tipos); o `id` é único na especialização. */
function typesOf(spec: Spec): Map<string, TypeEntry> {
  const types = new Map<string, TypeEntry>();
  spec.layers.forEach((layer, li) => {
    layer.annotationTypes.forEach((type, ti) => {
      if (!types.has(type.id)) {
        types.set(type.id, { type, path: `layers[${li}].annotationTypes[${ti}]` });
      }
    });
  });
  return types;
}

const fontId = (f: SpecFont): string =>
  JSON.stringify([f.family, f.weight ?? null, f.style ?? 'normal']);

/** Todas as diferenças de conteúdo entre duas versões do mesmo pacote (ordem no cabeçalho). */
export function diffSpecs(previous: Spec, next: Spec): SpecChange[] {
  const before = typesOf(previous);
  const after = typesOf(next);
  const out: SpecChange[] = [];

  // 1. O que existe na versão nova.
  for (const [id, { type, path }] of after) {
    const old = before.get(id);
    if (old === undefined) {
      out.push({
        kind: 'additive',
        code: 'added-type',
        path,
        typeId: id,
        message: `o tipo "${id}" é novo`,
      });
      continue;
    }
    forwardFields(
      old.type.fields,
      type.fields,
      { typeId: id, listPath: `${path}.fields` },
      out,
    );
    if (type.component !== undefined) {
      if (old.type.component === undefined) {
        out.push({
          kind: 'additive',
          code: 'added-component',
          path: `${path}.component`,
          typeId: id,
          message: `o tipo "${id}" ganhou o componente "${type.component}"`,
        });
      } else if (old.type.component !== type.component) {
        out.push({
          kind: 'additive',
          code: 'changed-component',
          path: `${path}.component`,
          typeId: id,
          message: `o componente do tipo "${id}" passou de "${old.type.component}" para "${type.component}"`,
        });
      }
    }
    const oldApplies = [...(old.type.appliesTo ?? ['marking'])].sort().join(', ');
    const newApplies = [...(type.appliesTo ?? ['marking'])].sort().join(', ');
    if (oldApplies !== newApplies) {
      out.push({
        kind: 'additive',
        code: 'changed-applies-to',
        path: `${path}.appliesTo`,
        typeId: id,
        message: `o tipo "${id}" passou a se aplicar a: ${newApplies} (antes: ${oldApplies}); anotações que deixaram de se aplicar viram pendência`,
      });
    }
    if (type.doc !== undefined && old.type.doc === undefined) {
      out.push({
        kind: 'additive',
        code: 'added-doc',
        path: `${path}.doc`,
        typeId: id,
        message: `o tipo "${id}" ganhou o documento "${type.doc}"`,
      });
    }
    const hadExamples = new Set((old.type.examples ?? []).map((e) => e.name));
    (type.examples ?? []).forEach((example, ei) => {
      if (hadExamples.has(example.name)) return;
      out.push({
        kind: 'additive',
        code: 'added-example',
        path: `${path}.examples[${ei}]`,
        typeId: id,
        message: `o tipo "${id}" ganhou o exemplo "${example.name}"`,
      });
    });
  }
  const hadFonts = new Set((previous.fonts ?? []).map(fontId));
  (next.fonts ?? []).forEach((font, i) => {
    if (hadFonts.has(fontId(font))) return;
    out.push({
      kind: 'additive',
      code: 'added-font',
      path: `fonts[${i}]`,
      message: `a fonte "${font.family}" é nova`,
    });
  });

  // 2. O que desapareceu, na ordem do arquivo anterior.
  for (const [id, { type, path }] of before) {
    const now = after.get(id);
    if (now === undefined) {
      out.push({
        kind: 'breaking',
        code: 'removed-type',
        path,
        typeId: id,
        message: `o tipo "${id}" foi removido; declare um passo "remove-type" ou "rename-type" em migrations`,
      });
      continue;
    }
    goneFields(
      type.fields,
      now.type.fields,
      { typeId: id, listPath: `${path}.fields` },
      out,
    );
  }
  return out;
}

/**
 * A cadeia de migrações de `from` até `next.version`: as entradas ligadas por `from → to`, em
 * ordem. `[]` quando `from` já é a versão nova; `undefined` se a cadeia estiver rompida (falta
 * a entrada de uma versão, ou a última passa de `next.version`) ou não houver `migrations`.
 * Não confia que `to > from`: uma entrada que não avança rompe a cadeia, em vez de laçar.
 */
export function migrationChain(next: Spec, from: number): SpecMigration[] | undefined {
  if (from === next.version) return [];
  if (from > next.version) return undefined;
  const byFrom = new Map<number, SpecMigration>();
  for (const migration of next.migrations ?? []) {
    if (!byFrom.has(migration.from)) byFrom.set(migration.from, migration);
  }
  const chain: SpecMigration[] = [];
  let at = from;
  while (at < next.version) {
    const migration = byFrom.get(at);
    if (migration === undefined || migration.to <= at || migration.to > next.version) {
      return undefined;
    }
    chain.push(migration);
    at = migration.to;
  }
  return chain;
}

/** `true` se `step` cobre a quebra `change` (a tabela de `migrationFor`). */
function covers(step: SpecMigrationStep, change: SpecChange): boolean {
  const { typeId, fieldKey, option } = change;
  switch (change.code) {
    case 'removed-type':
      return (
        (step.op === 'remove-type' && step.type === typeId) ||
        (step.op === 'rename-type' && step.from === typeId)
      );
    case 'removed-field':
      return (
        (step.op === 'remove-field' && step.type === typeId && step.field === fieldKey) ||
        (step.op === 'rename-field' && step.type === typeId && step.from === fieldKey)
      );
    case 'removed-option':
      return (
        step.op === 'map-values' &&
        step.type === typeId &&
        step.field === fieldKey &&
        option !== undefined &&
        Object.hasOwn(step.values, option)
      );
    case 'field-required':
    case 'field-type':
      return step.op === 'fill-field' && step.type === typeId && step.field === fieldKey;
    default:
      return false;
  }
}

/**
 * O passo declarado (na cadeia de `from` até `next.version`) que cobre a quebra, se houver.
 *
 * | quebra                       | passo que cobre                                                |
 * | ---------------------------- | -------------------------------------------------------------- |
 * | `removed-type`               | `remove-type{type}` ou `rename-type{from: type}`               |
 * | `removed-field`              | `remove-field{type, field}` ou `rename-field{type, from: field}` |
 * | `removed-option`             | `map-values{type, field}` com a opção entre as chaves de `values` |
 * | `field-required`, `field-type` | `fill-field{type, field}`                                    |
 *
 * Mudança aditiva ou cadeia rompida: `undefined`.
 */
export function migrationFor(
  next: Spec,
  from: number,
  change: SpecChange,
): SpecMigrationStep | undefined {
  if (change.kind !== 'breaking') return undefined;
  for (const migration of migrationChain(next, from) ?? []) {
    const step = migration.steps.find((s) => covers(s, change));
    if (step !== undefined) return step;
  }
  return undefined;
}

/**
 * As quebras de `diffSpecs(previous, next)` sem passo que as cubra na cadeia de
 * `previous.version` até `next.version` (lista vazia = o contrato está cumprido). Cadeia rompida:
 * todas as quebras ficam faltando.
 */
export function missingMigrations(previous: Spec, next: Spec): SpecChange[] {
  return diffSpecs(previous, next).filter(
    (c) => c.kind === 'breaking' && migrationFor(next, previous.version, c) === undefined,
  );
}
