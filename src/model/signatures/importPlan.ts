import type {
  Spec,
  SpecAnnotationType,
  SpecCode,
  SpecCodeCase,
  SpecField,
  SpecMigrationStep,
  SpecNotice,
} from '../spec';
import { interpretsParamTargets, PARAM_TARGETS_FORMAT_VERSION } from '../codeParams';
import { diffSpecs } from '../specVersions';
import { findTypeInSpec } from '../specLookup';
import { callName, unmappedParams } from './codeLink';
import {
  capitalize,
  keyOf,
  labelOf,
  normalizeName,
  optionFor,
  uniqueKey,
} from './importNames';
import { prepareImport, type Prepared } from './importPrepare';
import { diffSignatures, type SignatureDiff } from './importSync';
import type {
  ImportChange,
  ImportLink,
  ImportLinkVia,
  ImportNotice,
  PlanSignatureImportOptions,
  PlanSignatureImportResult,
  SignatureImportPlan,
} from './importTypes';
import {
  defaultFor,
  flatParams,
  resolveUnit,
  unitsOf,
  type FieldPlan,
  type Models,
  type ResolveContext,
  type Unit,
} from './importUnits';
import type { Signature } from './types';

// `planSignatureImport` (stage #1079, decisions 5, 7, 8, 9 and 12): from the signature sheet and
// the specialization, the fields, the `code` (or the `sources`), the warnings, the differences
// from the saved sheet and the suggested migrations. Deterministic and idempotent: the same sheet
// twice gives the same specialization. Pure: works on a copy and saves nothing.

type Scope = SpecCode | SpecCodeCase;

interface LinkRecord {
  readonly unit: Unit;
  readonly field: SpecField;
}

class Importer {
  private readonly existing = new Map<string, string>();
  private readonly linked = new Set<string>();
  /** The targets that come only from the base's `params`: the case's sheet does not judge them. */
  private readonly inherited = new Set<string>();
  private readonly links: ImportLink[] = [];
  private readonly created: SpecField[] = [];
  private readonly pending: Unit[] = [];
  private readonly ignored = new Set<string>();
  private readonly records: LinkRecord[] = [];
  private readonly notes = new Map<string, string[]>();
  private readonly before: ReadonlyMap<string, FlatLike>;
  private readonly newType: boolean;
  private readonly models: Models;
  /** The names that the `code`'s (or the case's) `ignore` leaves out on purpose (decision 6). */
  private readonly configured: ReadonlySet<string>;

  constructor(
    private readonly original: Spec,
    private readonly spec: Spec,
    private readonly type: SpecAnnotationType,
    private readonly options: PlanSignatureImportOptions,
    private readonly prepared: Prepared,
  ) {
    this.models = spec.fieldModels?.[prepared.id] ?? {};
    this.configured = new Set(
      (prepared.scope as Scope | undefined)?.ignore ?? prepared.code?.ignore ?? [],
    );
    this.before = flatLikeOf(options.previous);
    this.newType = type.fields.length === 0 && options.previous === undefined;
  }

  private get signature(): Signature {
    return this.options.signature;
  }

  private get design(): boolean {
    return this.prepared.source !== undefined;
  }

  private get path(): string {
    return this.prepared.path;
  }

  private get prefix(): string {
    return this.prepared.id;
  }

  // --- what is already linked ---

  private collectExisting(): void {
    if (this.design) this.collectDesign();
    else this.collectCode();
    for (const key of this.existing.values()) this.linked.add(key);
  }

  private collectDesign(): void {
    for (const field of this.type.fields) {
      for (const source of field.sources ?? []) {
        if (source.system === this.prefix && source.name !== undefined)
          this.existing.set(source.name, field.key);
      }
    }
  }

  private collectCode(): void {
    const code = this.prepared.code as SpecCode;
    const own = this.prepared.caseEntry?.params;
    const params = { ...code.params, ...own };
    for (const [key, target] of Object.entries(params)) {
      if (!this.existing.has(target)) this.existing.set(target, key);
      if (this.prepared.caseEntry !== undefined && own?.[key] === undefined)
        this.inherited.add(target);
    }
  }

  private fieldOf(key: string | undefined): SpecField | undefined {
    return key === undefined ? undefined : this.type.fields.find((f) => f.key === key);
  }

  // --- the `like` resolver ---

  private likePlan(ref: string): FieldPlan | undefined {
    const dot = ref.indexOf('.');
    const likeType = findTypeInSpec(this.spec, ref.slice(0, dot))?.type;
    const field = likeType?.fields.find((f) => f.key === ref.slice(dot + 1));
    const base = field === undefined ? undefined : likeBase(field);
    if (likeType === undefined || field === undefined || base === undefined)
      return undefined;
    return { ...base, ...this.likeValues(likeType, field) };
  }

  /** What the copied field carries in the target: `code.values` (code) or `sources[].values` (design). */
  private likeValues(
    likeType: SpecAnnotationType,
    field: SpecField,
  ): Pick<FieldPlan, 'values' | 'sourceValues'> {
    if (this.design) {
      const own = field.sources?.find((s) => s.system === this.prefix)?.values;
      return own === undefined ? {} : { sourceValues: own };
    }
    const values = likeType.code?.[this.prefix]?.values?.[field.key];
    return values === undefined ? {} : { values };
  }

  // --- one unit ---

  private apply(unit: Unit): void {
    if (this.isConfiguredIgnore(unit)) return;
    const context: ResolveContext = {
      models: this.models,
      like: (ref) => this.likePlan(ref),
    };
    const resolution = resolveUnit(unit, context);
    if (resolution.kind === 'ignored') this.ignored.add(unit.owner ?? unit.param.name);
    else if (resolution.kind === 'pending') this.pending.push(unit);
    else if (resolution.kind === 'field') this.bindField(unit, resolution.plan);
  }

  /** The `ignore` of the `code` (or of the case) cites the unit by internal name, by call name or by owner. */
  private isConfiguredIgnore(unit: Unit): boolean {
    return (
      this.configured.has(unit.owner ?? unit.param.name) ||
      this.configured.has(callName(unit.param))
    );
  }

  /** The field that `params` already links to the unit: by call name or, without an owner, by internal name. */
  private linkedKey(unit: Unit): string | undefined {
    const byCall = this.existing.get(unit.target);
    if (byCall !== undefined || unit.owner !== undefined || this.design) return byCall;
    return this.existing.get(unit.param.name);
  }

  /**
   * By name, only a field of the same type counts when the argument is a factory's or a composite's
   * (the `width` of `border` is not the size `width`): without the same type, a new field is born.
   */
  private findLinked(
    unit: Unit,
    plan: FieldPlan,
  ): { field: SpecField; via: ImportLinkVia } | undefined {
    const byParams = this.fieldOf(this.linkedKey(unit));
    if (byParams !== undefined) return { field: byParams, via: 'params' };
    const normal = normalizeName(unit.name);
    const byName = this.type.fields.find(
      (f) =>
        !this.linked.has(f.key) &&
        normalizeName(f.key) === normal &&
        (unit.owner === undefined || f.type === plan.type),
    );
    return byName === undefined ? undefined : { field: byName, via: 'name' };
  }

  private bindField(unit: Unit, plan: FieldPlan): void {
    let found = this.findLinked(unit, plan);
    const isNew = found === undefined;
    if (found === undefined) {
      const field = this.makeField(unit, plan);
      this.type.fields.push(field);
      this.created.push(field);
      found = { field, via: 'new' };
    }
    const { field, via } = found;
    this.linked.add(field.key);
    this.links.push({ param: unit.target, field: field.key, via });
    this.records.push({ unit, field });
    if (via !== 'params') this.writeLink(unit, field);
    this.refresh(unit, field, plan, isNew);
  }

  private keyFor(unit: Unit): string {
    const taken = new Set(this.type.fields.map((f) => f.key));
    const base = keyOf(unit.name);
    if (!taken.has(base) || unit.owner === undefined) return uniqueKey(base, taken);
    return uniqueKey(`${keyOf(unit.owner)}${capitalize(base)}`, taken);
  }

  private makeField(unit: Unit, plan: FieldPlan): SpecField {
    const doc = this.signature.doc?.[unit.name] ?? this.signature.doc?.[unit.target];
    const value = defaultFor(unit.param, plan);
    const field: Record<string, unknown> = {
      key: this.keyFor(unit),
      label: labelOf(unit.name),
      type: plan.type,
      ...(plan.options === undefined ? {} : { options: [...plan.options] }),
      ...(plan.suggestions === undefined ? {} : { suggestions: [...plan.suggestions] }),
      ...(value === undefined ? {} : { default: value }),
      ...(this.newType && unit.param.required === true ? { required: true } : {}),
      ...(doc === undefined ? {} : { description: doc.replace(/\s+/g, ' ').trim() }),
    };
    return field as unknown as SpecField;
  }

  /** The source name: the parameter's; a factory's argument carries the owner (`owner.member`). */
  private sourceName(unit: Unit): string {
    return unit.owner === undefined ? unit.param.name : unit.target;
  }

  /** Writes the link: `code.params` (or the field's `sources`, in design). */
  private writeLink(unit: Unit, field: SpecField): void {
    if (this.design) {
      field.sources = [
        ...(field.sources ?? []),
        { system: this.prefix, name: this.sourceName(unit) },
      ];
      return;
    }
    const scope = this.prepared.scope as Scope;
    scope.params = { ...scope.params, [field.key]: unit.target };
  }

  private refresh(unit: Unit, field: SpecField, plan: FieldPlan, isNew: boolean): void {
    if (!isNew) this.updateDefault(unit, field, plan);
    this.writeCode(unit, field, plan, isNew);
    this.noteKind(unit, field);
    this.noteRequired(unit, field);
    this.syncOptions(unit, field, plan, isNew);
  }

  /**
   * An existing field's default only changes when the sheet's changed (decision 12): the first import
   * does not write `default` where the field had none (the "empty = X" curation stays).
   */
  private updateDefault(unit: Unit, field: SpecField, plan: FieldPlan): void {
    const changed = this.diff().changed.some(
      (c) => c.kind === 'changed' && c.aspect === 'default' && c.param === unit.target,
    );
    if (!changed) return;
    const value = defaultFor(unit.param, plan);
    if (value === undefined || field.type !== plan.type) return;
    if (field.type === 'enum' && !field.options.includes(String(value))) return;
    (field as { default?: string | number }).default = value;
  }

  // --- the `code`: calls, formats and values ---

  private writeCode(unit: Unit, field: SpecField, plan: FieldPlan, isNew: boolean): void {
    if (this.design) {
      if (isNew && plan.sourceValues !== undefined)
        this.mergeSourceValues(field, plan.sourceValues);
      return;
    }
    const scope = this.prepared.scope as Scope;
    const base = this.prepared.code as SpecCode;
    if (unit.owner !== undefined && unit.call !== undefined)
      this.setCall(scope, base, unit);
    this.writeFormat(scope, base, field, plan);
    if (isNew) this.writeValues(scope, field, plan);
  }

  /** The field's `format`, without overwriting what the base or the scope (the case) already has. */
  private writeFormat(
    scope: Scope,
    base: SpecCode,
    field: SpecField,
    plan: FieldPlan,
  ): void {
    if (plan.format === undefined) return;
    if (base.formats?.[field.key] !== undefined) return;
    if (scope.formats?.[field.key] !== undefined) return;
    scope.formats = { ...scope.formats, [field.key]: plan.format };
  }

  private writeValues(scope: Scope, field: SpecField, plan: FieldPlan): void {
    if (plan.values === undefined || scope.values?.[field.key] !== undefined) return;
    scope.values = { ...scope.values, [field.key]: { ...plan.values } };
  }

  private setCall(scope: Scope, base: SpecCode, unit: Unit): void {
    const owner = unit.owner as string;
    const call = unit.call as string;
    if (scope.calls?.[owner] !== undefined || base.calls?.[owner] === call) return;
    scope.calls = { ...scope.calls, [owner]: call };
  }

  private mergeSourceValues(
    field: SpecField,
    values: Readonly<Record<string, string>>,
  ): void {
    const source = field.sources?.find((s) => s.system === this.prefix);
    if (source === undefined) return;
    source.values = { ...values, ...source.values };
  }

  // --- `diverges` warnings of the field ---

  private note(field: SpecField, message: string): void {
    this.notes.set(field.key, [...(this.notes.get(field.key) ?? []), message]);
  }

  private noteKind(unit: Unit, field: SpecField): void {
    const old = this.before.get(unit.target)?.kind;
    const now = unit.param.value?.kind;
    if (old === undefined || now === undefined || old === now) return;
    this.note(
      field,
      `the type of parameter \`${unit.target}\` changed from ${old} to ${now}`,
    );
  }

  private noteRequired(unit: Unit, field: SpecField): void {
    if (unit.param.required !== true || field.required === true) return;
    this.note(
      field,
      `required in the code (\`${unit.target}\`), but the field is optional`,
    );
  }

  /** The source's options against the field's (decision 7); code adds, design warns. */
  private syncOptions(
    unit: Unit,
    field: SpecField,
    plan: FieldPlan,
    isNew: boolean,
  ): void {
    const source =
      unit.param.value?.kind === 'enum' ? unit.param.value.options : undefined;
    if (source === undefined || field.type !== 'enum') return;
    const own = [...field.options];
    const matched = new Set<string>();
    for (const text of source) this.matchOption(field, text, own, matched);
    if (isNew && plan.options === undefined) return;
    for (const option of own) {
      if (!matched.has(option))
        this.note(field, `the option \`${option}\` no longer exists in the source`);
    }
  }

  private matchOption(
    field: Extract<SpecField, { type: 'enum' }>,
    text: string,
    own: readonly string[],
    matched: Set<string>,
  ): void {
    const option = optionFor(text, own);
    if (option !== undefined) {
      matched.add(option);
      if (option !== text) this.mapOption(field, option, text);
    } else if (this.design) {
      this.note(field, `the option \`${text}\` of the source does not exist in the field`);
    } else {
      field.options.push(text);
    }
  }

  private mapOption(field: SpecField, option: string, text: string): void {
    if (this.design) {
      const source = field.sources?.find((s) => s.system === this.prefix);
      if (source !== undefined) source.values = { [text]: option, ...source.values };
      return;
    }
    const scope = this.prepared.scope as Scope;
    const current = scope.values?.[field.key] ?? {};
    if (current[option] !== undefined) return;
    scope.values = { ...scope.values, [field.key]: { ...current, [option]: text } };
  }

  // --- what left, warnings and the rest ---

  private paramsView(): Record<string, string> {
    const view: Record<string, string> = {};
    for (const [target, key] of this.existing) view[key] = target;
    for (const link of this.links) view[link.field] = link.param;
    return view;
  }

  /** The linked parameters that the sheet no longer has: target and field. */
  private outside(): { target: string; field: string }[] {
    const present = new Set<string>();
    for (const unit of unitsOf(this.signature, this.models)) present.add(unit.target);
    for (const flat of flatParams(this.signature)) {
      present.add(flat.target);
      present.add(flat.param.name);
    }
    return [...this.existing]
      .filter(([target]) => !present.has(target) && !this.inherited.has(target))
      .map(([target, field]) => ({ target, field }));
  }

  /** The fields this sheet already flagged as `removed`: re-importing does not report them again. */
  private reportedRemoved(): ReadonlySet<string> {
    return new Set(
      this.type.fields
        .filter((f) =>
          f.notices?.some((n) => n.kind === 'removed' && n.ref === this.path),
        )
        .map((f) => f.key),
    );
  }

  private diffMemo: SignatureDiff | undefined;

  private diff(): SignatureDiff {
    if (this.diffMemo !== undefined) return this.diffMemo;
    const previous = this.options.previous;
    this.diffMemo =
      previous === undefined
        ? { renamed: [], removed: [], added: [], changed: [] }
        : diffSignatures(previous, this.signature);
    return this.diffMemo;
  }

  private keyOfTarget(target: string): string | undefined {
    return this.links.find((l) => l.param === target)?.field ?? this.existing.get(target);
  }

  /**
   * `<platform>: <text>`; in the sheet of a `variants` case, `<platform>: case \`<case>\`: <text>`
   * (the same parameter without a field in the base and in the case would give two equal
   * warnings, the `repeated notice` error).
   */
  private message(text: string): string {
    const variant = this.options.variant;
    return variant === undefined
      ? `${this.prefix}: ${text}`
      : `${this.prefix}: case \`${variant}\`: ${text}`;
  }

  private writeNotices(
    outside: { target: string; field: string }[],
    diff: SignatureDiff,
  ): ImportNotice[] {
    const ours: ImportNotice[] = [];
    const previousRemoved = this.removedNotices();
    const slot = this.detachOwnNotices();
    const fresh = new Map<{ notices?: SpecNotice[] }, SpecNotice[]>();
    const add = (
      at: ImportNotice['at'],
      kind: SpecNotice['kind'],
      text: string,
    ): void => {
      const notice: SpecNotice = { kind, message: this.message(text), ref: this.path };
      const holder = at === 'type' ? this.type : this.fieldOf(at.field);
      if (holder === undefined) return;
      fresh.set(holder, [...(fresh.get(holder) ?? []), notice]);
      ours.push({ at, kind, message: notice.message, ref: this.path });
    };
    for (const unit of this.pending) {
      add(
        'type',
        'pending',
        `the parameter \`${this.nameOf(unit)}\` (${unit.param.type}) is not a field yet`,
      );
    }
    for (const field of this.type.fields) {
      for (const text of this.notes.get(field.key) ?? [])
        add({ field: field.key }, 'diverges', text);
    }
    this.writeOutside(outside, diff, add);
    this.keepRemoved(previousRemoved, outside, fresh, ours);
    for (const [holder, list] of fresh) {
      const kept = holder.notices ?? [];
      const at = Math.min(slot.get(holder) ?? kept.length, kept.length);
      holder.notices = [...kept.slice(0, at), ...list, ...kept.slice(at)];
    }
    return ours;
  }

  /** The `removed` warnings that this sheet already saved, by field (the field is left without `params`). */
  private removedNotices(): Map<SpecField, SpecNotice[]> {
    const found = new Map<SpecField, SpecNotice[]>();
    for (const field of this.type.fields) {
      const list = field.notices?.filter(
        (n) => n.kind === 'removed' && n.ref === this.path,
      );
      if (list !== undefined && list.length > 0) found.set(field, list);
    }
    return found;
  }

  /**
   * The `removed` field no longer cites the parameter that left in `params` (the validator would warn
   * "parameter outside the signature"), and that is why the next `outside()` does not find it:
   * the warning that
   * the previous import saved stays as it is, until the parameter is linked to the field again.
   */
  private keepRemoved(
    previous: ReadonlyMap<SpecField, SpecNotice[]>,
    outside: readonly { field: string }[],
    fresh: Map<{ notices?: SpecNotice[] }, SpecNotice[]>,
    ours: ImportNotice[],
  ): void {
    const again = new Set(outside.map((o) => o.field));
    for (const [field, notices] of previous) {
      if (again.has(field.key) || this.linked.has(field.key)) continue;
      fresh.set(field, [...(fresh.get(field) ?? []), ...notices]);
      for (const n of notices)
        ours.push({
          at: { field: field.key },
          kind: n.kind,
          message: n.message,
          ref: this.path,
        });
    }
  }

  /** Removes from `params` the fields whose parameter left the sheet without a rename (they keep the `removed` warning). */
  private dropRemovedParams(
    outside: readonly { target: string; field: string }[],
    diff: SignatureDiff,
  ): void {
    const scope = this.prepared.scope as Scope | undefined;
    if (this.design || scope?.params === undefined) return;
    const params = { ...scope.params };
    for (const { target, field } of outside) {
      if (!diff.renamed.some((r) => r.from === target)) delete params[field];
    }
    if (Object.keys(params).length === 0) delete scope.params;
    else scope.params = params;
  }

  /**
   * Removes this sheet's old warnings (by `ref`) from the type and the fields and returns the position
   * they were in: the new ones take their place (re-importing the base after a case does not reorder
   * the list); without old warnings, they go to the end.
   */
  private detachOwnNotices(): Map<{ notices?: SpecNotice[] }, number> {
    const slot = new Map<{ notices?: SpecNotice[] }, number>();
    const holders: { notices?: SpecNotice[] }[] = [this.type, ...this.type.fields];
    for (const holder of holders) {
      const list = holder.notices;
      if (list === undefined) continue;
      const first = list.findIndex((n) => n.ref === this.path);
      if (first >= 0)
        slot.set(holder, list.slice(0, first).filter((n) => n.ref !== this.path).length);
      const kept = list.filter((n) => n.ref !== this.path);
      if (kept.length === 0) delete holder.notices;
      else holder.notices = kept;
    }
    return slot;
  }

  private writeOutside(
    outside: { target: string; field: string }[],
    diff: SignatureDiff,
    add: (at: ImportNotice['at'], kind: SpecNotice['kind'], text: string) => void,
  ): void {
    for (const { target, field } of outside) {
      const to = diff.renamed.find((r) => r.from === target)?.to;
      if (to === undefined)
        add(
          { field },
          'removed',
          `the parameter \`${target}\` left the signature; the field stays`,
        );
      else add({ field }, 'diverges', `probable rename of \`${target}\` to \`${to}\``);
    }
  }

  private nameOf(unit: Unit): string {
    return unit.owner === undefined ? unit.param.name : `${unit.owner}.${unit.name}`;
  }

  private changesOf(outside: { target: string }[], diff: SignatureDiff): ImportChange[] {
    const removed = [...diff.removed];
    for (const { target } of outside) {
      const renamed = diff.renamed.some((r) => r.from === target);
      if (!renamed && !removed.includes(target)) removed.push(target);
    }
    return [
      ...diff.renamed.map((r): ImportChange => ({
        kind: 'renamed',
        param: r.from,
        to: r.to,
      })),
      ...removed.map((param): ImportChange => ({ kind: 'removed', param })),
      ...diff.added.map((param): ImportChange => ({ kind: 'added', param })),
      ...diff.changed,
    ];
  }

  private migrations(
    outside: { target: string; field: string }[],
    diff: SignatureDiff,
  ): SpecMigrationStep[] {
    const steps: SpecMigrationStep[] = [];
    for (const { target, field } of outside) {
      const to = diff.renamed.find((r) => r.from === target)?.to;
      const toKey = to === undefined ? undefined : this.keyOfTarget(to);
      if (toKey === undefined)
        steps.push({ op: 'remove-field', type: this.type.id, field });
      else steps.push({ op: 'rename-field', type: this.type.id, from: field, to: toKey });
    }
    return steps;
  }

  run(): SignatureImportPlan {
    this.collectExisting();
    for (const unit of unitsOf(this.signature, this.models)) this.apply(unit);
    const outside = this.outside();
    const reported = this.reportedRemoved();
    const news = outside.filter((o) => !reported.has(o.field));
    const diff = this.diff();
    const notices = this.writeNotices(outside, diff);
    this.dropRemovedParams(outside, diff);
    const code = this.prepared.code;
    const ignore = [...this.configured, ...this.ignored];
    const unmapped = unmappedParams(this.signature, {
      params: this.paramsView(),
      ignore,
    });
    return {
      spec: this.spec,
      type: this.type,
      signaturePath: this.path,
      fields: this.created,
      links: this.links,
      ...(code === undefined ? {} : { code }),
      ...(this.prepared.source === undefined ? {} : { sources: this.type.sources ?? [] }),
      notices,
      unmapped,
      changes: this.changesOf(news, diff),
      suggestedMigrations: this.migrations(news, diff),
      versionBump: diffSpecs(this.original, this.spec).length > 0,
    };
  }
}

/** The type, the options and the suggestions of a field copied by `like`. */
function likeBase(field: SpecField): FieldPlan | undefined {
  if (field.type === 'enum') return { type: 'enum', options: field.options };
  if (field.type === 'number') return { type: 'number' };
  if (field.type !== 'string') return undefined;
  return {
    type: 'string',
    ...(field.suggestions ? { suggestions: field.suggestions } : {}),
  };
}

interface FlatLike {
  readonly kind: string | undefined;
}

function flatLikeOf(previous: Signature | undefined): ReadonlyMap<string, FlatLike> {
  const map = new Map<string, FlatLike>();
  if (previous === undefined) return map;
  for (const flat of flatParams(previous))
    map.set(flat.target, { kind: flat.param.value?.kind });
  return map;
}

/** Importing the sheet into the type, without saving anything; see the header. */
export function planSignatureImport(
  spec: Spec,
  options: PlanSignatureImportOptions,
): PlanSignatureImportResult {
  // `signature`, `calls` and `formats` only apply in 16, and bumping the version would change what the `params`
  // of the old specialization mean (path and `#n` become interpreted): refuse.
  if (!interpretsParamTargets(spec.formatVersion)) {
    return {
      ok: false,
      code: 'spec-version',
      detail: `the specialization "${spec.id}" is formatVersion ${spec.formatVersion}; the signature sheet (signature, calls, formats) is only valid from ${PARAM_TARGETS_FORMAT_VERSION}`,
      hint: `bump the specialization to formatVersion ${PARAM_TARGETS_FORMAT_VERSION} (check that the params values are still right: path and #n become interpreted) and call again`,
    };
  }
  const clone = structuredClone(spec);
  const found = findTypeInSpec(clone, options.type);
  if (found === null) {
    return {
      ok: false,
      code: 'type-not-found',
      detail: `the type "${options.type}" does not exist in the specialization "${spec.id}"`,
      hint: 'use the id of a type from annotationTypes (list_components shows those of the library)',
    };
  }
  const prepared = prepareImport(clone, found.type, options);
  if (!prepared.ok) return prepared;
  const plan = new Importer(spec, clone, found.type, options, prepared).run();
  return { ok: true, plan };
}
