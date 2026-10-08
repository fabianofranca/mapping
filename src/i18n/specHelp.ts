import type { Locale } from '../store/settings';

/** Bloco de conteúdo da página "Ajuda → Especializações". */
export type HelpBlock =
  | { readonly kind: 'p'; readonly text: string }
  | { readonly kind: 'list'; readonly items: readonly string[] }
  | {
      readonly kind: 'terms';
      readonly items: readonly { readonly term: string; readonly text: string }[];
    }
  | { readonly kind: 'code'; readonly code: string };

export interface HelpSection {
  readonly id: string;
  readonly title: string;
  readonly blocks: readonly HelpBlock[];
}

/** Trecho do exemplo SDUI (igual nos dois idiomas: é o formato do arquivo). */
const SDUI_EXCERPT = `{
  "format": "mapping-spec",
  "formatVersion": 1,
  "id": "sdui",
  "name": "SDUI",
  "version": 1,
  "layers": [
    {
      "id": "componentes",
      "name": "Componentes",
      "color": "#1E88E5",
      "annotationTypes": [
        {
          "id": "button",
          "name": "Button",
          "allowedChildren": ["onClick"],
          "fields": [
            { "key": "id", "type": "string", "required": true },
            { "key": "estilo", "type": "enum",
              "options": ["primary", "secondary"], "default": "primary" }
          ]
        },
        {
          "id": "input",
          "name": "Input",
          "fields": [
            { "key": "id", "type": "string", "required": true },
            { "key": "dado", "type": "ref",
              "accepts": { "tags": ["data-field"], "free": true } }
          ]
        }
      ]
    },
    {
      "id": "eventos",
      "name": "Eventos",
      "color": "#FB8C00",
      "annotationTypes": [
        {
          "id": "onClick",
          "name": "onClick",
          "requiresOwner": true,
          "fields": [
            { "key": "acao", "type": "enum",
              "options": ["navigate", "submit"], "required": true }
          ]
        }
      ]
    }
  ]
}`;

/** Trecho de uma especialização v2: plataforma, `code` de um tipo e um campo `codeRef`. */
const CODE_EXCERPT = `{
  "format": "mapping-spec",
  "formatVersion": 2,
  "id": "sdui",
  "name": "SDUI",
  "version": 2,
  "platforms": [
    { "id": "app", "name": "App", "language": "typescript" }
  ],
  "layers": [
    {
      "id": "componentes",
      "name": "Componentes",
      "color": "#1E88E5",
      "annotationTypes": [
        {
          "id": "button",
          "name": "Button",
          "fields": [
            { "key": "texto", "type": "string", "required": true },
            { "key": "estilo", "type": "enum",
              "options": ["primary", "secondary"], "default": "primary" }
          ],
          "code": {
            "app": {
              "symbol": "DSButton",
              "params": { "texto": "text", "estilo": "style" },
              "values": {
                "estilo": {
                  "primary": "ButtonStyle.Primary",
                  "secondary": "ButtonStyle.Secondary"
                }
              },
              "notes": "Passe o id como testId."
            }
          }
        }
      ]
    },
    {
      "id": "telas",
      "name": "Telas",
      "color": "#00897B",
      "annotationTypes": [
        {
          "id": "screen",
          "name": "Screen",
          "labelField": "nome",
          "fields": [
            { "key": "nome", "type": "string", "required": true },
            { "key": "implementacao", "type": "codeRef" }
          ]
        }
      ]
    }
  ]
}`;

const ptBR: readonly HelpSection[] = [
  {
    id: 'concept',
    title: 'O que é uma especialização',
    blocks: [
      {
        kind: 'p',
        text: 'Uma especialização é um arquivo JSON que define camadas obrigatórias e os tipos de anotação que podem ser criados nelas. Ex: a SDUI traz a camada Componentes (Button, Input…) e a camada Eventos (onClick, onHold…). Ao criar um Button, as chaves já vêm definidas e só falta preencher os valores.',
      },
      {
        kind: 'list',
        items: [
          'Um projeto pode aplicar várias especializações, a qualquer momento (botão Especializações).',
          'Uma especialização não cita outra pelo nome. A ligação entre elas é feita por referências fortes (tipo ref), que escolhem os alvos por etiquetas.',
          'Camadas da especialização só aceitam anotações tipadas, sem chaves extras. Camadas criadas por você continuam livres.',
          'A especialização aplicada é copiada para specs/<id>.json dentro do projeto, que fica autocontido.',
        ],
      },
    ],
  },
  {
    id: 'format',
    title: 'Formato do arquivo',
    blocks: [
      {
        kind: 'p',
        text: 'Na raiz: format (sempre "mapping-spec"), formatVersion (1 ou 2), id, name e version (inteiro ≥ 1) são obrigatórios; description e platforms são opcionais. Cada camada tem id (único), name, color (#RRGGBB) e annotationTypes.',
      },
      { kind: 'p', text: 'Tipo de anotação (annotationTypes):' },
      {
        kind: 'terms',
        items: [
          { term: 'id', text: 'Obrigatório. Único na especialização inteira.' },
          { term: 'name', text: 'Obrigatório. Nome exibido (ex: "Button").' },
          { term: 'description', text: 'Texto de ajuda.' },
          {
            term: 'labelField',
            text: 'Chave de um campo string cujo valor é o rótulo da instância quando o nome da anotação está vazio.',
          },
          {
            term: 'requiresOwner',
            text: 'Padrão false. A anotação precisa ter exatamente um dono.',
          },
          {
            term: 'allowedChildren',
            text: 'Ids dos tipos que podem ser vinculados a este.',
          },
          { term: 'fields', text: 'Obrigatório. Lista de campos (pode ser vazia).' },
          {
            term: 'code',
            text: 'Opcional (formatVersion 2). Como o tipo vira código em cada plataforma declarada.',
          },
        ],
      },
      { kind: 'p', text: 'Campo (fields):' },
      {
        kind: 'terms',
        items: [
          {
            term: 'key',
            text: 'Obrigatório. Chave gravada no JSON: [A-Za-z0-9_], sem começar com _ (reservado). Única no tipo.',
          },
          { term: 'label', text: 'Rótulo exibido (pode ter acentos). Padrão: a key.' },
          {
            term: 'type',
            text: 'Obrigatório: string, number, date, enum, table, ref ou codeRef.',
          },
          {
            term: 'required',
            text: 'Padrão false. Vazio é permitido ao salvar, mas a anotação fica incompleta.',
          },
          {
            term: 'default',
            text: 'Valor inicial, válido para o tipo. Não existe para table, ref nem codeRef.',
          },
          { term: 'options', text: 'Só enum: lista não vazia de strings únicas.' },
          {
            term: 'columns',
            text: 'Só table: campos simples (string, number, date ou enum).',
          },
          {
            term: 'tags',
            text: 'Etiquetas ([a-z0-9-]+) que tornam o campo alvo de referências. Em table, cada linha vira um alvo.',
          },
          {
            term: 'rowLabel',
            text: 'Obrigatório em table com tags: coluna string que nomeia cada linha.',
          },
          {
            term: 'accepts',
            text: 'Só ref: { "tags": [...], "free": true|false }. Precisa de pelo menos uma etiqueta ou free: true.',
          },
          {
            term: 'platforms',
            text: 'Só codeRef: subconjunto das plataformas declaradas (padrão: todas).',
          },
          { term: 'description', text: 'Texto de ajuda exibido no editor.' },
        ],
      },
    ],
  },
  {
    id: 'values',
    title: 'Tipos de valor',
    blocks: [
      {
        kind: 'terms',
        items: [
          { term: 'string', text: 'Texto.' },
          { term: 'number', text: 'Número, inteiro ou decimal.' },
          { term: 'date', text: 'Data ISO AAAA-MM-DD.' },
          {
            term: 'enum',
            text: 'Uma das options. Booleanos são enum (ex: ["sim", "não"]).',
          },
          {
            term: 'table',
            text: 'Lista de linhas; cada linha tem as chaves das columns e um _id interno.',
          },
          {
            term: 'ref',
            text: 'Referência forte a uma tupla de outra anotação. O valor do campo é a referência.',
          },
          {
            term: 'codeRef',
            text: 'Onde a instância foi implementada, por plataforma (caminho do arquivo, símbolo e linha).',
          },
        ],
      },
    ],
  },
  {
    id: 'relations',
    title: 'Relações entre anotações',
    blocks: [
      { kind: 'p', text: 'Valem sempre dentro da mesma especialização.' },
      {
        kind: 'list',
        items: [
          'allowedChildren: tipos que podem ser vinculados a este (ex: um Button aceita onClick e onHold). Um dono pode ter vários filhos, inclusive do mesmo tipo. Os filhos ficam em outra camada.',
          'requiresOwner: true: a anotação precisa de exatamente um dono, de um tipo que a liste em allowedChildren. Ex: um evento sem componente não faz sentido.',
          'No editor do dono aparecem botões "+ filho" (ex: "+ onClick") que criam a anotação já vinculada.',
        ],
      },
    ],
  },
  {
    id: 'refs',
    title: 'Referências e etiquetas',
    blocks: [
      { kind: 'p', text: 'Um campo ref aponta para um alvo. São alvos válidos:' },
      {
        kind: 'list',
        items: [
          'tuplas de anotações livres, se accepts.free for true;',
          'campos de anotações tipadas (de qualquer especialização aplicada) cujas tags contenham alguma etiqueta de accepts.tags. Numa table com tags, cada linha é um alvo, nomeada pela coluna rowLabel.',
        ],
      },
      {
        kind: 'p',
        text: 'O alvo pode estar em qualquer marcação e imagem do projeto. Referências são por id: sobrevivem a renomear a chave da tupla. Se o alvo for excluído, a referência fica quebrada e a anotação aparece como incompleta; o desfazer restaura tudo.',
      },
      {
        kind: 'p',
        text: 'Etiquetas recomendadas (reutilize em novas especializações):',
      },
      {
        kind: 'terms',
        items: [
          {
            term: 'data-field',
            text: 'Atributo de um modelo de dados (classe, entidade, DTO).',
          },
        ],
      },
    ],
  },
  {
    id: 'code',
    title: 'Plataformas, code e codeRef',
    blocks: [
      {
        kind: 'p',
        text: 'A formatVersion 2 liga a especialização ao código: ela declara as plataformas (um app, um contrato de API…) e como cada tipo vira código em cada uma. A formatVersion 1 continua válida (é a 2 sem plataformas e sem code).',
      },
      {
        kind: 'terms',
        items: [
          {
            term: 'platforms',
            text: 'Na raiz, opcional. Lista de { id, name, language }: id no formato [a-z0-9-]+ e único; name é exibido; language é informativo (ajuda o agente).',
          },
          {
            term: 'code',
            text: 'Em cada tipo de anotação, opcional, por id de plataforma declarada, com as propriedades abaixo.',
          },
          {
            term: 'symbol',
            text: 'Obrigatório em cada entrada de code: componente ou tipo que implementa o tipo naquela plataforma.',
          },
          {
            term: 'params',
            text: 'Chave do campo do tipo → nome do parâmetro no código. Campos fora de params não são passados.',
          },
          {
            term: 'values',
            text: 'Só para campos enum: valor no mapping → valor no código. Valor sem tradução é passado como está.',
          },
          { term: 'notes', text: 'Orientação livre para o agente.' },
          {
            term: 'codeRef',
            text: 'Tipo de campo que registra onde a instância foi implementada. O platforms do campo é opcional e restringe as plataformas permitidas. Não é permitido em colunas de table nem como default.',
          },
        ],
      },
      {
        kind: 'p',
        text: 'code e codeRef só valem em especializações que declaram platforms; os ids citados precisam estar em platforms, e as chaves de params e values precisam ser campos do tipo.',
      },
      { kind: 'code', code: CODE_EXCERPT },
    ],
  },
  {
    id: 'validation',
    title: 'Regras de validação',
    blocks: [
      {
        kind: 'p',
        text: 'Ao aplicar, as mensagens de erro trazem o caminho, ex: layers[1].annotationTypes[0].fields[2].type: "numero" inválido; use "number".',
      },
      {
        kind: 'list',
        items: [
          'format, formatVersion (1 ou 2), id, name e version obrigatórios; version inteiro ≥ 1;',
          'ids de camada únicos; ids de tipo únicos na especialização inteira; key única no tipo e nas colunas; nenhuma key começando com _;',
          'allowedChildren só referencia tipos existentes em outra camada;',
          'todo tipo com requiresOwner: true aparece no allowedChildren de algum tipo;',
          'default compatível com o tipo (e presente em options no enum); ref e codeRef sem default;',
          'columns só com tipos simples (codeRef não pode ser coluna); rowLabel obrigatório em table com tags e apontando para uma coluna string;',
          'labelField aponta para um campo string do tipo;',
          'accepts com pelo menos uma etiqueta ou free: true; etiquetas no formato [a-z0-9-]+;',
          'platforms: id no formato [a-z0-9-]+, único, e name obrigatório; platforms, code e codeRef só na formatVersion 2;',
          'code e codeRef só em especializações com platforms; os ids de code e do platforms do campo precisam existir em platforms;',
          'chaves de params e values precisam ser campos do tipo; values só para enum, com chaves que existam em options; symbol obrigatório;',
          'color no formato #RRGGBB; propriedades desconhecidas são rejeitadas.',
        ],
      },
    ],
  },
  {
    id: 'example',
    title: 'Exemplo comentado: SDUI',
    blocks: [
      { kind: 'code', code: SDUI_EXCERPT },
      {
        kind: 'list',
        items: [
          'Duas camadas: Componentes e Eventos, cada uma com seus tipos.',
          'Button: id é obrigatório (sem ele a anotação fica incompleta) e estilo já vem como primary (default).',
          'Button lista onClick em allowedChildren, e onClick tem requiresOwner: um onClick só existe ligado a um Button.',
          'Input.dado é um ref: aceita atributos com a etiqueta data-field (ex: as linhas de atributos da Classe, do Modelo de dados) e também tuplas de anotações livres.',
          'O exemplo completo (com table, number, labelField e outros) pode ser baixado abaixo.',
        ],
      },
    ],
  },
];

const enUS: readonly HelpSection[] = [
  {
    id: 'concept',
    title: 'What a specialization is',
    blocks: [
      {
        kind: 'p',
        text: 'A specialization is a JSON file that defines required layers and the annotation types that can be created in them. E.g. SDUI brings the Components layer (Button, Input…) and the Events layer (onClick, onHold…). When you create a Button, its keys are already defined and you only fill in the values.',
      },
      {
        kind: 'list',
        items: [
          'A project can apply several specializations, at any time (Specializations button).',
          'A specialization never names another one. They are linked through strong references (ref type), which pick their targets by tags.',
          'Specialization layers only accept typed annotations, with no extra keys. Layers you create yourself stay free-form.',
          'The applied specialization is copied to specs/<id>.json inside the project, which stays self-contained.',
        ],
      },
    ],
  },
  {
    id: 'format',
    title: 'File format',
    blocks: [
      {
        kind: 'p',
        text: 'At the root: format (always "mapping-spec"), formatVersion (1 or 2), id, name and version (integer ≥ 1) are required; description and platforms are optional. Each layer has id (unique), name, color (#RRGGBB) and annotationTypes.',
      },
      { kind: 'p', text: 'Annotation type (annotationTypes):' },
      {
        kind: 'terms',
        items: [
          {
            term: 'id',
            text: 'Required. Unique across the whole specialization.',
          },
          { term: 'name', text: 'Required. Display name (e.g. "Button").' },
          { term: 'description', text: 'Help text.' },
          {
            term: 'labelField',
            text: 'Key of a string field whose value is the instance label when the annotation name is empty.',
          },
          {
            term: 'requiresOwner',
            text: 'Defaults to false. The annotation must have exactly one owner.',
          },
          {
            term: 'allowedChildren',
            text: 'Ids of the types that can be linked to this one.',
          },
          { term: 'fields', text: 'Required. List of fields (may be empty).' },
          {
            term: 'code',
            text: 'Optional (formatVersion 2). How the type becomes code on each declared platform.',
          },
        ],
      },
      { kind: 'p', text: 'Field (fields):' },
      {
        kind: 'terms',
        items: [
          {
            term: 'key',
            text: 'Required. Key written to the JSON: [A-Za-z0-9_], must not start with _ (reserved). Unique in the type.',
          },
          { term: 'label', text: 'Display label (may have accents). Defaults to key.' },
          {
            term: 'type',
            text: 'Required: string, number, date, enum, table, ref or codeRef.',
          },
          {
            term: 'required',
            text: 'Defaults to false. Empty is allowed on save, but the annotation becomes incomplete.',
          },
          {
            term: 'default',
            text: 'Initial value, valid for the type. Does not exist for table, ref or codeRef.',
          },
          { term: 'options', text: 'enum only: non-empty list of unique strings.' },
          {
            term: 'columns',
            text: 'table only: simple fields (string, number, date or enum).',
          },
          {
            term: 'tags',
            text: 'Tags ([a-z0-9-]+) that make the field a reference target. In a table, each row becomes a target.',
          },
          {
            term: 'rowLabel',
            text: 'Required on a table with tags: the string column that names each row.',
          },
          {
            term: 'accepts',
            text: 'ref only: { "tags": [...], "free": true|false }. Needs at least one tag or free: true.',
          },
          {
            term: 'platforms',
            text: 'codeRef only: a subset of the declared platforms (default: all).',
          },
          { term: 'description', text: 'Help text shown in the editor.' },
        ],
      },
    ],
  },
  {
    id: 'values',
    title: 'Value types',
    blocks: [
      {
        kind: 'terms',
        items: [
          { term: 'string', text: 'Text.' },
          { term: 'number', text: 'Number, integer or decimal.' },
          { term: 'date', text: 'ISO date YYYY-MM-DD.' },
          {
            term: 'enum',
            text: 'One of the options. Booleans are enums (e.g. ["yes", "no"]).',
          },
          {
            term: 'table',
            text: 'List of rows; each row has the keys of the columns plus an internal _id.',
          },
          {
            term: 'ref',
            text: 'Strong reference to a tuple of another annotation. The field value is the reference.',
          },
          {
            term: 'codeRef',
            text: 'Where the instance was implemented, per platform (file path, symbol and line).',
          },
        ],
      },
    ],
  },
  {
    id: 'relations',
    title: 'Relations between annotations',
    blocks: [
      { kind: 'p', text: 'They always hold within the same specialization.' },
      {
        kind: 'list',
        items: [
          'allowedChildren: types that can be linked to this one (e.g. a Button accepts onClick and onHold). An owner can have many children, even of the same type. Children live in another layer.',
          'requiresOwner: true: the annotation needs exactly one owner, of a type that lists it in allowedChildren. E.g. an event without a component makes no sense.',
          'The owner’s editor shows "+ child" buttons (e.g. "+ onClick") that create the annotation already linked.',
        ],
      },
    ],
  },
  {
    id: 'refs',
    title: 'References and tags',
    blocks: [
      { kind: 'p', text: 'A ref field points to a target. Valid targets are:' },
      {
        kind: 'list',
        items: [
          'tuples of free-form annotations, if accepts.free is true;',
          'fields of typed annotations (from any applied specialization) whose tags contain one of the accepts.tags. In a table with tags, each row is a target, named by the rowLabel column.',
        ],
      },
      {
        kind: 'p',
        text: 'The target can be in any marking and image of the project. References are by id: they survive renaming the tuple key. If the target is deleted, the reference becomes broken and the annotation shows as incomplete; undo restores everything.',
      },
      {
        kind: 'p',
        text: 'Recommended tags (reuse them in new specializations):',
      },
      {
        kind: 'terms',
        items: [
          {
            term: 'data-field',
            text: 'Attribute of a data model (class, entity, DTO).',
          },
        ],
      },
    ],
  },
  {
    id: 'code',
    title: 'Platforms, code and codeRef',
    blocks: [
      {
        kind: 'p',
        text: 'formatVersion 2 links the specialization to code: it declares the platforms (an app, an API contract…) and how each type becomes code on each one. formatVersion 1 is still valid (it is version 2 without platforms and without code).',
      },
      {
        kind: 'terms',
        items: [
          {
            term: 'platforms',
            text: 'At the root, optional. List of { id, name, language }: id in the [a-z0-9-]+ format and unique; name is displayed; language is informational (it helps the agent).',
          },
          {
            term: 'code',
            text: 'On each annotation type, optional, by declared platform id, with the properties below.',
          },
          {
            term: 'symbol',
            text: 'Required in each code entry: the component or type that implements the type on that platform.',
          },
          {
            term: 'params',
            text: 'Key of a type field → parameter name in the code. Fields outside params are not passed.',
          },
          {
            term: 'values',
            text: 'Only for enum fields: value in the mapping → value in the code. A value without a translation is passed as is.',
          },
          { term: 'notes', text: 'Free-form guidance for the agent.' },
          {
            term: 'codeRef',
            text: 'Field type that records where the instance was implemented. The field’s platforms is optional and restricts the allowed platforms. It is not allowed as a table column or as a default.',
          },
        ],
      },
      {
        kind: 'p',
        text: 'code and codeRef only work in specializations that declare platforms; the ids they cite must exist in platforms, and the keys of params and values must be fields of the type.',
      },
      { kind: 'code', code: CODE_EXCERPT },
    ],
  },
  {
    id: 'validation',
    title: 'Validation rules',
    blocks: [
      {
        kind: 'p',
        text: 'When applying, error messages carry the path, e.g. layers[1].annotationTypes[0].fields[2].type: "numero" is invalid; use "number".',
      },
      {
        kind: 'list',
        items: [
          'format, formatVersion (1 or 2), id, name and version required; version an integer ≥ 1;',
          'unique layer ids; type ids unique across the whole specialization; key unique in the type and in the columns; no key starting with _;',
          'allowedChildren only references existing types in another layer;',
          'every type with requiresOwner: true appears in the allowedChildren of some type;',
          'default compatible with the type (and present in options for enum); ref and codeRef without default;',
          'columns with simple types only (codeRef cannot be a column); rowLabel required on a table with tags and pointing to a string column;',
          'labelField points to a string field of the type;',
          'accepts with at least one tag or free: true; tags in the [a-z0-9-]+ format;',
          'platforms: id in the [a-z0-9-]+ format, unique, and name required; platforms, code and codeRef only in formatVersion 2;',
          'code and codeRef only in specializations with platforms; the ids in code and in the field’s platforms must exist in platforms;',
          'keys of params and values must be fields of the type; values only for enum, with keys that exist in options; symbol required;',
          'color in the #RRGGBB format; unknown properties are rejected.',
        ],
      },
    ],
  },
  {
    id: 'example',
    title: 'Annotated example: SDUI',
    blocks: [
      { kind: 'code', code: SDUI_EXCERPT },
      {
        kind: 'list',
        items: [
          'Two layers: Componentes and Eventos, each with its own types.',
          'Button: id is required (without it the annotation is incomplete) and estilo starts as primary (default).',
          'Button lists onClick in allowedChildren, and onClick has requiresOwner: an onClick only exists attached to a Button.',
          'Input.dado is a ref: it accepts attributes with the data-field tag (e.g. the attribute rows of the Data model’s Class) and also tuples of free-form annotations.',
          'The full example (with table, number, labelField and more) can be downloaded below.',
        ],
      },
    ],
  },
];

const content: Record<Locale, readonly HelpSection[]> = { 'pt-BR': ptBR, 'en-US': enUS };

export function specHelpSections(locale: Locale): readonly HelpSection[] {
  return content[locale];
}
