/**
 * Motor dos componentes (MC2, decisões 9 e 10 da #898): o `sizing` avaliado e o tamanho ajustado ao
 * conteúdo. O `sizing` de um eixo é literal (px, `"fill"` ou `"hug"`) ou, na v4, uma expressão
 * avaliada com os valores da instância (`$switch` pelo estilo, `$if` pelo campo…); valor que não dá
 * px ≥ 0, `fill` nem `hug` cai no `size` daquele eixo com o aviso `valor inválido em sizing.<eixo>`.
 * Funções puras, sem DOM.
 */
import { templateMessage } from '../messages';
import type { ModelMessage } from '../modelMessage';
import type {
  ComponentFile,
  Expr,
  FieldValues,
  InstanceSizeSpec,
} from './componentFormat';
import { MIN_STORED_MARKING_SIZE } from '../geometry';
import { evaluate } from './expressions';
import { type InstantiateOptions, measureComponent } from './instantiate';
import { describeValue, parseSizeSpec } from './layoutValues';

export type SizingAxis = 'width' | 'height';

/** De onde veio o valor do eixo: o `size` (sem `sizing`, ou valor inválido), o literal ou a expressão. */
export type SizingSource = 'size' | 'literal' | 'expression';

export interface ResolvedAxis {
  readonly spec: InstanceSizeSpec;
  readonly source: SizingSource;
}

export interface ResolvedSizing {
  readonly width: ResolvedAxis;
  readonly height: ResolvedAxis;
  /** Um aviso por eixo com valor inválido, na ordem `width`, `height`. */
  readonly messages: readonly ModelMessage[];
}

function plainSpec(value: unknown): InstanceSizeSpec | undefined {
  const spec = parseSizeSpec(value);
  // O `sizing` não tem porcentagem (`"50%"`): é valor inválido.
  return typeof spec === 'string' && spec !== 'fill' && spec !== 'hug' ? undefined : spec;
}

/** O `sizing` do componente, avaliado com `values`; o eixo sem `sizing` vale o `size`. */
export function resolveSizing(
  component: ComponentFile,
  values: FieldValues,
): ResolvedSizing {
  const messages: ModelMessage[] = [];
  const axis = (name: SizingAxis): ResolvedAxis => {
    const raw: Expr<InstanceSizeSpec> | undefined = component.sizing?.[name];
    const size: ResolvedAxis = { spec: component.size[name], source: 'size' };
    if (raw === undefined) return size;
    if (typeof raw !== 'object') return { spec: raw, source: 'literal' };
    const value = evaluate<unknown>(raw as Expr<unknown>, values, undefined);
    const spec = plainSpec(value);
    if (spec !== undefined) return { spec, source: 'expression' };
    messages.push(
      templateMessage('engine.invalidValue', {
        label: `sizing.${name}`,
        value: describeValue(value),
      }),
    );
    return size;
  };
  const width = axis('width');
  const height = axis('height');
  return { width, height, messages };
}

export interface FitOptions {
  readonly base?: { readonly width: number; readonly height: number };
  /** Eixos que acompanham o `sizing` (padrão: os que o `sizing` avaliado manda `hug` ou px por expressão). */
  readonly auto?: Partial<Record<SizingAxis, boolean>>;
}

/** O px que o eixo dá por expressão (o literal em px não conta); `undefined` se não dá. */
export function expressionPx(axis: ResolvedAxis): number | undefined {
  return axis.source === 'expression' && typeof axis.spec === 'number'
    ? axis.spec
    : undefined;
}

/** Os eixos que o `sizing` avaliado faz acompanhar o conteúdo (`hug`) ou a expressão (px). */
export function followedAxes(resolved: ResolvedSizing): Record<SizingAxis, boolean> {
  const follows = (a: ResolvedAxis): boolean =>
    a.spec === 'hug' || expressionPx(a) !== undefined;
  return { width: follows(resolved.width), height: follows(resolved.height) };
}

/** Arredonda para cima, sem deixar o ruído de ponto flutuante subir um px. */
const ceilFit = (value: number): number => Math.ceil(value - 1e-6);

type AxisKind = 'hug' | 'px' | 'keep';

/** O que o eixo faz no ajuste: vale o px da expressão, mede o conteúdo (`auto` ligado) ou fica como está. */
function axisKind(axis: ResolvedAxis, auto: boolean | undefined): AxisKind {
  if (!auto) return 'keep';
  return expressionPx(axis) === undefined ? 'hug' : 'px';
}

/**
 * O tamanho que o componente tem com o conteúdo de `values`, pelo `sizing` avaliado: o eixo `hug` é
 * medido (inteiro para cima, entre os limites da raiz) e o eixo de px por expressão vale o px, os dois
 * nunca abaixo do `minSize` nem de `MIN_STORED_MARKING_SIZE`, como no Arrumar; os
 * demais ficam no `base` (padrão: o `size`). É a função de medida do ajuste (decisão 10) e a que o
 * `fitMarking` da MC3 usa. Sem eixo que dependa do conteúdo, devolve `undefined`.
 */
export function fitComponentSize(
  component: ComponentFile,
  values: FieldValues,
  options: InstantiateOptions,
  fit: FitOptions = {},
): { width: number; height: number; messages: readonly ModelMessage[] } | undefined {
  const resolved = resolveSizing(component, values);
  const auto = { ...followedAxes(resolved), ...fit.auto };
  const kinds = {
    width: axisKind(resolved.width, auto.width),
    height: axisKind(resolved.height, auto.height),
  };
  if (kinds.width === 'keep' && kinds.height === 'keep') return undefined;
  const base = fit.base ?? component.size;
  const given = (name: SizingAxis): number =>
    kinds[name] === 'px' ? (expressionPx(resolved[name]) as number) : base[name];
  const hug = { width: kinds.width === 'hug', height: kinds.height === 'hug' };
  const measured = measureHug(component, values, hug, given, options);
  const floor = (name: SizingAxis, value: number): number =>
    kinds[name] === 'keep'
      ? value
      : Math.max(value, component.minSize?.[name] ?? 0, MIN_STORED_MARKING_SIZE);
  return {
    width: floor('width', axisSize(hug.width, given('width'), measured?.width)),
    height: floor('height', axisSize(hug.height, given('height'), measured?.height)),
    messages: [...resolved.messages, ...(measured?.messages ?? [])],
  };
}

/** O tamanho final do eixo: o medido (inteiro para cima) no `hug`, senão o dado. */
function axisSize(hug: boolean, given: number, measured: number | undefined): number {
  return hug && measured !== undefined ? ceilFit(measured) : given;
}

/** Mede o componente nos eixos `hug` (o eixo que não é `hug` vale o `given`); sem eixo `hug`, não mede. */
function measureHug(
  component: ComponentFile,
  values: FieldValues,
  hug: Record<SizingAxis, boolean>,
  given: (name: SizingAxis) => number,
  options: InstantiateOptions,
): { width: number; height: number; messages: readonly ModelMessage[] } | undefined {
  if (!hug.width && !hug.height) return undefined;
  return measureComponent(
    component,
    values,
    {
      width: hug.width ? null : given('width'),
      height: hug.height ? null : given('height'),
    },
    options,
  );
}
