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
  "formatVersion": 5,
  "id": "sdui",
  "name": "SDUI",
  "version": 3,
  "platforms": [
    {
      "id": "android",
      "name": "Android",
      "language": "kotlin",
      "repo": {
        "url": "https://github.com/org/app-android",
        "urlTemplate": "https://github.com/org/app-android/blob/v3/{path}",
        "ref": "v3"
      }
    },
    {
      "id": "bff",
      "name": "BFF",
      "language": "kotlin",
      "repo": {
        "url": "https://github.com/org/bff",
        "urlTemplate": "https://github.com/org/bff/blob/v3/{path}",
        "ref": "v3"
      }
    }
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
          "allowedChildren": [
            "onClick"
          ],
          "fields": [
            {
              "key": "id",
              "type": "string",
              "required": true
            },
            {
              "key": "estilo",
              "type": "enum",
              "options": [
                "primary",
                "secondary"
              ],
              "default": "primary"
            }
          ],
          "code": {
            "android": {
              "symbol": "com.app.ds.DSButton",
              "path": "app/src/main/java/com/app/ds/DSButton.kt",
              "params": {
                "id": "testId",
                "estilo": "style"
              },
              "values": {
                "estilo": {
                  "primary": "ButtonStyle.Primary",
                  "secondary": "ButtonStyle.Secondary"
                }
              }
            },
            "bff": {
              "symbol": "com.app.bff.sdui.button",
              "path": "src/main/kotlin/com/app/bff/sdui/Components.kt",
              "params": {
                "id": "id",
                "estilo": "variant"
              },
              "notes": "A função devolve o nó do componente no JSON da tela."
            }
          }
        },
        {
          "id": "input",
          "name": "Input",
          "fields": [
            {
              "key": "id",
              "type": "string",
              "required": true
            },
            {
              "key": "dado",
              "type": "ref",
              "accepts": {
                "tags": [
                  "data-field"
                ],
                "free": true
              }
            }
          ],
          "code": {
            "android": {
              "symbol": "com.app.ds.DSTextField",
              "path": "app/src/main/java/com/app/ds/DSTextField.kt",
              "params": {
                "id": "testId"
              }
            },
            "bff": {
              "symbol": "com.app.bff.sdui.input",
              "path": "src/main/kotlin/com/app/bff/sdui/Components.kt",
              "params": {
                "id": "id"
              },
              "notes": "A função devolve o nó do componente no JSON da tela."
            }
          }
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
            {
              "key": "acao",
              "type": "enum",
              "options": [
                "navigate",
                "submit"
              ],
              "required": true
            }
          ],
          "code": {
            "android": {
              "symbol": "com.app.ds.OnClick",
              "path": "app/src/main/java/com/app/ds/OnClick.kt",
              "params": {
                "acao": "action"
              }
            },
            "bff": {
              "symbol": "com.app.bff.sdui.onClick",
              "path": "src/main/kotlin/com/app/bff/sdui/Events.kt",
              "params": {
                "acao": "action"
              },
              "notes": "A função devolve o nó do evento no JSON da tela."
            }
          }
        }
      ]
    }
  ]
}`;

/** Trecho de uma especialização v6: os tamanhos prontos de container (`containers`). */
const CONTAINERS_EXCERPT = `{
  "formatVersion": 6,
  "containers": [
    { "id": "phone", "name": "Celular", "width": 360, "height": 800 },
    { "id": "tablet", "name": "Tablet", "width": 800, "height": 1280, "background": "#FAFAFA" }
  ]
}`;

/** Trecho de uma especialização v7: o tipo flutuante (`floating`). */
const FLOATING_EXCERPT = `{
  "formatVersion": 7,
  "layers": [
    {
      "id": "notas",
      "name": "Notas",
      "color": "#F5C400",
      "annotationTypes": [
        {
          "id": "nota",
          "name": "Nota",
          "floating": true,
          "fields": [{ "key": "texto", "label": "Texto", "type": "string", "required": true }]
        }
      ]
    }
  ]
}`;

/** Trecho de uma especialização v7: o tipo aplicado à seta (`appliesTo`). */
const APPLIES_TO_EXCERPT = `{
  "id": "deep-link",
  "name": "Deep link",
  "appliesTo": ["arrow"],
  "fields": [{ "key": "uri", "label": "URI", "type": "string", "required": true }]
}`;

/** Trecho de uma especialização v10: avisos (`notices`) em tipo e campo. */
const NOTICES_EXCERPT = `{
  "id": "alert",
  "name": "Alert",
  "notices": [
    {
      "kind": "pending",
      "message": "O contrato aceita avatarVariant; o SDK do BFF ainda não tem.",
      "since": "2026-11-04",
      "ref": "cross/sdui/all/pe-core/base/plugins/alert.md"
    }
  ],
  "fields": [
    {
      "key": "legacyStyle",
      "type": "string",
      "notices": [{ "kind": "deprecated", "message": "Use variant." }]
    }
  ]
}`;

/** Trecho de uma especialização v11: filhos por camada e grupo (cláusula em `allowedChildren` e `groups`). */
const CHILDREN_EXCERPT = `{
  "formatVersion": 11,
  "layers": [
    {
      "id": "componentes",
      "name": "Componentes",
      "color": "#1E88E5",
      "annotationTypes": [
        {
          "id": "button",
          "name": "Button",
          "allowedChildren": [{ "layer": "eventos" }],
          "fields": []
        },
        {
          "id": "card",
          "name": "Card",
          "allowedChildren": [{ "layer": "eventos", "groups": ["navegacao"] }, "submit"],
          "fields": []
        }
      ]
    },
    {
      "id": "eventos",
      "name": "Eventos",
      "color": "#E53935",
      "groups": [
        { "id": "navegacao", "name": "Navegação" },
        {
          "id": "dados",
          "name": "Dados",
          "description": "Eventos que leem ou gravam dados."
        }
      ],
      "annotationTypes": [
        {
          "id": "navigate",
          "name": "Navigate",
          "groups": ["navegacao"],
          "requiresOwner": true,
          "fields": [{ "key": "destino", "type": "string", "required": true }]
        },
        {
          "id": "back",
          "name": "Back",
          "groups": ["navegacao"],
          "requiresOwner": true,
          "fields": []
        },
        {
          "id": "submit",
          "name": "Submit",
          "groups": ["dados"],
          "requiresOwner": true,
          "fields": []
        }
      ]
    }
  ]
}`;

/** Trecho de uma especialização v11: os papéis (`childRoles`) de um dono. */
const ROLES_EXCERPT = `{
  "id": "button",
  "name": "Button",
  "allowedChildren": [{ "layer": "eventos" }],
  "childRolesLabel": "Trigger",
  "childRoles": [
    { "id": "click", "name": "Clique" },
    { "id": "hold", "name": "Pressionar", "description": "Toque longo no botão." }
  ],
  "fields": []
}`;

/** Trecho de uma especialização v11: `docRepos` na raiz e o `doc` do tipo como objeto. */
const DOC_REPOS_EXCERPT = `{
  "docRepos": [
    {
      "id": "design-docs",
      "url": "https://gitlab.empresa.com/grupo/design-docs",
      "urlTemplate": "https://gitlab.empresa.com/grupo/design-docs/-/blob/main/{path}",
      "ref": "main"
    }
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
          "doc": { "repo": "design-docs", "path": "components/button.md" },
          "allowedChildren": [{ "layer": "eventos" }],
          "childRolesLabel": "Trigger",
          "childRoles": [
            { "id": "click", "name": "Clique" },
            { "id": "hold", "name": "Pressionar" }
          ],
          "fields": []
        }
      ]
    },
    {
      "id": "eventos",
      "name": "Eventos",
      "color": "#E53935",
      "groups": [{ "id": "navegacao", "name": "Navegação" }],
      "annotationTypes": [
        {
          "id": "navigate",
          "name": "Navigate",
          "groups": ["navegacao"],
          "requiresOwner": true,
          "fields": [{ "key": "destino", "type": "string", "required": true }]
        }
      ]
    }
  ]
}`;

/** Trecho de uma especialização v7: o "flutuante que aponta" (tabela flutuante com coluna `ref`). */
const POINTING_EXCERPT = `{
  "id": "tabela-eventos",
  "name": "Tabela de eventos",
  "floating": true,
  "component": "components/tabela-eventos.json",
  "fields": [
    {
      "key": "eventos",
      "type": "table",
      "columns": [
        { "key": "evento", "type": "string" },
        { "key": "tela", "type": "ref", "accepts": { "tags": ["screen"] } }
      ]
    }
  ]
}`;

/** Trecho de uma especialização v5: as plataformas com `repo` e o `code` de um tipo. */
const CODE_EXCERPT = `{
  "format": "mapping-spec",
  "formatVersion": 5,
  "id": "sdui",
  "name": "SDUI",
  "version": 3,
  "platforms": [
    {
      "id": "android",
      "name": "Android",
      "language": "kotlin",
      "repo": {
        "url": "https://github.com/org/app-android",
        "urlTemplate": "https://github.com/org/app-android/blob/v3/{path}",
        "ref": "v3"
      }
    },
    {
      "id": "bff",
      "name": "BFF",
      "language": "kotlin",
      "repo": {
        "url": "https://github.com/org/bff",
        "urlTemplate": "https://github.com/org/bff/blob/v3/{path}",
        "ref": "v3"
      }
    }
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
            {
              "key": "id",
              "type": "string",
              "required": true
            },
            {
              "key": "estilo",
              "type": "enum",
              "options": [
                "primary",
                "secondary"
              ],
              "default": "primary"
            }
          ],
          "code": {
            "android": {
              "symbol": "com.app.ds.DSButton",
              "path": "app/src/main/java/com/app/ds/DSButton.kt",
              "params": {
                "id": "testId",
                "estilo": "style"
              },
              "values": {
                "estilo": {
                  "primary": "ButtonStyle.Primary",
                  "secondary": "ButtonStyle.Secondary"
                }
              },
              "notes": "Chame o composable DSButton; o id vai em testId."
            },
            "bff": {
              "symbol": "com.app.bff.sdui.button",
              "path": "src/main/kotlin/com/app/bff/sdui/Components.kt",
              "params": {
                "id": "id",
                "estilo": "variant"
              },
              "notes": "A função devolve o nó do componente no JSON da tela."
            }
          }
        }
      ]
    }
  ]
}`;

/** Trecho de uma especialização v3: as origens (`sources`) de um tipo e de seus campos. */
const SOURCES_EXCERPT = `{
  "id": "button",
  "name": "Button",
  "sources": [{ "system": "figma", "id": "3f2a9c", "name": "DS/Button" }],
  "fields": [
    {
      "key": "estilo",
      "type": "enum",
      "options": ["primary", "secondary", "text"],
      "sources": [
        {
          "system": "figma",
          "name": "Style",
          "values": { "Primary": "primary", "Secondary": "secondary", "Text": "text" }
        }
      ]
    },
    {
      "key": "texto",
      "type": "string",
      "sources": [{ "system": "figma", "name": "Label" }]
    }
  ]
}`;

/** Trecho da declaração de origem executável (`origins`, v4). */
const ORIGINS_EXCERPT = `{
  "origins": [
    {
      "system": "sdui",
      "node": { "type": "type", "props": "props", "children": "children" },
      "screen": {
        "id": { "path": "screen.id" },
        "width": { "path": "screen.device.width" },
        "height": { "path": "screen.device.height" },
        "background": {
          "path": "screen.background",
          "values": { "surface": "#FEF7FF" },
          "default": "#FFFFFF"
        },
        "roots": [
          { "path": "content" },
          { "path": "bottomBar", "anchor": "bottom" },
          {
            "path": "floating[*]",
            "anchor": { "path": "anchor" },
            "margin": { "path": "margin" }
          },
          { "path": "modal", "anchor": "bottom", "scrim": "sdui-scrim" }
        ]
      },
      "booleans": { "true": "sim", "false": "não" },
      "examples": [{ "name": "Configurações", "file": "examples/settings.sdui.json" }]
    }
  ]
}`;

/** A árvore de um pacote de biblioteca (a pasta da especialização, v4). */
const PACKAGE_TREE = `sdui-backend/
  sdui-backend.spec.json       a especialização (formatVersion 9)
  components/sdui-button.json  um arquivo por componente (mapping-component)
  docs/sdui-button.md          o documento markdown do tipo
  examples/settings.sdui.json  uma tela de exemplo de um sistema externo
  fonts/Roboto-Regular.woff2   as fontes do desenho (opcional)`;

/** Trecho do contrato de versão (`migrations`, v4). */
const MIGRATIONS_EXCERPT = `{
  "migrations": [
    {
      "from": 1,
      "to": 2,
      "steps": [
        { "op": "rename-field", "type": "button", "from": "texto", "to": "label" },
        {
          "op": "map-values",
          "type": "button",
          "field": "variant",
          "values": { "primary": "filled" }
        },
        { "op": "fill-field", "type": "button", "field": "size", "default": "md" },
        { "op": "rename-type", "from": "chip", "to": "tag" },
        { "op": "remove-field", "type": "tag", "field": "legacy" },
        { "op": "remove-type", "type": "badge", "mode": "convert" }
      ]
    }
  ]
}`;

/** Uma especialização v12 completa: os passos de migração dos papéis (`rename-role`, `remove-role`, `set-role`). */
const ROLES_MIGRATION_EXCERPT = `{
  "format": "mapping-spec",
  "formatVersion": 12,
  "id": "loja",
  "name": "Loja",
  "version": 3,
  "layers": [
    {
      "id": "componentes",
      "name": "Componentes",
      "color": "#1E88E5",
      "annotationTypes": [
        {
          "id": "button",
          "name": "Button",
          "allowedChildren": [{ "layer": "eventos" }],
          "childRoles": [
            { "id": "click", "name": "Clique" },
            { "id": "hold", "name": "Pressionar" }
          ],
          "fields": []
        },
        {
          "id": "card",
          "name": "Card",
          "allowedChildren": [{ "layer": "eventos" }],
          "childRoles": [{ "id": "abrir", "name": "Abrir" }],
          "fields": []
        }
      ]
    },
    {
      "id": "eventos",
      "name": "Eventos",
      "color": "#43A047",
      "annotationTypes": [
        { "id": "navigate", "name": "Navigate", "requiresOwner": true, "fields": [] }
      ]
    }
  ],
  "migrations": [
    {
      "from": 2,
      "to": 3,
      "steps": [
        { "op": "rename-role", "type": "button", "from": "tap", "to": "click" },
        { "op": "remove-role", "type": "button", "role": "legado", "mode": "clear" },
        { "op": "set-role", "type": "card", "role": "abrir", "childType": "navigate" }
      ]
    }
  ]
}`;

/** Um problema do validador da biblioteca. */
const ISSUE_EXCERPT = `{
  "file": "sdui-backend.spec.json",
  "path": "layers[0].annotationTypes[2].component",
  "message": "arquivo não encontrado: components/sdui-fab.json",
  "severity": "error"
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
          'A formatVersion 12 acrescenta três passos de migração dos papéis em migrations: rename-role, remove-role e set-role (seções "Contrato de versão" e "Papéis no vínculo (childRoles)"). Tirar um papel de childRoles passa a ser quebra, e só sobe para a 12 quem declara um desses passos. As versões 1 a 11 continuam aceitas.',
          'A formatVersion 13 deixa allowedChildren listar tipos da camada do próprio dono: a cláusula { layer } da própria camada e o id de um tipo da mesma camada, inclusive o do próprio tipo (seção "Filhos por camada e grupo"). Assim um evento pode ser dono de outros eventos, cada filho no papel em que se liga. Só sobe para a 13 quem usa isso; as versões 1 a 12 continuam aceitas, e a cláusula da própria camada numa versão anterior é o erro de sempre: filhos devem estar em outra camada.',
          'A formatVersion 4 acrescenta a biblioteca: componentes que desenham os tipos, documentos, exemplos, fontes, origens executáveis e o contrato de versão (seções "Biblioteca: o pacote", "Contrato de versão" e "Validação da biblioteca").',
          'A formatVersion 5 é a 4 mais o repo nas plataformas: o repositório da biblioteca em cada plataforma, de onde vêm o link e a revisão do arquivo de cada symbol (seção "Plataformas e code").',
          'A formatVersion 6 é a 5 mais containers: os tamanhos prontos que o diálogo Novo container oferece quando a especialização está aplicada (seção "Containers (tamanhos prontos)"). O núcleo só tem Personalizado e Tamanho da seleção; as versões 1 a 5 continuam aceitas.',
          'A formatVersion 7 é a 6 mais floating no tipo de anotação (o tipo cuja instância é uma marcação flutuante, um comentário solto sobre o canvas: seção "Tipo flutuante"), appliesTo no tipo (onde a anotação se aplica: marcação, seta ou ambas: seção "Onde o tipo se aplica") e ref como tipo de coluna de table (uma lista de referências como dado). As versões 1 a 6 continuam aceitas.',
          'A formatVersion 8 acrescenta `suggestions` em campo e coluna `string` (vocabulário sugerido ao digitar, sem restringir o valor) e `linkedRef` (liga o texto a um campo/coluna `ref` do mesmo tipo/tabela: a lista de sugestões também mostra os alvos mapeados que esse `ref` aceita).',
          'A formatVersion 9 acrescenta `variants` na entrada de `code`: um campo enum do tipo escolhe a variante do código (em Compose, `Button`, `OutlinedButton` ou `TextButton`), que troca symbol, path e notes e soma params e values (seção "Plataformas e code"). As versões 1 a 8 continuam aceitas.',
          'A formatVersion 10 acrescenta `notices` no tipo, no campo e na coluna de table: avisos curtos (pendente, obsoleto, diverge, removido) que só informam, sem impedir nada (seção "Avisos (notices)"). As versões 1 a 9 continuam aceitas.',
          'A formatVersion 11 acrescenta três recursos opcionais: allowedChildren com cláusula { layer, groups } e os groups da camada e do tipo (seção "Filhos por camada e grupo"); childRoles e childRolesLabel no dono, os papéis em que um filho se liga a ele (seção "Papéis no vínculo (childRoles)"); e docRepos na raiz com o doc do tipo como objeto { repo, path }, um documento em repositório externo (seção "Documento em repositório externo (docRepos)"). As versões 1 a 10 continuam aceitas.',
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
        text: 'Na raiz: format (sempre "mapping-spec"), formatVersion (1 a 13), id, name e version (inteiro ≥ 1) são obrigatórios; description, platforms (com repo na versão 5), containers (a partir da versão 6), docRepos (a partir da versão 11) e, a partir da versão 4, fonts, origins e migrations são opcionais. Cada camada tem id (único), name, color (#RRGGBB) e annotationTypes, e, a partir da versão 11, groups opcional.',
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
            text: 'Os tipos que podem ser vinculados a este: ids de tipo e, a partir da formatVersion 11, cláusulas { layer, groups } (seção "Filhos por camada e grupo").',
          },
          {
            term: 'groups',
            text: 'Opcional (formatVersion 11). Ids dos grupos da própria camada a que o tipo pertence (seção "Filhos por camada e grupo").',
          },
          {
            term: 'childRoles',
            text: 'Opcional (formatVersion 11). Os papéis em que um filho se liga a este tipo (seção "Papéis no vínculo (childRoles)").',
          },
          {
            term: 'childRolesLabel',
            text: 'Opcional (formatVersion 11). O nome do seletor de papel, com childRoles; sem ele, "Papel".',
          },
          { term: 'fields', text: 'Obrigatório. Lista de campos (pode ser vazia).' },
          {
            term: 'code',
            text: 'Opcional (formatVersion 2). Como se cria uma instância do tipo em cada plataforma declarada.',
          },
          {
            term: 'component',
            text: 'Opcional (formatVersion 4). Caminho do arquivo .json do componente que desenha o tipo.',
          },
          {
            term: 'doc',
            text: 'Opcional (formatVersion 4). Caminho do documento .md do tipo; na formatVersion 11, também { repo, path }, um documento em repositório externo (seção "Documento em repositório externo (docRepos)").',
          },
          {
            term: 'examples',
            text: 'Opcional (formatVersion 4). Exemplos nomeados: valores dos campos do tipo ou o JSON de um sistema externo.',
          },
          {
            term: 'floating',
            text: 'Opcional (formatVersion 7). Padrão false. A instância é uma marcação flutuante (seção "Tipo flutuante").',
          },
          {
            term: 'appliesTo',
            text: 'Opcional (formatVersion 7). Lista de "marking" e/ou "arrow"; o padrão é ["marking"]. Diz a que a anotação se aplica (seção "Onde o tipo se aplica").',
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
            text: 'Obrigatório: string, number, date, enum, table ou ref.',
          },
          {
            term: 'required',
            text: 'Padrão false. Vazio é permitido ao salvar, mas a anotação fica incompleta.',
          },
          {
            term: 'default',
            text: 'Valor inicial, válido para o tipo. Não existe para table nem ref.',
          },
          { term: 'options', text: 'Só enum: lista não vazia de strings únicas.' },
          {
            term: 'columns',
            text: 'Só table: campos simples (string, number, date ou enum) e, a partir da formatVersion 7, ref (com accepts, como um campo ref; a célula é uma referência e não desenha seta).',
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
          'allowedChildren: tipos que podem ser vinculados a este (ex: um Button aceita onClick e onHold). Um dono pode ter vários filhos, inclusive do mesmo tipo. Os filhos ficam em outra camada (a partir da formatVersion 13, também na mesma camada do dono, quando a especialização declara). A partir da formatVersion 11, um item também pode ser uma cláusula que cobre uma camada ou os grupos dela (seção "Filhos por camada e grupo").',
          'requiresOwner: true: a anotação precisa de exatamente um dono, de um tipo que a liste em allowedChildren (por id ou pela cláusula que a cobre). Ex: um evento sem componente não faz sentido.',
          'childRoles (formatVersion 11): quando o mesmo tipo de filho se liga a pontos diferentes do dono, o ponto é um papel do vínculo (seção "Papéis no vínculo (childRoles)").',
          'No editor do dono aparecem botões "+ filho" (ex: "+ onClick") que criam a anotação já vinculada.',
        ],
      },
    ],
  },
  {
    id: 'children',
    title: 'Filhos por camada e grupo',
    blocks: [
      {
        kind: 'p',
        text: 'Até a formatVersion 10, allowedChildren lista os filhos um a um, por id. A formatVersion 11 deixa um item ser uma cláusula { "layer": "<id da camada>", "groups": ["<id>", …] } (groups é opcional) e deixa a camada declarar grupos (groups) a que os tipos dela pertencem. Assim um dono aceita uma camada inteira, ou só alguns grupos dela, sem repetir os ids e sem editar todos os donos quando a camada ganha um tipo.',
      },
      { kind: 'code', code: CHILDREN_EXCERPT },
      {
        kind: 'terms',
        items: [
          {
            term: 'layer',
            text: 'Obrigatório na cláusula. O id de uma camada da especialização, que não pode ser a do próprio dono antes da formatVersion 13 (filhos devem estar em outra camada); a partir da 13 pode. Sem groups, cobre todos os tipos da camada.',
          },
          {
            term: 'groups',
            text: 'Na cláusula: opcional e não vazio; cobre os tipos da camada que estão em algum dos grupos, e cada grupo precisa existir na camada da cláusula. Na camada: lista de { id, name, description? }, com id não vazio e único na camada e name não vazio; a ordem é a dos cabeçalhos. No tipo: lista não vazia, sem repetição, de grupos da própria camada.',
          },
        ],
      },
      {
        kind: 'list',
        items: [
          'O conjunto de filhos de um dono é a união dos itens de allowedChildren, na ordem deles; dentro de uma cláusula, os tipos vêm na ordem da camada; um tipo repetido fica na primeira posição. A cláusula só tem layer e groups: outra propriedade é erro.',
          'Um tipo sem groups só entra por uma cláusula da camada inteira ou pelo próprio id. requiresOwner é conferido no conjunto resolvido: o tipo precisa estar no conjunto de algum dono, por id, por camada ou por grupo.',
          'Avisos, que não bloqueiam: allowedChildren com 20 ids ou mais em texto (uma cláusula cobre a camada ou os grupos; com 19 não avisa) e grupo declarado que nenhum tipo usa.',
          'Fora do contrato de versão: incluir, mudar ou tirar groups, ou trocar uma lista de ids por uma cláusula, é compatível e nunca pede migração.',
          'Na mesma camada (formatVersion 13): a cláusula { layer } da própria camada e o id de um tipo da mesma camada, inclusive o do próprio tipo, valem em allowedChildren. Só a anotação tipada se vincula assim, e o ciclo continua barrado: uma anotação nunca é dona de si mesma nem de uma ancestral. Antes da 13, a camada do próprio dono é o erro de sempre.',
        ],
      },
    ],
  },
  {
    id: 'roles',
    title: 'Papéis no vínculo (childRoles)',
    blocks: [
      {
        kind: 'p',
        text: 'Um dono às vezes liga o mesmo tipo de filho em pontos diferentes dele: o Button tem um evento de clique e um de pressionar, e os dois são um navigate. Se o filho precisa dizer em que ponto do dono se liga, isso é um papel, não um campo do filho nem um id de tipo. A formatVersion 11 declara os papéis no dono, com childRoles, e um nome para o seletor, com childRolesLabel.',
      },
      { kind: 'code', code: ROLES_EXCERPT },
      {
        kind: 'terms',
        items: [
          {
            term: 'childRoles',
            text: 'Lista não vazia de { id, name, description? }, com id não vazio e único no tipo e name não vazio. O papel pertence ao vínculo, não ao filho: o mesmo tipo de filho pode ocupar papéis diferentes no mesmo dono. Só vale em tipo com allowedChildren.',
          },
          {
            term: 'childRolesLabel',
            text: 'Texto não vazio: o nome com que a app chama o seletor do papel (ex: "Trigger"). Só vale com childRoles. Sem ele, a app usa "Papel".',
          },
        ],
      },
      {
        kind: 'list',
        items: [
          'No contrato de versão (toda versão com papéis, da formatVersion 11 em diante; o passo que cobre a quebra é da formatVersion 12): o id do papel é dado que as anotações guardam (parentRole). Tirar um papel de um tipo, ou dar childRoles a um tipo que não tinha, é quebra e pede um passo rename-role, remove-role ou set-role em migrations; acrescentar um papel a um tipo que já tinha papéis é aditivo. Continuam fora do contrato o name e a description do papel, a ordem dos childRoles e o childRolesLabel.',
          'Numa versão anterior à 11 o erro é só é permitido com formatVersion 11, no caminho exato. Os passos de migração dos papéis são da formatVersion 12.',
        ],
      },
    ],
  },
  {
    id: 'docrepos',
    title: 'Documento em repositório externo (docRepos)',
    blocks: [
      {
        kind: 'p',
        text: 'Até a formatVersion 10, o doc de um tipo é um arquivo .md dentro do pacote. Quando a documentação do componente vive no repositório do design system ou do contrato, a formatVersion 11 declara na raiz os repositórios de documentos (docRepos) e deixa o doc do tipo apontar para um arquivo de um deles, sem copiá-lo para o pacote.',
      },
      { kind: 'code', code: DOC_REPOS_EXCERPT },
      {
        kind: 'terms',
        items: [
          {
            term: 'docRepos',
            text: 'Na raiz: lista de { id, url, urlTemplate?, ref? } com as mesmas regras do repo de uma plataforma (url http(s):// sem espaços; urlTemplate com {path}; ref informativa). O id segue [a-z0-9-]+ e é único na lista.',
          },
          {
            term: 'doc',
            text: 'Em texto, é o arquivo .md do pacote (como desde a formatVersion 4); como objeto { repo, path }, é um arquivo do repositório declarado em docRepos.',
          },
          { term: 'repo', text: 'O id de um repositório declarado em docRepos.' },
          {
            term: 'path',
            text: 'Relativo à raiz do repositório, com /, sem ., .. nem / no começo (como o path do code); termina em .md e não tem #.',
          },
        ],
      },
      {
        kind: 'list',
        items: [
          'O pacote não leva o documento: o doc objeto não conta como arquivo citado do pacote, então uma especialização cujos únicos arquivos citados são documentos externos vale como arquivo isolado, e a validação do pacote não confere o documento externo.',
          'Fora do contrato de versão: incluir, mudar ou tirar docRepos, ou trocar o doc entre texto e objeto, é compatível e nunca pede migração. Aviso, que não bloqueia: repositório de docRepos que nenhum doc usa.',
          'Numa versão anterior à 11 o erro é só é permitido com formatVersion 11, no caminho exato.',
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
    title: 'Plataformas e code',
    blocks: [
      {
        kind: 'p',
        text: 'O code de um tipo diz como se cria uma instância dele em cada plataforma: symbol é o que se chama, path é o arquivo que o define, params e values dizem como passar os campos, notes orienta. O agente lê o arquivo para saber a assinatura e escreve a chamada na solução. O mapeamento não guarda nada sobre a solução: ele não sabe onde ela está nem o que foi escrito nela, e o code não é o código gerado para uma anotação.',
      },
      {
        kind: 'p',
        text: 'Uma plataforma é um alvo de código em que o agente escreve a solução: o app Android, o app iOS, o BFF que gera o JSON de uma tela de SDUI. A formatVersion 2 declara as plataformas e o code dos tipos; a 5 acrescenta o repo, o repositório da biblioteca naquela plataforma. A formatVersion 1 continua válida (é a 2 sem plataformas e sem code).',
      },
      {
        kind: 'terms',
        items: [
          {
            term: 'platforms',
            text: 'Na raiz, opcional. Lista de { id, name, language, repo? }: os alvos de código em que o agente escreve a solução. id no formato [a-z0-9-]+ e único; name é exibido; language é informativo (diz ao agente em que linguagem escrever a chamada).',
          },
          {
            term: 'repo',
            text: 'Em cada plataforma, opcional, só na formatVersion 5: { url, urlTemplate?, ref? }, o repositório da biblioteca naquela plataforma, onde estão os arquivos citados nos path. Sem ele, o agente só chega ao arquivo pelo clone local que o projeto informar.',
          },
          {
            term: 'code',
            text: 'Em cada tipo de anotação, opcional, por id de plataforma declarada: como se cria uma instância do tipo em cada uma, com as propriedades abaixo.',
          },
          {
            term: 'symbol',
            text: 'Obrigatório em cada entrada de code: o que se chama para criar uma instância do tipo naquela plataforma (um composable, uma view, uma classe, a função do BFF que gera o JSON do componente). O agente escreve a chamada a esse símbolo.',
          },
          {
            term: 'path',
            text: 'Opcional em cada entrada de code: o arquivo que define o symbol, relativo à raiz do repo da plataforma (com /, sem ., .. nem letra de unidade) e sem linha. O agente o lê para saber a assinatura antes de escrever a chamada, e a app mostra a linha "Definição" nos Detalhes.',
          },
          {
            term: 'params',
            text: 'Com que nome cada campo do tipo é passado na chamada: chave do campo → nome do parâmetro. Campos fora de params não são passados.',
          },
          {
            term: 'values',
            text: 'Como cada valor de enum é escrito no código: campo enum → (valor no mapping → texto no código). Valor sem tradução é passado como está.',
          },
          {
            term: 'notes',
            text: 'Orientação livre para o agente que escreve a chamada: o que passar além dos campos, ordem, cuidados.',
          },
          {
            term: 'variants',
            text: 'Opcional (formatVersion 9). Um campo enum do tipo escolhe a variante do código: { field, cases }. Cada valor do campo (uma das options) tem um caso que troca symbol, path e notes e soma params e values aos da base; um nível só, e o caso não pode ser vazio. A anotação é lida pelo código já resolvido para o valor dela.',
          },
        ],
      },
      { kind: 'p', text: 'O repo de uma plataforma tem três propriedades:' },
      {
        kind: 'terms',
        items: [
          {
            term: 'url',
            text: 'Obrigatória. Endereço do repositório da biblioteca naquela plataforma (http:// ou https://, sem espaços).',
          },
          {
            term: 'urlTemplate',
            text: 'Opcional. Modelo do endereço de um arquivo, com {path} (ex: https://github.com/org/app-android/blob/v3/{path}). Serve a GitHub, GitLab, Bitbucket ou um servidor interno. Sem ele, a app e o servidor MCP não montam link.',
          },
          {
            term: 'ref',
            text: 'Opcional, texto não vazio. A revisão (tag, branch ou commit) da biblioteca a que o code corresponde. É informativa: aparece na app e no servidor MCP, mas não entra no link.',
          },
        ],
      },
      {
        kind: 'list',
        items: [
          'Como o agente chega ao arquivo: pelo urlTemplate do repo da plataforma, na especialização dona do tipo, com {path} trocado pelo path (a app mostra esse link na linha "Definição" logo depois de aplicar a especialização); ou pelo clone local, que o projeto pode informar em Configurações › Repositórios › Código (platformRepos[plataforma].localPath, uma sobreposição local: o caminho local do arquivo é o localPath mais o path).',
          'Plataformas com o mesmo id em especializações diferentes são o mesmo alvo de código. Cada especialização declara o repo da própria biblioteca, e eles podem diferir: o link de um tipo usa o repo da especialização dele.',
          'code só vale em especializações que declaram platforms; os ids citados precisam estar em platforms, e as chaves de params e values precisam ser campos do tipo.',
          'variants só a partir da formatVersion 9 (antes, o erro é só é permitido com formatVersion 9, no caminho code.<plataforma>.variants); field é a key de um campo enum do tipo; cases não vazio, com chaves nas options do campo e casos não vazios; params e values dos casos seguem as regras dos da base.',
          'Plataforma em que algum tipo tem path e que não declara repo gera um aviso da especialização (path-without-repo), não um erro: o arquivo é citado, mas o agente não sabe em que repositório procurá-lo.',
        ],
      },
      { kind: 'code', code: CODE_EXCERPT },
      {
        kind: 'list',
        items: [
          'android.symbol é o composable que se chama para criar um Button; android.path é o arquivo que o define, e o agente o lê para ver a assinatura antes de escrever a chamada.',
          'bff é uma plataforma como as outras: o symbol é a função Kotlin que gera o nó JSON do Button (com.app.bff.sdui.button), com o arquivo dela em path, e não o nome do nó ("button") que sai no JSON.',
          'params diz o nome do parâmetro que recebe cada campo (estilo vai em style no Android e em variant no BFF); values diz como o valor primary é escrito no Android (ButtonStyle.Primary).',
        ],
      },
    ],
  },
  {
    id: 'containers',
    title: 'Containers (tamanhos prontos)',
    blocks: [
      {
        kind: 'p',
        text: 'A formatVersion 6 deixa a especialização oferecer tamanhos prontos de container: o objeto de topo do canvas (uma tela de app, um painel, um cartão) criado sem arquivo, só com tamanho e cor de fundo. No diálogo Novo container, a lista Tamanho predefinido traz Personalizado e Tamanho da seleção (do núcleo; o segundo é o retângulo da marcação selecionada e fica desabilitado sem seleção) e, abaixo, os containers de cada especialização aplicada, agrupados pelo nome dela. Tamanhos de dispositivo (celular, tablet, desktop) vêm da especialização, não do núcleo.',
      },
      { kind: 'code', code: CONTAINERS_EXCERPT },
      {
        kind: 'terms',
        items: [
          {
            term: 'containers',
            text: 'Na raiz, opcional, só na formatVersion 6. A lista de tamanhos prontos. Escolher um preenche largura, altura e cor de fundo do diálogo, que a pessoa ainda pode editar. O agente a lê em get_specialization e a usa no add_container.',
          },
          {
            term: 'id',
            text: 'Obrigatório. No formato [a-z0-9-]+ e único na especialização.',
          },
          {
            term: 'name',
            text: 'Obrigatório, não vazio. É o texto da opção na lista.',
          },
          {
            term: 'width',
            text: 'Obrigatória. Largura em pixels, inteiro de 1 a 20000.',
          },
          {
            term: 'height',
            text: 'Obrigatória. Altura em pixels, inteiro de 1 a 20000.',
          },
          {
            term: 'background',
            text: 'Opcional. Cor #RRGGBB; sem ela, o container nasce branco (#FFFFFF).',
          },
        ],
      },
      {
        kind: 'p',
        text: 'A 5 continua aceita: uma especialização sem containers só aparece na lista com Personalizado e Tamanho da seleção. A lista está fora do contrato de versão: acrescentar, mudar ou remover tamanhos nunca é quebra nem pede migração. A biblioteca material3-compose do repositório traz Celular 360 × 800, Celular grande 412 × 915, Tablet 800 × 1280 e Desktop 1440 × 900.',
      },
    ],
  },
  {
    id: 'floating',
    title: 'Tipo flutuante',
    blocks: [
      {
        kind: 'p',
        text: 'A formatVersion 7 deixa um tipo de anotação ser flutuante (floating: true). A instância de um tipo flutuante é uma marcação flutuante: um comentário solto, como um post-it, que vive só no canvas e fica fora do pertencimento nos dois sentidos: nunca é filha de um container ou de uma marcação e nunca é mãe. É desenhada acima de tudo, inclusive sobre fotos mesmo com Mostrar componentes sobre fotos desligado, e arrastá-la move só ela. Adicionar (botão da Paleta) cria sempre no canvas, no centro da vista; arrastar da Paleta solta onde cair. A relação com uma tela ou um elemento é uma seta, não o pertencimento.',
      },
      {
        kind: 'p',
        text: 'Use floating só para o que é comentário ou anotação solta que não pertence a uma tela (uma nota, um recado, uma regra de negócio); nunca para componentes de interface.',
      },
      { kind: 'code', code: FLOATING_EXCERPT },
      {
        kind: 'terms',
        items: [
          {
            term: 'floating',
            text: 'Booleano, opcional; o padrão é false. Só a partir da formatVersion 7: numa versão anterior o erro é só é permitido com formatVersion 7, no caminho do tipo.',
          },
        ],
      },
      {
        kind: 'p',
        text: 'A biblioteca de notas do repositório (camada Notas, tipos nota e tabela, componentes post-it) é um pacote comum, embutido na app e aplicado por padrão: o projeto novo nasce com ela, e o projeto aberto de um schema anterior ao 13 a ganha ao abrir. Ela se remove por Especializações › Remover, como qualquer outra, e não volta. Campos string do tipo aceitam várias linhas na interface (o editor abre em várias linhas quando o texto tem quebra ou passa de 60 caracteres, ou com Shift+Enter; enquanto o texto não tem quebra, o Enter grava e o Shift+Enter quebra a linha).',
      },
    ],
  },
  {
    id: 'applies-to',
    title: 'Onde o tipo se aplica',
    blocks: [
      {
        kind: 'p',
        text: 'A formatVersion 7 diz a que uma anotação se aplica com appliesTo no tipo: "marking" (uma marcação, o padrão), "arrow" (uma seta, que liga duas marcações e pode ter anotações por camada como qualquer marcação) ou os dois. O painel de anotações oferece, para a marcação selecionada, só os tipos que se aplicam a marcações, e, para a seta, só os que se aplicam a setas. Um tipo só de seta (appliesTo: ["arrow"]) não tem component nem floating: a seta não tem desenho de componente.',
      },
      { kind: 'code', code: APPLIES_TO_EXCERPT },
      {
        kind: 'p',
        text: 'O padrão "flutuante que aponta": uma tabela flutuante (floating: true, com o componente da tabela) fica ao lado de uma tela e é ligada ao elemento que ela descreve por uma seta. O dado (os eventos, as propriedades) mora na anotação da tabela flutuante; o agente chega a ela pelas setas que saem do elemento. A coluna ref de uma table é dado, não seta: guarda uma lista de referências a tuplas (linhas de tabela, campos, tuplas livres) e nenhuma ligação é desenhada.',
      },
      { kind: 'code', code: POINTING_EXCERPT },
      {
        kind: 'terms',
        items: [
          {
            term: 'appliesTo',
            text: 'Lista de "marking" e/ou "arrow", opcional; não vazia, sem repetição. O padrão é ["marking"]. Só a partir da formatVersion 7: numa versão anterior o erro é só é permitido com formatVersion 7, no caminho do tipo.',
          },
        ],
      },
    ],
  },
  {
    id: 'notices',
    title: 'Avisos (notices)',
    blocks: [
      {
        kind: 'p',
        text: 'A formatVersion 10 deixa a especialização avisar sobre um tipo, um campo ou uma coluna de table com notices: uma lista de avisos curtos, escritos por quem gera a especialização, para registrar que duas fontes discordam (o contrato diz uma coisa e o código outra), que algo está pendente numa delas, obsoleto ou removido. A app mostra o aviso ao lado do tipo, do campo ou da coluna; o agente o lê ao instanciar o tipo.',
      },
      { kind: 'code', code: NOTICES_EXCERPT },
      {
        kind: 'terms',
        items: [
          {
            term: 'kind',
            text: 'Obrigatório. Um de removed (Removido: saiu do contrato e não deve ser usado), deprecated (Obsoleto: a message diz o que usar no lugar), diverges (Diverge: as fontes discordam, a message diz em quê) e pending (Pendente: uma fonte já tem e a outra ainda não; o nome da plataforma ou da origem vai na message). A gravidade é fixa: removed > deprecated = diverges > pending.',
          },
          {
            term: 'message',
            text: 'Obrigatória. O que a pessoa precisa saber: texto não vazio e que não seja só espaços.',
          },
          {
            term: 'since',
            text: 'Opcional. Desde quando o aviso vale: data real no formato AAAA-MM-DD.',
          },
          {
            term: 'ref',
            text: 'Opcional, texto livre não vazio. De onde o aviso vem (a página do contrato, o arquivo do código).',
          },
        ],
      },
      {
        kind: 'list',
        items: [
          'Os avisos aparecem na ordem removed, deprecated, diverges, pending e, dentro do mesmo kind, na ordem do arquivo. Dois avisos com o mesmo kind e a mesma message na lista são o erro aviso repetido.',
          'O aviso só informa: nenhum, nem removed, impede importar a especialização, aplicá-la, criar uma anotação do tipo ou aceitar uma proposta. Também não é pendência: a janela Incompletas não muda. Os Detalhes mostram o aviso do campo mesmo vazio; a janela Avisos e a contagem só contam o campo com valor.',
          'Fora do contrato de versão: incluir, mudar ou tirar notices é compatível e nunca pede migração. Quem gera a especialização pode regravar todos os avisos a cada rodada; o aviso some sozinho quando a diferença entre as fontes some. Atualizar a especialização só por avisos não mostra impacto.',
        ],
      },
    ],
  },
  {
    id: 'sources',
    title: 'Origens (sources)',
    blocks: [
      {
        kind: 'p',
        text: 'A formatVersion 3 diz a que elementos de um sistema externo (uma ferramenta de design, outro catálogo de componentes…) cada tipo corresponde e de que propriedade de origem vem cada campo. É o que um agente de importação usa para saber que componente vira que tipo, sem deduzir pelo nome; as propostas que ele cria usam essa correspondência. O app não interpreta system nem os nomes: só valida a estrutura. Na formatVersion 4, um sistema declarado em origins é executável: a especialização diz como ler o JSON dele e montar uma tela de componentes.',
      },
      { kind: 'code', code: SOURCES_EXCERPT },
      {
        kind: 'terms',
        items: [
          {
            term: 'sources',
            text: 'Opcional. Num tipo de anotação: lista de { system, id?, name? }, cada uma com pelo menos id ou name (um tipo pode corresponder a vários elementos, ex: variantes antigas e novas). Num campo ou coluna de table: lista de { system, name, values? }, a propriedade de origem do valor.',
          },
          {
            term: 'system',
            text: 'Nome do sistema de origem. system, id e name são textos não vazios; as comparações são exatas (maiúsculas contam).',
          },
          {
            term: 'values',
            text: 'Na origem de um campo, só em campos enum: valor de origem → uma das options (os destinos precisam existir em options).',
          },
        ],
      },
      {
        kind: 'p',
        text: 'sources só existe a partir da formatVersion 3: nas versões 1 e 2 o arquivo é recusado com a mensagem de versão, em vez de ignorar as origens.',
      },
      {
        kind: 'p',
        text: 'Num sistema executável (declarado em origins, formatVersion 4):',
      },
      {
        kind: 'terms',
        items: [
          {
            term: 'path',
            text: 'Na origem de um campo ou coluna: o caminho do valor dentro das props do nó externo (a.b[0].c, sem [*]). Obrigatório num sistema declarado em origins e proibido nos demais; name passa a ser só o nome de exibição.',
          },
          {
            term: 'slot',
            text: 'Na origem de um tipo: o nome do slot do componente que recebe os filhos do nó externo.',
          },
          {
            term: 'ignore',
            text: 'Na origem de um tipo: props que o nó externo traz e o desenho não usa (sem aviso de propriedade desconhecida).',
          },
          {
            term: 'origins',
            text: 'Na raiz: a declaração executável de cada sistema, com node (chaves do nó), screen (largura, altura, fundo e raízes com âncora e película), booleans e examples (telas de exemplo). O app executa a declaração, nunca código da especialização.',
          },
        ],
      },
      { kind: 'code', code: ORIGINS_EXCERPT },
    ],
  },
  {
    id: 'package',
    title: 'Biblioteca: o pacote',
    blocks: [
      {
        kind: 'p',
        text: 'Com a formatVersion 4, uma especialização é uma biblioteca: um pacote, que é a pasta da especialização com tudo o que ela cita. Todo caminho citado é relativo ao arquivo da especialização, com /, sem .. nem letra de unidade, e termina na extensão esperada.',
      },
      { kind: 'code', code: PACKAGE_TREE },
      {
        kind: 'terms',
        items: [
          {
            term: 'component',
            text: 'Em cada tipo: o arquivo .json do componente que o desenha (formato em docs/COMPONENT-FORMAT.md). Opcional: um tipo sem componente continua valendo, só não tem desenho.',
          },
          { term: 'doc', text: 'Em cada tipo: o documento markdown (.md) do tipo.' },
          {
            term: 'examples',
            text: 'Em cada tipo: exemplos com name único e um só modo, values (valores dos campos do tipo; table e ref não entram) ou system com file (o JSON de um nó de um sistema de origins).',
          },
          {
            term: 'fonts',
            text: 'Na raiz: lista de { family, file, weight?, style? } com arquivo .ttf, .otf, .woff ou .woff2. Fonte ausente avisa e o desenho usa a fonte do sistema.',
          },
          {
            term: 'origins',
            text: 'Na raiz: a declaração de origem executável (seção anterior), com telas de exemplo em examples.',
          },
          {
            term: 'migrations',
            text: 'Na raiz: o contrato de versão (próxima seção).',
          },
        ],
      },
      {
        kind: 'p',
        text: 'No app, Especializações › Aplicar pasta… (Chrome e Edge) ou Aplicar zip… confere o pacote pelos três níveis: erros bloqueiam, avisos deixam aplicar. Aplicar copia a pasta inteira para specs/<id>/ no projeto; Atualizar de pasta… ou de zip… regrava a cópia e Remover a apaga. Uma especialização v4 ou v5 que não cita nenhum arquivo do pacote (sem component, doc, examples, fonts nem origins) vale como arquivo .json isolado; a que cita é recusada em .json: a biblioteca precisa da pasta inteira. O repositório traz bibliotecas completas em libraries/ (por exemplo, a material3-compose, com 50 tipos do Material 3 para Jetpack Compose e a fonte Roboto) e, em examples/libraries/sdui-backend/, o exemplo da origem executável.',
      },
    ],
  },
  {
    id: 'contract',
    title: 'Contrato de versão',
    blocks: [
      {
        kind: 'p',
        text: 'version é a versão do pacote. Ao subir a versão, cada diferença é aditiva (só acrescenta: tipo, campo opcional, opção de enum, componente, documento, exemplo, fonte, ou um desenho novo sem mudar os campos) ou quebra (remove ou renomeia tipo, campo ou opção de enum, torna um campo obrigatório ou muda o type de um campo). Na formatVersion 12, os papéis (childRoles) entram no contrato: tirar um papel de um tipo ou dar papéis a um tipo que não tinha é quebra, e acrescentar um papel a um tipo que já tinha é aditivo. Camadas, labelField, allowedChildren, requiresOwner, description, tags, code, platforms e sources ficam fora do contrato, e também o name e a description do papel, a ordem dos childRoles e o childRolesLabel.',
      },
      {
        kind: 'p',
        text: 'Toda quebra precisa de um passo em migrations, que liga duas versões do pacote (from e to) e lista passos declarativos. Um campo pode ser citado por key ou por tabela.coluna.',
      },
      { kind: 'code', code: MIGRATIONS_EXCERPT },
      {
        kind: 'terms',
        items: [
          { term: 'rename-type', text: 'Tipo renomeado (from → to).' },
          {
            term: 'remove-type',
            text: 'Tipo removido; mode (convert ou delete) diz o destino das anotações.',
          },
          { term: 'rename-field', text: 'Campo renomeado (from → to).' },
          { term: 'remove-field', text: 'Campo removido.' },
          {
            term: 'map-values',
            text: 'Opção de enum removida: cada valor antigo aponta para uma option atual.',
          },
          {
            term: 'fill-field',
            text: 'Campo que passou a obrigatório, campo novo obrigatório ou type trocado: o default entra no lugar.',
          },
          {
            term: 'rename-role',
            text: 'formatVersion 12. Papel renomeado no tipo dono (type, from → to). Se to já existia, os dois papéis se juntam. Sem perda nem pendência.',
          },
          {
            term: 'remove-role',
            text: 'formatVersion 12. Papel removido do tipo dono (type, role); mode diz o destino dos filhos: clear mantém o vínculo e apaga o papel (perda; pendência se o dono ainda tem papéis), unlink desvincula o filho (perda; pendência de dono se o tipo do filho exige dono).',
          },
          {
            term: 'set-role',
            text: 'formatVersion 12. Tipo que passou a ter papéis: dá o papel (type, role) aos filhos do dono que não têm papel, só aos do childType quando vem. Preenche e nunca sobrescreve; nunca gera perda. Use antes do rename-type do filho para não perder a informação.',
          },
        ],
      },
      {
        kind: 'p',
        text: 'Um exemplo de especialização v12 com os três passos de papel (as anotações só mudam o vínculo, parentRole, nunca o filho):',
      },
      { kind: 'code', code: ROLES_MIGRATION_EXCERPT },
      {
        kind: 'p',
        text: 'Ao atualizar, a app executa os passos da cadeia sobre as anotações do projeto e mostra antes o impacto: os passos com suas contagens, as perdas em destaque (valores, anotações ou vínculos apagados, com o papel limpo contando como valor) e as pendências que abrem em Incompletas. Uma quebra sem passo recusa a atualização, e Desfazer devolve a biblioteca e os dados juntos.',
      },
    ],
  },
  {
    id: 'librarycheck',
    title: 'Validação da biblioteca',
    blocks: [
      {
        kind: 'p',
        text: 'Um pacote é validado em três níveis, na ordem. Erro impede usar; aviso deixa usar.',
      },
      {
        kind: 'list',
        items: [
          'Nível 1, cada arquivo isolado e estrito: a especialização, cada componente citado e cada documento. Arquivo citado e ausente é erro; arquivo do pacote que ninguém cita é aviso.',
          'Nível 2, coerência entre arquivos: o slot declarado existe no componente, os campos que o desenho usa existem no tipo (erro), os arquivos dos exemplos existem, o scrim é um tipo, a fonte tem arquivo (aviso) e, com a versão anterior, o contrato de versão.',
          'Nível 3, prova de desenho: cada componente é desenhado com o preview e com cada exemplo, no tamanho inicial e no mínimo, e cada exemplo de sistema externo passa pela declaração. Os avisos do motor levam (aproximado), porque fora do navegador o texto é medido de forma aproximada.',
        ],
      },
      {
        kind: 'terms',
        items: [
          {
            term: 'error',
            text: 'Impede usar o pacote (arquivo ausente ou inválido, campo inexistente no desenho, quebra de versão sem passo).',
          },
          {
            term: 'warning',
            text: 'Deixa usar: fonte ausente, arquivo sem uso, campo que o desenho não usa, conteúdo maior que a caixa.',
          },
        ],
      },
      { kind: 'code', code: ISSUE_EXCERPT },
      {
        kind: 'p',
        text: 'A biblioteca material3-compose do repositório passa com zero erros e zero avisos. O app, o servidor MCP (validate_library) e a skill chamam a mesma validação.',
      },
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
          'format, formatVersion (1 a 13), id, name e version obrigatórios; version inteiro ≥ 1;',
          'ids de camada únicos; ids de tipo únicos na especialização inteira; key única no tipo e nas colunas; nenhuma key começando com _;',
          'allowedChildren só referencia tipos existentes, em outra camada (a partir da formatVersion 13, também na camada do próprio dono);',
          'todo tipo com requiresOwner: true aparece no allowedChildren de algum tipo (na formatVersion 11, no conjunto resolvido dos filhos de algum dono: por id, por camada inteira ou por grupo);',
          'default compatível com o tipo (e presente em options no enum); ref sem default;',
          'columns só com tipos simples ou, na formatVersion 7, ref (com accepts; table dentro de table não existe); rowLabel obrigatório em table com tags e apontando para uma coluna string;',
          'labelField aponta para um campo string do tipo;',
          'accepts com pelo menos uma etiqueta ou free: true; etiquetas no formato [a-z0-9-]+;',
          'platforms: id no formato [a-z0-9-]+, único, e name obrigatório; platforms e code a partir da formatVersion 2; sources (origens externas) a partir da formatVersion 3;',
          'formatVersion 11, filhos por camada e grupo: só na versão 11 (antes dela o erro é só é permitido com formatVersion 11, no caminho exato); cada item de allowedChildren é um id de tipo ou uma cláusula { layer, groups } estrita (outra propriedade é erro, e groups vazio também); erros: layer que não é camada da especialização ou é a do próprio dono antes da formatVersion 13 (filhos devem estar em outra camada) e grupo inexistente na camada da cláusula; requiresOwner conferido no conjunto resolvido; groups da camada com id não vazio e único na camada e name não vazio; groups do tipo não vazio, sem repetição e só da própria camada; avisos: 20 ids ou mais em texto no mesmo allowedChildren e grupo que nenhum tipo usa;',
          'formatVersion 12, passos de papel em migrations: rename-role, remove-role e set-role só na versão 12 (de 4 a 11 o erro é só é permitido com formatVersion 12, no caminho migrations[i].steps[j].op); chaves estritas; rename-role: type é tipo desta versão com childRoles, to é papel dele e from não é; remove-role: type é tipo desta versão, role não é papel dele e mode é clear ou unlink; set-role: type tem childRoles, role é papel dele e childType só confere o formato de id; aviso: rename-role.from ou remove-role.role que não era papel do tipo na versão anterior;',
          'formatVersion 11, childRoles e childRolesLabel: só na versão 11; childRoles não vazia, de { id, name, description? } estritos, com id não vazio e único no tipo e name não vazio; só em tipo com allowedChildren; childRolesLabel texto não vazio e só com childRoles; sem ele a app usa "Papel";',
          'formatVersion 11, docRepos e doc objeto: só na versão 11; docRepos[n] com as regras do repo de plataforma (url obrigatória http(s):// sem espaços, urlTemplate opcional com {path}, ref opcional não vazio) e id no formato [a-z0-9-]+ e único; doc objeto { repo, path } estrito: repo precisa estar em docRepos, path relativo (sem ., .. nem / no começo), terminando em .md e sem #; o doc em texto continua valendo da versão 4 em diante; aviso: repositório de docRepos que nenhum doc usa;',
          'formatVersion 10, notices: só na versão 10 (antes dela o erro é só é permitido com formatVersion 10, no caminho do tipo, do campo ou da coluna); lista de objetos estritos com kind (pending, deprecated, diverges ou removed) e message (não vazia nem só espaços) obrigatórios, since (data real AAAA-MM-DD) e ref (texto não vazio) opcionais; dois avisos com o mesmo kind e a mesma message são o erro aviso repetido, no caminho do segundo; qualquer outra propriedade é recusada;',
          'formatVersion 7, floating, appliesTo e coluna ref: só na versão 7 (antes dela o erro é só é permitido com formatVersion 7); floating booleano; appliesTo não vazio, sem repetição, só com "marking" e "arrow", e sem component nem floating num tipo só de seta;',
          'formatVersion 6, containers: só na versão 6 (antes dela o erro é só é permitido com formatVersion 6); id no formato [a-z0-9-]+ e único na lista; name não vazio; width e height inteiros de 1 a 20000; background opcional, #RRGGBB; qualquer outra propriedade é recusada;',
          'formatVersion 5, repo: só na versão 5, dentro de uma entrada de platforms (antes dela o erro é só é permitido com formatVersion 5); url obrigatória, começando com http:// ou https://; urlTemplate opcional, http(s):// e com {path}; ref opcional, texto não vazio; qualquer outra propriedade é recusada. Plataforma com path em algum tipo e sem repo é só aviso (path-without-repo);',
          'code só em especializações com platforms; os ids de code precisam existir em platforms;',
          'chaves de params e values precisam ser campos do tipo; values só para enum, com chaves que existam em options; symbol obrigatório e path, se houver, relativo à raiz do repo da plataforma;',
          'formatVersion 4: fonts, origins, migrations, component, doc e examples só a partir da versão 4, com caminhos do pacote relativos e a extensão certa; fonts sem par family + weight + style repetido; examples com name único e um só modo; path só em sistema declarado em origins (e obrigatório nele), slot e ignore só nele; migrations com from e to coerentes e passos que citam tipos e campos que existem;',
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
          'platforms declara os dois alvos de código em que o agente escreve a solução, o android e o bff, cada um com o repo da sua biblioteca (url, o urlTemplate do link de um arquivo e a ref a que o code corresponde).',
          'code diz como se cria uma instância de cada tipo: no android, o symbol é o composable a chamar (com.app.ds.DSButton) e o path é o arquivo que o define, relativo à raiz do repo; no bff, o symbol é a função Kotlin que gera o nó JSON (com.app.bff.sdui.button), e não o nome do nó. O agente lê o arquivo para ver a assinatura e escreve a chamada.',
          'params diz com que nome o campo é passado (estilo vai em style no Android e em variant no BFF) e values como o valor do enum é escrito no código (primary vira ButtonStyle.Primary); notes orienta (a função do BFF devolve o nó do componente no JSON da tela).',
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
          'formatVersion 12 adds three role migration steps to migrations: rename-role, remove-role and set-role (sections "Version contract" and "Roles on the link (childRoles)"). Removing a role from childRoles is now a breaking change, and only a specialization that declares one of these steps goes up to 12. Versions 1 to 11 are still accepted.',
          'formatVersion 13 lets allowedChildren list types of the owner’s own layer: the { layer } clause of its own layer and the id of a type in the same layer, including the owner’s own type (section "Children by layer and group"). So an event can own other events, each child in the role it attaches in. Only a specialization that uses this goes up to 13; versions 1 to 12 are still accepted, and the own-layer clause in an earlier version is the usual error: children must be in another layer.',
          'formatVersion 4 adds the library: components that draw the types, documents, examples, fonts, executable origins and the version contract (sections "Library: the package", "Version contract" and "Library validation").',
          'formatVersion 5 is 4 plus repo on the platforms: the library repository on each platform, where the link and the revision of the file of each symbol come from (section "Platforms and code").',
          'formatVersion 6 is 5 plus containers: the ready-made sizes the New container dialog offers when the specialization is applied (section "Containers (ready-made sizes)"). The core only has Custom and Selection size; versions 1 to 5 are still accepted.',
          'formatVersion 7 is 6 plus floating on the annotation type (the type whose instance is a floating marking, a loose comment over the canvas: section "Floating type"), appliesTo on the type (what the annotation applies to: marking, arrow or both: section "What the type applies to") and ref as a column type of table (a list of references as data). Versions 1 to 6 are still accepted.',
          'formatVersion 8 adds `suggestions` to `string` fields and columns (vocabulary suggested while typing, without restricting the value) and `linkedRef` (links the text to a `ref` field/column of the same type/table: the suggestion list also shows the mapped targets that `ref` accepts).',
          'formatVersion 9 adds `variants` to the `code` entry: an enum field of the type picks the code variant (in Compose, `Button`, `OutlinedButton` or `TextButton`), which replaces symbol, path and notes and adds to params and values (section "Platforms and code"). Versions 1 to 8 are still accepted.',
          'formatVersion 10 adds `notices` to the type, the field and the table column: short notices (pending, deprecated, diverges, removed) that only inform and block nothing (section "Notices (notices)"). Versions 1 to 9 are still accepted.',
          'formatVersion 11 adds three optional features: allowedChildren with a { layer, groups } clause and the groups of the layer and of the type (section "Children by layer and group"); childRoles and childRolesLabel on the owner, the roles a child attaches to it in (section "Roles on the link (childRoles)"); and docRepos at the root with the type’s doc as a { repo, path } object, a document in an external repository (section "Document in an external repository (docRepos)"). Versions 1 to 10 are still accepted.',
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
        text: 'At the root: format (always "mapping-spec"), formatVersion (1 to 13), id, name and version (integer ≥ 1) are required; description, platforms (with repo in version 5), containers (from version 6), docRepos (from version 11) and, from version 4 on, fonts, origins and migrations are optional. Each layer has id (unique), name, color (#RRGGBB) and annotationTypes and, from version 11, optional groups.',
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
            text: 'The types that can be linked to this one: type ids and, from formatVersion 11, { layer, groups } clauses (section "Children by layer and group").',
          },
          {
            term: 'groups',
            text: 'Optional (formatVersion 11). Ids of the groups of the type’s own layer it belongs to (section "Children by layer and group").',
          },
          {
            term: 'childRoles',
            text: 'Optional (formatVersion 11). The roles a child attaches to this type in (section "Roles on the link (childRoles)").',
          },
          {
            term: 'childRolesLabel',
            text: 'Optional (formatVersion 11). The name of the role selector, with childRoles; without it, "Role".',
          },
          { term: 'fields', text: 'Required. List of fields (may be empty).' },
          {
            term: 'code',
            text: 'Optional (formatVersion 2). How to create an instance of the type on each declared platform.',
          },
          {
            term: 'component',
            text: 'Optional (formatVersion 4). Path of the .json component file that draws the type.',
          },
          {
            term: 'doc',
            text: 'Optional (formatVersion 4). Path of the type’s .md document; in formatVersion 11, also { repo, path }, a document in an external repository (section "Document in an external repository (docRepos)").',
          },
          {
            term: 'examples',
            text: 'Optional (formatVersion 4). Named examples: values of the type’s fields or the JSON of an external system.',
          },
          {
            term: 'floating',
            text: 'Optional (formatVersion 7). Defaults to false. The instance is a floating marking (section "Floating type").',
          },
          {
            term: 'appliesTo',
            text: 'Optional (formatVersion 7). List of "marking" and/or "arrow"; defaults to ["marking"]. Says what the annotation applies to (section "What the type applies to").',
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
            text: 'Required: string, number, date, enum, table or ref.',
          },
          {
            term: 'required',
            text: 'Defaults to false. Empty is allowed on save, but the annotation becomes incomplete.',
          },
          {
            term: 'default',
            text: 'Initial value, valid for the type. Does not exist for table or ref.',
          },
          { term: 'options', text: 'enum only: non-empty list of unique strings.' },
          {
            term: 'columns',
            text: 'table only: simple fields (string, number, date or enum) and, from formatVersion 7 on, ref (with accepts, like a ref field; the cell is a reference and draws no arrow).',
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
          'allowedChildren: types that can be linked to this one (e.g. a Button accepts onClick and onHold). An owner can have many children, even of the same type. Children live in another layer (from formatVersion 13, also in the owner’s own layer when the specialization declares it). From formatVersion 11, an item can also be a clause that covers a layer or its groups (section "Children by layer and group").',
          'requiresOwner: true: the annotation needs exactly one owner, of a type that lists it in allowedChildren (by id or through the clause that covers it). E.g. an event without a component makes no sense.',
          'childRoles (formatVersion 11): when the same child type attaches to different points of the owner, the point is a role on the link (section "Roles on the link (childRoles)").',
          'The owner’s editor shows "+ child" buttons (e.g. "+ onClick") that create the annotation already linked.',
        ],
      },
    ],
  },
  {
    id: 'children',
    title: 'Children by layer and group',
    blocks: [
      {
        kind: 'p',
        text: 'Until formatVersion 10, allowedChildren lists the children one by one, by id. formatVersion 11 lets an item be a clause { "layer": "<layer id>", "groups": ["<id>", …] } (groups is optional) and lets the layer declare groups (groups) its types belong to. An owner then accepts a whole layer, or only some of its groups, without repeating the ids and without editing every owner when the layer gains a type.',
      },
      { kind: 'code', code: CHILDREN_EXCERPT },
      {
        kind: 'terms',
        items: [
          {
            term: 'layer',
            text: 'Required in the clause. The id of a layer of the specialization, which cannot be the owner’s own before formatVersion 13 (children must be in another layer); from 13 it can. Without groups, it covers every type of the layer.',
          },
          {
            term: 'groups',
            text: 'In the clause: optional and non-empty; covers the types of the layer that are in any of the groups, and each group must exist in the clause’s layer. On the layer: a list of { id, name, description? }, with a non-empty id unique in the layer and a non-empty name; the order is the order of the headings. On the type: a non-empty list, without repetition, of groups of its own layer.',
          },
        ],
      },
      {
        kind: 'list',
        items: [
          'An owner’s set of children is the union of the allowedChildren items, in their order; inside a clause, the types come in the layer’s order; a repeated type stays in the first position. The clause only has layer and groups: any other property is an error.',
          'A type without groups only enters through a whole-layer clause or its own id. requiresOwner is checked against the resolved set: the type must be in the set of some owner, by id, by layer or by group.',
          'Warnings, which block nothing: allowedChildren with 20 ids or more in text (a clause covers the layer or the groups; 19 does not warn) and a declared group no type uses.',
          'Outside the version contract: adding, changing or removing groups, or replacing a list of ids with a clause, is compatible and never asks for a migration.',
          'In the same layer (formatVersion 13): the { layer } clause of its own layer and the id of a type in the same layer, including the owner’s own type, are valid in allowedChildren. Only a typed annotation links this way, and a cycle is still barred: an annotation is never its own owner or an ancestor’s. Before 13, the owner’s own layer is the usual error.',
        ],
      },
    ],
  },
  {
    id: 'roles',
    title: 'Roles on the link (childRoles)',
    blocks: [
      {
        kind: 'p',
        text: 'An owner sometimes links the same child type at different points of itself: the Button has a click event and a hold event, and both are a navigate. If the child needs to say at which point of the owner it attaches, that is a role, not a field of the child nor a type id. formatVersion 11 declares the roles on the owner, with childRoles, and a name for the selector, with childRolesLabel.',
      },
      { kind: 'code', code: ROLES_EXCERPT },
      {
        kind: 'terms',
        items: [
          {
            term: 'childRoles',
            text: 'Non-empty list of { id, name, description? }, with a non-empty id unique in the type and a non-empty name. The role belongs to the link, not to the child: the same child type can occupy different roles in the same owner. Only valid on a type with allowedChildren.',
          },
          {
            term: 'childRolesLabel',
            text: 'Non-empty text: the name the app gives the role selector (e.g. "Trigger"). Only valid with childRoles. Without it, the app uses "Role".',
          },
        ],
      },
      {
        kind: 'list',
        items: [
          'In the version contract (from formatVersion 12): the role id is data the annotations store (parentRole). Removing a role from a type, or giving childRoles to a type that had none, is breaking and needs a rename-role, remove-role or set-role step in migrations; adding a role to a type that already had roles is additive. The role name and description, the order of childRoles and childRolesLabel stay outside the contract.',
          'Before version 11 the error is only allowed with formatVersion 11, at the exact path. The role migration steps belong to formatVersion 12.',
        ],
      },
    ],
  },
  {
    id: 'docrepos',
    title: 'Document in an external repository (docRepos)',
    blocks: [
      {
        kind: 'p',
        text: 'Until formatVersion 10, a type’s doc is a .md file inside the package. When the component documentation lives in the design system or contract repository, formatVersion 11 declares the document repositories at the root (docRepos) and lets the type’s doc point to a file in one of them, without copying it into the package.',
      },
      { kind: 'code', code: DOC_REPOS_EXCERPT },
      {
        kind: 'terms',
        items: [
          {
            term: 'docRepos',
            text: 'At the root: a list of { id, url, urlTemplate?, ref? } with the same rules as a platform repo (url http(s):// without spaces; urlTemplate with {path}; ref informative). The id follows [a-z0-9-]+ and is unique in the list.',
          },
          {
            term: 'doc',
            text: 'As text, it is the package .md file (as since formatVersion 4); as an object { repo, path }, it is a file of the repository declared in docRepos.',
          },
          { term: 'repo', text: 'The id of a repository declared in docRepos.' },
          {
            term: 'path',
            text: 'Relative to the repository root, with /, without ., .. or a leading / (like the path of code); ends in .md and has no #.',
          },
        ],
      },
      {
        kind: 'list',
        items: [
          'The package does not carry the document: the doc object does not count as a cited package file, so a specialization whose only cited files are external documents is valid as a standalone file, and package validation does not check the external document.',
          'Outside the version contract: adding, changing or removing docRepos, or switching the doc between text and object, is compatible and never asks for a migration. Warning, which blocks nothing: a docRepos repository no doc uses.',
          'Before version 11 the error is only allowed with formatVersion 11, at the exact path.',
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
    title: 'Platforms and code',
    blocks: [
      {
        kind: 'p',
        text: 'The code of a type says how to create an instance of it on each platform: symbol is what you call, path is the file that defines it, params and values say how to pass the fields, notes guides. The agent reads the file to learn the signature and writes the call in the solution. The mapping stores nothing about the solution: it does not know where it is or what was written in it, and code is not the code generated for an annotation.',
      },
      {
        kind: 'p',
        text: 'A platform is a code target where the agent writes the solution: the Android app, the iOS app, the BFF that generates the JSON of an SDUI screen. formatVersion 2 declares the platforms and the code of the types; 5 adds repo, the library repository on that platform. formatVersion 1 is still valid (it is version 2 without platforms and without code).',
      },
      {
        kind: 'terms',
        items: [
          {
            term: 'platforms',
            text: 'At the root, optional. List of { id, name, language, repo? }: the code targets where the agent writes the solution. id in the [a-z0-9-]+ format and unique; name is displayed; language is informational (it tells the agent which language to write the call in).',
          },
          {
            term: 'repo',
            text: 'On each platform, optional, formatVersion 5 only: { url, urlTemplate?, ref? }, the library repository on that platform, where the files cited in path live. Without it, the agent only reaches the file through the local clone the project reports.',
          },
          {
            term: 'code',
            text: 'On each annotation type, optional, by declared platform id: how to create an instance of the type on each one, with the properties below.',
          },
          {
            term: 'symbol',
            text: 'Required in each code entry: what you call to create an instance of the type on that platform (a composable, a view, a class, the BFF function that generates the component JSON). The agent writes the call to that symbol.',
          },
          {
            term: 'path',
            text: 'Optional in each code entry: the file that defines the symbol, relative to the platform repo root (with /, no ., .. or drive letter) and without a line. The agent reads it to learn the signature before writing the call, and the app shows a "Definition" line in the Details.',
          },
          {
            term: 'params',
            text: 'The name each type field is passed with in the call: field key → parameter name. Fields outside params are not passed.',
          },
          {
            term: 'values',
            text: 'How each enum value is written in the code: enum field → (value in the mapping → text in the code). A value without a translation is passed as is.',
          },
          {
            term: 'notes',
            text: 'Free-form guidance for the agent writing the call: what to pass besides the fields, order, caveats.',
          },
          {
            term: 'variants',
            text: 'Optional (formatVersion 9). An enum field of the type picks the code variant: { field, cases }. Each value of the field (one of its options) has a case that replaces symbol, path and notes and adds to the base params and values; one level only, and a case cannot be empty. The annotation is read through the code already resolved for its value.',
          },
        ],
      },
      { kind: 'p', text: 'The repo of a platform has three properties:' },
      {
        kind: 'terms',
        items: [
          {
            term: 'url',
            text: 'Required. Address of the library repository on that platform (http:// or https://, no spaces).',
          },
          {
            term: 'urlTemplate',
            text: 'Optional. Template of the address of a file, with {path} (e.g. https://github.com/org/app-android/blob/v3/{path}). It works with GitHub, GitLab, Bitbucket or an internal server. Without it, the app and the MCP server do not build a link.',
          },
          {
            term: 'ref',
            text: 'Optional, non-empty text. The revision (tag, branch or commit) of the library that the code corresponds to. It is informational: it shows in the app and in the MCP server, but is not part of the link.',
          },
        ],
      },
      {
        kind: 'list',
        items: [
          'How the agent reaches the file: through the urlTemplate of the platform repo, in the specialization that owns the type, with {path} replaced by the path (the app shows this link in the "Definition" line right after the specialization is applied); or through the local clone, which the project can report in Settings › Repositories › Code (platformRepos[platform].localPath, a local overlay: the local path of the file is the localPath plus the path).',
          'Platforms with the same id in different specializations are the same code target. Each specialization declares the repo of its own library, and they may differ: the link of a type uses the repo of its specialization.',
          'code only works in specializations that declare platforms; the ids it cites must exist in platforms, and the keys of params and values must be fields of the type.',
          'variants only from formatVersion 9 (before it the error is only allowed with formatVersion 9, at code.<platform>.variants); field is the key of an enum field of the type; cases is not empty, with keys in the field options and non-empty cases; the params and values of the cases follow the rules of the base ones.',
          'A platform where some type has a path and that does not declare repo produces a specialization warning (path-without-repo), not an error: the file is cited, but the agent does not know which repository to look in.',
        ],
      },
      { kind: 'code', code: CODE_EXCERPT },
      {
        kind: 'list',
        items: [
          'android.symbol is the composable you call to create a Button; android.path is the file that defines it, and the agent reads it to see the signature before writing the call.',
          'bff is a platform like the others: its symbol is the Kotlin function that generates the Button JSON node (com.app.bff.sdui.button), with its file in path, not the node name ("button") that appears in the JSON.',
          'params gives the parameter name that receives each field (estilo goes in style on Android and in variant on the BFF); values says how the primary value is written on Android (ButtonStyle.Primary).',
        ],
      },
    ],
  },
  {
    id: 'containers',
    title: 'Containers (ready-made sizes)',
    blocks: [
      {
        kind: 'p',
        text: 'formatVersion 6 lets the specialization offer ready-made container sizes: the top-level object of the canvas (an app screen, a panel, a card) created without a file, with just a size and a background color. In the New container dialog, the Preset size list has Custom and Selection size (from the core; the second is the rectangle of the selected marking and is disabled with no selection) and, below them, the containers of each applied specialization, grouped by its name. Device sizes (phone, tablet, desktop) come from the specialization, not from the core.',
      },
      { kind: 'code', code: CONTAINERS_EXCERPT },
      {
        kind: 'terms',
        items: [
          {
            term: 'containers',
            text: 'At the root, optional, formatVersion 6 only. The list of ready-made sizes. Choosing one fills in the dialog width, height and background color, which the person can still edit. The agent reads it in get_specialization and uses it in add_container.',
          },
          {
            term: 'id',
            text: 'Required. In the [a-z0-9-]+ format and unique in the specialization.',
          },
          {
            term: 'name',
            text: 'Required, non-empty. It is the text of the option in the list.',
          },
          {
            term: 'width',
            text: 'Required. Width in pixels, an integer from 1 to 20000.',
          },
          {
            term: 'height',
            text: 'Required. Height in pixels, an integer from 1 to 20000.',
          },
          {
            term: 'background',
            text: 'Optional. A #RRGGBB color; without it the container is born white (#FFFFFF).',
          },
        ],
      },
      {
        kind: 'p',
        text: 'Version 5 is still accepted: a specialization without containers only shows Custom and Selection size in the list. The list is outside the version contract: adding, changing or removing sizes is never a break and needs no migration. The repository’s material3-compose library brings Phone 360 × 800, Large phone 412 × 915, Tablet 800 × 1280 and Desktop 1440 × 900.',
      },
    ],
  },
  {
    id: 'floating',
    title: 'Floating type',
    blocks: [
      {
        kind: 'p',
        text: 'formatVersion 7 lets an annotation type be floating (floating: true). The instance of a floating type is a floating marking: a loose comment, like a sticky note, that lives only on the canvas and stays out of containment in both directions: it is never a child of a container or of a marking and never a parent. It is drawn above everything, even over photos with Show components over photos turned off, and dragging it moves only it. Add (the Palette button) always creates it on the canvas, at the center of the view; dragging from the Palette drops it where it lands. The relation with a screen or an element is an arrow, not containment.',
      },
      {
        kind: 'p',
        text: 'Use floating only for what is a comment or loose annotation that does not belong to a screen (a note, a message, a business rule); never for interface components.',
      },
      { kind: 'code', code: FLOATING_EXCERPT },
      {
        kind: 'terms',
        items: [
          {
            term: 'floating',
            text: 'Boolean, optional; defaults to false. From formatVersion 7 on only: in an earlier version the error is only allowed with formatVersion 7, at the type path.',
          },
        ],
      },
      {
        kind: 'p',
        text: 'The repository notes library (Notes layer, nota and tabela types, sticky-note components) is a regular package, embedded in the app and applied by default: a new project is born with it, and a project opened from a schema older than 13 gains it on opening. It is removed through Specializations › Remove, like any other, and does not come back. String fields of the type accept several lines in the interface (the editor opens in several lines when the text has a break or goes past 60 characters, or with Shift+Enter; while the text has no line break, Enter saves and Shift+Enter breaks the line).',
      },
    ],
  },
  {
    id: 'applies-to',
    title: 'What the type applies to',
    blocks: [
      {
        kind: 'p',
        text: 'formatVersion 7 says what an annotation applies to with appliesTo on the type: "marking" (a marking, the default), "arrow" (an arrow, which links two markings and can have annotations per layer like any marking) or both. The annotations panel offers, for the selected marking, only the types that apply to markings, and, for the arrow, only those that apply to arrows. An arrow-only type (appliesTo: ["arrow"]) has no component or floating: an arrow has no component drawing.',
      },
      { kind: 'code', code: APPLIES_TO_EXCERPT },
      {
        kind: 'p',
        text: 'The "floating that points" pattern: a floating table (floating: true, with the table component) sits beside a screen and is linked to the element it describes by an arrow. The data (the events, the properties) lives in the annotation of the floating table; the agent reaches it through the arrows leaving the element. The ref column of a table is data, not an arrow: it holds a list of references to tuples (table rows, fields, free tuples) and no link is drawn.',
      },
      { kind: 'code', code: POINTING_EXCERPT },
      {
        kind: 'terms',
        items: [
          {
            term: 'appliesTo',
            text: 'List of "marking" and/or "arrow", optional; non-empty, without repetition. Defaults to ["marking"]. From formatVersion 7 on only: in an earlier version the error is only allowed with formatVersion 7, at the type path.',
          },
        ],
      },
    ],
  },
  {
    id: 'notices',
    title: 'Notices (notices)',
    blocks: [
      {
        kind: 'p',
        text: 'formatVersion 10 lets the specialization warn about a type, a field or a table column with notices: a list of short notices, written by whoever generates the specialization, to record that two sources disagree (the contract says one thing and the code another), or that something is pending in one of them, deprecated or removed. The app shows the notice beside the type, the field or the column; the agent reads it when instantiating the type.',
      },
      { kind: 'code', code: NOTICES_EXCERPT },
      {
        kind: 'terms',
        items: [
          {
            term: 'kind',
            text: 'Required. One of removed (Removed: left the contract and must not be used), deprecated (Deprecated: the message says what to use instead), diverges (Diverges: the sources disagree, the message says on what) and pending (Pending: one source already has it and the other does not yet; the name of the platform or origin goes in the message). The severity is fixed: removed > deprecated = diverges > pending.',
          },
          {
            term: 'message',
            text: 'Required. What the person needs to know: non-empty text that is not only spaces.',
          },
          {
            term: 'since',
            text: 'Optional. Since when the notice holds: a real date in YYYY-MM-DD format.',
          },
          {
            term: 'ref',
            text: 'Optional, free non-empty text. Where the notice comes from (the contract page, the code file).',
          },
        ],
      },
      {
        kind: 'list',
        items: [
          'Notices are shown in the order removed, deprecated, diverges, pending and, within the same kind, in file order. Two notices with the same kind and message in the list are the error aviso repetido.',
          "A notice only informs: none, not even removed, prevents importing the specialization, applying it, creating an annotation of the type or accepting a proposal. It is not an incompleteness either: the Incomplete window does not change. The Details show a field's notice even when it is empty; the Notices window and the count only include a field that has a value.",
          'Outside the version contract: adding, changing or removing notices is compatible and never asks for a migration. Whoever generates the specialization may rewrite all notices on every run; a notice disappears by itself when the difference between the sources disappears. Updating the specialization only through notices shows no impact.',
        ],
      },
    ],
  },
  {
    id: 'sources',
    title: 'Sources (sources)',
    blocks: [
      {
        kind: 'p',
        text: 'formatVersion 3 states which elements of an external system (a design tool, another component catalog…) each type corresponds to, and which source property each field comes from. An import agent uses it to know which component becomes which type without guessing from the name; the proposals it creates rely on this mapping. The app does not interpret system or the names: it only validates the structure. In formatVersion 4, a system declared in origins is executable: the specialization says how to read its JSON and build a screen of components.',
      },
      { kind: 'code', code: SOURCES_EXCERPT },
      {
        kind: 'terms',
        items: [
          {
            term: 'sources',
            text: 'Optional. On an annotation type: list of { system, id?, name? }, each with at least id or name (a type can correspond to several elements, e.g. old and new variants). On a field or table column: list of { system, name, values? }, the source property of the value.',
          },
          {
            term: 'system',
            text: 'Name of the source system. system, id and name are non-empty strings; comparisons are exact (case matters).',
          },
          {
            term: 'values',
            text: 'In a field source, only for enum fields: source value → one of the options (the targets must exist in options).',
          },
        ],
      },
      {
        kind: 'p',
        text: 'sources only exists from formatVersion 3 on: in versions 1 and 2 the file is rejected with the version message instead of ignoring the sources.',
      },
      {
        kind: 'p',
        text: 'In an executable system (declared in origins, formatVersion 4):',
      },
      {
        kind: 'terms',
        items: [
          {
            term: 'path',
            text: 'In a field or column source: the path of the value inside the external node’s props (a.b[0].c, no [*]). Required in a system declared in origins and forbidden in the others; name becomes just the display name.',
          },
          {
            term: 'slot',
            text: 'In a type source: the name of the component slot that receives the external node’s children.',
          },
          {
            term: 'ignore',
            text: 'In a type source: props the external node carries and the drawing does not use (no unknown-property warning).',
          },
          {
            term: 'origins',
            text: 'At the root: the executable declaration of each system, with node (node keys), screen (width, height, background and roots with anchor and scrim), booleans and examples (example screens). The app runs the declaration, never code from the specialization.',
          },
        ],
      },
      { kind: 'code', code: ORIGINS_EXCERPT },
    ],
  },
  {
    id: 'package',
    title: 'Library: the package',
    blocks: [
      {
        kind: 'p',
        text: 'With formatVersion 4, a specialization is a library: a package, which is the specialization folder with everything it cites. Every cited path is relative to the specialization file, with /, no .. or drive letter, and ends in the expected extension.',
      },
      { kind: 'code', code: PACKAGE_TREE },
      {
        kind: 'terms',
        items: [
          {
            term: 'component',
            text: 'On each type: the .json component file that draws it (format in docs/COMPONENT-FORMAT.md). Optional: a type without a component is still valid, it just has no drawing.',
          },
          { term: 'doc', text: 'On each type: the type’s markdown (.md) document.' },
          {
            term: 'examples',
            text: 'On each type: examples with a unique name and a single mode, values (values of the type’s fields; table and ref are not accepted) or system with file (the JSON of a node of an origins system).',
          },
          {
            term: 'fonts',
            text: 'At the root: list of { family, file, weight?, style? } with a .ttf, .otf, .woff or .woff2 file. A missing font warns and the drawing uses the system font.',
          },
          {
            term: 'origins',
            text: 'At the root: the executable origin declaration (previous section), with example screens in examples.',
          },
          {
            term: 'migrations',
            text: 'At the root: the version contract (next section).',
          },
        ],
      },
      {
        kind: 'p',
        text: 'In the app, Specializations › Apply folder… (Chrome and Edge) or Apply zip… checks the package through the three levels: errors block, warnings let you apply. Applying copies the whole folder to specs/<id>/ in the project; Update from folder… or from zip… rewrites the copy and Remove deletes it. A v4 or v5 specialization that cites no package file (no component, doc, examples, fonts or origins) works as a lone .json file; one that does is refused as a .json: the library needs the whole folder. The repository ships complete libraries in libraries/ (for example material3-compose, with 50 Material 3 types for Jetpack Compose and the Roboto font) and, in examples/libraries/sdui-backend/, the example of the executable origin.',
      },
    ],
  },
  {
    id: 'contract',
    title: 'Version contract',
    blocks: [
      {
        kind: 'p',
        text: 'version is the package version. When it goes up, each difference is additive (it only adds: a type, an optional field, an enum option, a component, a document, an example, a font, or a new drawing without changing the fields) or breaking (it removes or renames a type, a field or an enum option, makes a field required or changes a field’s type). In formatVersion 12 the roles (childRoles) are in the contract: removing a role from a type or giving roles to a type that had none is breaking, and adding a role to a type that already had roles is additive. Layers, labelField, allowedChildren, requiresOwner, description, tags, code, platforms and sources are outside the contract, and so are the role name and description, the order of childRoles and childRolesLabel.',
      },
      {
        kind: 'p',
        text: 'Every breaking change needs a step in migrations, which links two package versions (from and to) and lists declarative steps. A field can be cited by key or by table.column.',
      },
      { kind: 'code', code: MIGRATIONS_EXCERPT },
      {
        kind: 'terms',
        items: [
          { term: 'rename-type', text: 'Type renamed (from → to).' },
          {
            term: 'remove-type',
            text: 'Type removed; mode (convert or delete) says where its annotations go.',
          },
          { term: 'rename-field', text: 'Field renamed (from → to).' },
          { term: 'remove-field', text: 'Field removed.' },
          {
            term: 'map-values',
            text: 'Enum option removed: each old value points to a current option.',
          },
          {
            term: 'fill-field',
            text: 'Field that became required, new required field or changed type: the default takes its place.',
          },
          {
            term: 'rename-role',
            text: 'formatVersion 12. Role renamed on the owner type (type, from → to). If to already existed, the two roles merge. No loss and nothing pending.',
          },
          {
            term: 'remove-role',
            text: 'formatVersion 12. Role removed from the owner type (type, role); mode says where the children go: clear keeps the link and drops the role (a loss; pending if the owner still has roles), unlink detaches the child (a loss; pending owner if the child type requires an owner).',
          },
          {
            term: 'set-role',
            text: 'formatVersion 12. A type that gained roles: gives the role (type, role) to the owner’s children that have none, only those of childType when it comes. It fills and never overwrites; it never causes a loss. Use it before the child’s rename-type so the information is kept.',
          },
        ],
      },
      {
        kind: 'p',
        text: 'An example of a v12 specialization with the three role steps (the annotations only change the link, parentRole, never the child itself):',
      },
      { kind: 'code', code: ROLES_MIGRATION_EXCERPT },
      {
        kind: 'p',
        text: 'When updating, the app runs the chain steps on the project’s annotations and shows the impact first: the steps with their counts, the losses highlighted (deleted values or annotations) and the pending items that open in Incomplete. A breaking change without a step refuses the update, and Undo restores the library and the data together.',
      },
    ],
  },
  {
    id: 'librarycheck',
    title: 'Library validation',
    blocks: [
      {
        kind: 'p',
        text: 'A package is validated on three levels, in order. An error prevents use; a warning allows it.',
      },
      {
        kind: 'list',
        items: [
          'Level 1, each file alone and strict: the specialization, each cited component and each document. A cited file that is missing is an error; a package file nobody cites is a warning.',
          'Level 2, consistency between files: the declared slot exists in the component, the fields the drawing uses exist in the type (error), the example files exist, the scrim is a type, the font has a file (warning) and, with the previous version, the version contract.',
          'Level 3, drawing proof: each component is drawn with the preview and with each example, at the initial and the minimum size, and each external-system example goes through the declaration. Engine warnings carry (aproximado), because outside the browser the text is measured approximately.',
        ],
      },
      {
        kind: 'terms',
        items: [
          {
            term: 'error',
            text: 'Prevents using the package (missing or invalid file, a field the drawing uses that does not exist, a version break without a step).',
          },
          {
            term: 'warning',
            text: 'Allows use: missing font, unused file, a field the drawing does not use, content larger than the box.',
          },
        ],
      },
      { kind: 'code', code: ISSUE_EXCERPT },
      {
        kind: 'p',
        text: 'The repository’s material3-compose library passes with zero errors and zero warnings. The app, the MCP server (validate_library) and the skill call the same validation.',
      },
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
          'format, formatVersion (1 to 13), id, name and version required; version an integer ≥ 1;',
          'unique layer ids; type ids unique across the whole specialization; key unique in the type and in the columns; no key starting with _;',
          'allowedChildren only references existing types, in another layer (from formatVersion 13, also in the owner’s own layer);',
          'every type with requiresOwner: true appears in the allowedChildren of some type (in formatVersion 11, in the resolved set of children of some owner: by id, by whole layer or by group);',
          'default compatible with the type (and present in options for enum); ref without default;',
          'columns with simple types only or, in formatVersion 7, ref (with accepts; a table inside a table does not exist); rowLabel required on a table with tags and pointing to a string column;',
          'labelField points to a string field of the type;',
          'accepts with at least one tag or free: true; tags in the [a-z0-9-]+ format;',
          'platforms: id in the [a-z0-9-]+ format, unique, and name required; platforms and code from formatVersion 2 on; sources (external origins) from formatVersion 3 on;',
          'formatVersion 11, children by layer and group: version 11 only (before it the error is only allowed with formatVersion 11, at the exact path); each allowedChildren item is a type id or a strict { layer, groups } clause (any other property is an error, and so is an empty groups); errors: a layer that is not a layer of the specialization or is the owner’s own before formatVersion 13 (children must be in another layer) and a group that does not exist in the clause’s layer; requiresOwner is checked against the resolved set; layer groups with a non-empty id unique in the layer and a non-empty name; type groups non-empty, without repetition and only from its own layer; warnings: 20 ids or more in text in the same allowedChildren and a group no type uses;',
          'formatVersion 12, role steps in migrations: rename-role, remove-role and set-role in version 12 only (from 4 to 11 the error is only allowed with formatVersion 12, at migrations[i].steps[j].op); strict keys; rename-role: type is a type of this version with childRoles, to is one of its roles and from is not; remove-role: type is a type of this version, role is not one of its roles and mode is clear or unlink; set-role: type has childRoles, role is one of its roles and childType only checks the id format; warning: a rename-role.from or remove-role.role that was not a role of the type in the previous version;',
          'formatVersion 11, childRoles and childRolesLabel: version 11 only; childRoles non-empty, of strict { id, name, description? }, with a non-empty id unique in the type and a non-empty name; only on a type with allowedChildren; childRolesLabel non-empty text and only with childRoles; without it the app uses "Role";',
          'formatVersion 11, docRepos and doc object: version 11 only; docRepos[n] with the rules of a platform repo (url required, http(s):// without spaces, urlTemplate optional with {path}, ref optional non-empty) and an id in the [a-z0-9-]+ format, unique; doc object { repo, path } strict: repo must be in docRepos, path relative (no ., .. or leading /), ending in .md and without #; the text doc is still valid from version 4 on; warning: a docRepos repository no doc uses;',
          'formatVersion 10, notices: only in version 10 (before it the error is only allowed with formatVersion 10, at the type, field or column path); a list of strict objects with kind (pending, deprecated, diverges or removed) and message (not empty or only spaces) required, since (a real YYYY-MM-DD date) and ref (non-empty text) optional; two notices with the same kind and message are the error repeated notice (aviso repetido), at the path of the second; any other property is refused;',
          'formatVersion 10, notices: only in version 10 (before it the error is only allowed with formatVersion 10, at the type, field or column path); a list of strict objects with kind (pending, deprecated, diverges or removed) and message (not empty or only spaces) required, since (a real YYYY-MM-DD date) and ref (non-empty text) optional; two notices with the same kind and message are the error aviso repetido, at the path of the second; any other property is refused;',
          'formatVersion 7, floating, appliesTo and ref column: version 7 only (before it the error is only allowed with formatVersion 7); floating is boolean; appliesTo is non-empty, without repetition, with "marking" and "arrow" only, and an arrow-only type has no component or floating;',
          'formatVersion 6, containers: version 6 only (before it the error is only allowed with formatVersion 6); id in the [a-z0-9-]+ format and unique in the list; name non-empty; width and height integers from 1 to 20000; background optional, #RRGGBB; any other property is rejected;',
          'formatVersion 5, repo: version 5 only, inside a platforms entry (before it the error is only allowed with formatVersion 5); url required, starting with http:// or https://; urlTemplate optional, http(s):// and containing {path}; ref optional, non-empty text; any other property is rejected. A platform with a path on some type and no repo is only a warning (path-without-repo);',
          'code only in specializations with platforms; the ids in code must exist in platforms;',
          'keys of params and values must be fields of the type; values only for enum, with keys that exist in options; symbol required and path, if present, relative to the platform repo root;',
          'formatVersion 4: fonts, origins, migrations, component, doc and examples only from version 4 on, with relative package paths and the right extension; fonts without a repeated family + weight + style; examples with a unique name and a single mode; path only in a system declared in origins (and required there), slot and ignore only there; migrations with coherent from and to and steps that cite types and fields that exist;',
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
          'platforms declares the two code targets where the agent writes the solution, android and bff, each with the repo of its library (url, the urlTemplate of a file link and the ref the code corresponds to).',
          'code says how to create an instance of each type: on android, symbol is the composable to call (com.app.ds.DSButton) and path is the file that defines it, relative to the repo root; on bff, symbol is the Kotlin function that generates the JSON node (com.app.bff.sdui.button), not the node name. The agent reads the file to see the signature and writes the call.',
          'params gives the name each field is passed with (estilo goes in style on Android and in variant on the BFF) and values how the enum value is written in the code (primary becomes ButtonStyle.Primary); notes guides (the BFF function returns the component node in the screen JSON).',
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
