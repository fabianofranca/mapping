import type { ComponentFile, Direction, FieldValues } from './components/componentFormat';
import { type Box, approximateMeasurer, instantiate } from './components/instantiate';
import { type Library, type TextFile, loadLibrary } from './components/library';
import { type Origin, screenFromSource } from './components/origin';
import type { IconSet } from './components/icons';
import { isIntrinsicSize } from './components/layoutValues';
import { expressionPx, fitComponentSize, resolveSizing } from './components/sizing';
import { type ResolvedTokens, resolveTokens } from './components/tokens';
import type { LibraryIssue } from './library';
import { libraryIssue } from './libraryIssue';
import { modelMessage, rawMessage, type ModelMessage } from './modelMessage';
import {
  MODEL_MESSAGE_TEMPLATES,
  fillTemplate,
  isModelMessageTemplateCode,
  templateMessage,
  type ModelMessageTemplateCode,
} from './messages';
import type { Spec, SpecAnnotationType } from './spec';

// Nível 3 do validador da biblioteca: a prova de desenho. Instancia cada componente com os
// valores do `preview` e de cada exemplo de valores, no tamanho inicial, e passa
// cada exemplo de sistema externo pela declaração (`origins`). Puro: recebe tudo já lido
// (`library.ts` monta o contexto) e nunca lê disco nem rede.
//
// Ordem das issues (fixa, os testes dependem dela): tipos na ordem da especialização (camadas e
// tipos em ordem); em cada tipo com componente válido, primeiro o `preview` (ou os valores
// padrão, quando o componente não tem `preview`), depois cada exemplo de valores, sempre no
// `size` (o `minSize` não é desenhado: o aviso de conteúdo maior que a caixa nele só serve a quem
// escreve o componente, não a quem vê o preview); depois os exemplos de sistema externo do tipo; por
// fim as telas de exemplo de cada origem, na ordem de `origins`.
//
// A medida do texto é a aproximada (`approximateMeasurer`): quem desenha de verdade usa a do
// navegador, por isso os avisos do motor de desenho levam `(aproximado)` no fim.

/** Tamanho do quadro que recebe o nó de um exemplo de sistema externo (um componente, não uma tela). */
const NODE_SCREEN = 1000;

/** Sufixo dos avisos que dependem da medida do texto. */
export const APPROXIMATE_SUFFIX = ' (aproximado)';

export interface DrawingContext {
  readonly spec: Spec;
  readonly specPath: string;
  /** Caminho de um arquivo citado pela especialização, relativo à raiz do pacote. */
  readonly resolve: (ref: string) => string;
  /** Componentes válidos, pelo caminho resolvido. */
  readonly components: ReadonlyMap<string, ComponentFile>;
  /** JSON já lido de um arquivo (exemplo externo), pelo caminho resolvido; ausente ou inválido = `undefined`. */
  readonly jsonOf: (path: string) => unknown;
  /** Os `.json` do pacote com texto, a especialização primeiro (alimenta `loadLibrary`). */
  readonly textFiles: readonly TextFile[];
  /** O conjunto de ícones da especialização (`icons`), quando o arquivo é válido. */
  readonly icons?: IconSet;
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** "campo não informado" do motor para um campo que o tipo nem declara: o nível 2 já deu o erro. */
const NOT_INFORMED_CODE: ModelMessageTemplateCode = 'engine.fieldMissing';

/** O aviso do motor com o sufixo de medida aproximada (o aviso vai em `detail`, que a interface traduz). */
const approximate = (message: ModelMessage): ModelMessage => {
  const params = { reason: message.text };
  const text = fillTemplate(MODEL_MESSAGE_TEMPLATES['engine.approximate'], params);
  return modelMessage('engine.approximate', params, text, message);
};

export function defaultValues(
  type: SpecAnnotationType,
): Record<string, string | number | null> {
  const values: Record<string, string | number | null> = {};
  for (const field of type.fields) {
    values[field.key] =
      field.type === 'table' || field.type === 'ref' ? null : (field.default ?? null);
  }
  return values;
}

/** O aviso que só aparece em `rtl`: o do motor com o prefixo "em rtl" (o aviso vai em `detail`, que a interface traduz). */
const inRtl = (message: ModelMessage): ModelMessage => {
  const params = { reason: message.text };
  const text = fillTemplate(MODEL_MESSAGE_TEMPLATES['engine.inRtl'], params);
  return modelMessage('engine.inRtl', params, text, message);
};

/** O caso provado: um código de prova por caso e por haver modo ou não (ver `drawCode`). */
type DrawKind = 'defaults' | 'preview' | 'example';

interface DrawCase {
  readonly kind: DrawKind;
  /** Nome do exemplo (só no caso `example`). */
  readonly name?: string;
  readonly values: FieldValues;
  readonly file: string;
  readonly path: string;
}

function drawCases(
  type: SpecAnnotationType,
  component: ComponentFile,
  componentPath: string,
  specPath: string,
  basePath: string,
): DrawCase[] {
  const defaults = defaultValues(type);
  const cases: DrawCase[] = [
    component.preview === undefined
      ? { kind: 'defaults', values: defaults, file: componentPath, path: '' }
      : {
          kind: 'preview',
          values: { ...defaults, ...component.preview },
          file: componentPath,
          path: 'preview',
        },
  ];
  (type.examples ?? []).forEach((example, index) => {
    if (example.values === undefined) return;
    cases.push({
      kind: 'example',
      name: example.name,
      values: { ...defaults, ...example.values },
      file: specPath,
      path: `${basePath}.examples[${index}]`,
    });
  });
  return cases;
}

const DRAW_CODES = {
  defaults: ['library.draw.defaults', 'library.draw.defaultsMode'],
  preview: ['library.draw.preview', 'library.draw.previewMode'],
  example: ['library.draw.example', 'library.draw.exampleMode'],
} as const satisfies Record<
  DrawKind,
  readonly [ModelMessageTemplateCode, ModelMessageTemplateCode]
>;

/** Os mesmos casos desenhados no tamanho ajustado ao conteúdo (decisão 10 da #898): "tamanho ajustado W×H". */
const FITTED_DRAW_CODES = {
  defaults: ['library.drawFitted.defaults', 'library.drawFitted.defaultsMode'],
  preview: ['library.drawFitted.preview', 'library.drawFitted.previewMode'],
  example: ['library.drawFitted.example', 'library.drawFitted.exampleMode'],
} as const satisfies Record<
  DrawKind,
  readonly [ModelMessageTemplateCode, ModelMessageTemplateCode]
>;

/** O código da mensagem do caso, com ou sem modo (um código por variante, texto inteiro no catálogo). */
function drawCode(
  kind: DrawKind,
  withMode: boolean,
  fitted: boolean,
): ModelMessageTemplateCode {
  return (fitted ? FITTED_DRAW_CODES : DRAW_CODES)[kind][withMode ? 1 : 0];
}

/**
 * Os modos em que a prova roda: cada modo de `tokens` com a tabela resolvida dele (como o desenho
 * faz com `resolvedTokensByMode`); sem `tokens`, uma passada só, sem modo na mensagem.
 */
function drawingModes(spec: Spec): DrawingMode[] {
  const tokens = spec.tokens;
  if (tokens === undefined || tokens.modes.length === 0) return [{}];
  return tokens.modes.map((mode) => ({ mode, tokens: resolveTokens(tokens, {}, mode) }));
}

type DrawingMode = { mode?: string; tokens?: ResolvedTokens };

const sameBox = (a: Box, b: Box): boolean => a.width === b.width && a.height === b.height;

/**
 * O tamanho ajustado cabe o conteúdo por construção (mede o conteúdo, e o `min*` só o aumenta): só vale
 * prová-lo quando algo o segura, o `maxWidth`/`maxHeight` da raiz num eixo medido ou o px que uma
 * expressão dá ao eixo. Sem isso o caso no `size` já é o que importa, e o custo da prova não dobra.
 */
function fitCanOverflow(component: ComponentFile, values: FieldValues): boolean {
  const sizing = resolveSizing(component, values);
  const root = component.template;
  const capped = {
    width: root.maxWidth !== undefined,
    height: root.maxHeight !== undefined,
  };
  return (['width', 'height'] as const).some((axis) => {
    const resolved = sizing[axis];
    const measured = resolved.spec === 'hug' || isIntrinsicSize(resolved.spec);
    return expressionPx(resolved) !== undefined || (measured && capped[axis]);
  });
}

/**
 * O tamanho ajustado do caso (o do ajuste, com os valores do caso e os tokens do modo dado);
 * `undefined` se o componente não tem eixo que dependa do conteúdo ou se o ajuste dá o `size` (o caso
 * no `size` já o prova).
 */
function fittedBox(
  component: ComponentFile,
  values: FieldValues,
  first: DrawingMode | undefined,
): Box | undefined {
  try {
    if (!fitCanOverflow(component, values)) return undefined;
    const tokens = first?.tokens;
    const fit = fitComponentSize(component, values, {
      measure: approximateMeasurer,
      ...(tokens === undefined ? {} : { tokens }),
    });
    if (fit === undefined) return undefined;
    const box: Box = { x: 0, y: 0, width: fit.width, height: fit.height };
    return sameBox(box, { x: 0, y: 0, ...component.size }) ? undefined : box;
  } catch {
    return undefined;
  }
}

/** O resultado da prova de um caso num modo: os avisos do motor ou o erro de uma exceção. */
interface ModeResult {
  readonly mode: string | undefined;
  readonly box: Box;
  readonly texts: ModelMessage[];
  readonly error: string | undefined;
}

/**
 * Prova um caso em cada modo, num tamanho por modo, em `ltr` e depois em `rtl`: o aviso que vale
 * em todos os modos sai uma vez; o de `rtl` que o `ltr` do mesmo modo já deu não se repete, e o que
 * só `rtl` dá sai com o prefixo "em rtl" (um componente que estoura só em `rtl` é um problema dele).
 */
function proveCase(
  type: SpecAnnotationType,
  component: ComponentFile,
  drawCase: DrawCase,
  modes: readonly DrawingMode[],
  boxes: readonly Box[],
  fitted: boolean,
  out: LibraryIssue[],
): void {
  const keys = new Set(type.fields.map((f) => f.key));
  const issue = (
    mode: string | undefined,
    box: Box,
    detail: ModelMessage,
    severity: 'warning' | 'error',
  ) =>
    libraryIssue(
      severity,
      drawCase.file,
      drawCase.path,
      drawCode(drawCase.kind, mode !== undefined, fitted),
      {
        typeId: type.id,
        ...(drawCase.name === undefined ? {} : { name: drawCase.name }),
        ...(mode === undefined ? {} : { mode }),
        size: `${box.width}×${box.height}`,
      },
      detail,
    );
  const run = (direction: Direction): ModeResult[] =>
    modes.map(({ mode, tokens }, i): ModeResult => {
      try {
        const { messages } = instantiate(component, drawCase.values, boxes[i] as Box, {
          measure: approximateMeasurer,
          ...(tokens === undefined ? {} : { tokens }),
          ...(direction === 'rtl' ? { direction } : {}),
        });
        // O aviso do `sizing` não depende da medida do texto nem da direção: sai sem o sufixo
        // `(aproximado)` e só na passada `ltr`.
        const sizing =
          fitted || direction === 'rtl'
            ? []
            : resolveSizing(component, drawCase.values).messages;
        return {
          mode,
          box: boxes[i] as Box,
          texts: [
            ...messages
              .filter((m) => {
                const key = String(m.params.key ?? '');
                return m.code !== NOT_INFORMED_CODE || key === '' || keys.has(key);
              })
              .map(approximate),
            ...sizing,
          ],
          error: undefined,
        };
      } catch (error) {
        return { mode, box: boxes[i] as Box, texts: [], error: messageOf(error) };
      }
    });
  // O aviso que vale em todos os modos sai uma vez, sem modo; o que depende do modo cita o modo.
  const emit = (perMode: readonly ModeResult[]): void => {
    const first = boxes[0] as Box;
    const common =
      modes.length > 1 && boxes.every((b) => sameBox(b, first))
        ? (perMode[0]?.texts ?? []).filter((t) =>
            perMode.every(
              (m) => m.error === undefined && m.texts.some((x) => x.text === t.text),
            ),
          )
        : [];
    for (const message of common) out.push(issue(undefined, first, message, 'warning'));
    for (const { mode, box, texts, error } of perMode) {
      if (error !== undefined) {
        out.push(
          issue(mode, box, templateMessage('library.drawFailed', { error }), 'error'),
        );
        continue;
      }
      for (const message of texts) {
        if (!common.some((c) => c.text === message.text))
          out.push(issue(mode, box, message, 'warning'));
      }
    }
  };
  const ltr = run('ltr');
  emit(ltr);
  emit(rtlOnly(ltr, run('rtl')));
}

/** O que `rtl` dá a mais que o `ltr` do mesmo modo: avisos novos com o prefixo "em rtl"; erro só de `rtl` idem. */
function rtlOnly(ltr: readonly ModeResult[], rtl: readonly ModeResult[]): ModeResult[] {
  return rtl.map((r, i) => {
    const base = ltr[i] as ModeResult;
    if (r.error !== undefined) {
      return {
        ...r,
        error: undefined,
        texts: base.error === undefined ? rtlError(r.error) : [],
      };
    }
    const seen = new Set(base.texts.map((t) => t.text));
    return { ...r, texts: r.texts.filter((t) => !seen.has(t.text)).map(inRtl) };
  });
}

/** A exceção que só `rtl` lança, como um aviso "em rtl" (a prova segue; o erro de `ltr` já vale). */
function rtlError(error: string): ModelMessage[] {
  return [inRtl(templateMessage('library.drawFailed', { error }))];
}

function typeDrawing(
  type: SpecAnnotationType,
  component: ComponentFile,
  componentPath: string,
  specPath: string,
  basePath: string,
  modes: readonly DrawingMode[],
  out: LibraryIssue[],
): void {
  const box: Box = { x: 0, y: 0, ...component.size };
  for (const drawCase of drawCases(type, component, componentPath, specPath, basePath)) {
    proveCase(
      type,
      component,
      drawCase,
      modes,
      modes.map(() => box),
      false,
      out,
    );
    // Componente com eixo que depende do conteúdo: o mesmo caso no tamanho ajustado.
    const fit = fittedBox(component, drawCase.values, modes[0]);
    if (fit !== undefined)
      proveCase(
        type,
        component,
        drawCase,
        modes,
        modes.map(() => fit),
        true,
        out,
      );
  }
}

/** Biblioteca do motor para provar os exemplos externos; `undefined` (e o motivo) se não monta. */
function buildLibrary(ctx: DrawingContext): { library?: Library; reason?: string } {
  try {
    return { library: loadLibrary(ctx.textFiles) };
  } catch (error) {
    return { reason: messageOf(error) };
  }
}

/**
 * Biblioteca com a origem trocada por uma sintética que lê o JSON `{ node }` como a única raiz
 * de um quadro grande: só o desenho do nó importa, não a tela (`screen`) da origem declarada.
 */
export function nodeProbeLibrary(lib: Library, origin: Origin): Library {
  return {
    ...lib,
    origins: [
      {
        ...origin,
        screen: { width: NODE_SCREEN, height: NODE_SCREEN, roots: [{ path: 'node' }] },
      },
    ],
  };
}

/** Tira o `node.` que o quadro sintético põe na frente do caminho de um aviso da origem. */
export const withoutNodePrefix = (message: string): string =>
  message.replace(/^node\.?/, '');

/** O erro da tradução como `detail`: com código, ou o texto cru (uma exceção do motor). */
function errorDetail(
  result: { readonly error?: string; readonly errorMessage?: ModelMessage },
  strip: (text: string) => string = (text) => text,
): ModelMessage {
  return result.errorMessage ?? rawMessage(strip(result.error ?? ''));
}

/**
 * O aviso da origem sem o `node.` que o quadro sintético põe na frente do caminho: o `path` do
 * parâmetro perde o prefixo e o texto é montado de novo (igual a `withoutNodePrefix(text)`).
 */
export function withoutNodePrefixMessage(message: ModelMessage): ModelMessage {
  const path = message.params.path;
  if (typeof path === 'string' && isModelMessageTemplateCode(message.code))
    return templateMessage(message.code, {
      ...message.params,
      path: withoutNodePrefix(path),
    });
  // Sem `path` (ou sem tradução): o texto perde o prefixo, como antes, e deixa de ter código.
  const text = withoutNodePrefix(message.text);
  return text === message.text ? message : rawMessage(text);
}

export function drawingIssues(ctx: DrawingContext): LibraryIssue[] {
  const { spec, specPath } = ctx;
  const out: LibraryIssue[] = [];
  const modes = drawingModes(spec);
  let built: { library?: Library; reason?: string } | undefined;
  const library = (): { library?: Library; reason?: string } => {
    built ??= buildLibrary(ctx);
    return built;
  };
  let warnedLibrary = false;
  const libraryOrWarn = (path: string): Library | undefined => {
    const { library: lib, reason } = library();
    if (lib === undefined && !warnedLibrary) {
      warnedLibrary = true;
      out.push(
        reason === undefined
          ? libraryIssue('warning', specPath, path, 'library.buildFailedUnknown')
          : libraryIssue('warning', specPath, path, 'library.buildFailed', { reason }),
      );
    }
    return lib;
  };

  spec.layers.forEach((layer, li) => {
    layer.annotationTypes.forEach((type, ti) => {
      const basePath = `layers[${li}].annotationTypes[${ti}]`;
      if (type.component === undefined) return;
      const componentPath = ctx.resolve(type.component);
      const loaded = ctx.components.get(componentPath);
      if (loaded === undefined) return;
      const component =
        ctx.icons === undefined ? loaded : { ...loaded, resolvedIcons: ctx.icons };
      typeDrawing(type, component, componentPath, specPath, basePath, modes, out);

      (type.examples ?? []).forEach((example, index) => {
        if (example.system === undefined || example.file === undefined) return;
        const at = `${basePath}.examples[${index}].file`;
        const json = ctx.jsonOf(ctx.resolve(example.file));
        if (json === undefined) return;
        const lib = libraryOrWarn(at);
        const origin = lib?.origins.find((o) => o.system === example.system);
        if (lib === undefined || origin === undefined) return;
        // O nó do exemplo vai para uma origem sintética que o lê como a única raiz de um quadro
        // grande: só o desenho do nó importa, não a tela (`screen`) da origem declarada.
        const probe = nodeProbeLibrary(lib, origin);
        const result = screenFromSource(
          probe,
          { node: json },
          { system: origin.system, measure: approximateMeasurer },
        );
        const params = { name: example.name, system: origin.system };
        const systemIssue = (severity: 'error' | 'warning', detail: ModelMessage) =>
          libraryIssue(severity, specPath, at, 'library.systemExample', params, detail);
        if (result.error !== undefined) {
          out.push(systemIssue('error', errorDetail(result, withoutNodePrefix)));
          return;
        }
        for (const message of result.messages)
          out.push(systemIssue('warning', withoutNodePrefixMessage(message)));
        const root = result.screen?.instances.find((i) => i.parentId === undefined);
        if (root !== undefined && root.typeId !== type.id) {
          out.push(
            libraryIssue('warning', specPath, at, 'library.systemExampleType', {
              ...params,
              found: root.typeId,
              typeId: type.id,
            }),
          );
        }
      });
    });
  });

  (spec.origins ?? []).forEach((origin, oi) => {
    (origin.examples ?? []).forEach((example, ei) => {
      const at = `origins[${oi}].examples[${ei}].file`;
      const json = ctx.jsonOf(ctx.resolve(example.file));
      if (json === undefined) return;
      const lib = libraryOrWarn(at);
      if (lib === undefined) return;
      const result = screenFromSource(lib, json, {
        system: origin.system,
        measure: approximateMeasurer,
      });
      const params = { name: example.name, system: origin.system };
      const screenIssue = (severity: 'error' | 'warning', detail: ModelMessage) =>
        libraryIssue(severity, specPath, at, 'library.originScreen', params, detail);
      if (result.error !== undefined) {
        out.push(screenIssue('error', errorDetail(result)));
        return;
      }
      for (const message of result.messages) out.push(screenIssue('warning', message));
    });
  });
  return out;
}
