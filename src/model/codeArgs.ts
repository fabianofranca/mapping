import { applyFormat, interpretsParamTargets, paramTarget } from './codeParams';
import type { SpecCode, SpecField } from './spec';
import type { JsonValue } from './types';

// Os argumentos de uma chamada de código (`codeBlueprint`): os `params` do `code` aplicados aos
// campos preenchidos. Na `formatVersion` 16 o valor de um `param` também é um caminho
// (`colors.containerColor`: argumento de uma fábrica de `calls`) ou posicional (`#0`), e `formats`
// dá o molde do valor (`{value}.dp`). Antes da 16 o valor é um texto opaco (o nome do parâmetro).
// Função pura, sem navegador.

/** Parâmetro do componente na plataforma (`code.<plataforma>.params`). */
export interface BlueprintParam {
  /** Campo do tipo; no argumento aninhado de uma fábrica (`call`), o nome do parâmetro. */
  readonly key: string;
  /** Nome do parâmetro no código; no argumento posicional, o `#n` como escrito. */
  readonly name: string;
  /**
   * Valor pronto para o código: `enum` traduzido por `code.<plataforma>.values` (sem
   * tradução, como está) e passado pelo `formats` (`16.dp`); `ref` pelo rótulo do alvo (ex:
   * `User.name`; quebrada: `null`); `table` com as linhas (só as colunas, sem `_id`; vazia: `[]`);
   * vazio: `null`. Na fábrica (`call`), sempre `null`: o valor está em `args`.
   */
  readonly value: JsonValue;
  /** O argumento é posicional (`#n` em `params`, só `formatVersion` 16): a posição, de 0. */
  readonly position?: number;
  /**
   * O argumento é o resultado de uma fábrica (`code.<plataforma>.calls`, só `formatVersion` 16):
   * o símbolo dela. Só existe quando algum campo da fábrica está preenchido; `args` traz só eles.
   */
  readonly call?: string;
  readonly args?: readonly BlueprintParam[];
}

/** Monta os argumentos: os simples, os posicionais e as fábricas (um argumento por `calls` usado). */
class ArgBuilder {
  readonly out: BlueprintParam[] = [];
  private readonly groups = new Map<string, BlueprintParam[]>();

  constructor(
    private readonly code: SpecCode,
    private readonly interprets: boolean,
  ) {}

  /** O valor do campo passado pelo molde de `formats` (valor vazio e objeto ficam como estão). */
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
    } else if (target?.kind === 'path' && this.code.calls?.[target.call] !== undefined) {
      if (shown !== null)
        this.addToCall(target.call, { key, name: target.name, value: shown });
    } else {
      this.out.push({ key, name: raw, value: shown });
    }
  }

  /** O argumento da fábrica `call` nasce com o primeiro campo preenchido dela. */
  private addToCall(call: string, arg: BlueprintParam): void {
    let args = this.groups.get(call);
    if (args === undefined) {
      args = [];
      this.groups.set(call, args);
      this.out.push({
        key: call,
        name: call,
        call: this.code.calls?.[call] ?? call,
        value: null,
        args,
      });
    }
    args.push(arg);
  }
}

/** Os argumentos, na ordem dos campos do tipo; vazio sem `code.params`. */
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
