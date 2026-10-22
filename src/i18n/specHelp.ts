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
          { "path": "modal", "anchor": "bottom", "scrim": "m3-scrim" }
        ]
      },
      "booleans": { "true": "sim", "false": "não" },
      "examples": [{ "name": "Configurações", "file": "examples/settings.sdui.json" }]
    }
  ]
}`;

/** A árvore de um pacote de biblioteca (a pasta da especialização, v4). */
const PACKAGE_TREE = `material3/
  material3.spec.json          a especialização (formatVersion 6)
  components/m3-button.json    um arquivo por componente (mapping-component)
  docs/m3-button.md            o documento markdown do tipo
  examples/settings.sdui.json  uma tela de exemplo de um sistema externo
  fonts/Roboto-Regular.ttf     as fontes do desenho
  fonts/LEIA-ME.txt`;

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

/** Um problema do validador da biblioteca. */
const ISSUE_EXCERPT = `{
  "file": "material3.spec.json",
  "path": "layers[0].annotationTypes[2].component",
  "message": "arquivo não encontrado: components/m3-fab.json",
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
          'A formatVersion 4 acrescenta a biblioteca: componentes que desenham os tipos, documentos, exemplos, fontes, origens executáveis e o contrato de versão (seções "Biblioteca: o pacote", "Contrato de versão" e "Validação da biblioteca").',
          'A formatVersion 5 é a 4 mais o repo nas plataformas: o repositório da biblioteca em cada plataforma, de onde vêm o link e a revisão do arquivo de cada symbol (seção "Plataformas e code").',
          'A formatVersion 6 é a 5 mais containers: os tamanhos prontos que o diálogo Novo container oferece quando a especialização está aplicada (seção "Containers (tamanhos prontos)"). O núcleo só tem Personalizado e Tamanho da seleção; as versões 1 a 5 continuam aceitas.',
          'A formatVersion 7 é a 6 mais floating no tipo de anotação: o tipo cuja instância é uma marcação flutuante, um comentário solto sobre o canvas (seção "Tipo flutuante"). As versões 1 a 6 continuam aceitas.',
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
        text: 'Na raiz: format (sempre "mapping-spec"), formatVersion (1 a 7), id, name e version (inteiro ≥ 1) são obrigatórios; description, platforms (com repo na versão 5), containers (a partir da versão 6) e, a partir da versão 4, fonts, origins e migrations são opcionais. Cada camada tem id (único), name, color (#RRGGBB) e annotationTypes.',
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
            text: 'Opcional (formatVersion 2). Como se cria uma instância do tipo em cada plataforma declarada.',
          },
          {
            term: 'component',
            text: 'Opcional (formatVersion 4). Caminho do arquivo .json do componente que desenha o tipo.',
          },
          {
            term: 'doc',
            text: 'Opcional (formatVersion 4). Caminho do documento .md do tipo.',
          },
          {
            term: 'examples',
            text: 'Opcional (formatVersion 4). Exemplos nomeados: valores dos campos do tipo ou o JSON de um sistema externo.',
          },
          {
            term: 'floating',
            text: 'Opcional (formatVersion 7). Padrão false. A instância é uma marcação flutuante (seção "Tipo flutuante").',
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
          'Como o agente chega ao arquivo: pelo urlTemplate do repo da plataforma, na especialização dona do tipo, com {path} trocado pelo path (a app mostra esse link na linha "Definição" logo depois de aplicar a especialização); ou pelo clone local, que o projeto pode informar em Configurações › Repositórios de código (platformRepos[plataforma].localPath, uma sobreposição local: o caminho local do arquivo é o localPath mais o path).',
          'Plataformas com o mesmo id em especializações diferentes são o mesmo alvo de código. Cada especialização declara o repo da própria biblioteca, e eles podem diferir: o link de um tipo usa o repo da especialização dele.',
          'code só vale em especializações que declaram platforms; os ids citados precisam estar em platforms, e as chaves de params e values precisam ser campos do tipo.',
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
        text: 'A 5 continua aceita: uma especialização sem containers só aparece na lista com Personalizado e Tamanho da seleção. A lista está fora do contrato de versão: acrescentar, mudar ou remover tamanhos nunca é quebra nem pede migração. O pacote Material 3 do repositório traz Celular 360 × 800, Celular grande 412 × 915, Tablet 800 × 1280 e Desktop 1440 × 900.',
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
        text: 'A biblioteca de notas do repositório (camada Notas, tipo nota com titulo e texto, componente post-it) é um pacote comum, embutido na app e aplicado por padrão: o projeto novo nasce com ela, e o projeto aberto de um schema anterior ao 13 a ganha ao abrir. Ela se remove por Especializações › Remover, como qualquer outra, e não volta. Campos string do tipo aceitam várias linhas na interface (o editor abre em várias linhas quando o texto tem quebra ou passa de 60 caracteres, ou com Shift+Enter).',
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
        text: 'No app, Especializações › Aplicar pasta… (Chrome e Edge) ou Aplicar zip… confere o pacote pelos três níveis: erros bloqueiam, avisos deixam aplicar. Aplicar copia a pasta inteira para specs/<id>/ no projeto; Atualizar de pasta… ou de zip… regrava a cópia e Remover a apaga. Uma especialização v4 ou v5 que não cita nenhum arquivo do pacote (sem component, doc, examples, fonts nem origins) vale como arquivo .json isolado; a que cita é recusada em .json: a biblioteca precisa da pasta inteira. O repositório traz um pacote completo, o Material 3, em examples/libraries/material3/, gerado por npm run build:examples.',
      },
    ],
  },
  {
    id: 'contract',
    title: 'Contrato de versão',
    blocks: [
      {
        kind: 'p',
        text: 'version é a versão do pacote. Ao subir a versão, cada diferença é aditiva (só acrescenta: tipo, campo opcional, opção de enum, componente, documento, exemplo, fonte, ou um desenho novo sem mudar os campos) ou quebra (remove ou renomeia tipo, campo ou opção de enum, torna um campo obrigatório ou muda o type de um campo). Camadas, labelField, allowedChildren, requiresOwner, description, tags, code, platforms e sources ficam fora do contrato.',
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
        ],
      },
      {
        kind: 'p',
        text: 'Ao atualizar, a app executa os passos da cadeia sobre as anotações do projeto e mostra antes o impacto: os passos com suas contagens, as perdas em destaque (valores ou anotações apagados) e as pendências que abrem em Incompletas. Uma quebra sem passo recusa a atualização, e Desfazer devolve a biblioteca e os dados juntos.',
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
        text: 'O pacote Material 3 do repositório passa com zero erros e 42 avisos (duas fontes ausentes e 40 de conteúdo maior que a caixa na prova de desenho). O app, o servidor MCP e a skill vão chamar a mesma validação; isso chega em uma fase seguinte da etapa Biblioteca.',
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
          'format, formatVersion (1 a 7), id, name e version obrigatórios; version inteiro ≥ 1;',
          'ids de camada únicos; ids de tipo únicos na especialização inteira; key única no tipo e nas colunas; nenhuma key começando com _;',
          'allowedChildren só referencia tipos existentes em outra camada;',
          'todo tipo com requiresOwner: true aparece no allowedChildren de algum tipo;',
          'default compatível com o tipo (e presente em options no enum); ref sem default;',
          'columns só com tipos simples; rowLabel obrigatório em table com tags e apontando para uma coluna string;',
          'labelField aponta para um campo string do tipo;',
          'accepts com pelo menos uma etiqueta ou free: true; etiquetas no formato [a-z0-9-]+;',
          'platforms: id no formato [a-z0-9-]+, único, e name obrigatório; platforms e code a partir da formatVersion 2; sources (origens externas) a partir da formatVersion 3;',
          'formatVersion 7, floating: só na versão 7 (antes dela o erro é só é permitido com formatVersion 7); booleano;',
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
          'formatVersion 4 adds the library: components that draw the types, documents, examples, fonts, executable origins and the version contract (sections "Library: the package", "Version contract" and "Library validation").',
          'formatVersion 5 is 4 plus repo on the platforms: the library repository on each platform, where the link and the revision of the file of each symbol come from (section "Platforms and code").',
          'formatVersion 6 is 5 plus containers: the ready-made sizes the New container dialog offers when the specialization is applied (section "Containers (ready-made sizes)"). The core only has Custom and Selection size; versions 1 to 5 are still accepted.',
          'formatVersion 7 is 6 plus floating on the annotation type: the type whose instance is a floating marking, a loose comment over the canvas (section "Floating type"). Versions 1 to 6 are still accepted.',
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
        text: 'At the root: format (always "mapping-spec"), formatVersion (1 to 7), id, name and version (integer ≥ 1) are required; description, platforms (with repo in version 5), containers (from version 6) and, from version 4 on, fonts, origins and migrations are optional. Each layer has id (unique), name, color (#RRGGBB) and annotationTypes.',
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
            text: 'Optional (formatVersion 2). How to create an instance of the type on each declared platform.',
          },
          {
            term: 'component',
            text: 'Optional (formatVersion 4). Path of the .json component file that draws the type.',
          },
          {
            term: 'doc',
            text: 'Optional (formatVersion 4). Path of the type’s .md document.',
          },
          {
            term: 'examples',
            text: 'Optional (formatVersion 4). Named examples: values of the type’s fields or the JSON of an external system.',
          },
          {
            term: 'floating',
            text: 'Optional (formatVersion 7). Defaults to false. The instance is a floating marking (section "Floating type").',
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
          'How the agent reaches the file: through the urlTemplate of the platform repo, in the specialization that owns the type, with {path} replaced by the path (the app shows this link in the "Definition" line right after the specialization is applied); or through the local clone, which the project can report in Settings › Code repositories (platformRepos[platform].localPath, a local overlay: the local path of the file is the localPath plus the path).',
          'Platforms with the same id in different specializations are the same code target. Each specialization declares the repo of its own library, and they may differ: the link of a type uses the repo of its specialization.',
          'code only works in specializations that declare platforms; the ids it cites must exist in platforms, and the keys of params and values must be fields of the type.',
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
        text: 'Version 5 is still accepted: a specialization without containers only shows Custom and Selection size in the list. The list is outside the version contract: adding, changing or removing sizes is never a break and needs no migration. The repository Material 3 package brings Phone 360 × 800, Large phone 412 × 915, Tablet 800 × 1280 and Desktop 1440 × 900.',
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
        text: 'The repository notes library (Notes layer, nota type with titulo and texto, sticky-note component) is a regular package, embedded in the app and applied by default: a new project is born with it, and a project opened from a schema older than 13 gains it on opening. It is removed through Specializations › Remove, like any other, and does not come back. String fields of the type accept several lines in the interface (the editor opens in several lines when the text has a break or goes past 60 characters, or with Shift+Enter).',
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
        text: 'In the app, Specializations › Apply folder… (Chrome and Edge) or Apply zip… checks the package through the three levels: errors block, warnings let you apply. Applying copies the whole folder to specs/<id>/ in the project; Update from folder… or from zip… rewrites the copy and Remove deletes it. A v4 or v5 specialization that cites no package file (no component, doc, examples, fonts or origins) works as a lone .json file; one that does is refused as a .json: the library needs the whole folder. The repository ships a complete package, Material 3, in examples/libraries/material3/, generated by npm run build:examples.',
      },
    ],
  },
  {
    id: 'contract',
    title: 'Version contract',
    blocks: [
      {
        kind: 'p',
        text: 'version is the package version. When it goes up, each difference is additive (it only adds: a type, an optional field, an enum option, a component, a document, an example, a font, or a new drawing without changing the fields) or breaking (it removes or renames a type, a field or an enum option, makes a field required or changes a field’s type). Layers, labelField, allowedChildren, requiresOwner, description, tags, code, platforms and sources are outside the contract.',
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
        ],
      },
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
        text: 'The repository’s Material 3 package passes with zero errors and 42 warnings (two missing fonts and 40 of content larger than the box in the drawing proof). The app, the MCP server and the skill will call the same validation; that arrives in a later phase of the Library stage.',
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
          'format, formatVersion (1 to 7), id, name and version required; version an integer ≥ 1;',
          'unique layer ids; type ids unique across the whole specialization; key unique in the type and in the columns; no key starting with _;',
          'allowedChildren only references existing types in another layer;',
          'every type with requiresOwner: true appears in the allowedChildren of some type;',
          'default compatible with the type (and present in options for enum); ref without default;',
          'columns with simple types only; rowLabel required on a table with tags and pointing to a string column;',
          'labelField points to a string field of the type;',
          'accepts with at least one tag or free: true; tags in the [a-z0-9-]+ format;',
          'platforms: id in the [a-z0-9-]+ format, unique, and name required; platforms and code from formatVersion 2 on; sources (external origins) from formatVersion 3 on;',
          'formatVersion 7, floating: version 7 only (before it the error is only allowed with formatVersion 7); boolean;',
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
