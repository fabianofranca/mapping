// Gerador puro do pacote de biblioteca de exemplo do produto (`examples/libraries/material3/`).
// Sem `node:fs`: devolve a lista `{ path, text }` com caminhos relativos à pasta do pacote.
// `scripts/buildLibraryExamples.mjs` grava; `tests/model/libraryExamples.test.ts` confere que o
// repositório está em dia. Para regerar: `npm run build:examples`.
import type { ComponentFile } from '../src/model/components/componentFormat';
import { findSlot } from '../src/model/components/arrange';
import settings from '../lab/components/sdui/settings.sdui.json';
import { M3_COMPONENTS, M3_SPEC } from '../lab/components/samplesMaterial3';

export interface LibraryExampleFile {
  readonly path: string;
  readonly text: string;
}

type ExampleValues = Record<string, string | number | null>;

interface RawField {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
  default?: string | number;
  description?: string;
  sources?: { system: string; name?: string; path?: string }[];
}

interface RawSource {
  system: string;
  id?: string;
  name?: string;
  slot?: string;
  ignore?: string[];
}

interface RawType {
  id: string;
  name: string;
  description?: string;
  component?: string;
  doc?: string;
  examples?: { name: string; values: ExampleValues }[];
  fields: RawField[];
  sources?: RawSource[];
  code?: Record<string, { symbol?: string; path?: string; notes?: string }>;
  [key: string]: unknown;
}

interface RawLayer {
  annotationTypes: RawType[];
  [key: string]: unknown;
}

interface RawSpec {
  layers: RawLayer[];
  origins: { examples?: { name: string; file: string }[]; [key: string]: unknown }[];
  [key: string]: unknown;
}

/**
 * Variantes de cada tipo, além do exemplo padrão (o `preview`): campo, valor (sempre uma das
 * `options` do campo e diferente do `preview`) e nome em português. No máximo três por tipo.
 */
const VARIANTS: Readonly<Record<string, readonly (readonly [string, string, string])[]>> =
  {
    'm3-top-app-bar': [['align', 'center', 'Centralizado']],
    'm3-button': [
      ['variant', 'tonal', 'Tonal'],
      ['variant', 'outlined', 'Contornado'],
      ['variant', 'text', 'Texto'],
    ],
    'm3-fab': [
      ['color', 'secondary', 'Secundário'],
      ['color', 'surface', 'Superfície'],
    ],
    'm3-text-field': [
      ['state', 'focused', 'Focado'],
      ['state', 'error', 'Com erro'],
      ['state', 'disabled', 'Desabilitado'],
    ],
    'm3-switch': [['selected', 'não', 'Desligado']],
    'm3-checkbox': [
      ['checked', 'não', 'Desmarcado'],
      ['error', 'sim', 'Com erro'],
    ],
    'm3-chip': [['selected', 'sim', 'Selecionado']],
    'm3-card': [
      ['variant', 'filled', 'Preenchido'],
      ['variant', 'outlined', 'Contornado'],
    ],
    'm3-navigation-bar': [
      ['active', '2', 'Segunda aba ativa'],
      ['active', '3', 'Terceira aba ativa'],
    ],
    'm3-bottom-sheet': [['handle', 'não', 'Sem alça']],
    'm3-box': [
      ['background', 'primary-container', 'Fundo primário'],
      ['shape', 'large', 'Cantos grandes'],
    ],
    'm3-row': [
      ['background', 'primary-container', 'Fundo primário'],
      ['shape', 'large', 'Cantos grandes'],
    ],
    'm3-column': [
      ['background', 'primary-container', 'Fundo primário'],
      ['shape', 'large', 'Cantos grandes'],
    ],
  };

const MAX_EXAMPLES = 3;

/** Valores do `preview` que cabem em um exemplo: só campos do tipo, sem texto vazio. */
function previewValues(type: RawType, component: ComponentFile): ExampleValues {
  const keys = new Set(type.fields.map((f) => f.key));
  const values: ExampleValues = {};
  for (const [key, value] of Object.entries(component.preview ?? {})) {
    if (!keys.has(key) || value === undefined || value === '') continue;
    values[key] = value;
  }
  return values;
}

function buildExamples(type: RawType, component: ComponentFile) {
  const base = previewValues(type, component);
  const examples = [{ name: 'Padrão', values: base }];
  for (const [key, value, name] of VARIANTS[type.id] ?? []) {
    if (examples.length >= MAX_EXAMPLES) break;
    const field = type.fields.find((f) => f.key === key);
    if (!field?.options?.includes(value) || base[key] === value) {
      throw new Error(
        `${type.id}: variante "${name}" (${key}=${value}) fora das opções do campo`,
      );
    }
    examples.push({ name, values: { ...base, [key]: value } });
  }
  return examples;
}

// ---------------------------------------------------------------------------------------
// JSON no formato do Prettier (largura 90): objetos abertos; listas só de valores simples
// numa linha quando cabem.
// ---------------------------------------------------------------------------------------

const PRINT_WIDTH = 90;

function isPrimitive(value: unknown): boolean {
  return value === null || typeof value !== 'object';
}

function format(value: unknown, indent: string, lead: number, tail: number): string {
  if (isPrimitive(value)) return JSON.stringify(value);
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.every(isPrimitive)) {
      const inline = `[${value.map((v) => JSON.stringify(v)).join(', ')}]`;
      if (lead + inline.length + tail <= PRINT_WIDTH) return inline;
      if (value.every((v) => typeof v === 'number')) {
        // Prettier preenche a linha com números.
        const lines: string[] = [];
        let line = inner;
        value.forEach((v, i) => {
          const piece = `${JSON.stringify(v)}${i < value.length - 1 ? ',' : ''}`;
          if (
            line.length > inner.length &&
            line.length + 1 + piece.length > PRINT_WIDTH
          ) {
            lines.push(line);
            line = inner + piece;
          } else line += (line.length > inner.length ? ' ' : '') + piece;
        });
        lines.push(line);
        return `[\n${lines.join('\n')}\n${indent}]`;
      }
    }
    const items = value.map((v, i) => {
      const comma = i < value.length - 1 ? ',' : '';
      return `${inner}${format(v, inner, inner.length, comma.length)}${comma}`;
    });
    return `[\n${items.join('\n')}\n${indent}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([, v]) => v !== undefined,
  );
  if (entries.length === 0) return '{}';
  const lines = entries.map(([k, v], i) => {
    const comma = i < entries.length - 1 ? ',' : '';
    const head = `${inner}${JSON.stringify(k)}: `;
    return `${head}${format(v, inner, head.length, comma.length)}${comma}`;
  });
  return `{\n${lines.join('\n')}\n${indent}}`;
}

function toJson(value: unknown): string {
  return `${format(value, '', 0, 0)}\n`;
}

// ---------------------------------------------------------------------------------------
// Documento markdown de um componente (um só molde)
// ---------------------------------------------------------------------------------------

function cell(text: string | number | undefined): string {
  return String(text ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ');
}

/** Tabela markdown com as colunas alinhadas, como o Prettier a escreve. */
function table(header: string[], rows: string[][]): string[] {
  const widths = header.map((h, i) =>
    Math.max(3, h.length, ...rows.map((r) => (r[i] ?? '').length)),
  );
  const line = (cells: string[]) =>
    `| ${cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join(' | ')} |`;
  return [
    line(header),
    `| ${widths.map((w) => '-'.repeat(w)).join(' | ')} |`,
    ...rows.map(line),
  ];
}

function sizingText(component: ComponentFile): string {
  const { width, height } = component.sizing ?? {};
  return `largura ${width ?? component.size.width}, altura ${height ?? component.size.height}`;
}

function valuesText(values: ExampleValues): string {
  return Object.entries(values)
    .map(([k, v]) => `${k}=${v === null ? 'vazio' : v}`)
    .join(', ');
}

function renderDoc(type: RawType, component: ComponentFile): string {
  const out: string[] = [`# ${component.name}`, ''];
  if (component.description) out.push(component.description, '');
  out.push(`Tipo de anotação: \`${type.id}\` (${type.name}).`, '');
  out.push('## Tamanho', '');
  out.push(`- Inicial: ${component.size.width} × ${component.size.height} px`);
  if (component.minSize) {
    out.push(`- Mínimo: ${component.minSize.width} × ${component.minSize.height} px`);
  }
  out.push(`- Dimensionamento: ${sizingText(component)}`, '');

  out.push('## Campos', '');
  out.push(
    ...table(
      ['Chave', 'Rótulo', 'Tipo', 'Obrigatório', 'Opções', 'Padrão', 'Descrição'],
      type.fields.map((f) => [
        `\`${f.key}\``,
        cell(f.label),
        f.type,
        f.required ? 'sim' : 'não',
        cell(f.options?.join(', ')),
        cell(f.default),
        cell(f.description),
      ]),
    ),
  );
  out.push('');

  if (findSlot(component)) {
    const slot = type.sources?.find((s) => s.slot !== undefined)?.slot;
    out.push(
      '## Slot',
      '',
      `Este componente tem um slot que recebe os filhos${slot ? ` (\`${slot}\`)` : ''}.`,
      '',
    );
  }

  out.push('## Exemplos', '');
  for (const e of type.examples ?? [])
    out.push(`- **${e.name}**: ${valuesText(e.values)}`);
  out.push('');

  const sources = type.sources ?? [];
  if (sources.length > 0) {
    out.push('## Origem externa', '');
    for (const s of sources) {
      out.push(
        `Sistema \`${s.system}\`: tipo externo \`${s.name ?? s.id ?? type.id}\`.`,
        '',
      );
      if (s.slot) out.push(`- Slot: \`${s.slot}\``);
      if (s.ignore?.length)
        out.push(`- Props ignoradas: ${s.ignore.map((i) => `\`${i}\``).join(', ')}`);
      const mapped = type.fields.filter((f) =>
        f.sources?.some((fs) => fs.system === s.system),
      );
      if (mapped.length > 0) {
        out.push(
          '',
          ...table(
            ['Campo', 'Caminho em `props`'],
            mapped.flatMap((f) =>
              (f.sources ?? [])
                .filter((fs) => fs.system === s.system)
                .map((fs) => [`\`${f.key}\``, `\`${fs.path ?? fs.name ?? ''}\``]),
            ),
          ),
        );
      }
      out.push('');
    }
  }

  const code = Object.entries(type.code ?? {});
  if (code.length > 0) {
    out.push('## Código', '');
    for (const [platform, entry] of code) {
      const where = [entry.symbol, entry.path].filter(Boolean).join(' em ');
      out.push(`- \`${platform}\`: ${where}${entry.notes ? ` (${entry.notes})` : ''}`);
    }
    out.push('');
  }
  return `${out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()}\n`;
}

const FONTS_README = `Fontes do pacote Material 3
===========================

A especialização (material3.spec.json) declara a Roboto em "fonts":

  - fonts/Roboto-Regular.ttf (peso 400)
  - fonts/Roboto-Medium.ttf  (peso 500)

Os arquivos .ttf NÃO estão no repositório (licença e peso). A Roboto é licenciada
sob Apache 2.0 e pode ser baixada em https://fonts.google.com/specimen/Roboto
(botão "Get font" / "Download all"); copie os dois arquivos acima para esta pasta,
com esses nomes.

Sem os arquivos, o desenho cai na fonte do sistema e o Diagnóstico mostra um aviso
por fonte ausente. O pacote continua válido.
`;

/** Tamanhos de container que a Material 3 oferece no diálogo Novo container (`formatVersion` 6). */
const CONTAINER_PRESETS = [
  { id: 'phone', name: 'Celular', width: 360, height: 800 },
  { id: 'phone-large', name: 'Celular grande', width: 412, height: 915 },
  { id: 'tablet', name: 'Tablet', width: 800, height: 1280 },
  { id: 'desktop', name: 'Desktop', width: 1440, height: 900 },
] as const;

/** Todos os arquivos do pacote, com caminhos relativos a `examples/libraries/material3/`. */
export function libraryExampleFiles(): LibraryExampleFile[] {
  const base = structuredClone(M3_SPEC) as unknown as RawSpec;
  // O pacote publicado usa a `formatVersion` 6, que acrescenta `containers` logo depois de
  // `description` (a especialização do laboratório continua na 4).
  const {
    format,
    formatVersion: _version,
    id,
    name,
    version,
    description,
    ...rest
  } = base;
  void _version;
  const spec: RawSpec = {
    format,
    formatVersion: 6,
    id,
    name,
    version,
    description,
    containers: CONTAINER_PRESETS.map((c) => ({ ...c })),
    ...rest,
  } as RawSpec;
  const byId = new Map<string, ComponentFile>(M3_COMPONENTS.map((c) => [c.id, c]));
  const files: LibraryExampleFile[] = [];
  const docs: LibraryExampleFile[] = [];

  for (const layer of spec.layers) {
    for (const type of layer.annotationTypes) {
      if (!type.component) continue;
      const id = type.component.replace(/^components\//, '').replace(/\.json$/, '');
      const component = byId.get(id);
      if (!component)
        throw new Error(`${type.id}: componente ${id} não existe em M3_COMPONENTS`);
      type.doc = `docs/${id}.md`;
      type.examples = buildExamples(type, component);
      docs.push({ path: type.doc, text: renderDoc(type, component) });
    }
  }
  const origin = spec.origins[0];
  if (!origin) throw new Error('M3_SPEC sem origins');
  origin.examples = [{ name: 'Configurações', file: 'examples/settings.sdui.json' }];

  files.push({ path: 'material3.spec.json', text: toJson(spec) });
  for (const c of M3_COMPONENTS) {
    files.push({ path: `components/${c.id}.json`, text: toJson(c) });
  }
  files.push(...docs);
  files.push({ path: 'examples/settings.sdui.json', text: toJson(settings) });
  files.push({ path: 'fonts/LEIA-ME.txt', text: FONTS_README });
  return files;
}
