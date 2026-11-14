import { applyFormat, interpretsParamTargets, paramTarget } from './codeParams';
import type { SpecCode, SpecField } from './spec';
import type { JsonValue } from './types';

// The arguments of a code call (`codeBlueprint`): the `params` of the `code` applied to the
// filled-in fields. In `formatVersion` 16 a `param`'s value is also a path
// (`colors.containerColor`: argument of a `calls` factory) or positional (`#0`), and `formats`
// gives the value's mold (`{value}.dp`). Before 16 the value is opaque text (the parameter name).
// Pure function, no browser.

/** Component parameter on the platform (`code.<platform>.params`). */
export interface BlueprintParam {
  /** Field of the type; in the nested argument of a factory (`call`), the parameter name. */
  readonly key: string;
  /** Parameter name in the code; in a positional argument, the `#n` as written. */
  readonly name: string;
  /**
   * Value ready for the code: `enum` translated by `code.<platform>.values` (without
   * a translation, as is) and passed through `formats` (`16.dp`); `ref` by the target's label (e.g.
   * `User.name`; broken: `null`); `table` with the rows (only the columns, without `_id`; empty: `[]`);
   * empty: `null`. In the factory (`call`), always `null`: the value is in `args`.
   */
  readonly value: JsonValue;
  /** The argument is positional (`#n` in `params`, only `formatVersion` 16): the position, from 0. */
  readonly position?: number;
  /**
   * The argument is the result of a factory (`code.<platform>.calls`, only `formatVersion` 16):
   * its symbol. It only exists when some field of the factory is filled in; `args` carries only those.
   */
  readonly call?: string;
  readonly args?: readonly BlueprintParam[];
}

/** Builds the arguments: the simple ones, the positional ones and the factories (one argument per `calls` used). */
class ArgBuilder {
  readonly out: BlueprintParam[] = [];
  private readonly groups = new Map<string, BlueprintParam[]>();

  constructor(
    private readonly code: SpecCode,
    private readonly interprets: boolean,
  ) {}

  /** The field's value passed through the `formats` mold (an empty value and an object stay as they are). */
  private formatted(key: string, value: JsonValue): JsonValue {
    const format = this.interprets ? this.code.formats?.[key] : undefined;
    if (format === undefined || value === null || typeof value === 'object') return value;
    return applyFormat(format, value);
  }

  add(field: SpecField, raw: string, value: JsonValue): void {
    const key = field.key;
    const shown = this.formatted(key, value);
    const target = this.interprets ? paramTarget(raw) : null;
    if (target?.kind === 'position') {
      this.out.push({ key, name: raw, position: target.position, value: shown });
    } else if (target?.kind === 'path' && this.callSymbol(target.call) !== undefined) {
      if (shown !== null)
        this.addToCall(target.call, { key, name: target.name, value: shown });
    } else {
      this.out.push({ key, name: raw, value: shown });
    }
  }

  /** The symbol of the `call` factory (only an own key of `calls`; `constructor` is not a factory). */
  private callSymbol(call: string): string | undefined {
    const calls = this.code.calls;
    return calls !== undefined && Object.hasOwn(calls, call) ? calls[call] : undefined;
  }

  /** The `call` factory's argument is born with the first filled-in field of it. */
  private addToCall(call: string, arg: BlueprintParam): void {
    let args = this.groups.get(call);
    if (args === undefined) {
      args = [];
      this.groups.set(call, args);
      this.out.push({
        key: call,
        name: call,
        call: this.callSymbol(call) ?? call,
        value: null,
        args,
      });
    }
    args.push(arg);
  }
}

/** The arguments, in the type's field order; empty without `code.params`. */
export function blueprintParams(
  fields: readonly SpecField[],
  code: SpecCode | null,
  formatVersion: number,
  valueOf: (field: SpecField) => JsonValue,
): BlueprintParam[] {
  const params = code?.params;
  if (code === null || params === undefined) return [];
  const builder = new ArgBuilder(code, interpretsParamTargets(formatVersion));
  for (const field of fields) {
    const raw = Object.hasOwn(params, field.key) ? params[field.key] : undefined;
    if (raw !== undefined) builder.add(field, raw, valueOf(field));
  }
  return builder.out;
}
