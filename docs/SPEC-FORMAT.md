# Formato da especialização (`formatVersion` 1 a 16)

O formato do arquivo que define camadas e tipos de anotação (e, na `formatVersion` 2, as plataformas de código e o código de instanciação dos tipos; na 3, as origens externas; na 4, a **biblioteca**: componentes, documentos, exemplos, fontes, origens executáveis e o contrato de versão; na 5, o repositório de cada plataforma; na 6, os tamanhos prontos de container; na 7, o tipo flutuante; na 8, as sugestões de texto; na 9, as variantes do código; na 10, os avisos; na 11, os filhos por camada e grupo, os papéis no vínculo e o documento em repositório externo; na 12, os passos de migração dos papéis; na 13, os filhos da própria camada; na 14, a anotação inteira como alvo de um `ref`; na 15, os tokens de design; na 16, as assinaturas e os modelos de campo). A página "Ajuda → Especializações" da app é uma versão resumida deste documento (um teste garante que os títulos das seções e os blocos de código coincidem).

## O que é uma especialização

Uma **especialização** é um arquivo JSON que define **camadas obrigatórias** e os **tipos de anotação** que podem ser criados nelas. Ex: a especialização **SDUI** traz a camada Componentes (Button, Input…) e a camada Eventos (onClick, onHold…). Ao criar um Button, as chaves já vêm definidas e só falta preencher os valores.

- Um projeto pode aplicar **várias** especializações, a qualquer momento.
- Uma especialização **não cita outra pelo nome**. A ligação entre elas é feita por **referências fortes** (tipo `ref`) que escolhem os alvos por **etiquetas**.
- Camadas da especialização só aceitam anotações **tipadas**, sem chaves extras. Camadas criadas pelo usuário continuam livres.
- A especialização aplicada é **copiada** para `specs/<id>.json` dentro do projeto, que fica autocontido. A cópia mantém a `formatVersion` com que foi aplicada.
- A `formatVersion` 12 é a 11 mais três **passos de migração dos papéis**, em `migrations`: `rename-role`, `remove-role` e `set-role` (ver "Contrato de versão" e "Papéis no vínculo (childRoles)"). Antes dela, tirar um papel de `childRoles` deixava `parentRole` das anotações apontando para um papel que não existe mais; a 12 trata essa troca como **quebra** e a cobre com um passo que renomeia, remove ou preenche o papel nas anotações do projeto. A 12 é aditiva: as versões 1 a 11 continuam aceitas sem mudança, e cada passo novo numa versão anterior é o erro `só é permitido com formatVersion 12`, no caminho exato. Só sobe para a 12 a especialização que declara algum desses passos. Uma v11 que remove ou torna obrigatório o papel de um tipo, sem o passo, é recusada na atualização até subir para a 12 com ele.
- A `formatVersion` 13 é a 12 mais os **filhos da própria camada**: `allowedChildren` passa a aceitar a cláusula `{ layer }` com a camada do próprio dono e o id de um tipo da mesma camada, inclusive o do próprio tipo (ver "Filhos por camada e grupo"). Com isso um evento pode ser dono de outros eventos, cada filho no papel em que se liga (`childRoles`), e a anotação **tipada** pode ter dona da mesma camada no projeto (schema v15; a **livre** continua só com dona de outra camada, e o ciclo continua barrado). A 13 é aditiva: as versões 1 a 12 continuam aceitas sem mudança, e a camada ou o tipo da própria camada em `allowedChildren` numa versão anterior continua sendo o erro de sempre (`filhos devem estar em outra camada`). Só sobe para a 13 a especialização que declara um filho da própria camada.
- A `formatVersion` 14 é a 13 mais a **anotação inteira como alvo**: o `accepts` de um campo ou coluna `ref` ganha `annotations`, uma lista de ids de tipo ou cláusulas `{ layer, groups? }` da **mesma especialização**, com a mesma sintaxe e o mesmo resolvedor do `allowedChildren` (ver "Referências e etiquetas"). A 14 é aditiva: as versões 1 a 13 continuam aceitas sem mudança, e `annotations` numa versão anterior é o erro `só é permitido com formatVersion 14`, no caminho `…accepts.annotations`. Só sobe para a 14 a especialização que declara `accepts.annotations`.
- A `formatVersion` 15 é a 14 mais os **tokens de design**: a chave `tokens` na raiz declara valores nomeados (cores, raios, espaçamentos, famílias de fonte), simples ou por modo (`light`/`dark`), que os componentes de formato 4 leem com `{ "$token": "nome" }` (ver "Tokens de design"). A 15 também traz o **conjunto de ícones**: a chave `icons` na raiz aponta para um arquivo `.json` do pacote com os ícones, que o nó `icon` dos componentes de formato 4 lê (ver "Conjunto de ícones"). A 15 é aditiva: as versões 1 a 14 continuam aceitas sem mudança, e `tokens` ou `icons` numa versão anterior é o erro `só é permitido com formatVersion 15`, no caminho da chave. A 15 traz ainda `structural` no tipo de anotação: `structural: true` marca o tipo que **agrupa e não desenha** (um grupo, uma seção). Ele não tem `component` (`structural` junto com `component` é erro de validação, no caminho `structural`), a marcação dele não mostra o cabeçalho com o nome no canvas, o contorno aparece só com o mouse ou selecionada (como o de quem tem desenho) e ela não conta como "sem componente" em nenhuma pendência; `structural` numa versão anterior é o erro `só é permitido com formatVersion 15`, no caminho `…annotationTypes[n].structural`. A 15 traz também a **origem medida**: `origins[].kind` (`tree`, o padrão, ou `measured`; ver "Origens (sources)"); `kind` numa versão anterior é o erro `só é permitido com formatVersion 15`, no caminho `origins[n].kind`. Só sobe para a 15 a especialização que declara `tokens`, `icons`, `structural` ou `kind: "measured"`.
- A `formatVersion` 16 é a 15 mais as **assinaturas e os modelos de campo**: o `code` de cada plataforma (e cada caso de `variants`) passa a poder citar a **ficha de assinatura** do que se chama (`signature`, formato `mapping-signature`, ver `docs/SIGNATURE-FORMAT.md`), deixar parâmetros de fora de propósito (`ignore`), ligar parâmetros a fábricas (`calls`) e formatar o valor (`formats`); `params` passa a aceitar o caminho `colors.containerColor` e o posicional `#0`; as `sources` do tipo aceitam `signature`; e a raiz ganha `fieldModels` (ver "Assinaturas e modelos de campo"). A 16 é aditiva: as versões 1 a 15 continuam aceitas sem mudança, e cada chave nova numa versão anterior é o erro `só é permitido com formatVersion 16`, no caminho exato da chave. Antes da 16, os valores de `params` com `.` ou `#0` são texto opaco, como sempre foram. Só sobe para a 16 a especialização que declara `fieldModels`, `signature`, `ignore`, `calls` ou `formats`, ou um caminho ou posicional em `params`.
- A `formatVersion` 2 é a 1 mais o código de instanciação (plataformas e `code`: como se cria uma instância de cada tipo). A importação aceita as versões 1 a 16; uma especialização v1 é uma v2 sem plataformas e sem `code` (ver "Plataformas e code").
- A `formatVersion` 3 é a 2 mais `sources`: a que elementos de um sistema externo cada tipo corresponde e de que propriedade de origem vem cada campo (ver "Origens (sources)").
- A `formatVersion` 4 é a 3 mais a **biblioteca**: o tipo aponta para um componente (`component`), um documento (`doc`) e exemplos (`examples`); a raiz ganha `fonts`, `origins` e `migrations`; as `sources` ganham `path`, `slot` e `ignore` (ver "Origens (sources)", "Biblioteca: o pacote", "Contrato de versão" e "Validação da biblioteca"). As versões 1, 2 e 3 continuam aceitas sem mudança: cada chave da v4 numa versão anterior é o erro `só é permitido com formatVersion 4`, no caminho exato.
- A `formatVersion` 5 é a 4 mais `repo` nas plataformas: o repositório da biblioteca em cada plataforma (`url`, `urlTemplate`, `ref`), de onde vêm o link e a revisão do arquivo de cada `symbol` (ver "Plataformas e code"). As versões 1 a 4 continuam aceitas sem mudança: `repo` numa versão anterior é o erro `só é permitido com formatVersion 5`, no caminho exato.
- A `formatVersion` 6 é a 5 mais `containers`: a lista de **tamanhos prontos de container** que o diálogo **Novo container** oferece quando a especialização está aplicada (ver "Containers (tamanhos prontos)"). A 6 é aditiva: as versões 1 a 5 continuam aceitas sem mudança, e `containers` numa versão anterior é o erro `só é permitido com formatVersion 6`, no caminho exato. O núcleo da app não traz tamanhos de dispositivo; só **Personalizado** e **Tamanho da seleção**.
- A `formatVersion` 7 é a 6 mais `floating` no tipo de anotação (o tipo cuja instância é uma **marcação flutuante**, um comentário solto sobre o canvas: ver "Tipo flutuante"), `appliesTo` no tipo (a que a anotação se aplica: marcação, seta ou ambas: ver "Onde o tipo se aplica") e `ref` como tipo de coluna de `table` (uma lista de referências como dado: ver "Tipos de valor"). A 7 é aditiva: as versões 1 a 6 continuam aceitas sem mudança, e cada chave da 7 numa versão anterior é o erro `só é permitido com formatVersion 7`, no caminho exato.
- A `formatVersion` 8 é a 7 mais `suggestions` e `linkedRef` em campo e coluna `string` (vocabulário sugerido ao digitar, sem restringir o valor, e os alvos mapeados na mesma lista: ver "Sugestões de texto" e "Alvos mapeados na lista (`linkedRef`)"). A 8 é aditiva: as versões 1 a 7 continuam aceitas sem mudança, e `suggestions` ou `linkedRef` numa versão anterior é o erro `só é permitido com formatVersion 8`, no caminho exato.
- A `formatVersion` 9 é a 8 mais `variants` na entrada de `code`: o campo `enum` do tipo que escolhe a variante do código de instanciação, como o `style` de um botão que em Compose troca o composable (`Button`, `OutlinedButton`, `TextButton`; ver "Variantes do código (`variants`)"). A 9 é aditiva: as versões 1 a 8 continuam aceitas sem mudança, e `variants` numa versão anterior é o erro `só é permitido com formatVersion 9`, no caminho exato. Só sobe para a 9 a especialização que usa `variants`.
- A `formatVersion` 10 é a 9 mais `notices` no tipo, no campo e na coluna de `table`: avisos curtos que dizem a quem usa a especialização que algo diverge entre as fontes, está pendente, obsoleto ou removido (ver "Avisos (notices)"). A 10 é aditiva: as versões 1 a 9 continuam aceitas sem mudança, e `notices` numa versão anterior é o erro `só é permitido com formatVersion 10`, no caminho exato. Só sobe para a 10 a especialização que usa `notices`.
- A `formatVersion` 11 é a 10 mais três recursos, todos opcionais: `allowedChildren` que aceita, além de ids de tipo, uma **cláusula** `{ layer, groups? }` que cobre uma camada inteira ou só os **grupos** dela (`groups` na camada e no tipo: ver "Filhos por camada e grupo"); `childRoles` e `childRolesLabel` no tipo dono, os **papéis** em que um filho se liga a ele (ver "Papéis no vínculo (childRoles)"); e `docRepos` na raiz com o `doc` do tipo como objeto `{ repo, path }`, o documento que vive em **outro repositório** (ver "Documento em repositório externo (docRepos)"). A 11 é aditiva: as versões 1 a 10 continuam aceitas sem mudança, e cada chave da 11 numa versão anterior é o erro `só é permitido com formatVersion 11`, no caminho exato. Só sobe para a 11 a especialização que usa alguma dessas chaves; o `doc` como texto (o arquivo do pacote) continua valendo desde a 4.

Arquivos de apoio:

- `docs/spec.schema.json`: JSON Schema (draft 2020-12). Valida só a **estrutura**; as regras entre elementos (ids únicos, `allowedChildren` com as cláusulas e os `groups`, `requiresOwner`, `childRoles`, o `repo` de `docRepos`, `labelField`, `rowLabel`, `default` compatível, plataformas declaradas, chaves de `params` e `values`, `sources` só a partir da versão 3, `values` das origens só em `enum` e com destinos nas `options`, `path`/`slot`/`ignore` só em sistema declarado em `origins`, `examples` em um modo só, os passos de `migrations` coerentes com os tipos e campos) só são verificadas pelo validador da app (`src/model/spec.ts`, que é a fonte da verdade).
- `docs/component.schema.json`: JSON Schema do arquivo de componente (`docs/COMPONENT-FORMAT.md`).
- `examples/specs/sdui.json` (`formatVersion` 12) e `examples/specs/modelo-de-dados.json` (`formatVersion` 1): exemplos completos.
- `examples/libraries/sdui-backend/`: o exemplo de **origem executável** (v9, 6 tipos): `origins` com `booleans`, `background.values` e raízes com `anchor`, `margin` e `scrim`; `sources` de tipo (`slot`, `ignore`, `id`) e de campo e coluna (`path`, `values`); exemplos do sistema externo (`examples[].system` e `file`) e a tela de exemplo; e `migrations` com os seis passos. É o exemplo de `origins`, `sources` e `migrations`.
- `examples/libraries/sdui-backend/`: um pacote de biblioteca pequeno com a origem executável (`origins`, `sources` e `migrations`, com a tela de exemplo de um sistema externo fictício; ver "Biblioteca: o pacote"). O que cada exemplo mostra está em `examples/README.md`.
- `libraries/material3-compose/`: biblioteca **pronta para uso** (v9, não embutida: aplicada pela pasta ou pelo zip) do Material 3 para Jetpack Compose, com o composable de cada tipo no `code` e `variants` onde a variante troca o símbolo; fixada no `compose.material3` 1.4.0.
- `libraries/kotlin/`: biblioteca **pronta para uso** (v8, não embutida: a pessoa a aplica pela pasta ou pelo zip) das declarações Kotlin, com onze tipos de classe, objeto e interface, cada um com componente e documento; as propriedades são alvos de referência com a etiqueta `data-field`. As pastas de `libraries/` estão em [`libraries/README.md`](../libraries/README.md).

## Formato do arquivo

```json
{
  "format": "mapping-spec",
  "formatVersion": 1,
  "id": "sdui",
  "name": "SDUI",
  "version": 1,
  "description": "opcional",
  "layers": [
    {
      "id": "componentes",
      "name": "Componentes",
      "color": "#1E88E5",
      "annotationTypes": [
        {
          "id": "input",
          "name": "Input",
          "labelField": null,
          "requiresOwner": false,
          "allowedChildren": ["onChange"],
          "fields": [
            { "key": "id", "type": "string", "required": true },
            {
              "key": "tipo",
              "type": "enum",
              "options": ["text", "email"],
              "default": "text"
            },
            {
              "key": "dado",
              "type": "ref",
              "accepts": { "tags": ["data-field"], "free": true }
            }
          ]
        }
      ]
    }
  ]
}
```

Na raiz: `format` (sempre `"mapping-spec"`), `formatVersion` (`1` a `16`), `id`, `name` e `version` (inteiro ≥ 1) são obrigatórios; `description`, `platforms` (a partir da versão 2, com `repo` na 5), `containers` (a partir da versão 6), `docRepos` (a partir da versão 11) e, a partir da versão 4, `fonts`, `origins` e `migrations` são opcionais, e `tokens` (a partir da versão 15) e `fieldModels` (a partir da versão 16) também. Cada camada tem `id` (único), `name`, `color` (`#RRGGBB`) e `annotationTypes`, e, a partir da versão 11, `groups` opcional (ver "Filhos por camada e grupo"). A importação ainda aceita arquivos antigos com `"mapeador-spec"`.

### Tipo de anotação

| Propriedade       | Obrigatória | Descrição                                                                                                                                                                                                                |
| ----------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`              | sim         | Único **na especialização inteira**.                                                                                                                                                                                     |
| `name`            | sim         | Nome exibido (ex: "Button").                                                                                                                                                                                             |
| `description`     | não         | Texto de ajuda.                                                                                                                                                                                                          |
| `labelField`      | não         | Chave de um campo `string` cujo valor é o **rótulo da instância** quando o `name` da anotação está vazio.                                                                                                                |
| `requiresOwner`   | não         | Padrão `false`. A anotação precisa ter exatamente um dono (ver "Relações").                                                                                                                                              |
| `allowedChildren` | não         | Os tipos que podem ser **vinculados** a este: ids de tipo e, a partir da `formatVersion` 11, cláusulas `{ layer, groups? }`; a partir da 13, também da camada do próprio dono (ver "Filhos por camada e grupo").         |
| `groups`          | não         | A partir da `formatVersion` 11. Ids dos grupos da **própria camada** a que o tipo pertence (ver "Filhos por camada e grupo").                                                                                            |
| `childRoles`      | não         | A partir da `formatVersion` 11. Os papéis em que um filho se liga a este tipo (ver "Papéis no vínculo (childRoles)").                                                                                                    |
| `childRolesLabel` | não         | A partir da `formatVersion` 11. O nome do seletor de papel, com `childRoles` (padrão "Papel").                                                                                                                           |
| `fields`          | sim         | Lista de campos (pode ser vazia).                                                                                                                                                                                        |
| `code`            | não         | A partir da `formatVersion` 2. Como se cria uma instância do tipo, por plataforma declarada (ver "Plataformas e code").                                                                                                  |
| `sources`         | não         | A partir da `formatVersion` 3. Elementos de origem a que o tipo corresponde (ver "Origens (sources)").                                                                                                                   |
| `component`       | não         | A partir da `formatVersion` 4. Caminho do arquivo `.json` do componente que desenha o tipo (ver "Biblioteca: o pacote").                                                                                                 |
| `doc`             | não         | A partir da `formatVersion` 4. Caminho do documento `.md` do tipo (ver "Biblioteca: o pacote"); na 11, também `{ repo, path }`, um documento em repositório externo (ver "Documento em repositório externo (docRepos)"). |
| `examples`        | não         | A partir da `formatVersion` 4. Exemplos nomeados do tipo: valores dos campos ou o JSON de um sistema externo.                                                                                                            |
| `floating`        | não         | A partir da `formatVersion` 7. Padrão `false`. A instância é uma marcação flutuante (ver "Tipo flutuante").                                                                                                              |
| `appliesTo`       | não         | A partir da `formatVersion` 7. `["marking"]`, `["arrow"]` ou os dois; padrão `["marking"]` (ver "Onde o tipo se aplica").                                                                                                |
| `structural`      | não         | A partir da `formatVersion` 15. Padrão `false`. `true`: o tipo agrupa e não desenha (sem `component`); a marcação não mostra o nome e o contorno só aparece com o mouse ou selecionada.                                  |
| `notices`         | não         | A partir da `formatVersion` 10. Avisos sobre o tipo (ver "Avisos (notices)").                                                                                                                                            |

### Campo

| Propriedade   | Obrigatória        | Descrição                                                                                                                                                                                                   |
| ------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `key`         | sim                | Chave gravada no JSON. `[A-Za-z0-9_]`, **não pode começar com `_`** (reservado). Única dentro do tipo.                                                                                                      |
| `label`       | não                | Rótulo exibido (pode ter acentos). Padrão: `key`.                                                                                                                                                           |
| `type`        | sim                | `string`, `number`, `date`, `enum`, `table` ou `ref`.                                                                                                                                                       |
| `required`    | não                | Padrão `false`. Vazio é permitido ao salvar, mas a anotação fica **incompleta**.                                                                                                                            |
| `default`     | não                | Valor inicial. Precisa ser válido para o tipo. Não existe para `table` nem `ref`.                                                                                                                           |
| `options`     | só `enum`          | Lista não vazia de strings únicas.                                                                                                                                                                          |
| `linkedRef`   | só `string`        | A partir da `formatVersion` 8. `key` de um campo `ref` do mesmo tipo (ou de uma coluna `ref` da mesma `table`): as declarações mapeadas que o `ref` aceita entram na lista (ver "Alvos mapeados na lista"). |
| `suggestions` | só `string`        | A partir da `formatVersion` 8. Lista de sugestões de texto (ver "Sugestões de texto"); vale também numa coluna `string` de `table`.                                                                         |
| `columns`     | só `table`         | Campos com a mesma estrutura, **apenas** `string`, `number`, `date` ou `enum` e, a partir da `formatVersion` 7, `ref` (com `accepts`). `table` dentro de `table` não existe.                                |
| `tags`        | não                | Etiquetas que tornam o campo **alvo de referências** (`[a-z0-9-]+`). Em `table`, cada **linha** vira um alvo.                                                                                               |
| `rowLabel`    | `table` com `tags` | Chave de uma coluna `string` que nomeia cada linha como alvo.                                                                                                                                               |
| `accepts`     | só `ref`           | `{ "tags": [...], "free": true\|false, "annotations": [...] }`. Precisa de pelo menos uma etiqueta, `free: true` ou `annotations` (ver "Referências e etiquetas").                                          |
| `description` | não                | Texto de ajuda exibido no editor.                                                                                                                                                                           |
| `sources`     | não                | A partir da `formatVersion` 3. Propriedades de origem do campo, inclusive em colunas; na v4, `path` em sistema declarado em `origins` (ver "Origens (sources)").                                            |
| `notices`     | não                | A partir da `formatVersion` 10. Avisos sobre o campo; vale também numa coluna de `table` (ver "Avisos (notices)").                                                                                          |

## Tipos de valor

- `string`: texto.
- `number`: número, inteiro ou decimal.
- `date`: data ISO `AAAA-MM-DD`.
- `enum`: uma das `options`. Booleanos são `enum` (ex: `["sim", "não"]`). **Estados de um componente:** o desenho é um quadro parado: sem animação, ripple animado nem troca de estado pelo mouse. A **aparência** de um estado de interação (hover, foco, pressionado, arrastado) é desenhável e, quando a origem a define (tokens de estado do design system), entra como um campo `enum` opcional do tipo, fora do `code`, como o desabilitado e o selecionado. Ao listar o que fica fora num plano ou na Fidelidade, separe movimento (fora) de aparência de estado (campo).
- `table`: lista de linhas; cada linha é um objeto com as chaves das `columns` (mais o id interno `_id`).
- `ref`: **referência forte** a uma tupla de outra anotação. O valor do campo é a referência.

**Lista de referências: coluna `ref` numa `table`.** Quando o tipo precisa apontar para vários alvos (ou levar dado junto com cada alvo), declare uma `table` com uma coluna `ref` (a partir da `formatVersion` 7; o `accepts` é o mesmo de um campo `ref`). Cada linha é uma referência e pode ter outras colunas ao lado; a linha tem `_id`, é alvo de referências como qualquer linha e entra nas migrações da biblioteca (`tabela.coluna`) e na comparação por linha das propostas. A coluna `ref` é **dado**: não desenha seta nem liga marcações (quem liga uma marcação a outra é a seta). Uma célula vazia é `null`; numa coluna obrigatória, vazia é pendência; alvo que sumiu é `broken-ref`; alvo que a coluna não aceita é `ref-not-accepted`. O componente do tipo lê a célula pelo rótulo do alvo (ver `repeat` em `docs/COMPONENT-FORMAT.md`).

**Tipo de campo removido: `codeRef`.** Até a etapa 9 existia o tipo `codeRef` (o lugar da solução em que a instância foi escrita, por plataforma). Ele saiu do formato: a especialização guarda só o que ajuda a **instanciar** o tipo (o `code` dos tipos, com `symbol` e `path`), nunca onde a instância ficou. Um arquivo antigo com um campo `"type": "codeRef"` continua válido: a importação da app e o `validate_specialization` **leem e ignoram** o campo (ele sai do tipo, junto com as chaves de `params` do `code` que o citam) e dão um aviso com o caminho (`ignored-field`). Nenhuma `formatVersion` nova; as cópias em `specs/` dos projetos existentes continuam abrindo. O JSON Schema ([`spec.schema.json`](spec.schema.json)) descreve só o formato atual e recusa o campo. Ao encontrar um, remova-o do arquivo.

## Sugestões de texto

A `formatVersion` 8 deixa um campo `string` (ou uma coluna `string` de `table`) oferecer um **vocabulário sugerido** com `suggestions`: ao digitar, a pessoa vê uma lista com as sugestões que combinam com a palavra sob o cursor e pode escolher uma. É para texto **aberto** com palavras recorrentes, como o tipo de uma propriedade de código (`String`, `Int`, `List`), que também aceita `String?` e `List<Endereco>`.

**`suggestions` não restringe o valor.** Qualquer texto continua aceito: o que não está na lista não é erro, aviso nem pendência, e um `default` não precisa estar nela. Para um conjunto **fechado** de valores use `enum` (`options`), que trava o valor.

```json
{
  "key": "type",
  "type": "string",
  "suggestions": ["String", "Int", "Boolean", "List", "Map"]
}
```

- `suggestions`: lista não vazia, até 200 itens, de textos únicos, não vazios e sem espaço no começo nem no fim. Só em campo ou coluna `string`: em `number`, `date`, `enum`, `ref` ou `table` o erro é `só é permitido em campo ou coluna string`, no caminho `…fields[n].suggestions`. Numa versão anterior à 8 o erro é `só é permitido com formatVersion 8`, no mesmo caminho (`…columns[m].suggestions` numa coluna).
- **Contrato de versão:** incluir, mudar ou tirar `suggestions` é compatível e nunca pede migração (ver "Contrato de versão"); um pacote pode passar da `formatVersion` 7 à 8 entre versões.

## Alvos mapeados na lista (`linkedRef`)

Também na `formatVersion` 8, um campo `string` (ou coluna `string` de `table`) pode trazer `linkedRef`: a `key` de um campo `ref` **do mesmo tipo** (na coluna, de uma coluna `ref` **da mesma `table`**). Ao digitar, a lista mostra, antes das `suggestions`, as declarações já mapeadas que esse `ref` aceita, cada uma com o nome do tipo dela ao lado. O texto inserido é o **nome** da declaração (o valor do campo `name` do alvo, como `Usuario`). Escolher só troca a palavra sob o cursor; ao confirmar (Enter ou sair do campo), a app grava o texto **e** o `ref` irmão juntos, numa entrada do desfazer (um Ctrl+Z desfaz os dois), desde que o nome escolhido ainda seja uma palavra do texto (`List<Usuario>` serve). O Esc descarta os dois. Digitar o nome à mão sem escolher não mexe no `ref`, apagar o texto não limpa o `ref` (ele tem o próprio botão de limpar) e um `ref` já preenchido com outro alvo é trocado pela escolha.

`linkedRef` **não restringe o valor** e é independente de `suggestions`: um campo pode ter os dois, só `suggestions`, só `linkedRef` ou nenhum. No Catálogo e na revisão (sem projeto ou somente leitura) não há alvos para listar.

```json
[
  {
    "key": "type",
    "type": "string",
    "linkedRef": "typeRef",
    "suggestions": ["String", "Int", "Boolean", "List", "Map"]
  },
  { "key": "typeRef", "type": "ref", "accepts": { "tags": ["kotlin-type"] } }
]
```

- `linkedRef`: só em campo ou coluna `string` (em outro tipo o erro é `só é permitido em campo ou coluna string`) e só a partir da `formatVersion` 8 (antes, `só é permitido com formatVersion 8`, no caminho `…fields[n].linkedRef` ou `…columns[m].linkedRef`). A `key` precisa existir no mesmo nível (os campos do tipo, ou as colunas da mesma `table`) e ser um campo ou coluna `ref`; senão o erro aponta o `linkedRef`.
- **Contrato de versão:** incluir, mudar ou tirar `linkedRef` é compatível e nunca pede migração (ver "Contrato de versão").

## Relações entre anotações

Sempre dentro da mesma especialização.

- `allowedChildren`: tipos que podem ser vinculados (via `parentAnnotationId`) a este. Um dono pode ter N filhos, inclusive do mesmo tipo. Os filhos devem estar em **outra camada** (a partir da `formatVersion` 13, também na **mesma camada** do dono: ver "Filhos por camada e grupo"). Cada item é o id de um tipo ou, a partir da `formatVersion` 11, uma cláusula `{ layer, groups? }` que cobre uma camada ou os grupos dela (ver "Filhos por camada e grupo").
- `requiresOwner: true`: a anotação precisa de exatamente um dono, de um tipo que a liste em `allowedChildren` (por id ou pela cláusula que a cobre).
- `childRoles` (`formatVersion` 11): os papéis em que um filho se liga ao dono (ver "Papéis no vínculo (childRoles)").

## Filhos por camada e grupo

Até a v10, `allowedChildren` lista os filhos **um a um**, por id. Uma camada de eventos com trinta tipos obriga cada dono a repetir os trinta ids, e um tipo novo na camada pede a edição de todos os donos. A `formatVersion` 11 deixa um item de `allowedChildren` ser, em vez do id, uma **cláusula** `{ "layer": "<id da camada>", "groups": ["<id>", …] }` (`groups` é opcional), e deixa a camada declarar **grupos** (`layers[].groups`) a que os tipos dela pertencem (`annotationTypes[].groups`).

```json
{
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
}
```

- **A cláusula.** Sem `groups`, cobre **todos os tipos da camada** (o Button acima aceita todo evento, inclusive os que forem acrescentados depois). Com `groups`, cobre os tipos da camada que estão em **algum** dos grupos listados (o Card aceita `navigate` e `back`, mais o `submit` citado por id). A cláusula só tem `layer` e `groups`; qualquer outra propriedade é erro, e `groups: []` também (para a camada inteira, omita `groups`).
- **O conjunto resolvido.** Os tipos que um dono aceita como filhos são a **união dos itens, na ordem deles**; dentro de uma cláusula, os tipos vêm na ordem da camada; um tipo que aparece mais de uma vez fica na **primeira** posição. Um id de texto continua sendo um tipo só, em outra camada, como antes. Toda leitura de "quem pode ser filho de quem" (o editor do dono, a validação do vínculo, `requiresOwner`) usa esse mesmo conjunto.
- **Os grupos.** `layers[].groups` é uma lista de `{ id, name, description? }`: `id` não vazio e único **dentro da camada**, `name` não vazio, `description` opcional. A ordem da lista é a ordem dos cabeçalhos com que a app apresenta os tipos. `annotationTypes[].groups` é a lista, não vazia e sem repetição, dos ids de grupo da **própria camada** a que o tipo pertence; um tipo pode estar em vários grupos, e um tipo sem `groups` só entra por uma cláusula da camada inteira ou pelo próprio id. Um grupo é só um agrupamento: não muda o que o tipo é nem onde ele vive.
- **Outra camada, como sempre (até a 12).** A `layer` da cláusula precisa existir e, até a `formatVersion` 12, **não pode ser a camada do próprio dono** (o erro é o de sempre: `filhos devem estar em outra camada`); um `group` precisa existir **na camada da cláusula**. A 13 muda só essa regra (ver abaixo).
- **`requiresOwner`** é conferido no conjunto resolvido: o tipo precisa estar no conjunto de algum dono, seja por id, por camada inteira ou por grupo. O dono precisa ser **outro** tipo: se o único tipo que o lista é ele mesmo (na `formatVersion` 13, que aceita filhos da própria camada), nenhuma anotação poderia ser a dona e o erro é `"t" exige dono, mas nenhum outro tipo o aceita como filho (só ele mesmo o lista em allowedChildren)`, no caminho `…annotationTypes[n].requiresOwner`.
- **Avisos** (`specWarnings`; não bloqueiam): `allowedChildren` com 20 ids ou mais **em texto** avisa `N tipos listados um a um; uma cláusula { layer, groups } cobre a camada ou os grupos` (com 19, não); grupo declarado que nenhum tipo usa também avisa.
- **Fora do contrato de versão:** incluir, mudar ou tirar `groups`, e trocar uma lista de ids por uma cláusula, é compatível e nunca pede migração (ver "Contrato de versão"). `diffSpecs` não gera diferença para `allowedChildren`, como hoje, nem para `groups`.
- Só a partir da `formatVersion` 11: a cláusula, `layers[n].groups` e `annotationTypes[m].groups` numa versão anterior são o erro `só é permitido com formatVersion 11`, no caminho exato (`layers[0].annotationTypes[0].allowedChildren[0]`, `layers[1].groups`, `layers[1].annotationTypes[0].groups`).

### Filhos da própria camada (`formatVersion` 13)

Alguns tipos se encadeiam **na mesma camada**: um evento que dispara outro (a chamada `send-http-request` tem o resultado Sucesso e o resultado Falha, e cada um dispara um próximo evento da mesma camada de eventos). Até a 12, isso obrigava a duplicar a camada ou a criar campos no tipo (`chainedAfter`, `trigger`). A `formatVersion` 13 deixa `allowedChildren` aceitar a camada do próprio dono: a **cláusula** `{ "layer": "<a camada do próprio tipo>" }` (com ou sem `groups`) e o **id de um tipo da mesma camada**, **inclusive o do próprio tipo**.

```json
{
  "formatVersion": 13,
  "layers": [
    {
      "id": "eventos",
      "name": "Eventos",
      "color": "#E53935",
      "annotationTypes": [
        {
          "id": "click",
          "name": "Clique",
          "allowedChildren": ["send-http-request"],
          "fields": []
        },
        {
          "id": "send-http-request",
          "name": "Enviar requisição HTTP",
          "requiresOwner": true,
          "allowedChildren": [{ "layer": "eventos" }],
          "childRoles": [
            { "id": "success", "name": "Sucesso" },
            { "id": "failure", "name": "Falha" }
          ],
          "fields": [{ "key": "url", "type": "string", "required": true }]
        }
      ]
    }
  ]
}
```

No projeto, a árvore de vínculos fica assim (o evento `e1` é dono de três filhos, cada um no seu papel, na mesma camada de `Clique`):

```text
Clique
└── e1  send-http-request          (role: click, no Clique do botão)
    ├── e2  send-http-request      (role: success)
    ├── e4  send-http-request      (role: success)
    └── e3  send-http-request      (role: failure)
```

- **O que muda no projeto.** A anotação **tipada** pode ter dona da **mesma camada** quando o tipo da dona aceita o tipo dela (por id ou pela cláusula da própria camada); a anotação **livre** continua só com dona de **outra camada** (o schema v15 do `mapping.json` descreve a regra). Um dono de outra camada continua valendo como antes.
- **Sem ciclo.** A cadeia de donas nunca volta a uma anotação já visitada: um tipo que aceita a si mesmo permite `e1` dono de `e2`, mas `e2` não pode ser dona de `e1` nem uma anotação ser dona de si mesma (`invalid-annotation-parent`).
- **`requiresOwner`** é conferido no conjunto resolvido, também com a camada do próprio dono: o `send-http-request` acima só existe ligado a um `Clique` ou a outro `send-http-request`.
- **O "quando" é papel.** Para encadear, o filho se liga ao evento anterior num `childRoles` do tipo dono (Sucesso, Falha), em vez de um campo `chainedAfter` ou `trigger` no filho (ver "Papéis no vínculo (childRoles)").
- Só a partir da `formatVersion` 13: numa versão anterior, a cláusula da própria camada é o erro `camada "eventos" é a do próprio tipo; filhos devem estar em outra camada` (no caminho `….allowedChildren[k].layer`) e o id de um tipo da mesma camada é `tipo "x" está na mesma camada; filhos devem estar em outra camada`.

## Papéis no vínculo (childRoles)

Um dono às vezes liga o mesmo tipo de filho em **pontos diferentes** dele: o Button tem um evento de clique e um de pressionar, e os dois são do tipo `navigate`. Quando o filho precisa dizer **em que ponto do dono se liga**, isso é um **papel**, não um campo do filho nem um id de tipo (quando só o ponto de ligação muda, não crie um tipo por gatilho, como `onClick` e `onHold`, nem um campo `trigger` em cada evento). A `formatVersion` 11 declara os papéis no **dono**, com `childRoles`, e um nome para o seletor, com `childRolesLabel`.

```json
{
  "id": "button",
  "name": "Button",
  "allowedChildren": [{ "layer": "eventos" }],
  "childRolesLabel": "Trigger",
  "childRoles": [
    { "id": "click", "name": "Clique" },
    { "id": "hold", "name": "Pressionar", "description": "Toque longo no botão." }
  ],
  "fields": []
}
```

- `childRoles`: lista **não vazia** de `{ id, name, description? }`, com `id` não vazio e **único no tipo** e `name` não vazio. O papel pertence ao **vínculo** entre o dono e o filho, não ao filho: o mesmo tipo de filho pode ocupar papéis diferentes no mesmo dono (um `navigate` no clique, outro no pressionar) e em donos diferentes.
- `childRoles` só vale em um tipo **com `allowedChildren`** (sem filhos não há vínculo para levar papel): em outro caso é erro.
- `childRolesLabel`: texto não vazio, o nome com que a app chama o seletor do papel ("Trigger", "Slot", "Posição"). Só vale com `childRoles` (senão é erro). Sem ele, a app usa **Papel** (pt-BR) e **Role** (en-US).
- **No contrato de versão (toda versão com papéis, da `formatVersion` 11 em diante; o passo que cobre a quebra é da `formatVersion` 12):** o `id` do papel é dado que as anotações guardam (`parentRole`). **Tirar** um papel de um tipo, ou dar `childRoles` a um tipo que não tinha, é **quebra** e pede um passo `rename-role`, `remove-role` ou `set-role` em `migrations`; **acrescentar** um papel a um tipo que já tinha papéis é aditivo (ver "Contrato de versão"). Continuam fora do contrato o `name` e a `description` do papel, a ordem dos `childRoles` e o `childRolesLabel`.
- Só a partir da `formatVersion` 11 (numa versão anterior o erro é `só é permitido com formatVersion 11`, no caminho `layers[0].annotationTypes[0].childRoles` ou `….childRolesLabel`). Os passos de migração dos papéis (`rename-role`, `remove-role` e `set-role`) são da `formatVersion` 12.

## Documento em repositório externo (docRepos)

Até a v10, o `doc` de um tipo é um arquivo `.md` **dentro do pacote**. Quando a documentação do componente vive no repositório do design system ou do contrato, e não na pasta da especialização, copiá-la para o pacote cria uma segunda fonte que envelhece. A `formatVersion` 11 declara na raiz os repositórios de documentos (`docRepos`) e deixa o `doc` do tipo apontar para um arquivo de um deles.

```json
{
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
}
```

- `docRepos`: lista de `{ id, url, urlTemplate?, ref? }`, com as **mesmas regras do `repo` de uma plataforma** (ver "Plataformas e code"): `url` obrigatória, `http://` ou `https://`, sem espaços; `urlTemplate` opcional, `http(s)://` e com `{path}`; `ref` opcional, texto não vazio, informativa; qualquer outra propriedade é recusada. `id` no formato `[a-z0-9-]+` (o do id de plataforma) e **único** na lista.
- `doc` com **dois jeitos**: **texto** (`"docs/button.md"`) é o arquivo `.md` do pacote, como desde a v4; **objeto** `{ "repo": "<id de docRepos>", "path": "<caminho>" }` é um arquivo do repositório declarado. O `repo` precisa existir em `docRepos`, e o objeto não tem outra propriedade.
- `path` segue as regras do `path` de `code`: relativo à raiz do repositório, `/` como separador, sem `.`, `..` nem `/` no começo. Além disso termina em **`.md`** e **não tem `#`** (a âncora dentro do documento não faz parte do caminho do arquivo).
- **O pacote não leva o documento.** O `doc` objeto não conta como arquivo citado do pacote: uma especialização cujos únicos arquivos citados são documentos externos vale como **arquivo isolado** (ver "Biblioteca: o pacote"), e o nível 1 da validação do pacote não confere o documento externo (a app não o baixa; quem o lê chega a ele pelo repositório).
- **Fora do contrato de versão:** incluir, mudar ou tirar `docRepos`, e trocar o `doc` entre texto e objeto, é compatível e nunca pede migração (ver "Contrato de versão"); `diffSpecs` não gera diferença.
- **Aviso** (`specWarnings`; não bloqueia): um repositório de `docRepos` que nenhum `doc` usa.
- Só a partir da `formatVersion` 11 (numa versão anterior o erro é `só é permitido com formatVersion 11`, no caminho `docRepos` ou `layers[0].annotationTypes[0].doc`, este quando o `doc` é objeto).

## Referências e etiquetas

Um campo `ref` aponta para um **alvo**. São alvos válidos:

- tuplas de anotações **livres**, se `accepts.free` for `true`;
- campos de anotações tipadas (qualquer especialização aplicada) cujo `tags` contenha alguma etiqueta de `accepts.tags`; numa `table` com `tags`, cada linha é um alvo, nomeada pela coluna `rowLabel`;
- a **anotação inteira** de um dos tipos de `accepts.annotations` (a partir da `formatVersion` 14).

**`accepts.annotations` (`formatVersion` 14).** Lista não vazia de itens com a sintaxe do `allowedChildren`: o id de um tipo ou uma cláusula `{ "layer": "<id>", "groups": ["<id>", …] }` (sem `groups`, cobre todos os tipos da camada), todos da **mesma especialização**, e o resolvedor é o mesmo (`resolveTypeItems`). A camada do próprio tipo vale. Com `annotations`, a referência aponta para a anotação, e não para um campo dela; pode vir junto de `tags` e `free`. Erros, com os textos do `allowedChildren`: `camada "x" não existe na especialização`, `grupo "g" não existe na camada "c"` e `tipo "t" não existe na especialização`; `annotations: []` é erro (`não pode ser vazio`); antes da 14 é `só é permitido com formatVersion 14`, no caminho `layers[i].annotationTypes[j].fields[k].accepts.annotations` (e `….columns[m].accepts.annotations` numa coluna).

```json
{
  "key": "item",
  "type": "ref",
  "required": true,
  "accepts": { "annotations": [{ "layer": "componentes" }] }
}
```

Etiqueta recomendada (reutilize em novas especializações): **`data-field`** — atributo de um modelo de dados (classe, entidade, DTO).

## Plataformas e code

O `code` de um tipo diz como se cria uma instância dele em cada plataforma: `symbol` é o que se chama, `path` é o arquivo que o define, `params` e `values` dizem como passar os campos, `notes` orienta. O agente lê o arquivo para saber a assinatura e escreve a chamada na solução. O mapeamento não guarda nada sobre a solução: ele não sabe onde ela está nem o que foi escrito nela, e o `code` não é o código gerado para uma anotação.

Uma **plataforma** é um alvo de código em que o agente escreve a solução: o app Android, o app iOS, o BFF que gera o JSON de uma tela de SDUI. A `formatVersion` 2 declara as plataformas e o `code` dos tipos; a 5 acrescenta o `repo`, o repositório da biblioteca naquela plataforma. A `formatVersion` 1 continua válida: é a 2 sem plataformas e sem `code`. O núcleo da app é genérico; plataformas, linguagens e código de instanciação entram só por estas propriedades.

| Propriedade | Onde                            | Descrição                                                                                                                                                                                                                                                            |
| ----------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `platforms` | raiz (opcional)                 | Lista de `{ id, name, language, repo? }`: os alvos de código em que o agente escreve a solução. `id` no formato `[a-z0-9-]+` e único na especialização; `name` é exibido; `language` é informativo (diz ao agente em que linguagem escrever a chamada).              |
| `repo`      | entrada de `platforms` (v5)     | Opcional, só na `formatVersion` 5. O repositório da biblioteca naquela plataforma, onde estão os arquivos citados nos `path`: `{ url, urlTemplate?, ref? }` (abaixo). Sem ele, o agente só chega ao arquivo pelo clone local que o projeto informar.                 |
| `code`      | tipo de anotação (opcional)     | Objeto por **id de plataforma declarada**: como se cria uma instância do tipo em cada uma. Cada entrada tem as propriedades abaixo.                                                                                                                                  |
| `symbol`    | entrada de `code` (obrigatória) | O que se chama para criar uma instância do tipo naquela plataforma: um composable, uma view, uma classe, a função do BFF que gera o JSON do componente. O agente escreve a chamada a esse símbolo.                                                                   |
| `path`      | entrada de `code` (opcional)    | O arquivo que define o `symbol`, **relativo à raiz do `repo` da plataforma** (`/` como separador, sem `.`, `..`, `/` no começo nem letra de unidade, sem linha). O agente o lê para saber a assinatura antes de escrever a chamada; sem `path`, o `symbol` localiza. |
| `params`    | entrada de `code` (opcional)    | Com que nome cada campo do tipo é passado na chamada: chave de um campo do tipo → nome do parâmetro. Campos fora de `params` não são passados.                                                                                                                       |
| `values`    | entrada de `code` (opcional)    | Como cada valor de `enum` é escrito no código: chave de um campo `enum` → (valor no mapping → texto no código). Valor sem tradução é passado como está.                                                                                                              |
| `notes`     | entrada de `code` (opcional)    | Orientação livre para o agente que escreve a chamada: o que passar além dos campos, ordem, cuidados.                                                                                                                                                                 |
| `variants`  | entrada de `code` (opcional)    | A partir da `formatVersion` 9. Um campo `enum` do tipo escolhe a variante do código, que troca `symbol`, `path` e `notes` e soma `params` e `values` (ver "Variantes do código").                                                                                    |

O `repo` de uma plataforma tem três propriedades:

| Propriedade   | Obrigatória | Descrição                                                                                                                                                                                                                                                                                   |
| ------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `url`         | sim         | Endereço do repositório da biblioteca naquela plataforma (`http://` ou `https://`, sem espaços).                                                                                                                                                                                            |
| `urlTemplate` | não         | Modelo do endereço de **um arquivo**, com `{path}` (ex: `https://github.com/org/app-android/blob/v3/{path}`). Serve a GitHub, GitLab, Bitbucket ou um servidor interno. Um `{line}` é aceito e sai do link, porque o `path` não tem linha. Sem ele, a app e o servidor MCP não montam link. |
| `ref`         | não         | A revisão (tag, branch ou commit) da biblioteca a que o `code` corresponde. Informativa: a app e o servidor MCP a mostram, mas não a usam para montar o link (quem a quer no link a escreve no `urlTemplate`). Texto não vazio.                                                             |

- **Como o agente chega ao arquivo.** Pelo endereço: o `urlTemplate` do `repo` da plataforma, na especialização dona do tipo, com `{path}` trocado pelo `path` (cada segmento codificado, as `/` mantidas). A app mostra a linha "Definição" nos Detalhes da anotação tipada com esse link logo depois de aplicar a especialização, e o servidor MCP devolve o endereço. Ou pelo clone local: o projeto pode guardar onde a biblioteca está clonada (`platformRepos[<plataforma>].localPath`, uma sobreposição local; ver o [`FORMAT.md`](FORMAT.md), "Campos da v11"), e o caminho local do arquivo é o `localPath` mais o `path`.
- Plataformas com o **mesmo `id`** em especializações diferentes são o mesmo alvo de código (o projeto guarda um só clone local para elas). Cada especialização declara o `repo` da própria biblioteca, e eles podem diferir: o link de um tipo usa o `repo` da especialização dele.
- `code` só vale em especializações que declaram `platforms`. Os ids citados em `code` precisam existir em `platforms`, e as chaves de `params` e `values` precisam ser campos do tipo.
- Plataforma em que algum tipo tem `path` e que não declara `repo` gera um **aviso** da especialização (`path-without-repo`), não um erro: o arquivo é citado, mas o agente não sabe em que repositório procurá-lo. O uso de `code` pelo servidor MCP (`get_code_hints`, `find_by_code`) está no [`AGENT-GUIDE.md`](AGENT-GUIDE.md).

```json
{
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
              "options": ["primary", "secondary"],
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
}
```

- `android.symbol` é o composable que se chama para criar um Button; `android.path` é o arquivo que o define, e o agente o lê para ver a assinatura antes de escrever a chamada.
- `bff` é uma plataforma como as outras: o `symbol` é a **função Kotlin que gera o nó JSON** do Button (`com.app.bff.sdui.button`), com o arquivo dela em `path`, e não o nome do nó (`"button"`) que sai no JSON.
- `params` diz o nome do parâmetro que recebe cada campo (`estilo` vai em `style` no Android e em `variant` no BFF); `values` diz como o valor `primary` é escrito no Android (`ButtonStyle.Primary`).
- Cada plataforma declara o `repo` da biblioteca dela; os arquivos de `path` são relativos à raiz desse repositório.

### Variantes do código (`variants`)

Em algumas plataformas a variante de um componente troca **o que se chama**, não um parâmetro: em Compose, o botão preenchido é `Button`, o contornado é `OutlinedButton` e o de texto é `TextButton`. A `formatVersion` 9 deixa a entrada de `code` de uma plataforma declarar `variants`: um campo `enum` do tipo escolhe, pelo valor que a anotação tem, o que muda no `code`.

| Propriedade      | Onde                         | Descrição                                                                                                                                                                         |
| ---------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `variants`       | entrada de `code` (opcional) | A partir da `formatVersion` 9. `{ field, cases }`: o campo que escolhe a variante e o que muda em cada valor dele.                                                                |
| `variants.field` | obrigatória                  | A `key` de um campo `enum` do tipo, do nível de cima. Coluna de `table` não conta.                                                                                                |
| `variants.cases` | obrigatória                  | Objeto de valor do campo (uma das `options` dele) → caso, com ao menos um caso. O caso tem `symbol`, `path`, `params`, `values` e `notes`, todos opcionais, e não pode ser vazio. |

**Como o caso se combina com a base** (a entrada de `code` sem `variants`):

- `symbol`, `path` e `notes` do caso **substituem** os da base (só os que o caso declara; o resto vem da base).
- `params` e `values` do caso **se somam** aos da base, chave por chave: o caso acrescenta ou troca a entrada daquela chave (em `values`, a tradução do caso para um campo substitui a da base para aquele campo).
- Quando a anotação tem um valor no campo, esse valor escolhe o caso. Sem valor, vale o `default` do campo; sem `default`, a base. Valor sem caso também usa a base.
- **Um nível só.** Um campo escolhe a variante e o caso não tem `variants`. Duas dimensões (por exemplo, estilo e tamanho) viram um `enum` que as junta (`filled-large`) ou dois tipos, como o FAB e o Extended FAB do Compose.
- O resultado resolvido nunca traz `variants`: o servidor MCP (`get_code_hints`, `get_marking`, `get_annotation`, `find_by_code`) e a "Definição" dos Detalhes mostram o código **já resolvido** para a variante da anotação; `get_specialization`, `get_component` e o Catálogo mostram o JSON cru (o Catálogo ainda lista a tabela variante → símbolo). O detalhe do uso está no [`AGENT-GUIDE.md`](AGENT-GUIDE.md).

```json
{
  "id": "button",
  "name": "Button",
  "fields": [
    { "key": "label", "type": "string", "required": true },
    { "key": "enabled", "type": "enum", "options": ["true", "false"], "default": "true" },
    {
      "key": "style",
      "type": "enum",
      "options": ["filled", "outlined", "text", "tonal"],
      "default": "filled"
    }
  ],
  "code": {
    "compose": {
      "symbol": "androidx.compose.material3.Button",
      "path": "compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Button.kt",
      "params": { "enabled": "enabled" },
      "notes": "content = { Text(label) }",
      "variants": {
        "field": "style",
        "cases": {
          "outlined": { "symbol": "androidx.compose.material3.OutlinedButton" },
          "text": { "symbol": "androidx.compose.material3.TextButton" },
          "tonal": {
            "symbol": "androidx.compose.material3.FilledTonalButton",
            "notes": "content = { Text(label) }; a cor vem do tema tonal."
          }
        }
      }
    }
  }
}
```

Uma anotação com `style = outlined` é instanciada com `OutlinedButton` (o `path` e o `params` são os da base, porque o caso só trocou o `symbol`); uma com `style = filled` (o `default`, sem caso) usa `Button`. A especialização precisa declarar `formatVersion: 9` e a plataforma `compose` em `platforms`.

**Regras de validação:** `variants` só a partir da `formatVersion` 9 (`só é permitido com formatVersion 9`, no caminho `…code.<plataforma>.variants`); `field` obrigatório, a `key` de um campo `enum` do tipo (`"x" não é um campo do tipo` ou `"x" deve ser um campo enum do tipo`, no caminho `…variants.field`); `cases` com ao menos um caso (`declare ao menos um caso`); cada chave de `cases` uma das `options` do campo (`"v" não está nas options de "field"`, no caminho `…variants.cases.<v>`); caso vazio é erro (`caso vazio: declare symbol, path, params, values ou notes`); `params` e `values` do caso seguem as regras dos da base (chaves de campos do tipo; `values` só de campo `enum` e só com opções dele); `path` do caso, a mesma regra do `path` da base; qualquer outra propriedade em `variants` ou no caso é recusada.

## Assinaturas e modelos de campo

A `formatVersion` 16 liga o `code` de um tipo à **assinatura** do que ele chama. A assinatura é uma **ficha** `mapping-signature` ([`SIGNATURE-FORMAT.md`](SIGNATURE-FORMAT.md)): um JSON no pacote da biblioteca com os parâmetros do componente (nome, papel, tipo na fonte, padrão), escrito pelo agente ou por um extrator e **derivado** do código. O servidor nunca lê o código, só esse JSON. Com a ficha, o Mapping sabe o que o tipo ainda não cobre (o `unmapped` abaixo) e confere se o `params` aponta para parâmetros que existem.

As chaves a seguir valem **só na `formatVersion` 16**; em uma versão anterior cada uma é o erro `só é permitido com formatVersion 16`, no caminho exato (`…code.compose.signature`, `fieldModels`).

| Chave         | Onde                                                              | Descrição                                                                                                                                                                                                                                                                                                                               |
| ------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `signature`   | entrada de `code` e caso de `variants`; entrada de `sources`      | Caminho da ficha `.json` no pacote, relativo à especialização: `signatures/<tipo>.<plataforma>.json` (no caso, `signatures/<tipo>.<caso>.<plataforma>.json`). No `code`, é a ficha de código; em `sources`, a de design.                                                                                                                |
| `ignore`      | entrada de `code` e caso de `variants`; `sources` com `signature` | Nomes de parâmetro da ficha que ficam de fora **de propósito** (`modifier`, `interactionSource`): não viram campo, não entram no `unmapped` e não geram aviso. Nome repetido é erro. Em `sources`, o `ignore` que já existia continua com o significado de sempre e, com `signature`, também vale para os parâmetros fora de propósito. |
| `calls`       | entrada de `code` e caso de `variants`                            | Parâmetro que se preenche por uma **fábrica**: `{ "<parâmetro>": "<símbolo da fábrica>" }` (`{ "colors": "androidx.compose.material3.ButtonDefaults.buttonColors" }`). Os campos do tipo chegam a ela por caminho em `params`.                                                                                                          |
| `formats`     | entrada de `code` e caso de `variants`                            | Como o valor de um campo é escrito: `{ "<chave do campo>": "<molde com {value}>" }`, como `{ "width": "{value}.dp" }` (o valor `16` sai `16.dp`). O molde precisa conter `{value}`; a chave é de um campo do tipo.                                                                                                                      |
| `fieldModels` | raiz                                                              | O modelo de campo de cada tipo da fonte (abaixo): id da plataforma ou do sistema → tipo na fonte → modelo.                                                                                                                                                                                                                              |

### Alvo em `params`

Em uma especialização `formatVersion` 16, o valor de `code.<plataforma>.params` tem três formas:

- **nome** (`text`): o parâmetro de mesmo nome, como sempre;
- **caminho** (`colors.containerColor`): o argumento `containerColor` da fábrica de `calls.colors`. O primeiro segmento precisa estar em `calls` (senão, o erro `"colors" não está em calls`, no caminho do campo em `params`);
- **posicional** (`#0`): o argumento sem nome na posição 0, o parâmetro de rótulo externo `_` do Swift (`Text("…")`).

Antes da 16 o valor é um texto opaco (nome de parâmetro, de campo JSON…) e nada muda: `.` e `#0` não são interpretados.

### `variants`: o que o caso troca e o que soma

No caso de `variants`, `signature` e `ignore` **substituem** os da base (o caso aponta para a ficha do outro símbolo, como `OutlinedButton`). `params`, `values`, `calls` e `formats` se **somam**, chave por chave, e o `calls` do caso troca o da base para o mesmo parâmetro. O `unmapped` e o `code` que o MCP devolve já saem resolvidos pelo caso.

### Exemplo

```json
{
  "formatVersion": 16,
  "platforms": [{ "id": "compose", "name": "Compose", "language": "kotlin" }],
  "fieldModels": {
    "compose": {
      "Boolean": { "type": "enum", "options": ["true", "false"] },
      "Dp": { "type": "number", "format": "{value}.dp" }
    }
  },
  "layers": [
    {
      "id": "ui",
      "name": "UI",
      "color": "#1E88E5",
      "annotationTypes": [
        {
          "id": "button",
          "name": "Button",
          "fields": [
            { "key": "title", "type": "string" },
            { "key": "containerColor", "type": "string" },
            { "key": "width", "type": "number" }
          ],
          "code": {
            "compose": {
              "symbol": "androidx.compose.material3.Button",
              "path": "compose/material3/Button.kt",
              "signature": "signatures/button.compose.json",
              "ignore": ["modifier"],
              "calls": {
                "colors": "androidx.compose.material3.ButtonDefaults.buttonColors"
              },
              "formats": { "width": "{value}.dp" },
              "params": {
                "title": "#0",
                "containerColor": "colors.containerColor",
                "width": "width"
              }
            }
          }
        }
      ]
    }
  ]
}
```

(O exemplo mostra só as chaves da 16; uma especialização completa tem `format`, `id`, `name` e `version`.)

### Modelos de campo (`fieldModels`)

`fieldModels` diz como um parâmetro de um **tipo na fonte** vira campo do tipo de anotação. A chave de fora é o `id` da plataforma (ou o `system` de uma origem), a de dentro é o texto exato do tipo na fonte (`Dp`, `Color`; para o booleano, `boolean`), e o valor é um modelo, com **uma** forma:

| Forma                                        | O que diz                                                                                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `{ "like": "<tipo>.<campo>" }`               | Igual ao campo `<campo>` do tipo `<tipo>` da especialização. O campo precisa existir.                                                 |
| `{ "type": "number\|string\|enum", ... }`    | Um campo novo do tipo dado, com `options` (obrigatório em `enum`, só nele) e `format` (molde com `{value}`) opcionais.                |
| `{ "expand": { "call?", "params": { … } } }` | O tipo na fonte é composto: vira uma fábrica (`call`, opcional) com os `params` (nome → tipo na fonte), cada um com o próprio modelo. |
| `{ "ignore": true }`                         | Esse tipo na fonte nunca vira campo.                                                                                                  |

### Validação

Erros de validação, sempre com o caminho:

- `só é permitido com formatVersion 16`: qualquer chave da tabela acima, ou `signature` em `sources`, numa versão anterior;
- `like` que não acha o campo: `"<tipo>.<campo>" não é um campo de um tipo da especialização`;
- `format` (em `fieldModels`) ou molde (em `formats`) sem `{value}`; `formats` com chave que não é campo do tipo;
- caminho em `params` cujo primeiro segmento não está em `calls`: `"<x>" não está em calls`;
- forma duplicada ou ausente no modelo, `options` fora de `enum`, `ignore` repetido, `expand` sem `params`.

No `validate_library` (que lê os arquivos do pacote), além disso:

- a ficha citada que não existe (`arquivo não encontrado`) ou é inválida (os erros da ficha, com o caminho dentro dela);
- `source.symbol` ou `source.path` da ficha diferentes do `symbol` ou do `path` do `code`;
- **aviso** `parâmetro fora da ficha: "<nome>"`: o `params` mapeia um parâmetro (nome, argumento de fábrica ou posicional) que a ficha não tem; o parâmetro saiu do código ou o nome está errado.

### O que sobra: `unmapped`

Com `signature`, o `code` que o MCP entrega (`get_code_hints`, `get_marking`, `get_annotation`, `get_component`, `find_by_code`) traz `unmapped`: a lista, na ordem da ficha, dos parâmetros que **nenhum campo liga e o `ignore` não dispensa**, cada um com `name`, `role`, `type`, `required` e `default?`. Um parâmetro com algum campo da fábrica ligado por caminho conta como ligado. `callback`, `modifier`, `state` e `slot` também entram: é assim que o agente sabe, por exemplo, que `onClick` é obrigatório. Os `value` sem campo são o rastro do que a tela ainda não modela. O servidor só lê o JSON da ficha no pacote aplicado (`specs/<id>/signatures/…`); nunca o código. Detalhes em [`MCP.md`](MCP.md).

### O importador e os avisos que ele regrava

A ficha vira campos, `code` (ou `sources`) e avisos pela tool `plan_signature_import` (`planSignatureImport`, puro, em `src/model/signatures/`; fluxo em [`AGENT-GUIDE.md`](AGENT-GUIDE.md), "Importar parâmetros da assinatura"). O importador não grava arquivo: devolve a especialização importada e quem grava é o agente, que valida com `validate_library`.

**O que vira campo** (o `fieldModels` da biblioteca tem precedência sobre a regra):

| Parâmetro da ficha                        | Resultado                                                                                                                                                                   |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `callback`, `modifier`, `state`           | nunca viram campo; ficam na ficha e no `unmapped`                                                                                                                           |
| `slot`                                    | sem campo, salvo quando o `fieldModels` tem modelo para o tipo exato (`@Composable () -> Unit` como `string` com um `format`)                                               |
| `value` `text`                            | `string`                                                                                                                                                                    |
| `value` `boolean`                         | `enum` com as opções do modelo `boolean` (padrão `["true", "false"]`)                                                                                                       |
| `value` `number`, `integer`, `dimension`  | `number` (a dimensão em unidades do componente)                                                                                                                             |
| `value` `enum`                            | `enum` com as `options`; o texto da fonte que difere da opção vai para `code.values` (ou `sources[].values`)                                                                |
| `value` `color`, `opaque`                 | só com modelo no `fieldModels`; sem ele, o parâmetro fica fora e o tipo ganha um `pending`                                                                                  |
| parâmetro composto (padrão é uma fábrica) | um campo **opcional** por parâmetro da fábrica, cada um pela mesma regra; a chave é o nome do parâmetro da fábrica ou, se colidir, `<param><Nome>` (`colorsContainerColor`) |

- **`default`:** o literal representável vira `default` do campo; o padrão não literal (`ButtonDefaults.shape`) fica sem `default`, e o argumento não é passado.
- **Obrigatório:** só em **tipo novo** (o tipo ainda sem campos e sem ficha gravada). Em tipo que já tem campos, o campo novo nasce **opcional** (campo novo obrigatório é quebra) e o parâmetro obrigatório no código ganha `diverges` ("obrigatório no código").
- **Chave do campo:** o nome do parâmetro, normalizado para `[A-Za-z0-9_]`; o nome original (e o rótulo externo do Swift) vai para o `code.params`.
- **Ligação a campo existente**, nesta ordem: (a) o `code.params` (ou `sources[].name`) que já cita o parâmetro; (b) o campo cuja `key` normalizada (minúsculas, só letras e dígitos) é igual à do nome; (c) um campo novo. No Figma a ligação (b) é a regra normal (`Style` casa com `style`); as opções de um `VARIANT` casam com as `options` pelo texto normalizado e entram em `sources[].values`, e a que não casa ganha `diverges`. Alvo de design nunca acrescenta opção a campo existente (só avisa); alvo de código acrescenta a opção nova.
- **Idempotente:** importar a mesma ficha duas vezes dá a mesma especialização.

**Avisos que o importador escreve.** Todos levam `ref` igual ao caminho da ficha (`signatures/button.compose.json`) e a `message` começa pelo id da plataforma ou do sistema (`compose: …`, a regra do prefixo de "Avisos de fidelidade e origens do aviso"). A cada importação ele **regrava todos os avisos com esse `ref`** e não toca nos outros (os curados à mão, com o `ref` do doc do tipo, ficam):

- `pending` no tipo, um por parâmetro `value` sem campo e fora do `ignore` ("compose: o parâmetro `windowInsets` (WindowInsets) ainda não é campo");
- `removed` no campo cujo parâmetro sumiu da fonte (o campo fica);
- `diverges` no campo: o `value.kind` do parâmetro mudou; uma opção do campo não existe mais na fonte; o código exige e o campo é opcional; renome provável (um parâmetro saiu e outro entrou com o mesmo tipo e na mesma posição: o `removed` do campo antigo dá lugar a `diverges` "renome provável de `a` para `b`").

**Sincronizar.** Com a ficha anterior gravada no pacote, a importação compara as duas (`changes`: `added`, `removed`, `changed` e `renamed`) e o `spec` devolvido traz só o que é **aditivo**: campo novo opcional, opção nova de `enum`, `default` atualizado e as ligações. Nunca remove nem renomeia campo e nunca escreve `migrations`: `suggestedMigrations` (`remove-field`, `rename-field`) é a sugestão, e o agente só a escreve se a pessoa pedir. `versionBump` é `true` quando o contrato mudou (o `diffSpecs` entre a especialização de antes e a de depois não é vazio); um `default` atualizado ou uma mudança só de avisos não sobe a versão.

## Containers (tamanhos prontos)

A `formatVersion` 6 deixa a especialização oferecer **tamanhos prontos de container**: o objeto de topo do canvas (uma tela de app, um painel, um cartão) criado sem arquivo, só com tamanho e cor de fundo. No diálogo **Novo container**, a lista **Tamanho predefinido** traz **Personalizado** e **Tamanho da seleção** (do núcleo; este é o retângulo da marcação selecionada e fica desabilitado sem seleção) e, abaixo, os `containers` de cada especialização aplicada, agrupados pelo nome dela. Tamanhos de dispositivo (celular, tablet, desktop) são de domínio: vêm da especialização, não do núcleo. A biblioteca Material 3 do repositório traz Celular 360 × 800, Celular grande 412 × 915, Tablet 800 × 1280 e Desktop 1440 × 900.

```json
{
  "formatVersion": 6,
  "containers": [
    { "id": "phone", "name": "Celular", "width": 360, "height": 800 },
    {
      "id": "tablet",
      "name": "Tablet",
      "width": 800,
      "height": 1280,
      "background": "#FAFAFA"
    }
  ]
}
```

Na raiz, opcional; lista de objetos com:

- `containers`: a lista. Escolher um tamanho preenche largura, altura e cor de fundo do diálogo; a pessoa ainda pode editá-los antes de criar. O agente lê a lista em `get_specialization` (campo `containers`) e a usa nos tamanhos de `add_container`.
- `id`: obrigatório; no formato `[a-z0-9-]+` e único na especialização.
- `name`: obrigatório, não vazio; é o texto da opção na lista.
- `width` e `height`: obrigatórios; inteiros de 1 a 20000 (pixels).
- `background`: opcional; cor `#RRGGBB`. Sem ele, o container nasce branco (`#FFFFFF`).

A 5 continua aceita: uma especialização sem `containers` só aparece na lista com **Personalizado** e **Tamanho da seleção**. A lista está fora do contrato de versão (acrescentar, mudar ou remover tamanhos nunca é quebra nem pede migração).

## Tipo flutuante

A `formatVersion` 7 deixa um tipo de anotação ser **flutuante** (`floating: true`). A instância de um tipo flutuante é uma **marcação flutuante**: um comentário solto, como um post-it, que vive só no canvas (`containerId` nulo, `rect` em unidades do canvas) e fica **fora do pertencimento** nos dois sentidos: nunca é filha de um container ou de uma marcação e nunca é mãe. É desenhada acima de tudo, inclusive sobre fotos mesmo com **Mostrar componentes sobre fotos** desligado, e arrastá-la move só ela: nada a carrega nem é carregado por ela. **Adicionar** (botão da Paleta) cria sempre no canvas, no centro da vista (**Adicionar no canvas**); arrastar da Paleta solta onde cair. A relação com uma tela ou um elemento é uma seta, não o pertencimento.

Use `floating` só para o que é comentário ou anotação solta que não pertence a uma tela (uma nota, um recado, uma regra de negócio); nunca para componentes de interface, que pertencem à tela onde estão.

```json
{
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
          "fields": [
            { "key": "texto", "label": "Texto", "type": "string", "required": true }
          ]
        }
      ]
    }
  ]
}
```

- `floating`: booleano, opcional; o padrão é `false`. Só a partir da `formatVersion` 7 (numa versão anterior o erro é `só é permitido com formatVersion 7`, no caminho `layers[0].annotationTypes[0].floating`).
- A biblioteca de **notas** do repositório (`libraries/notas/`: camada **Notas**, tipos `nota` com `titulo` e `texto` e `tabela` com `titulo` e `linhas` chave/valor, componentes no estilo post-it) é um pacote comum, embutido na app e **aplicado por padrão**: o projeto novo nasce com ela, e o projeto aberto de um schema anterior ao 13 a ganha ao abrir. Ela se remove por **Especializações › Remover**, como qualquer outra, e não volta.
- Campos `string` do tipo aceitam várias linhas na interface (o editor abre em várias linhas quando o texto tem quebra ou passa de 60 caracteres, ou com Shift+Enter; enquanto o texto não tem quebra, o Enter grava e o Shift+Enter quebra a linha).

## Onde o tipo se aplica

A `formatVersion` 7 diz a que uma anotação se aplica com `appliesTo` no tipo: `"marking"` (uma marcação, o padrão), `"arrow"` (uma **seta**, que liga duas marcações e pode ter anotações por camada, como uma marcação) ou os dois. O painel de anotações oferece, para a marcação selecionada, só os tipos que se aplicam a marcações e, para a seta, só os que se aplicam a setas. Um tipo **só de seta** (`appliesTo: ["arrow"]`) não tem `component` nem `floating`: a seta não tem desenho de componente. Restrições de origem e destino por tipo (por exemplo, "só liga uma marcação Tela a um Botão") ficam fora do formato.

```json
{
  "id": "deep-link",
  "name": "Deep link",
  "appliesTo": ["arrow"],
  "fields": [{ "key": "uri", "label": "URI", "type": "string", "required": true }]
}
```

- `appliesTo`: lista de `"marking"` e/ou `"arrow"`, opcional; não vazia e sem repetição. Só a partir da `formatVersion` 7 (numa versão anterior o erro é `só é permitido com formatVersion 7`, no caminho `layers[0].annotationTypes[0].appliesTo`).
- Pela API do modelo, `typeAppliesTo(tipo, 'marking' | 'arrow')` responde se o tipo se aplica ao item.

**O padrão "flutuante que aponta".** Uma tabela de dados (eventos disparados, propriedades) que descreve um elemento de uma tela é um tipo **flutuante** cujo componente desenha a tabela (`repeat`, ver `docs/COMPONENT-FORMAT.md`). Ela fica ao lado da tela e é ligada ao elemento (um botão) por uma **seta**; o dado mora na anotação da tabela flutuante, e quem lê o mapeamento chega a ela pelas setas que saem do elemento. Se a relação em si tem dado (o deep link que a transição abre, o evento que ela dispara), é um tipo aplicado à seta. A biblioteca de **notas** traz a **Tabela** genérica (título e linhas chave/valor) para isso, sem especialização.

```json
{
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
}
```

## Avisos (notices)

A `formatVersion` 10 deixa a especialização **avisar** sobre um tipo, um campo ou uma coluna de `table` com `notices`: uma lista de avisos curtos, escritos por quem gera a especialização, para quem a usa saber que ali há algo a considerar. É o lugar de registrar que duas fontes **discordam** (o contrato diz uma coisa e o código outra), que algo está **pendente** numa delas, ficou **obsoleto** ou **saiu** do contrato. A pessoa vê o aviso na app ao lado do tipo, do campo ou da coluna; o agente o lê ao instanciar o tipo.

```json
{
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
}
```

Cada aviso é um objeto estrito:

| Propriedade | Obrigatória | Descrição                                                                               |
| ----------- | ----------- | --------------------------------------------------------------------------------------- |
| `kind`      | sim         | Um de `pending`, `deprecated`, `diverges` ou `removed` (tabela abaixo).                 |
| `message`   | sim         | O que a pessoa precisa saber. Texto não vazio e que não seja só espaços.                |
| `since`     | não         | Desde quando o aviso vale: data real no formato `AAAA-MM-DD`.                           |
| `ref`       | não         | De onde o aviso vem, texto livre não vazio (a página do contrato, o arquivo do código). |

Os quatro `kind` têm **gravidade fixa**, na ordem `removed` > `deprecated` = `diverges` > `pending`; a lista é exibida na ordem `removed`, `deprecated`, `diverges`, `pending` e, dentro do mesmo `kind`, na ordem do arquivo.

| `kind`       | Rótulo (pt-BR / en-US) | Significa                                                                                                                                                  |
| ------------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `removed`    | Removido / Removed     | Saiu do contrato e não deve ser usado.                                                                                                                     |
| `deprecated` | Obsoleto / Deprecated  | Obsoleto; a `message` diz o que usar no lugar.                                                                                                             |
| `diverges`   | Diverge / Diverges     | As fontes discordam; a `message` diz em quê.                                                                                                               |
| `pending`    | Pendente / Pending     | Uma fonte já tem e a outra ainda não; o nome da plataforma ou da origem abre a `message`, como `compose: …` (o núcleo da app não leva nome de plataforma). |

- `notices`: lista (pode ser vazia) no tipo (`layers[n].annotationTypes[m].notices`), no campo (`…fields[k].notices`) e na coluna de `table` (`…fields[k].columns[j].notices`). Dois avisos com o mesmo `kind` e a mesma `message` na lista são o erro `aviso repetido`, no caminho do segundo. Um `kind` fora dos quatro, uma `message` vazia ou só de espaços, uma `since` que não é data real, uma `ref` vazia e qualquer outra propriedade são erros. Numa versão anterior à 10 o erro é `só é permitido com formatVersion 10`, no caminho exato.
- **O aviso só informa.** Nenhum aviso, nem `removed`, impede importar a especialização, aplicá-la, criar uma anotação do tipo ou aceitar uma proposta que o use. O aviso também não é pendência: a janela **Incompletas** e os códigos de problema das anotações não mudam. Os Detalhes mostram o aviso do campo mesmo vazio; a janela Avisos e a contagem só contam o campo com valor.
- **Fora do contrato de versão:** incluir, mudar ou tirar `notices` é compatível e nunca pede migração (ver "Contrato de versão"). `diffSpecs` ignora `notices` e não gera diferença, então quem gera a especialização regrava todos os avisos da sua origem (o mesmo `ref`; ver "Avisos de fidelidade e origens do aviso"), e o aviso some sozinho quando a diferença entre as fontes some. Atualizar a especialização só por avisos não mostra impacto.

### Avisos de fidelidade e origens do aviso

Os `notices` também registram a **fidelidade**: onde o desenho ou o comportamento de uma biblioteca aproxima a plataforma. Esta subseção vale para qualquer biblioteca e plataforma.

**Critério.** Vira aviso a divergência de **desenho** ou de **comportamento** entre a biblioteca e a plataforma que **muda uma decisão** de quem marca (como recortar, que tipo ou campo escolher, o que esperar do desenho) ou de quem escreve o código (que parâmetro passar, que composable ou view trocar, o que conferir na tela). O resto fica **só no doc** do componente: estados interativos que o desenho estático não mostra (pressionado, foco, passar o mouse), valores literais em vez de token, diferenças de subpixel e a referência dos arquivos usados. Parâmetro que não é campo não é assunto desta regra: é do importador de assinaturas.

- **Exemplo que vira aviso:** `compose: as filhas de um slot não têm weight; marque a largura real de cada uma`. **Exemplo que fica no doc:** `sem o estado pressionado`.
- **`ref`:** o caminho, dentro do pacote, do documento que descreve a diferença, normalmente o `doc` do tipo (`docs/<tipo>.md`).
- **`kind`:** `diverges`. Use `pending` só quando o limite tem um **pedido registrado** (uma issue, um ticket da biblioteca), citado na `message`.
- **Prefixo da plataforma (regra):** a `message` de um aviso ligado a uma plataforma ou a uma origem **começa com o id dela e dois-pontos** (`compose: …`). O `notices` não tem campo de plataforma e o núcleo não filtra por texto: quem lê (a pessoa ou o agente) ignora o aviso cujo prefixo é de outra plataforma.

**Duas origens de aviso**, diferenciadas pelo `ref`:

| Origem                    | `ref`                                                                                                        | Quem grava                                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Gerado por ferramenta** | O arquivo de entrada da ferramenta que produz o aviso (por exemplo, a ficha de assinatura de um importador). | A ferramenta **regrava todos** os avisos com esse `ref` a cada rodada e não toca nos outros.                                                          |
| **Curado à mão**          | Qualquer outro `ref`, como o doc do tipo.                                                                    | O autor (ou a skill `spec-author`), ao escrever ou rever o doc. A ferramenta nunca o apaga; ele só sai quando o autor revê o doc e a diferença sumiu. |

- Ninguém escreve à mão um aviso com o `ref` de uma ferramenta: ele sumiria na próxima rodada dela.
- Um aviso de fidelidade não repete o que um `pending` gerado por ferramenta já diz.

**Como a app mostra os dois (sem controle novo):**

- **Janela Avisos:** os avisos de fidelidade e os gerados por ferramenta são `notices` da especialização e entram na **mesma lista**, agrupados por aviso e ordenados por gravidade. O filtro de `kind` separa `diverges` de `pending`, mas **não** separa o `pending` curado (de doc) do `pending` gerado (de ficha): os dois são `pending`. O cabeçalho do grupo mostra o selo, o lugar, a mensagem, o `since` e a contagem, **não o `ref`**.
- **A origem só aparece nos Detalhes:** `Origem: <ref>`, no aviso do tipo (`NoticeBlock`, no topo da anotação) e no do campo e da coluna (`NoticeLine`, abaixo do controle). Escolher a linha de um grupo na janela abre os Detalhes da anotação, onde a origem está.

## Origens (sources)

A `formatVersion` 3 diz a que elementos de um **sistema externo** (uma ferramenta de design, outro catálogo de componentes…) cada tipo corresponde e de que propriedade de origem vem cada campo. É o que um agente de importação usa para saber que componente vira que tipo, sem deduzir pelo nome. O núcleo não interpreta `system` nem os nomes: só valida a estrutura e devolve os dados a quem pedir.

```json
{
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
}
```

| Propriedade | Onde                                  | Descrição                                                                                                                                                                    |
| ----------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sources`   | tipo de anotação (opcional)           | Lista de `{ system, id?, name? }`, cada uma com pelo menos `id` ou `name`. Um tipo pode corresponder a vários elementos (ex: variantes antigas e novas do mesmo componente). |
| `sources`   | campo ou coluna de `table` (opcional) | Lista de `{ system, name, values? }`: a propriedade de origem do valor.                                                                                                      |
| `values`    | origem de um campo (opcional)         | Só em campos `enum`: valor de origem → uma das `options` (os destinos precisam existir em `options`).                                                                        |

- `system`, `id` e `name` são textos não vazios; comparações são exatas (maiúsculas contam).
- `sources` só existe a partir da `formatVersion` 3: nas versões 1 e 2 o arquivo é recusado com a mensagem de versão, em vez de ignorar as origens.
- Em código TypeScript, `findTypesBySource(specs, system, { id?, name? })` (em `src/model/`) devolve os tipos que correspondem a um elemento de origem: os que casam pelo `id` primeiro, depois os que casam só pelo `name`. Cada resultado traz `executable` (o `system` está em `origins` daquela especialização), e `isExecutableSystem(spec, system)` diz o mesmo para um sistema: quem monta uma resposta lê o `path` dos campos só onde ele existe. A busca nunca casa pelo `path`.

### Origem executável (`formatVersion` 4)

A v4 deixa uma origem ser **executável**: a especialização declara em `origins` como ler o JSON de um sistema externo (o de um backend de SDUI, por exemplo) e transformá-lo numa tela de componentes. O núcleo executa a **declaração**, que é dado, e nunca código vindo da especialização; `system` continua sendo só um nome. Um sistema é executável quando o seu `system` aparece em `origins`. Isso muda o que as `sources` pedem:

| Propriedade | Onde                                      | Descrição                                                                                                                                                                                        |
| ----------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `path`      | `sources` de campo ou coluna              | O caminho do valor dentro das `props` do nó externo (`a.b[0].c`; sem `[*]`). **Obrigatório** em sistema declarado em `origins`; **proibido** nos demais.                                         |
| `name`      | `sources` de campo ou coluna              | Só o **nome** da propriedade de origem (exibição). Opcional em sistema executável; obrigatório nos demais, como na v3. Nunca é lido como caminho: um nome com `.` ou `[` não é mal interpretado. |
| `name`      | `sources` do tipo                         | Em sistema executável é o **nome do tipo externo** (a chave `node.type` do nó): é por ele que o nó vira o tipo. O `id` não participa da tradução.                                                |
| `slot`      | `sources` do tipo (só sistema executável) | Nome do nó `slot` do componente que recebe os filhos do nó externo (não vazio; o validador da biblioteca confere que o componente tem esse slot).                                                |
| `ignore`    | `sources` do tipo (só sistema executável) | Props que o nó externo traz e o desenho não usa (textos não vazios, sem repetição). Uma prop que não é caminho de campo nem está em `ignore` gera o aviso `propriedade desconhecida`.            |

```json
{
  "id": "card",
  "name": "Card",
  "component": "components/card.json",
  "sources": [
    {
      "system": "sdui",
      "name": "Card",
      "slot": "ações",
      "ignore": ["contentDescription"]
    }
  ],
  "fields": [
    {
      "key": "headline",
      "type": "string",
      "required": true,
      "sources": [{ "system": "sdui", "path": "headline" }]
    },
    {
      "key": "variant",
      "type": "enum",
      "options": ["elevated", "filled", "outlined"],
      "default": "elevated",
      "sources": [{ "system": "sdui", "path": "style", "name": "Estilo" }]
    }
  ]
}
```

A declaração é a chave `origins` da raiz: uma lista, uma entrada por sistema (`system` único). Ela é **estrita**: chave desconhecida é problema, com o caminho (`origins[0].screen.roots[1].path: …`).

**Origem medida (`kind: "measured"`, v15).** Para uma tela que já existe e pode ser medida (uma página web aberta num navegador, a hierarquia de views de um app), a origem não lê um documento de backend: o MCP recebe a árvore `{ type, id?, classes?, rect: { x, y, width, height }, props?, children? }` na op `import_measured` e cria uma marcação por nó. As `sources` dos tipos e dos campos casam assim: no tipo, o `id` do nó contra o `id` da source, depois cada classe contra o `name`, depois o `type` contra o `name`; no campo, o `path` da source é lido nas `props` do nó (com `values` para `enum`). O pertencimento sai da geometria, não da árvore. Exemplo: `{ "system": "dom", "kind": "measured" }`; biblioteca em `examples/libraries/medido/`.

| Propriedade | Descrição                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `system`    | Obrigatório. O nome do sistema (o mesmo `system` das `sources`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `name`      | Texto de exibição, opcional.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `node`      | Obrigatório. `{ type, props, children }`: os nomes das chaves do nó externo que guardam o tipo, as props e os filhos. Os três são obrigatórios nesta versão.                                                                                                                                                                                                                                                                                                                                                                                  |
| `screen`    | Obrigatório. Onde ficam os valores da tela: `width` e `height` (obrigatórios; sem eles não há tela), `id`, `name`, `background` e `roots` (ao menos uma raiz). Cada valor é um **literal** ou `{ path, values?, default? }`.                                                                                                                                                                                                                                                                                                                  |
| `roots`     | Em `screen`. Lista de `{ path, anchor?, margin?, scrim? }`: `path` é o caminho da raiz no documento (`[*]` faz cada elemento virar uma raiz; raiz que não existe é ignorada, sem aviso); `anchor` é uma das nove âncoras da tela (`top-start`, `top`, `top-end`, `start`, `center`, `end`, `bottom-start`, `bottom`, `bottom-end`), literal ou caminho relativo ao nó da raiz; `margin` é a distância das bordas em px; `scrim` é o `id` de um tipo desenhado por baixo da raiz (a película de um modal). Sem `anchor` a raiz entra no fluxo. |
| `kind`      | `tree` (padrão: o JSON de um backend, lido por `node` e `screen`) ou `measured` (`formatVersion` 15: uma árvore de retângulos medidos, importada pela op `import_measured` do MCP). A origem `measured` aceita só `system`, `kind`, `name` e `booleans`; `node`, `screen` e `examples` são erro.                                                                                                                                                                                                                                              |
| `booleans`  | `{ "true": texto, "false": texto }`: como um booleano do JSON vira texto nos campos sem `values` próprio (ex: `sim`/`não`).                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `examples`  | Lista de `{ name, file }`: telas de exemplo (o JSON de uma tela inteira) do sistema; `name` não vazio e único na origem, `file` caminho do pacote `.json`.                                                                                                                                                                                                                                                                                                                                                                                    |

```json
{
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
}
```

Como o desenho é calculado (tamanhos `fill`/`hug`, âncoras da tela, avisos do motor) está no [`COMPONENT-FORMAT.md`](COMPONENT-FORMAT.md). **Limites conhecidos**: um slot por componente; props só dentro de `props` (não há origem com as props no próprio nó); listas do JSON externo que viram campos numerados (`items[0].label` vira `label1`) são frágeis, e campo de tabela no lugar delas é uma evolução; só a direção externo → tela (não há saída da tela para o sistema externo).

## Biblioteca: o pacote

Com a v4, uma especialização é uma **biblioteca**: um **pacote**, que é a **pasta da especialização**, com tudo o que ela cita. O arquivo da especialização fica na raiz da pasta.

```
sdui-backend/
  sdui-backend.spec.json       a especialização (formatVersion 9)
  components/sdui-button.json  um arquivo por componente (mapping-component)
  docs/sdui-button.md          o documento markdown do tipo
  examples/settings.sdui.json  uma tela de exemplo de um sistema externo
  fonts/Roboto-Regular.woff2   as fontes do desenho (opcional)
```

Os nomes das pastas (`components/`, `docs/`, `examples/`, `fonts/`) são convenção; o que vale é o caminho citado. **Todo caminho citado** pela especialização é relativo ao arquivo dela, com `/`, **sem `..`**, sem `/` no começo e sem letra de unidade (a mesma regra do `path` do `code`), e termina na extensão esperada. Na leitura da biblioteca (componentes, fontes, ícones e `componentPaths`), um `..` que sai da pasta do pacote é problema da biblioteca, `caminho fora da biblioteca: <ref>`, no caminho de quem cita (`<tipo>`, `fonts[i]` ou `icons`), e não é mais descartado em silêncio. Uma raiz de `origins[].screen.roots` com `margin` e sem `anchor` é erro: `margin só vale com anchor` (caminho `…roots[i].margin`):

| Chave                       | Onde             | Extensão                             |
| --------------------------- | ---------------- | ------------------------------------ |
| `component`                 | tipo de anotação | `.json` (um componente)              |
| `doc` (texto)               | tipo de anotação | `.md`                                |
| `examples[].file`           | tipo de anotação | `.json` (o nó de um sistema externo) |
| `origins[].examples[].file` | origem           | `.json` (uma tela inteira)           |
| `fonts[].file`              | raiz             | `.ttf`, `.otf`, `.woff` ou `.woff2`  |

O formato do arquivo de componente está no [`COMPONENT-FORMAT.md`](COMPONENT-FORMAT.md). As chaves novas da v4:

| Propriedade  | Onde             | Descrição                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------ | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `component`  | tipo de anotação | O arquivo do componente que desenha o tipo. Opcional: um tipo sem componente continua valendo, só não tem desenho.                                                                                                                                                                                                                                                                                                                                                                                                               |
| `doc`        | tipo de anotação | O documento markdown do tipo (quando usar, variantes, exemplos de uso). Na `formatVersion` 11 também pode ser `{ repo, path }`, um documento em repositório externo, que **não** faz parte do pacote (ver "Documento em repositório externo (docRepos)").                                                                                                                                                                                                                                                                        |
| `examples`   | tipo de anotação | Lista de exemplos. `name` (não vazio e único no tipo) e `description` opcional, mais **um** de dois modos: `values` (valores dos campos do tipo) ou `system` com `file` (o JSON de **um nó** de um sistema externo declarado em `origins`: um componente, não uma tela).                                                                                                                                                                                                                                                         |
| `values`     | exemplo          | Chave de um campo do próprio tipo (coluna não vale) → valor. `null` é sempre aceito; `string` pede texto, `date` pede `AAAA-MM-DD` válido, `number` pede número finito e `enum` pede uma das `options`. Campo `table` aceita **só a lista de linhas**, no formato do `preview` do componente: objetos coluna → texto, número ou `null`, cada célula conferida pelo tipo da coluna (`_id` e chave que não é coluna são erro; coluna `ref` só aceita `null`; a lista vazia vale), e o campo `ref` **não** aceita valor em exemplo. |
| `fonts`      | raiz             | Lista de `{ family, file, weight?, style? }`. `family` não vazio; `weight` é um inteiro de 100 a 1000 ou uma faixa `"100 900"` (dois inteiros, o primeiro menor); `style` é `normal` (padrão) ou `italic`. O par `family` + `weight` + `style` não pode se repetir.                                                                                                                                                                                                                                                              |
| `origins`    | raiz             | A declaração de origem executável (ver "Origens (sources)").                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `migrations` | raiz             | O contrato de versão (ver "Contrato de versão").                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

```json
{
  "id": "button",
  "name": "Button",
  "labelField": "label",
  "component": "components/button.json",
  "doc": "docs/button.md",
  "fields": [
    { "key": "label", "type": "string", "required": true },
    {
      "key": "variant",
      "type": "enum",
      "options": ["filled", "tonal", "outlined"],
      "default": "filled"
    }
  ],
  "examples": [
    { "name": "Preenchido", "values": { "label": "Salvar", "variant": "filled" } },
    {
      "name": "Contornado",
      "description": "Botão com borda.",
      "values": { "label": "Cancelar", "variant": "outlined" }
    }
  ]
}
```

**Fontes.** O arquivo de uma fonte declarada pode não estar no pacote (as fontes têm licença e peso; o pacote de exemplo não leva os `.ttf`). A fonte ausente **avisa** e o desenho cai na fonte do sistema; o pacote continua válido.

**Aplicar a um projeto.** Aplicar uma biblioteca **copia a pasta inteira** para `specs/<id>/` (a cópia de uma especialização v1 a v3 continua sendo o arquivo `specs/<id>.json`). Na app, **Especializações** aceita a pasta (`showDirectoryPicker`, Chrome/Edge) ou um zip do pacote (com ou sem uma pasta-raiz única), confere os três níveis e mostra erros (bloqueiam) e avisos (deixam aplicar); **Atualizar de pasta…/zip…** passa a versão aplicada como `previous` ao contrato de versão (quebra sem migração é erro) e regrava a pasta, e **Remover** a apaga. Uma especialização v4 ou v5 que **não cita nenhum arquivo do pacote** (nenhum tipo com `component`, `doc` em texto ou `examples`, e sem `fonts`, `origins` nem `icons` na raiz; `migrations` não conta, e o `doc` objeto da v11, que é um documento em repositório externo, também não) vale como arquivo isolado, como a v1 a v3: a app a aplica e atualiza com o `.json` e a cópia é `specs/<id>.json`. Um `.json` v4 ou v5 que cita arquivos do pacote é **recusado** na app: ele pede a pasta (ou o zip). Ao abrir o projeto, o Diagnóstico mostra os problemas dos níveis 1 e 2 da cópia. As tools do servidor MCP e a skill que escreve o pacote são da B2 também.

**Pacote embutido.** `libraries/notas/` (especialização v7: a camada Notas, o tipo flutuante `nota` e o componente post-it) é um pacote comum que a app traz dentro do build e **aplica por padrão** em projeto novo e em projeto aberto de um schema anterior ao 13 (ver "Tipo flutuante"). Para o resto do ciclo ele é uma biblioteca como as outras: a cópia vai para `specs/notas/` e a pessoa pode removê-la.

**Pacote de exemplo.** `libraries/material3-compose/` é o Material Design 3 (baseline, tema claro e escuro) para o Jetpack Compose, pronto para uso: a especialização v15 (biblioteca v2) com cinquenta tipos, cada um com `component`, `doc` e de um a três exemplos, os componentes, os tamanhos de container, os `tokens` nos modos `light` e `dark`, o conjunto de ícones em `icons/` e a Roboto em `fonts/`. A origem executável (`origins`, `sources`, `migrations` e a tela de exemplo `examples/settings.sdui.json`, uma tela de SDUI sem retângulos, traduzida pela `origins`) está em `examples/libraries/sdui-backend/`. Os testes usam uma cópia congelada de um pacote antigo de quinze tipos, em `tests/fixtures/material3/` (não é um exemplo distribuído).

## Tokens de design

`tokens` (`formatVersion` 15, opcional, na raiz) guarda os **valores de design** da biblioteca com nome: cores, raios, espaçamentos e famílias de fonte. Os componentes de formato 4 leem cada valor com `{ "$token": "nome" }` (ver `docs/COMPONENT-FORMAT.md`), em vez de repetir o literal em cada nó. Trocar o valor num lugar só muda o desenho inteiro.

Na cor, `{ "$token": "scrim", "alpha": 0.32 }` multiplica o alfa da cor do token (a opacidade sem duplicar o token na especialização; `alpha` é número de 0 a 1 ou `$token` de número). O token também vale em `shadow.x`/`y`/`blur`, em cada item de `cornerRadius` e de `stroke.dash` e em `stroke.offset` (ver `docs/COMPONENT-FORMAT.md`).

```json
{
  "formatVersion": 15,
  "tokens": {
    "modes": ["light", "dark"],
    "values": {
      "primary": { "light": "#6750A4", "dark": "#D0BCFF" },
      "on-primary": { "light": "#FFFFFF", "dark": "#381E72" },
      "radius-md": 12,
      "space-4": 16,
      "font-sans": "Roboto, sans-serif"
    }
  }
}
```

- `modes`: lista **não vazia** de nomes distintos no formato `[a-z0-9][a-z0-9-]*`. A convenção é `["light", "dark"]`.
- `values`: o nome do token (`[a-z0-9][a-z0-9-]*`) aponta para um valor, que é **texto** (cor `#rrggbb`, `rgba(…)`, ou família de fonte) ou **número** (raio, espaçamento, tamanho, peso).
- Um valor **simples** vale em todos os modos (`"radius-md": 12`). Um valor **por modo** é um objeto com **todos** os modos de `modes` (e só eles) e todos do **mesmo tipo**: misturar cor num modo e número no outro é erro.
- **Embutidos:** `font-sans` e `font-mono` (famílias de fonte) existem em toda biblioteca, mesmo sem `tokens`, e valem a fonte do hospedeiro (na app, o `--font-sans` e o `--font-mono` do tema; no visualizador, a pilha dos tokens da app ou a opção `fonts`; no MCP, a Mapping Sans embutida). A especialização pode redefini-los em `values`, e a definição dela vence a do hospedeiro. O texto sem `font.family` usa `font-sans`.
- **Chaves de `tokens`:** só `modes` e `values` existem. Qualquer outra chave é erro de validação, no caminho dela: `tokens.<chave>: chave desconhecida: <chave>`. Como o `tokens` já era lido pelo validador, uma biblioteca que trazia uma chave a mais e passava antes agora é recusada (a `formatVersion` continua 15).
- **Modo do desenho:** o desenho segue o modo do projeto e do container (`drawingMode`, ver `docs/FORMAT.md`); sem modo escolhido, usa o **primeiro** de `modes`, e um modo não declarado cai no primeiro, sem aviso.
- Erros de validação, com o caminho em `tokens`: `só é permitido com formatVersion 15`, nome fora do padrão, `modes` vazio ou com nome repetido, valor por modo sem algum modo (ou com modo que não existe em `modes`) e valores de tipos diferentes entre os modos. No `validate_library` (nível 2), `$token` com nome inexistente é `o token "x" não existe nos tokens da especialização` e com tipo errado é `o token "primary" é cor, mas aqui se espera número`.

## Conjunto de ícones

`icons` (`formatVersion` 15, opcional, na raiz) é o caminho de **um** arquivo `.json` do pacote, relativo ao arquivo da especialização (como `component`, `doc` e `fonts[].file`: sem `.`, `..` nem unidade, com `/`). O arquivo guarda os ícones da biblioteca; o nó `icon` dos componentes de formato 4 (`docs/COMPONENT-FORMAT.md`) escolhe um pelo nome. Isso substitui o `$switch` que repetia todos os caminhos dentro de cada componente que mostra um ícone escolhido pela pessoa.

```json
{
  "format": "mapping-icons",
  "formatVersion": 1,
  "viewBox": [24, 24],
  "icons": {
    "check": {
      "paths": [
        {
          "d": "M5 12l5 5L20 7",
          "stroke": true,
          "width": 2,
          "cap": "round",
          "join": "round"
        }
      ]
    },
    "dot": {
      "viewBox": [10, 10],
      "paths": [{ "d": "M5 1a4 4 0 1 0 0 8a4 4 0 1 0 0-8z", "fill": true }]
    }
  }
}
```

- `format` é `mapping-icons` e `formatVersion` é `1` (a única versão do arquivo; outra é o erro `formatVersion: deve ser 1`). `viewBox` (`[largura, altura]` positivos) é obrigatório e vale para todos os ícones que não trazem o seu.
- `icons`: o nome do ícone (`^[a-z0-9][a-z0-9-_]*$`; `Check` é erro) aponta para `{ viewBox?, paths }`. `paths` é uma lista **não vazia** de `{ d, fill?, stroke?, width?, cap?, join? }`: `d` são os dados SVG; `fill` e `stroke` são `true` (a cor do nó `icon`), `false` (nada) ou uma cor própria; `width` é a largura do traço em unidades do `viewBox` (padrão 1); `cap` (`butt`, `round`, `square`) e `join` (`miter`, `round`, `bevel`) como em `stroke` do componente. Um caminho sem `fill` nem `stroke` é preenchido com a cor do nó; com `stroke` e sem `fill`, só o traço aparece.
- O arquivo faz parte do pacote: a app o copia com a pasta (`specs/<id>/`), a especialização que declara `icons` não vale como arquivo isolado, e o arquivo apontado não é "arquivo não referenciado".
- **Validação da biblioteca.** Nível 1: o arquivo existe (`arquivo não encontrado: <caminho>`, no caminho `icons` da especialização) e é um `mapping-icons` válido (cada erro com o caminho dentro do arquivo, ex.: `icons.Check: nome inválido; use [a-z0-9][a-z0-9-_]*`). Nível 2: todo nome **literal** de um nó `icon` existe no conjunto (`o ícone "nuvem" não existe no conjunto de ícones (icons/set.json)`, no caminho do `name`); sem `icons` declarado o literal é erro (`o ícone "check" não pode ser conferido: a especialização não declara icons`). Nível 3: um campo `enum` lido pelo `name` de um nó `icon` com uma `option` que não está no conjunto gera aviso (`a opção "nuvem" do campo "icon" não está no conjunto de ícones; o desenho cai no reservado`), e a prova de desenho avisa `ícone desconhecido: <nome>`.

## Contrato de versão

`version` (inteiro ≥ 1) é a **versão do pacote**. Subir a versão de uma biblioteca é uma decisão que pode quebrar os projetos que a aplicaram; o contrato diz o que é seguro e o que exige uma migração declarada. Duas versões do mesmo pacote são comparadas por `diffSpecs(anterior, nova)` (em `src/model/specVersions.ts`, função pura) e cada diferença é **aditiva** ou **quebra**. Tipo, campo e opção são identificados pelo `id`, pela `key` e pelo texto, nunca pela posição; as colunas de uma `table` contam como campos do tipo.

**Aditiva** (só acrescenta; atualizar não perde nada):

- um tipo novo, um campo **opcional** novo (coluna incluída), uma opção nova de `enum`;
- um **papel** novo (`childRoles`) em um tipo que já tinha papéis (`added-role`: as anotações existentes ficam com o papel que tinham);
- um `component`, um `doc`, um exemplo ou uma fonte novos, ou outro arquivo de componente para o tipo;
- trocar o **desenho** (o template do componente) sem mudar os campos.

**Quebra** (e só isto): remover ou renomear um **tipo**, um **campo** (ou coluna) ou uma **opção de `enum`**; tornar um campo **obrigatório**, inclusive um campo novo que já nasce obrigatório (os valores existentes ficam incompletos); mudar o `type` de um campo.

**Quebra dos papéis** (comparando o tipo pelo mesmo `id`; vale para toda versão que tem papéis, da 11 em diante):

- `removed-role`: um papel de `childRoles` que sumiu, inclusive o tipo que perde todos. As anotações guardam o `id` do papel em `parentRole`, e esse `id` deixa de existir.
- `roles-required`: um tipo que não tinha `childRoles` e passou a ter. Os filhos que já estavam vinculados ficam sem papel, e agora o dono pede um.

Uma v11 que remove um papel é recusada até subir para a `formatVersion` 12 com o passo que o cobre. **Dono renomeado:** quando o tipo foi renomeado (`rename-type`), os papéis **não** são comparados entre o tipo antigo e o novo; um papel que as anotações usam e que não existe no tipo novo vira `unknown-role` ao migrar, e o autor pode declarar `rename-role` com o `id` novo, **depois** do `rename-type`.

**Fora do contrato**, de propósito: `fieldModels`, `signature`, `ignore`, `calls`, `formats` e os caminhos e posicionais em `params` (`formatVersion` 16; o que a importação de uma assinatura acrescenta, um campo opcional ou uma opção de `enum`, é aditivo como qualquer outro), camadas, `labelField`, `allowedChildren` (inclusive a cláusula `{ layer, groups }` e, na 13, os filhos da própria camada), `requiresOwner`, `description`, `tags`, `code`, `platforms`, `containers`, `sources`, `suggestions`, `linkedRef`, `notices`, `accepts.annotations`, `groups` (da camada e do tipo), o `name` e a `description` de um papel, a ordem dos `childRoles`, `childRolesLabel` e `docRepos`, trocar o `doc` entre texto e objeto, e remover um `component`, um `doc`, um exemplo ou uma fonte. Nada disso gera diferença. Um renome é indistinguível de remover + acrescentar; quem renomeia **declara** isso num passo `rename-*`, e é isso que o diferencia de uma remoção.

### `migrations`

Toda quebra precisa de uma entrada em `migrations` na raiz da versão nova. Cada entrada liga duas versões do pacote e traz **passos declarativos**:

```json
{
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
}
```

`from` é um inteiro ≥ 1; `to` é maior que `from` e não passa de `version`; `steps` não é vazia; nenhum `from` se repete. Os nove passos e a quebra que cada um cobre (os três últimos, dos papéis, são da `formatVersion` 12):

| Passo (`op`)   | Chaves                       | Cobre a quebra                                                                                                                                                                                                 |
| -------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rename-type`  | `from`, `to`                 | tipo removido (`from` é o tipo que saiu; `to` existe na versão nova).                                                                                                                                          |
| `remove-type`  | `type`, `mode`               | tipo removido. `mode` (`convert` ou `delete`) diz o destino das anotações do tipo.                                                                                                                             |
| `rename-field` | `type`, `from`, `to`         | campo removido (`from` é o que saiu; `to` existe no tipo).                                                                                                                                                     |
| `remove-field` | `type`, `field`              | campo removido (o tipo continua existindo).                                                                                                                                                                    |
| `map-values`   | `type`, `field`, `values`    | opção de `enum` removida: cada chave de `values` é uma opção antiga e o destino é uma `option` atual.                                                                                                          |
| `fill-field`   | `type`, `field`, `default`   | campo que passou a obrigatório, campo novo obrigatório **ou** `type` trocado: o `default` (texto ou número, válido para o tipo do campo) entra no lugar; no `type` trocado os valores antigos são descartados. |
| `rename-role`  | `type`, `from`, `to`         | `removed-role`: papel renomeado (`type` é o tipo **dono**; `from` é o papel que saiu; `to` existe no tipo). Se `to` já existia na versão anterior, os dois papéis se **juntam**.                               |
| `remove-role`  | `type`, `role`, `mode`       | `removed-role`: papel removido (o tipo pode até não ter mais `childRoles`). `mode` (`clear` ou `unlink`) diz o destino dos filhos que usavam o papel.                                                          |
| `set-role`     | `type`, `role`, `childType?` | `roles-required`: tipo que passou a ter `childRoles`. Dá o papel `role` aos filhos **sem papel** do dono (só aos do tipo `childType`, quando vem).                                                             |

- **Papéis (v12).** Nos três passos de papel, `type` é o tipo do **dono** (o que tem `childRoles`), identificado pelo `id` que ele tem **naquele ponto da cadeia**: depois de um `rename-type` do dono, o id novo. `rename-role` e `set-role` só preenchem ou trocam o papel e nunca removem filho; `set-role` **preenche e nunca sobrescreve** (um filho que já tem papel fica como está). O `childType` do `set-role` pode ser um id antigo quando o passo vem **antes** do `rename-type` do filho. Cobertura: `removed-role` de um papel `r` do tipo `T` é coberto por `rename-role` com `type: T, from: r` ou por `remove-role` com `type: T, role: r`; `roles-required` de `T` é coberto por qualquer `set-role` com `type: T` (os filhos que nenhum passo alcança ficam com a pendência `missing-role`). Uma especialização v11 só declara esses passos depois de subir para a 12.
- A chave de campo de um passo (`field`, `from`, `to`) é a `key` do campo **ou** `tabela.coluna`: a coluna de uma `table` também guarda dados, então mudar uma coluna (remover, trocar o `type`, torná-la obrigatória) é quebra e é coberta pelo mesmo passo.
- O arquivo é conferido sozinho (nível 1 do validador): o **lado novo** do passo existe na versão (`rename-type.to` é um tipo daqui; o campo `to`/`field` existe no tipo; os destinos de `map-values` estão nas `options` de um campo `enum`; o `default` de `fill-field` é válido para o campo) e o **lado antigo** não existe mais (`rename-type.from`, `remove-type.type` não são tipos desta versão; `rename-field.from` e `remove-field.field` não são campos do tipo). Que o lado antigo existia na versão anterior é conferido quando se compara duas versões. Nos passos de papel: `rename-role.type` é um tipo desta versão **com** `childRoles`, `to` é um papel dele e `from` não é; `remove-role.type` é um tipo desta versão (pode não ter mais `childRoles`), `role` não é papel dele e `mode` é `clear` ou `unlink`; `set-role.type` tem `childRoles`, `role` é um papel dele e `childType`, quando vem, só confere o formato de id (um tipo que não existe é um no-op). Na comparação (nível 2) um `rename-role.from` ou `remove-role.role` que não era papel do tipo na versão anterior (considerando o `rename-type` do dono) é um **aviso**.
- A **cadeia** liga as entradas por `from → to`, a partir da versão que o projeto aplicou até a `version` nova (`migrationChain`). Uma cadeia rompida (falta a entrada de uma versão) deixa **toda** quebra sem cobertura. `missingMigrations(anterior, nova)` devolve as quebras que nenhum passo da cadeia cobre; lista vazia é contrato cumprido, e `migrationFor` diz que passo cobre uma quebra.
- O validador da biblioteca (nível 2) usa o contrato quando recebe a versão anterior: cada quebra sem passo vira um **erro**, e uma `version` que não cresceu também.

### Execução da migração

Ao **atualizar** uma biblioteca aplicada (`updateSpecialization`, na app e no MCP), a app roda a cadeia `from → to` sobre as anotações do projeto (`runLibraryMigrations`, em `src/model/libraryMigrations.ts`, puro e sem APIs de navegador) e só então troca a cópia aplicada, as camadas e a versão. Tudo é uma só operação: na app, **Desfazer** devolve a pasta `specs/<id>/` e os dados juntos.

- **Encadeamento.** A cadeia parte da versão que o projeto aplicou e segue as entradas por `from → to` até a `version` nova; os passos rodam na ordem, e cada um opera sobre o resultado do anterior (o tipo é o que a anotação tem **naquele ponto**, depois dos renomes anteriores). Só as anotações da própria especialização são tocadas. Cadeia rompida (falta uma entrada) ou sem `migrations`: nada roda. Um passo que não acha nada é um no-op.
- **Perda × pendência.** **Perda** é valor **não vazio** que o passo apagou ou sobrescreveu: aparece em destaque no diálogo antes de atualizar. **Pendência** é dado que a migração não consegue consertar e deixa como está: depois de atualizar ele aparece em **Incompletas**, sem apagar nada.

| Passo          | O que faz nos dados                                                                                                                                                                                                                                                                                | Perda                                                                                   | Pendência                                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `rename-type`  | Troca o `typeId` das anotações do tipo. A camada **não** muda.                                                                                                                                                                                                                                     | não                                                                                     | `layer-mismatch` se a camada do tipo novo é outra                                                                        |
| `remove-type`  | `convert`: a anotação vira **livre** (os valores viram pares chave-valor, o vínculo fica). `delete`: apaga a anotação **e as vinculadas a ela** (também de outros tipos e livres).                                                                                                                 | só no `delete`: cada anotação apagada                                                   | `layer-mismatch` no `convert` (ela fica na camada)                                                                       |
| `rename-field` | Move o valor de `from` para `to`; em campo de nível superior reescreve também as referências (`ref`) do projeto inteiro que apontam para o campo ou para uma linha da tabela dele. Entre formas diferentes (campo × coluna, ou tabelas diferentes) não há como mover: o valor de `from` é apagado. | `to` já tinha valor (sobrescrito) ou a forma não permite mover                          | não                                                                                                                      |
| `remove-field` | Apaga a chave de `values` (ou a coluna, em cada linha). Valor vazio não conta como perda.                                                                                                                                                                                                          | valor não vazio                                                                         | não                                                                                                                      |
| `map-values`   | Troca o valor antigo da `enum` pelo destino de `values`.                                                                                                                                                                                                                                           | não                                                                                     | `unknown-option` para o valor que não está em `values` nem nas opções atuais                                             |
| `fill-field`   | Valor **vazio ou ausente** recebe o `default`. Valor que não vale **nada** no tipo do campo (`invalid-value`, como o texto num campo que virou número) é trocado pelo `default`.                                                                                                                   | só o valor trocado por `invalid-value`                                                  | `unknown-option` (valor fora das opções) fica como está                                                                  |
| `rename-role`  | Troca o `parentRole` dos filhos do dono que usavam o papel `from` pelo `to`. Se `to` já existia na versão anterior, os dois papéis se juntam.                                                                                                                                                      | não                                                                                     | não                                                                                                                      |
| `remove-role`  | `clear`: o filho continua vinculado ao dono e fica sem papel (`parentRole: null`). `unlink`: o filho é desvinculado (`parentAnnotationId: null` e `parentRole: null`) e continua existindo.                                                                                                        | `clear`: `cleared-role` (o papel que estava no valor). `unlink`: `unlinked` (o vínculo) | `clear`: `missing-role` se o dono ainda tem papéis. `unlink`: `missing-owner` quando o tipo do filho tem `requiresOwner` |
| `set-role`     | Dá o papel `role` aos filhos do dono que **não têm papel**; com `childType`, só aos desse tipo. Preenche e nunca sobrescreve.                                                                                                                                                                      | não (nunca gera perda)                                                                  | não                                                                                                                      |

A chave de campo de um passo é a `key` ou `tabela.coluna`; numa coluna o passo vale para cada linha da tabela.

**Passos de papel (v12).** Os **filhos** do dono são as anotações cujo `parentAnnotationId` aponta para uma anotação da especialização cujo tipo, naquele ponto da cadeia, é o `type` do passo; o filho pode ser de qualquer tipo, de outra especialização ou livre. Invariante: `parentRole` não nulo exige `parentAnnotationId` não nulo. No relatório por passo, `annotations` conta os filhos alterados e `unlinked` conta os desvínculos.

**O que é recusado.** Com especialização v4 ou v5 e a cópia aplicada disponível, `updateSpecialization` **recusa** uma versão com quebra sem passo que a cubra (`spec-missing-migrations`, e na app o botão **Atualizar** fica desabilitado): nada é alterado. As versões 1 a 3 não têm `migrations` e **não são recusadas**: a atualização segue como era (os valores que deixam de valer viram pendência). Sem a cópia aplicada, nada é comparado.

**O que o impacto informa.** `specializationUpdateImpact` (em `src/model/specializations.ts`) devolve `changes`, `breaking`, `missingMigrations`, `migrations` e `comparable` e, com a execução simulada sobre o projeto, `additive` (nenhuma quebra: os dados ficam como estão), `refused` (quebra sem migração), `steps` (o relatório por passo: anotações, valores, convertidas, apagadas, referências e desvinculadas), `losses` (cada valor, anotação ou vínculo que a atualização apaga: inclui `papel limpo` e `vínculo desfeito`) e `pending` (o que vira pendência). O diálogo de atualização mostra isso: "Atualização aditiva: os dados ficam como estão.", ou **Passos da migração** com as contagens, as perdas em destaque ("Esta atualização apaga N valor(es) e M anotação(ões).", com "e K vínculo(s)" no fim quando há vínculo desfeito) e as pendências ("N pendência(s) ficam"). Depois de atualizar com pendências, a janela **Incompletas** abre sozinha.

### Exemplos

Os trechos são o que muda no arquivo da especialização (`version` e `migrations`); o resto do arquivo (camadas, tipos, componentes) segue a v4 normal.

**(a) Evolução aditiva, v1 → v2.** Um componente novo e um campo opcional novo: nenhuma quebra, então **nenhum** `migrations`. Os dados do projeto ficam como estão.

```json
{
  "formatVersion": 4,
  "id": "loja",
  "version": 2,
  "layers": [
    {
      "id": "telas",
      "annotationTypes": [
        {
          "id": "botao",
          "component": "components/botao.json",
          "fields": [
            { "key": "texto", "type": "string", "required": true },
            { "key": "nota", "type": "string", "required": false }
          ]
        },
        { "id": "cartao", "component": "components/cartao.json", "fields": [] }
      ]
    }
  ]
}
```

(`nota` e o tipo `cartao` são novos na v2; `texto` já existia.)

**(b) Renomear um campo, v2 → v3.** O campo `texto` do `botao` passa a se chamar `rotulo`. Sem o passo, a v3 seria uma quebra recusada.

```json
{
  "version": 3,
  "migrations": [
    {
      "from": 2,
      "to": 3,
      "steps": [
        { "op": "rename-field", "type": "botao", "from": "texto", "to": "rotulo" }
      ]
    }
  ]
}
```

Numa anotação do `botao`, o `values` muda assim (as outras chaves ficam; uma `ref` que apontava para `texto` passa a apontar para `rotulo`):

```json
{
  "antes": { "texto": "Cadastrar", "nota": "primário" },
  "depois": { "rotulo": "Cadastrar", "nota": "primário" }
}
```

**(c) Cadeia de duas entradas, aplicada a um projeto na v1.** A v3 traz as duas entradas (a v1 → v2 e a v2 → v3) e a atualização roda as duas em ordem:

```json
{
  "version": 3,
  "migrations": [
    {
      "from": 1,
      "to": 2,
      "steps": [{ "op": "rename-type", "from": "chip", "to": "etiqueta" }]
    },
    {
      "from": 2,
      "to": 3,
      "steps": [
        { "op": "fill-field", "type": "etiqueta", "field": "tamanho", "default": "md" },
        {
          "op": "map-values",
          "type": "etiqueta",
          "field": "estilo",
          "values": { "primary": "filled" }
        }
      ]
    }
  ]
}
```

Antes (projeto na v1) e depois (v3), para uma anotação de `chip`:

```json
{
  "antes": { "typeId": "chip", "values": { "estilo": "primary" } },
  "depois": { "typeId": "etiqueta", "values": { "estilo": "filled", "tamanho": "md" } }
}
```

Uma anotação com `"estilo": "outline"` (que não está em `values` nem nas opções da v3) fica com o valor e vira a pendência `unknown-option`, que abre em **Incompletas**. Se o projeto já estivesse na v2, só a segunda entrada rodaria; se faltasse a v1 → v2, nada rodaria e a atualização seria recusada.

**(d) Remover um tipo: `convert` e `delete`.** O tipo `selo` sai da v2. As duas formas cobrem a quebra; a diferença é o destino das anotações.

```json
{
  "version": 2,
  "migrations": [
    {
      "from": 1,
      "to": 2,
      "steps": [{ "op": "remove-type", "type": "selo", "mode": "convert" }]
    }
  ]
}
```

Com `convert`, a anotação de `selo` vira **livre**: `{ "texto": "Novo" }` passa a ser o par `texto` = `Novo`. Nada se perde (o diálogo mostra "1 convertida(s)"); a anotação fica na camada em que estava, e se a camada é da especialização ela entra em **Incompletas** (`layer-mismatch`).

```json
{
  "version": 2,
  "migrations": [
    {
      "from": 1,
      "to": 2,
      "steps": [{ "op": "remove-type", "type": "selo", "mode": "delete" }]
    }
  ]
}
```

Com `delete`, a anotação de `selo` é **apagada, e as vinculadas a ela também**. Isso é perda: antes de atualizar o diálogo avisa em destaque "Esta atualização apaga 0 valor(es) e 2 anotação(ões)." (uma por anotação apagada, com a lista de qual marcação e qual nome), e **Desfazer** traz tudo de volta.

**(e) Papéis (`formatVersion` 12).** Na v3 da especialização `loja`, o `button` renomeou o papel `tap` para `click` e deixou de ter o papel `legado`, e o `card`, que não tinha papéis, passou a ter o papel `abrir`. Sem os três passos, a v3 seria recusada (`removed-role` e `roles-required`). Este é um arquivo completo, porque a `formatVersion` 12 é a que aceita os passos:

```json
{
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
}
```

Num projeto na v2, a atualização muda só o vínculo dos filhos (`parentRole`), nunca o filho em si:

```json
{
  "antes": [
    { "typeId": "navigate", "parentAnnotationId": "<button>", "parentRole": "tap" },
    { "typeId": "navigate", "parentAnnotationId": "<button>", "parentRole": "legado" },
    { "typeId": "navigate", "parentAnnotationId": "<card>", "parentRole": null }
  ],
  "depois": [
    { "typeId": "navigate", "parentAnnotationId": "<button>", "parentRole": "click" },
    { "typeId": "navigate", "parentAnnotationId": "<button>", "parentRole": null },
    { "typeId": "navigate", "parentAnnotationId": "<card>", "parentRole": "abrir" }
  ]
}
```

- `rename-role` troca `tap` por `click` sem perda nem pendência. Se `click` já existisse na v2, os filhos dos dois papéis passariam a ocupar o mesmo: é assim que se **juntam** dois papéis.
- `remove-role` com `clear` mantém o filho vinculado e apaga o papel: isso é **perda** (`cleared-role`, o `legado` que estava no valor, mostrada em destaque no diálogo) e, como o `button` ainda tem papéis, o filho fica em **Incompletas** (`missing-role`) até a pessoa escolher um. Com `unlink`, o filho seria desvinculado do `button` (perda `unlinked`) e, como o `navigate` tem `requiresOwner`, ficaria pendente de dono (`missing-owner`).
- `set-role` dá `abrir` só aos filhos de `navigate` do `card` que **não tinham papel**; um filho que já tivesse papel fica como está, e o passo nunca gera perda. O `childType` pode ser o id **antigo** do filho quando o passo vem antes do `rename-type` dele: dar o papel **antes** do renome é o que mantém a informação de um tipo que vai ser renomeado.

## Validação da biblioteca

`validateLibrary` (em `src/model/library.ts`) valida um pacote **já lido**: recebe a lista de arquivos (`{ path, text? }` para `.json` e `.md`, `{ path, binary: true }` para uma fonte presente), o caminho da especialização (sem ele, procura o único arquivo com `"format": "mapping-spec"`), opcionalmente a versão anterior (`previous`, que liga o contrato de versão) e até que nível ir (`level`, padrão 3). É puro: não lê disco nem rede.

**Erro impede usar, aviso deixa usar.** Cada problema é `{ file, path, message, severity }` (`severity` é `error` ou `warning`; `file` é o arquivo do problema e `path` o caminho dentro dele, ambos podem ser vazios):

```json
{
  "file": "sdui-backend.spec.json",
  "path": "layers[0].annotationTypes[2].component",
  "message": "arquivo não encontrado: components/sdui-fab.json",
  "severity": "error"
}
```

O relatório traz `ok` (sem nenhum erro), `issues` (todos, na ordem dos níveis), `errors`, `warnings`, a `spec` lida e um `summary` (nível alcançado e contagens de tipos, componentes, documentos, exemplos e fontes). Os níveis rodam em ordem e cada um só roda se o anterior deixou o que ele precisa: sem especialização legível não há nível 2; um componente inválido não impede os outros de passar pelos níveis 2 e 3.

1. **Cada arquivo isolado, estrito.** A especialização (`parseSpec`; os avisos de `specWarnings`), cada componente citado (`parseComponent`, com o caminho dentro do arquivo), cada documento (`.md` vazio avisa). Um arquivo citado que não está no pacote é **erro** (`arquivo não encontrado`); um `.json` ou `.md` do pacote que ninguém cita é **aviso** (`arquivo não referenciado pela especialização`).
2. **Coerência entre arquivos.** O `slot` declarado nas `sources` do tipo existe no componente (erro); todo campo que o desenho usa existe no tipo (**erro**: o desenho não acha o valor); campo do `preview` que o tipo não tem, campo do tipo que o desenho não usa e dois tipos com o mesmo arquivo de componente são **avisos**; os arquivos dos exemplos de sistema externo existem e são JSON (erro quando não); o `scrim` das raízes é um tipo da especialização (erro); o arquivo de cada fonte existe (**aviso** quando falta: o desenho usa a fonte do sistema); e, com `previous`, o contrato de versão (erro para a quebra sem passo e para a `version` que não cresceu; aviso para um passo que cita o que não existia na versão anterior).
3. **Prova de desenho.** Cada componente é instanciado com os valores do `preview` (ou os padrões dos campos) e de **cada exemplo de valores**, no `size` (o `minSize` não é desenhado): cada aviso do motor vira um aviso do pacote com `(aproximado)` no fim, porque aqui o texto é medido de forma **aproximada** (a medida real é a do navegador). Uma falha ao desenhar é erro. Cada exemplo de sistema externo (o do tipo, `system` + `file`, e cada tela de `origins[].examples`) passa pela declaração de origem: erro do resultado é erro, e propriedade desconhecida e os outros avisos da origem são avisos. A lista de avisos está no [`COMPONENT-FORMAT.md`](COMPONENT-FORMAT.md), "Avisos do motor".

As três portas — **o aplicativo, o servidor MCP e a skill `spec-author`** — chamam a **mesma função** e mostram o mesmo relatório. Isso é da fase B2 da etapa Biblioteca; hoje a função existe e é coberta por testes, mas nenhuma porta a chama ainda.

Os pacotes `libraries/material3-compose/` e `examples/libraries/sdui-backend/` passam pelo validador com **zero erros e zero avisos** (`tests/model/material3ComposeLibrary.test.ts` e `tests/examples/sduiBackendLibrary.test.ts` fixam o resultado). A prova de desenho só desenha o tamanho inicial (`size`): o `minSize` não é desenhado, porque o aviso nele só serviria a quem escreve o componente.

## Regras de validação

As mensagens de erro trazem o caminho, ex: `layers[1].annotationTypes[0].fields[2].type: "numero" inválido; use "string", "number", "date", "enum", "table" ou "ref"`.

- `format`, `formatVersion` (1 a 16), `id`, `name` e `version` obrigatórios; `version` inteiro ≥ 1;
- ids de camada únicos; ids de tipo únicos na especialização inteira; `key` única no tipo e nas colunas; nenhuma `key` começando com `_`;
- `allowedChildren` só referencia tipos existentes **em outra camada** (a partir da `formatVersion` 13, também na camada do próprio dono, inclusive o próprio tipo);
- todo tipo com `requiresOwner: true` aparece no `allowedChildren` de algum **outro** tipo (na v11, no conjunto **resolvido** dos filhos de algum dono: por id, por camada inteira ou por grupo); o tipo que só ele mesmo lista não atende (`nenhum outro tipo o aceita como filho`);
- `default` compatível com o tipo (e presente em `options` no `enum`); `ref` sem `default`;
- `columns` só com tipos simples ou, na `formatVersion` 7, `ref` (com `accepts`); `table` dentro de `table` é recusado; `rowLabel` obrigatório em `table` com `tags` e apontando para uma coluna `string`;
- `labelField` aponta para um campo `string` do tipo;
- `accepts` com pelo menos uma etiqueta, `free: true` ou `annotations`; etiquetas no formato `[a-z0-9-]+`;
- **v14, `accepts.annotations`:** só a partir da `formatVersion` 14 (antes, `só é permitido com formatVersion 14`, no caminho `…accepts.annotations` do campo ou da coluna); lista não vazia de ids de tipo ou cláusulas `{ layer, groups }` da mesma especialização; camada, grupo e tipo inexistentes são os erros do `allowedChildren`;
- **v15, `structural`:** só a partir da `formatVersion` 15 (antes, `só é permitido com formatVersion 15`, no caminho `…annotationTypes[n].structural`); booleano; `true` com `component` no mesmo tipo é erro;
- **v15, `origins[].kind`:** só a partir da `formatVersion` 15 (antes, `só é permitido com formatVersion 15`, no caminho `origins[n].kind`); `tree` (padrão) ou `measured`; a `measured` aceita só `system`, `kind`, `name` e `booleans` (`node`, `screen` e `examples` são erro, com o caminho).
- **v15, `tokens`:** só a partir da `formatVersion` 15 (antes, `só é permitido com formatVersion 15`, no caminho `tokens`); `modes` lista não vazia de nomes distintos `[a-z0-9][a-z0-9-]*`; nome de token no mesmo padrão; cada valor é texto ou número, simples ou com todos os modos (e só eles) do mesmo tipo (ver "Tokens de design");
- **v16:** `fieldModels`, `signature`, `ignore`, `calls` e `formats` (no `code`, no caso de `variants` e, para `signature`, em `sources`) só a partir da `formatVersion` 16 (antes, `só é permitido com formatVersion 16`, no caminho da chave); `like` aponta para `<tipo>.<campo>` existente; `format` e molde têm `{value}`; o primeiro segmento de um caminho em `params` está em `calls`; ver "Assinaturas e modelos de campo";
- `platforms`: `id` no formato `[a-z0-9-]+` e único, `name` obrigatório, `language` e `repo` opcionais; `platforms` e `code` a partir da `formatVersion` 2;
- **v5, `repo`:** só na `formatVersion` 5, dentro de uma entrada de `platforms` (numa versão anterior o erro é `só é permitido com formatVersion 5`, no caminho `platforms[0].repo`); `url` obrigatória, começando com `http://` ou `https://`, sem espaços; `urlTemplate` opcional, também `http(s)://` e com `{path}`; `ref` opcional, texto não vazio; qualquer outra propriedade em `repo` é recusada;
- **v11, filhos por camada e grupo:** só a partir da `formatVersion` 11 (numa versão anterior o erro é `só é permitido com formatVersion 11`, no caminho `…annotationTypes[n].allowedChildren[k]` para a cláusula, `layers[n].groups` e `…annotationTypes[m].groups`); cada item de `allowedChildren` é um id de tipo ou uma cláusula `{ layer, groups? }` estrita (outra propriedade é erro, e `groups: []` também); erros: `layer` que não é uma camada da especialização, `layer` que é a camada do próprio dono (`filhos devem estar em outra camada`) e grupo inexistente na camada da cláusula; `requiresOwner` é conferido no conjunto resolvido; `layers[n].groups`: `id` não vazio e único na camada, `name` não vazio; `annotationTypes[m].groups`: lista não vazia, sem repetição, só de grupos da própria camada (grupo inexistente na camada é erro); **avisos:** 20 ids ou mais em texto no mesmo `allowedChildren` (`N tipos listados um a um; uma cláusula { layer, groups } cobre a camada ou os grupos`; com 19, não) e grupo declarado que nenhum tipo usa (ver "Filhos por camada e grupo");
- **v13, filhos da própria camada:** a cláusula `{ layer }` da camada do próprio tipo e o id de um tipo da mesma camada (inclusive o do próprio tipo) só são aceitos a partir da `formatVersion` 13; numa versão anterior os erros são `camada "x" é a do próprio tipo; filhos devem estar em outra camada` (no caminho `…allowedChildren[k].layer`) e `tipo "x" está na mesma camada; filhos devem estar em outra camada`; o resto das regras de `allowedChildren` (camada e grupos inexistentes, `requiresOwner` no conjunto resolvido) não muda (ver "Filhos por camada e grupo");
- **v12, passos de papel em `migrations`:** `rename-role`, `remove-role` e `set-role` só a partir da `formatVersion` 12 (numa versão de 4 a 11 o erro é `só é permitido com formatVersion 12`, no caminho `migrations[i].steps[j].op`); a mensagem de um `op` inválido lista os nove passos; chaves estritas (`rename-role`: `type`, `from`, `to`; `remove-role`: `type`, `role`, `mode`; `set-role`: `type`, `role`, `childType` opcional); `rename-role`: `type` é um tipo desta versão com `childRoles`, `to` é um papel dele e `from` não é; `remove-role`: `type` é um tipo desta versão (pode não ter mais `childRoles`), `role` não é papel dele e `mode` é `clear` ou `unlink`; `set-role`: `type` tem `childRoles`, `role` é um papel dele e `childType`, se vier, só confere o formato de id (tipo inexistente é um no-op); **aviso** (nível 2, com a versão anterior): `rename-role.from` ou `remove-role.role` que não era papel do tipo naquela versão, considerando o `rename-type` do dono; contrato: `removed-role`, `roles-required` e `added-role` (ver "Contrato de versão");
- **v11, `childRoles` e `childRolesLabel`:** só a partir da `formatVersion` 11 (`só é permitido com formatVersion 11`, no caminho `…annotationTypes[n].childRoles` ou `….childRolesLabel`); `childRoles` não vazia, de `{ id, name, description? }` estritos, com `id` não vazio e único no tipo e `name` não vazio; só em tipo com `allowedChildren` (senão é erro); `childRolesLabel` texto não vazio e só com `childRoles` (senão é erro); sem ele a app usa "Papel" / "Role" (ver "Papéis no vínculo (childRoles)");
- **v11, `docRepos` e `doc` objeto:** só a partir da `formatVersion` 11 (`só é permitido com formatVersion 11`, no caminho `docRepos` ou `…annotationTypes[n].doc`); `docRepos[n]` com as regras do `repo` de plataforma (`url` obrigatória `http(s)://` sem espaços, `urlTemplate` opcional com `{path}`, `ref` opcional não vazio, nenhuma outra propriedade), `id` no formato `[a-z0-9-]+` e único na lista (id repetido e `urlTemplate` sem `{path}` são erro); `doc` objeto `{ repo, path }` estrito: `repo` precisa estar em `docRepos`, `path` relativo (sem `.`, `..` nem `/` no começo), terminando em `.md` e sem `#`; o `doc` texto continua valendo da v4 em diante; **aviso:** repositório de `docRepos` que nenhum `doc` usa (ver "Documento em repositório externo (docRepos)");
- **v10, `notices`:** só a partir da `formatVersion` 10 (numa versão anterior o erro é `só é permitido com formatVersion 10`, no caminho `…annotationTypes[n].notices`, `…fields[n].notices` ou `…columns[m].notices`); lista (pode ser vazia) de objetos estritos com `kind` (`pending`, `deprecated`, `diverges` ou `removed`) e `message` (não vazia nem só espaços) obrigatórios, `since` (data real `AAAA-MM-DD`) e `ref` (texto não vazio) opcionais; dois avisos com o mesmo `kind` e a mesma `message` na lista são o erro `aviso repetido`, no caminho do segundo; qualquer outra propriedade é recusada; o aviso só informa (ver "Avisos (notices)");
- **v9, `variants`:** só a partir da `formatVersion` 9 (numa versão anterior o erro é `só é permitido com formatVersion 9`, no caminho `…code.<plataforma>.variants`); `field` é a `key` de um campo `enum` do tipo (nível de cima); `cases` não vazio, com chaves nas `options` do campo e casos não vazios; `params` e `values` dos casos como os da base; um nível só (o caso não tem `variants`); qualquer outra propriedade é recusada (ver "Variantes do código");
- **v8, `suggestions`:** só a partir da `formatVersion` 8 (numa versão anterior o erro é `só é permitido com formatVersion 8`, no caminho `…fields[n].suggestions` ou `…columns[m].suggestions`); só em campo ou coluna `string`; lista não vazia, até 200 itens, de textos únicos, não vazios e sem espaço nas pontas; não restringe o valor, e o `default` pode ficar fora da lista;
- **v8, `linkedRef`:** só a partir da `formatVersion` 8 (numa versão anterior o erro é `só é permitido com formatVersion 8`, no caminho `…fields[n].linkedRef` ou `…columns[m].linkedRef`); só em campo ou coluna `string`; a `key` precisa ser a de um campo `ref` do mesmo tipo (na coluna, de uma coluna `ref` da mesma `table`); não restringe o valor e independe de `suggestions`;
- **v7, `floating`, `appliesTo` e coluna `ref`:** só a partir da `formatVersion` 7 (numa versão anterior o erro é `só é permitido com formatVersion 7`, no caminho exato: `…annotationTypes[n].floating`, `…annotationTypes[n].appliesTo`, `…fields[n].columns[m].type`); `floating` booleano; `appliesTo` não vazio, sem repetição, só com `marking` e `arrow`, e um tipo que não se aplica a marcações (só `arrow`) não pode ter `component` nem `floating`;
- **v6, `containers`:** só a partir da `formatVersion` 6 (numa versão anterior o erro é `só é permitido com formatVersion 6`, no caminho `containers`); `id` no formato `[a-z0-9-]+` e único na lista; `name` não vazio; `width` e `height` inteiros de 1 a 20000; `background` opcional no formato `#RRGGBB`; qualquer outra propriedade é recusada;
- `sources` a partir da `formatVersion` 3; origem de tipo com `system` e pelo menos `id` ou `name`; origem de campo com `system` e `name` (ou `path`, na v4, em sistema de `origins`); `values` só em campos `enum` e com destinos que existam em `options`;
- **v4, chaves novas:** `fonts`, `origins`, `migrations` (raiz), `component`, `doc` e `examples` (tipo) só a partir da `formatVersion` 4: numa versão anterior o erro é `só é permitido com formatVersion 4`, no caminho da chave;
- **v4, caminhos do pacote:** `component` e `examples[].file` com extensão `.json`, `doc` (texto) com `.md`, `fonts[].file` com `.ttf`, `.otf`, `.woff` ou `.woff2`, e `origins[].examples[].file` com `.json`; todos relativos, normalizados, com `/`, sem `.`, `..`, `/` no começo nem unidade;
- **v4, `fonts`:** `family` não vazio; `weight` inteiro de 100 a 1000 ou faixa `"100 900"` (o primeiro número menor); `style` `normal` ou `italic`; o par `family` + `weight` + `style` não se repete;
- **v4, `examples`:** `name` não vazio e único no tipo; ou `values` ou `system` com `file`, nunca os dois modos nem nenhum; as chaves de `values` são campos do tipo, com valor `null` ou compatível com o tipo (o campo `table` aceita só a lista de linhas, em cada linha um objeto coluna → valor com as chaves sendo colunas da tabela e cada célula compatível com a coluna, e a coluna `ref` só `null`, sem mudar a `formatVersion`: uma app ou MCP anterior ao épico recusa a biblioteca com a mensagem de hoje; o campo `ref` não aceita valor); `system` precisa estar em `origins`;
- **v4, `sources`:** `path` só em sistema declarado em `origins` (e obrigatório nele), com sintaxe válida (`a.b[0].c`) e sem `[*]`; fora de `origins`, `name` é obrigatório e `path` é proibido; `slot` e `ignore` só em sistema declarado em `origins`, e `ignore` sem repetição;
- **v4, `origins`:** conferido por `parseOrigins`, estrito: `system` único, `node` com `type`, `props` e `children`, `screen` com `width`, `height` e ao menos uma raiz, caminhos e âncoras válidos, `booleans` com `true` e `false`, `examples` com `name` único e `file` `.json`;
- **v4, `migrations`:** `from` inteiro ≥ 1 e único, `to` maior que `from` e no máximo `version`, `steps` não vazia, `op` conhecido e chaves estritas por passo; o lado novo de cada passo existe nesta versão e o lado antigo não existe mais (ver "Contrato de versão");
- `code` só em especializações que declaram `platforms`; os ids de `code` precisam existir em `platforms`;
- `symbol` obrigatório em cada entrada de `code`; `path`, se houver, não vazio e relativo à raiz do `repo` da plataforma (normalizado, com `/`, sem `.`, `..`, `/` no começo nem unidade); chaves de `params` e `values` precisam ser campos do tipo; `values` só para campos `enum`, com chaves que existam em `options`;
- `color` no formato `#RRGGBB`;
- propriedades desconhecidas são rejeitadas (o `platforms` de um campo só existia no tipo removido `codeRef`);
- um campo do tipo removido `codeRef` (fora de `columns`) não é erro: é lido, ignorado e vira aviso (ver "Tipos de valor").

**Validar antes de importar.** A importação da app e o servidor MCP usam a mesma validação (`parseSpecText`, em `src/model/`). A tool `validate_specialization` do servidor (um `path` dentro das raízes ou o `text` JSON) devolve exatamente esses erros, com o caminho, sem aplicar a nenhum projeto, e ainda avisa o que não impede a importação mas costuma ser descuido: plataforma declarada e não usada (`unused-platform`), tipo sem `code` numa especialização com plataformas (`type-without-code`: nenhuma plataforma diz como criar uma instância dele), plataforma em que algum tipo tem `path` e que não declara `repo` (`path-without-repo`), o `format` antigo (`mapeador-spec`) e o campo do tipo removido `codeRef`, ignorado (`ignored-field`). A importação da app mostra o aviso dos campos ignorados.

## Exemplo comentado: SDUI

```json
{
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
          "allowedChildren": ["onClick"],
          "fields": [
            {
              "key": "id",
              "type": "string",
              "required": true
            },
            {
              "key": "estilo",
              "type": "enum",
              "options": ["primary", "secondary"],
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
                "tags": ["data-field"],
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
              "options": ["navigate", "submit"],
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
}
```

- Duas camadas: Componentes e Eventos, cada uma com seus tipos.
- `Button`: `id` é obrigatório (sem ele a anotação fica incompleta) e `estilo` já vem como `primary` (`default`).
- `Button` lista `onClick` em `allowedChildren`, e `onClick` tem `requiresOwner`: um `onClick` só existe ligado a um `Button`.
- `Input.dado` é um `ref`: aceita atributos com a etiqueta `data-field` (ex: as linhas de atributos da Classe, do Modelo de dados) e também tuplas de anotações livres.
- `platforms` declara os dois alvos de código em que o agente escreve a solução, o `android` e o `bff`, cada um com o `repo` da sua biblioteca (`url`, o `urlTemplate` do link de um arquivo e a `ref` a que o `code` corresponde).
- `code` diz como se cria uma instância de cada tipo: no `android`, o `symbol` é o composable a chamar (`com.app.ds.DSButton`) e o `path` é o arquivo que o define, relativo à raiz do `repo`; no `bff`, o `symbol` é a função Kotlin que gera o nó JSON (`com.app.bff.sdui.button`), e não o nome do nó. O agente lê o arquivo para ver a assinatura e escreve a chamada.
- `params` diz com que nome o campo é passado (`estilo` vai em `style` no Android e em `variant` no BFF) e `values` como o valor do `enum` é escrito no código (`primary` vira `ButtonStyle.Primary`); `notes` orienta (a função do BFF devolve o nó do componente no JSON da tela).

## Exemplos completos

- [`examples/specs/sdui.json`](../examples/specs/sdui.json) (`formatVersion` 12): `string`, `number`, `enum`, `table` e `ref`; `required`, `default`, `label`, `description`; `allowedChildren` e `requiresOwner`; referência por etiqueta (`dado`) que também aceita tuplas livres; plataformas `android`, `ios` e `bff` (a função Kotlin que gera o JSON), cada uma com o `repo` da sua biblioteca, `code` em todos os tipos de componentes e eventos e a camada Telas com o `Screen` (sem `code`).
- [`examples/specs/modelo-de-dados.json`](../examples/specs/modelo-de-dados.json) (`formatVersion` 1, sem plataformas): `date`, `labelField`, `table` com etiqueta `data-field` e `rowLabel` (cada atributo vira um alvo de referência).
