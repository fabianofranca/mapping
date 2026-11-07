---
name: spec-author
description: Escreve, revisa ou atualiza uma especialização do Mapping (arquivo JSON "mapping-spec" com camadas, tipos de anotação, campos, relações, plataformas/code e origens) a partir de um código-fonte, design system ou documento, e a valida antes de entregar. Na formatVersion 4 escreve a BIBLIOTECA inteira (pasta com a especialização, um componente por arquivo, um documento por componente, exemplos e fontes) e a valida com validate_library. Use sempre que o pedido envolver criar ou mexer numa especialização, spec, "mapping-spec", tipos de anotação do Mapping, mapear componentes de um design system ou de um app para o Mapping, ou dizer com que código se cria uma instância de cada tipo (code com symbol e path, platforms com repo), ou ligá-los a uma origem externa (sources, Figma) — mesmo que a palavra "especialização" não apareça.
---

# Autor de especializações e bibliotecas do Mapping

Uma **especialização** é o arquivo JSON que ensina o Mapping a falar a língua de um domínio: quais camadas existem, que tipos de anotação cada uma aceita, que campos cada tipo tem, como os tipos se relacionam e, opcionalmente, com que código se cria uma instância de cada tipo em cada plataforma (`formatVersion` 2; o repositório da biblioteca em cada plataforma entra na 5) e a que elemento de um sistema externo ele corresponde (`formatVersion` 3). Na `formatVersion` 4 a especialização vira uma **biblioteca**: uma pasta (o **pacote**) com a especialização, um arquivo de **componente** por tipo (o desenho), um **documento** markdown por componente, **exemplos** nomeados e a lista de **fontes**. O formato completo está em `docs/SPEC-FORMAT.md` do repositório do Mapping; esta skill é o método para produzir um arquivo que passe na validação de primeira e que modele bem o domínio.

O prompt que invoca a skill traz o que muda de uma especialização para outra: id, nome, origem do material, `formatVersion`, plataformas, o que fica fora e, para uma biblioteca, a pasta de saída e a origem dos componentes. Tudo o que não muda está aqui.

## Modelo e esforço

Para quem vai disparar o agente: **Opus 5.5 com esforço alto** é o padrão (o esforço padrão desse modelo é médio, e as regras entre elementos da especialização são onde o esforço baixo erra). **Fable 5.1 alto** para a primeira especialização de uma plataforma grande ou uma `formatVersion` 3 com muitas origens a casar. **Sonnet 5.5** para manutenção (acrescentar um tipo, renomear campo, corrigir um erro do validador).

## Leitura obrigatória, nesta ordem

1. `docs/SPEC-FORMAT.md`: o formato, as regras de validação e o exemplo comentado. Leia inteiro; é curto.
2. `docs/spec.schema.json`: a estrutura. Ele valida só a forma; as regras entre elementos (ids únicos, `allowedChildren` em outra camada, `default` compatível, destinos de `values` em `options`) vivem no validador da app, e é ele que decide.
3. `examples/specs/sdui.json` (`formatVersion` 2, com plataformas e `code`) e `examples/specs/modelo-de-dados.json` (`formatVersion` 1, com `table`, `tags` e `rowLabel`): copie o estilo, não o conteúdo.
4. Em `docs/AGENT-GUIDE.md`, a seção "Criando especializações: gerar, validar, corrigir" e, se a especialização tiver `sources`, "Especializações com `sources`". Para uma biblioteca (`formatVersion` 4), leia também "Escrevendo uma biblioteca", a seção "Biblioteca: o pacote" e o "Contrato de versão" do `docs/SPEC-FORMAT.md` e **inteiro** o `docs/COMPONENT-FORMAT.md` (template, tamanhos, expressões).
5. Para uma biblioteca, `libraries/material3-compose/` (a especialização, `components/`, `docs/`, `examples/` e `fonts/`): copie o estilo, não o conteúdo.

Quando o agente roda fora do repositório do Mapping (o caso normal: ele roda no repositório do código que está sendo mapeado), esses documentos chegam pelo servidor MCP como recursos `mapping-docs://SPEC-FORMAT.md`, `mapping-docs://COMPONENT-FORMAT.md` e `mapping-docs://AGENT-GUIDE.md`; os exemplos e o schema ficam só no repositório do Mapping. Se nem o MCP nem o repositório estiverem ao alcance, pare e diga o que falta: escrever uma especialização sem o formato na mão produz um arquivo que não importa.

## O que o prompt dá e o que fazer quando falta

| O prompt diz                                           | Se não disser                                                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `id` e `name` da especialização                        | Derive do domínio (`id` em `[a-z0-9-]+`) e registre como decisão.                                      |
| A origem: repositório, pasta, design system, documento | Pergunte. Sem origem não há o que modelar.                                                             |
| O que ler na origem e o que ignorar                    | Leia o catálogo público (componentes exportados, entidades, eventos); ignore internos e testes.        |
| `formatVersion` desejada                               | Use a mínima para o que a especialização usa (ver "Versão"); biblioteca pede a 4.                      |
| (opcional) Tamanhos prontos de container               | Só declare `containers` se a origem evidenciar tamanhos (breakpoints, dispositivos); pede a 6.         |
| Plataformas e linguagens                               | Só declare plataformas que o material de origem evidencie. Nenhuma, se for `formatVersion` 1.          |
| Onde gravar o arquivo                                  | `<id>.json` na pasta de trabalho; diga onde ficou.                                                     |
| (biblioteca) A pasta de saída                          | `<id>/` na pasta de trabalho, com `<id>/<id>.spec.json` dentro; diga onde ficou.                       |
| (biblioteca) A origem dos componentes                  | SVG do Figma, código ou documento: sem ela não há o que desenhar; pergunte (ver "Biblioteca").         |
| Aplicar a um projeto                                   | **Não aplique.** Entregue o arquivo validado; aplicar é por `propose_changes` e a revisão é da pessoa. |

Em qualquer dúvida de modelagem que mude o que a pessoa vai ver (um tipo a mais ou a menos, um campo obrigatório ou não), escolha a opção mais simples, siga e liste a dúvida na entrega. Não trave esperando resposta por detalhe pequeno.

## Método

A ordem importa porque cada passo depende do anterior.

### 1. Inventário da origem

Antes de escrever JSON, liste os candidatos a tipo de anotação com a **evidência** de cada um (arquivo e símbolo, ou o nome no design system). Separe por natureza: coisas que aparecem na tela (componentes, telas), coisas que acontecem (eventos, ações), coisas que descrevem dados (entidades, campos). Essa separação vira as camadas. Um inventário de vinte linhas evita uma especialização que modela o que não existe ou esquece o que existe.

### 2. Camadas

Uma camada por natureza, não por módulo do código. `id` em `[a-z0-9-]+` e único; `name` exibido; `color` em `#RRGGBB`, distinta entre camadas (a cor é como a pessoa separa as camadas no canvas). Filhos vinculados (`allowedChildren`) precisam estar em **outra camada** do dono, então quem tem eventos de componente tem ao menos duas camadas.

### 3. Tipos de anotação

- `id` único **na especialização inteira**, não só na camada. Use o nome do componente em minúsculas (`button`, `text-field`).
- `description` com a orientação que um agente de implementação precisa ler depois (quando usar, o que não confundir com o quê). É o lugar das notas de domínio; `code.notes` é só para detalhes de código.
- `labelField`: a chave de um campo `string` cujo valor nomeia a instância quando a anotação não tem nome. Quase todo tipo tem um (texto do botão, nome da tela, nome da entidade).

### 4. Campos

- `key` em `[A-Za-z0-9_]`, sem começar com `_` (reservado), única no tipo e nas colunas. `label` pode ter acentos; `key` não precisa.
- Tipos: `string`, `number`, `date`, `enum`, `table`, `ref`. Booleano é `enum` com duas opções (`["sim", "não"]`).
- `required` só para o que a instância não faz sentido sem. Vazio é permitido ao salvar; a anotação fica **incompleta**, e incompletas aparecem numa lista própria da app. Marcar tudo como obrigatório transforma a lista em ruído.
- `default` precisa ser válido para o tipo e, em `enum`, estar em `options`. Não existe para `table` nem `ref`.
- `table`: colunas só `string`, `number`, `date` ou `enum`. Com `tags`, cada linha vira alvo de referência e `rowLabel` (uma coluna `string`) é obrigatório.
- `options` de `enum`: strings únicas, nos valores do domínio (os valores do código vão em `code.values`; os da origem externa, em `sources[].values`).
- **`suggestions` versus `enum`** (`formatVersion` 8): `enum` é um conjunto **fechado** (a pessoa só escolhe uma das `options`; booleanos, estados, estilos). `suggestions`, só em campo ou coluna `string`, é um vocabulário **aberto**: a lista aparece ao digitar, mas qualquer texto continua valendo (o tipo de uma propriedade de código, `String`, `Int`, mas também `String?` e `List<Endereco>`). Use `suggestions` quando o valor tem palavras recorrentes mas não se esgota nelas; `enum` quando valor fora da lista é erro do domínio. Regras: lista não vazia, até 200 itens, textos únicos, não vazios e sem espaço nas pontas; em outro tipo de campo é erro; numa versão anterior à 8 é erro (`só é permitido com formatVersion 8`). O `default` pode ficar fora da lista. Incluir, mudar ou tirar `suggestions` não é quebra e não pede migração.
- **`linkedRef`** (`formatVersion` 8): num campo ou coluna `string` de texto livre que **às vezes nomeia algo já mapeado** (o tipo de uma propriedade, que pode ser outra declaração do mapeamento), declare um campo `ref` ao lado (na `table`, uma coluna `ref`) e ponha `linkedRef` com a `key` dele. Os alvos mapeados entram na lista e, ao escolher um, o texto e o `ref` são preenchidos juntos. Não restringe o valor: o texto livre continua valendo, e o `ref` fica vazio quando o texto não nomeia nada mapeado. Combina com `suggestions` (alvos primeiro, depois a lista fixa). Diferente de `enum` (conjunto fechado) e de `suggestions` (palavras fixas, sem ligação com o mapeamento). Erro se a `key` não existir, não for `ref` ou o campo não for `string`; incluir, mudar ou tirar não é quebra.

### 5. Relações e referências

- `allowedChildren`: ids de tipos de outra camada que podem ser vinculados a este (um dono, N filhos). Todo tipo com `requiresOwner: true` tem de aparecer no `allowedChildren` de algum tipo, senão o validador recusa. Na `formatVersion` 11 o item também pode ser uma **cláusula** que cobre uma camada ou grupos dela, e o dono pode declarar **papéis** para os filhos (ver o passo 12).
- `ref` é referência **forte** a uma tupla de outra anotação, por **etiqueta**: o campo alvo declara `tags`, e o campo `ref` declara `accepts: { tags: [...], free: true|false }`, com ao menos uma etiqueta ou `free: true`. Etiquetas em `[a-z0-9-]+`.
- Uma especialização **nunca cita outra pelo nome**: a ligação entre elas é só por etiquetas. Reutilize `data-field` para atributo de um modelo de dados (classe, entidade, DTO); invente etiqueta nova só quando nenhuma existente serve, e registre-a na entrega.

### 6. Plataformas e `code` (`formatVersion` 2; `repo` na 5)

O `code` de um tipo diz como se cria uma instância dele em cada plataforma: `symbol` é o que se chama, `path` é o arquivo que o define, `params` e `values` dizem como passar os campos, `notes` orienta. O agente lê o arquivo para saber a assinatura e escreve a chamada na solução. O mapeamento não guarda nada sobre a solução: não é o código gerado para uma anotação.

- `platforms` na raiz: `{ id, name, language, repo? }`. Uma plataforma é um alvo de código em que o agente escreve a solução (o app Android, o app iOS, o BFF que gera o JSON de uma tela). `id` em `[a-z0-9-]+` e único. Plataformas com o mesmo `id` em especializações diferentes são a mesma plataforma; alinhe com as já usadas no projeto (`get_project` mostra).
- `repo` por plataforma (`formatVersion` 5): `{ url, urlTemplate?, ref? }`, o repositório **da biblioteca** naquela plataforma, a raiz a que os `path` se referem. Preencha `url` e `ref` do repositório que você leu (o endereço `http(s)://` e a tag, branch ou commit em que leu o código), nunca de memória; `urlTemplate` (com `{path}`) só quando souber o formato do endereço de um arquivo no host. Cada especialização declara o repositório da própria biblioteca. Plataforma em que algum tipo tem `path` e que não tem `repo` gera aviso de validação: preencha o `repo`.
- `code` por tipo, por id de plataforma declarada:
  - `symbol` (obrigatório): **o que se chama para criar uma instância do tipo**, com o nome completo e conferido no código: um composable, uma view, uma classe, a função do BFF que gera o JSON do componente. Não é o nome do nó de saída (`"button"`, `"onClick"`), é a função ou o construtor que o produz.
  - `path` (opcional): o arquivo que define o `symbol`, para o agente ler a assinatura. **Relativo à raiz do `repo`**, `/` como separador, sem `.`, `..` nem linha. Preencha quando o arquivo for conhecido porque você o viu, nunca invente.
  - `params` (chave do campo → nome do parâmetro; só o que é passado), `values` (só campos `enum`; valor do mapping → texto no código), `notes` (orientação curta para quem escreve a chamada: o que passar além dos campos, ordem, cuidados).
- **`variants`** (`formatVersion` 9, dentro da entrada de `code`): use quando **a variante troca o que se chama**, não um parâmetro. Em Compose, `Button`, `OutlinedButton`, `TextButton` e `FilledTonalButton` são quatro composables; o tipo `Button` tem um campo `enum` `style` (`filled`, `outlined`, `text`, `tonal`) e o `code.compose` declara `variants: { field: "style", cases: { outlined: { symbol: "…OutlinedButton" }, … } }`. Quando a variante só muda um argumento (`enabled`, `size`), continue com `params` e `values`, sem `variants`.
  - `field` é a `key` de um campo `enum` do **próprio tipo** (nível de cima; coluna de `table` não vale) e cada chave de `cases` é uma das `options` dele. O caso declara **só o que muda**: `symbol`, `path` e `notes` substituem os da base; `params` e `values` se somam aos da base. Caso vazio é erro. O valor sem caso (o `filled`, por exemplo) usa a base, e uma anotação sem valor usa o `default` do campo.
  - **Um nível só.** Duas dimensões (estilo e tamanho) viram um `enum` que as junta (`filled-large`) ou dois tipos (o FAB e o Extended FAB do Compose são tipos separados). O caso não tem `variants`.
  - Confira cada `symbol` e `path` de caso no código, como o da base. O `find_by_code` e o `get_code_hints` entregam o código já resolvido para a variante da anotação.
- **Nunca crie um campo `codeRef`** (nem outro campo para guardar onde a instância foi escrita na solução): esse tipo saiu do formato. A especialização guarda só o que ajuda a **instanciar** (`symbol`, `path`, `params`, `values`, `notes`, `repo`), nada sobre a solução. Ao revisar ou atualizar uma especialização que tem um campo `"type": "codeRef"`, **remova o campo** (e as chaves de `params` que o citam), suba a `version` e registre a remoção na entrega; o validador o aceita só por compatibilidade, com o aviso `ignored-field`.
- Nome de plataforma, linguagem ou framework só aparece dentro de `platforms` e `code`. O resto da especialização descreve o domínio, não a tecnologia.

### 7. Origens (`formatVersion` 3)

- `sources` no tipo: `{ system, id?, name? }`, ao menos `id` ou `name`; o `id` é mais forte que o `name`, então prefira os dois quando a origem der. Um tipo pode corresponder a vários elementos (variantes antiga e nova).
- `sources` no campo ou coluna: `{ system, name, values? }`, com `values` só em `enum` e cada destino existindo em `options`.
- `system`, `id` e `name` são comparados exatamente, maiúsculas contam: copie da origem, não digite de memória.

### 8. Biblioteca (`formatVersion` 4)

Só quando o prompt pede uma biblioteca (componentes que a app desenha). Faça os passos 1 a 7 como sempre; depois, **dentro da pasta de saída**:

1. **Pacote:** a pasta `<id>/` leva a especialização na raiz e tudo o que ela cita, por caminho relativo ao arquivo dela, `/` como separador, **sem `..`**: `components/<tipo>.json`, `docs/<tipo>.md`, `examples/*.json`, `fonts/*`. Nada fora da pasta.
2. **Um componente por tipo** (`component` no tipo, arquivo `mapping-component` em `components/`): desenho (template), `size` inicial, `minSize` e `preview` com valores de exemplo. Siga o `docs/COMPONENT-FORMAT.md`; as chaves de campo que o template cita (`$field`, `$has`, `$switch`) precisam existir no tipo. Cores, espaçamentos e tipografia saem da origem (SVG do Figma: camadas, `fill`, raios e fontes que você viu; código: tokens do tema; documento: a tabela do design system), nunca de memória. Tipo sem desenho (evento, entidade) fica sem `component`.
3. **Um documento por componente** (`doc`, `docs/<tipo>.md`): quando usar, variantes, o que não confundir; markdown simples (títulos, parágrafos, listas, tabelas, código). É o que o agente lê em `get_component`.
4. **Exemplos nomeados** (`examples` no tipo): `values` (chaves de campos do próprio tipo, valores válidos) com `name` único; para uma origem de sistema externo (`origins`), `system` + `file` (o JSON de **um nó** em `examples/`) e, na origem, telas inteiras em `examples[]`.
5. **Fontes:** `fonts` na raiz (`family`, `file`, `weight`, `style`). Os arquivos têm licença e peso: se não puder incluí-los, deixe `fonts/LEIA-ME.txt` dizendo quais arquivos faltam e de onde obtê-los (fonte ausente é **aviso**, não erro).
6. **Atualização de biblioteca já aplicada:** preserve ids de tipo e `key` de campo, suba a `version`. **Aditivo** (não precisa de `migrations`): tipo novo, campo **opcional** novo, opção nova de `enum`, componente, documento, exemplo ou fonte novos, mudar só o desenho. **Quebra** (exige entrada em `migrations`, com `from`, `to` e `steps`): remover ou renomear tipo, campo ou opção de `enum`, tornar um campo obrigatório, mudar o `type` de um campo, tirar um papel de `childRoles` ou dar `childRoles` a um tipo que não tinha (passos `rename-role`, `remove-role` e `set-role`, da `formatVersion` 12: ver a seção 12). Passe a versão anterior à validação (`previous`).

### 9. Containers (`formatVersion` 6)

Só quando a origem evidencia **tamanhos prontos** para o objeto de topo do canvas (breakpoints de um design system, dispositivos-alvo de um app). É o que o diálogo **Novo container** oferece, agrupado pelo nome da especialização; o núcleo da app só tem **Personalizado** e **Tamanho da seleção** e não traz tamanhos de dispositivo. Tamanho de dispositivo, portanto, é domínio: se a especialização cobre telas de app, declare-os aqui.

- `containers` na raiz: lista de `{ id, name, width, height, background? }`. `id` em `[a-z0-9-]+` e único na lista; `name` não vazio (o texto da opção, como a origem o chama: "Celular", "Tablet"); `width` e `height` inteiros de 1 a 20000; `background` opcional, `#RRGGBB` (sem ele, branco).
- Exemplo: `"containers": [ { "id": "phone", "name": "Celular", "width": 360, "height": 800 } ]`.
- Vocabulário: **container** é o objeto de topo do canvas (com arquivo de imagem ou só com tamanho e cor de fundo); no projeto (`mapping.json`, schema v12) ele fica em `containers[]` e a marcação aponta para ele por `containerId`. A especialização nunca cita o projeto: `containers` aqui são só os tamanhos prontos. "Imagem" fica para o arquivo de imagem do container.
- Copie os números da origem, não os invente. Sem evidência, omita `containers` (e fique na `formatVersion` que o resto pede): é opcional e a 5 continua aceita.
- Numa versão anterior à 6, `containers` é erro (`só é permitido com formatVersion 6`). A lista está fora do contrato de versão: mudar tamanhos não é quebra.

### 10. Tipo flutuante (`formatVersion` 7)

`floating: true` no tipo de anotação faz a instância ser uma **marcação flutuante**: um comentário solto que vive só no canvas, acima de tudo, fora do pertencimento (nunca filha nem mãe de container ou marcação; arrastá-la move só ela). Use **só** quando o tipo é um comentário ou anotação solta que não pertence a uma tela (nota, recado, regra de negócio); **nunca** para componentes de interface, que pertencem à tela onde estão. O exemplo é a biblioteca de notas do repositório (`libraries/notas/`, aplicada por padrão pela app). Numa versão anterior à 7, `floating` é erro (`só é permitido com formatVersion 7`). Um tipo flutuante costuma ter um campo `string` de texto livre (aceita várias linhas na interface).

#### Onde o tipo se aplica: `appliesTo` (`formatVersion` 7)

`appliesTo` no tipo diz a que a anotação se aplica: `["marking"]` (o padrão: uma marcação), `["arrow"]` (uma **seta**, que liga duas marcações e pode ter anotações por camada, como a marcação) ou `["marking", "arrow"]`. O painel de anotações oferece à seta selecionada só os tipos que se aplicam a setas, e à marcação só os que se aplicam a marcações. Regras do validador: a lista é não vazia, sem repetição e só com `marking` e `arrow`; um tipo **só de seta** não tem `component` nem `floating` (a seta não tem desenho de componente). Numa versão anterior à 7, `appliesTo` é erro (`só é permitido com formatVersion 7`). Use `["arrow"]` para o dado que descreve a **relação** (o deep link que uma transição abre, o evento que ela dispara); não para o que descreve um elemento. Restrições de origem e destino por tipo não existem no formato: não as invente.

#### O padrão "flutuante que aponta" (tabelas de dados ligadas por seta)

Um dado em forma de tabela que descreve um elemento de uma tela (os eventos de analytics de um botão, as propriedades de uma chamada) **não** é uma anotação do botão: é um tipo **flutuante** cujo componente desenha a tabela, posto ao lado da tela e **ligado ao botão por uma seta**. O dado mora na anotação da tabela flutuante; quem lê o mapeamento chega a ela pelas setas que saem do botão. Escreva assim:

1. O tipo: `floating: true`, `component` e `doc`, e um campo `table` com as colunas que o domínio pede (evento, propriedade, valor…). Uma coluna pode ser `ref` (`accepts` como o campo `ref`; formatVersion 7) quando a linha aponta para um dado do projeto (um campo de modelo de dados, outra tela): é **dado**, não desenha seta.
2. O componente (`formatVersion` 2 do componente): um nó `repeat` com `field` = a chave do campo `table` e `template` = o desenho de **uma** linha; dentro do `template`, `{ "$field": "<coluna>" }` lê a coluna da linha. Copie o molde de `libraries/notas/components/tabela.json` (título, uma linha por registro, chave à esquerda e valor à direita) e troque as colunas. O `preview` traz 2 ou 3 linhas de exemplo (lista de objetos, uma chave por coluna). A altura da marcação **não** cresce com as linhas: dimensione o `size` e o `minSize` para o `preview` caber (a prova de desenho avisa `conteúdo maior que a caixa`).
3. Se a **relação** tem dado próprio, um segundo tipo com `appliesTo: ["arrow"]`.
4. No documento do tipo (`doc`), diga que a ligação com o alvo é uma seta e como o agente a encontra (`arrows` em `get_marking`).

Uma especialização **não cita outra**: a biblioteca de notas já traz a **Tabela** genérica (título e linhas chave/valor), mas uma especialização com colunas tipadas escreve o próprio tipo e o próprio componente do mesmo molde.

#### Imagem remota: o nó `image` (componente `formatVersion` 3)

Use `image` quando o desenho mostra uma foto cuja URL vem do dado (avatar, foto, logo). Ligue o `src` a um campo `string` do tipo, `{ "$field": "foto" }` (no `repeat`, a coluna `string` da `table`). Regras:

- `src` é só o literal (`https://...` absoluto) ou o `$field` puro: **nunca `$concat`**, `$switch` ou `$if`; nunca `http:`, `data:` nem caminho relativo.
- `fit`: `cover` (padrão), `contain` ou `fill`. Dê tamanho fixo, `fill` ou `%`; **nunca `hug`** (é erro). `fill` (cor) serve de fundo atrás da imagem e `cornerRadius` faz avatar redondo.
- Um componente com nó `image` usa a `formatVersion` 3 do componente. A especialização não muda (nada de declarar origem) e o `preview` traz uma URL `https://` só se você a viu na origem.

### 11. Avisos (`formatVersion` 10)

`notices` (lista, opcional) no tipo, no campo ou na coluna de `table` registra um **aviso curto** para quem usa a especialização. Escreva um quando **duas fontes que você leu discordam** (o contrato diz uma coisa e o código outra) ou quando o que você viu pede cuidado: nunca invente aviso sem ter visto a diferença nas fontes.

```json
{
  "id": "alert",
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

- `kind` (obrigatório): `pending` (uma fonte já tem e a outra ainda não; **o nome da plataforma ou da origem vai na `message`**, não em outro lugar), `deprecated` (obsoleto; a `message` diz o que usar no lugar), `diverges` (as fontes discordam; a `message` diz em quê) ou `removed` (saiu do contrato; não deve ser usado). `message` obrigatória, não vazia nem só espaços; `since` (data real `AAAA-MM-DD`) e `ref` (texto livre: a página do contrato, o arquivo do código) opcionais. Não repita o mesmo `kind` com a mesma `message` na lista (erro `aviso repetido`).
- **Regrave TODOS os avisos a cada rodada**, a partir do que as fontes mostram hoje: o aviso é um retrato da diferença, não um histórico. Quando a diferença some (o SDK ganhou o campo), o aviso simplesmente não é escrito de novo e some sozinho. Não carregue aviso antigo "por garantia".
- **Só informa.** Nenhum aviso, nem `removed`, impede importar, aplicar, criar anotação ou aceitar proposta, e não vira pendência. Por isso um campo que deve ser **obrigatório** continua com `required`, e um tipo que não pode mais existir continua precisando de migração, não de aviso.
- **Fora do contrato de versão:** incluir, mudar ou tirar `notices` nunca pede migração nem sobe a `version` por si só (`diffSpecs` os ignora); atualizar a especialização só por avisos não mostra impacto.
- **Só suba para a `formatVersion` 10 se algo usa `notices`.** Numa versão anterior, `notices` é erro (`só é permitido com formatVersion 10`, no caminho exato).

### 12. Filhos por camada e grupo, papéis e documentos externos (`formatVersion` 11)

Três recursos opcionais, cada um para um problema de modelagem. Use o que a origem pede e **não suba para a 11 por garantia**: sem nenhuma chave nova, a especialização fica na versão que o conteúdo pede.

**Cláusula no lugar de lista longa.** Quando um dono aceita **toda** uma camada (todo evento) ou uma parte coerente dela, escreva `allowedChildren: [{ "layer": "eventos" }]` ou `[{ "layer": "eventos", "groups": ["navegacao"] }]` em vez de listar os ids. Um tipo novo na camada passa a valer para o dono sem editá-lo. Itens em texto e cláusulas podem se misturar na mesma lista; a lista de ids continua certa para poucos filhos específicos. Com 20 ids ou mais em texto, o validador avisa que uma cláusula cobre a camada.

- **`groups`** (`layers[].groups`: `[{ id, name, description? }]`, `id` único na camada, a ordem é a dos cabeçalhos; `annotationTypes[].groups`: lista não vazia, sem repetição, de ids da **própria** camada; um tipo pode estar em vários grupos). Declare só os grupos que a origem evidencia (as seções do contrato, as pastas, as categorias do design system); grupo que nenhum tipo usa é aviso. Um tipo sem `groups` só entra por cláusula da camada inteira ou pelo id.
- A cláusula só tem `layer` e `groups`, aponta para **outra** camada (a do próprio dono é erro) e os `groups` dela existem na camada citada (`groups: []` é erro; para a camada inteira, omita). `requiresOwner` é conferido no conjunto **resolvido**: o filho precisa estar no conjunto de algum dono, por id, por camada ou por grupo.

**Papéis no vínculo.** Se o filho precisa dizer em que ponto do dono se liga, isso é papel, não campo nem id de tipo. Declare no **dono** `childRoles: [{ id, name, description? }]` (não vazia, `id` único no tipo; só em tipo com `allowedChildren`) e, se o nome padrão ("Papel" / "Role") não serve, `childRolesLabel` ("Trigger", "Slot"; só com `childRoles`). O papel pertence ao **vínculo**: o mesmo tipo de filho pode ocupar papéis diferentes no mesmo dono.

**`docRepos`: o documento mora noutro repositório.** Quando a documentação de um componente vive no repositório do design system ou do contrato, não a copie para o pacote (a cópia vira uma segunda fonte que envelhece): declare o repositório na raiz, `docRepos: [{ id, url, urlTemplate?, ref? }]` (as mesmas regras do `repo` de uma plataforma: `url` e `ref` do repositório que você leu, nunca de memória; `urlTemplate` com `{path}` só quando souber o formato do endereço de um arquivo no host), e aponte o `doc` do tipo para ele: `"doc": { "repo": "design-docs", "path": "components/button.md" }`. O `path` é relativo à raiz do repositório, termina em `.md`, sem `#`, `.`, `..` nem `/` no começo; o `repo` precisa estar em `docRepos`. O `doc` externo **não é arquivo do pacote**: uma biblioteca em que ele é o único arquivo citado vale como arquivo isolado, e a validação do pacote não o confere. O `doc` em texto (o `.md` do pacote) continua valendo; escreva o documento no pacote quando **você** o escreve. Repositório declarado que nenhum `doc` usa é aviso.

**Três anti-padrões** que a 11 existe para evitar:

1. **O gatilho no id do tipo:** dois tipos `onClick` e `onHold` que são o mesmo evento e só diferem no ponto do botão em que se ligam. Faça um tipo (`navigate`) e dois papéis no dono (`click`, `hold`).
2. **Um campo `trigger` em cada evento:** o ponto de ligação é dado do vínculo, não do filho; o campo se repete em todo tipo de evento e nada o liga ao que o dono oferece. Use `childRoles`.
3. **`allowedChildren` par a par:** os mesmos trinta ids copiados em cada dono, para que a camada inteira (ou um grupo) seja aceita. Use a cláusula `{ layer, groups? }`.

Um dono com papéis e eventos em grupos:

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
          "fields": [{ "key": "label", "type": "string", "required": true }]
        },
        {
          "id": "card",
          "name": "Card",
          "allowedChildren": [{ "layer": "eventos", "groups": ["navegacao"] }],
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
        { "id": "dados", "name": "Dados" }
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

O Button aceita todo evento (e, nele, o mesmo `navigate` pode ser ligado no clique e no pressionar); o Card só os do grupo `navegacao`. **Fora do contrato de versão:** incluir, mudar ou tirar `groups`, `childRolesLabel`, `docRepos` e o formato do `doc`, e mudar o `name` ou a `description` de um papel ou a ordem dos `childRoles`, nunca pede migração nem sobe a `version` por si só. **Dentro do contrato** estão os `id` dos papéis (ver a seção seguinte). Numa versão anterior à 11, cada uma dessas chaves é erro (`só é permitido com formatVersion 11`, no caminho exato).

#### Migração dos papéis (`formatVersion` 12)

O `id` do papel é dado que as anotações guardam (`parentRole` no vínculo do filho). Por isso, ao **atualizar** uma biblioteca já aplicada, mexer nos papéis de um tipo é quebra e exige um passo em `migrations` (os três passos só existem na `formatVersion` 12; as chaves são estritas, `type` é o tipo **dono**):

- **Papel que sumiu de `childRoles`** (`removed-role`, inclusive o tipo que perde todos): `rename-role { type, from, to }` quando o papel só mudou de `id` (o `to` existe no tipo) ou `remove-role { type, role, mode }` quando ele acabou. **Usar `rename-role` também para juntar dois papéis** em um (o `to` já existia na versão anterior): os filhos dos dois passam a ocupar o mesmo. `mode: "clear"` mantém o filho vinculado e apaga o papel (perda `cleared-role`; o filho fica em Incompletas, `missing-role`, se o dono ainda tem papéis); `mode: "unlink"` desvincula o filho (perda `unlinked`; pendência `missing-owner` se o tipo dele tem `requiresOwner`). Escolha `clear` quando o filho ainda faz sentido ligado ao dono, `unlink` quando o papel era o que o ligava.
- **Tipo que não tinha `childRoles` e passou a ter** (`roles-required`): `set-role { type, role, childType? }` dá `role` aos filhos do dono que **não têm papel**; com `childType`, só aos desse tipo. Ele preenche e **nunca sobrescreve**, e nunca gera perda; filho que nenhum passo alcança fica em Incompletas (`missing-role`). Declare um `set-role` para cada papel inicial que a origem evidencia, com `childType` quando o papel depende do tipo do filho.
- **Papel novo em tipo que já tinha papéis** (`added-role`) é aditivo: não pede passo.

**Dono ou filho renomeado (caso SDUI).** O `type` do passo é o `id` do dono **naquele ponto da cadeia**: depois de um `rename-type` do dono, o `id` novo; os papéis não são comparados entre o tipo antigo e o novo, então um papel que o tipo novo não tem vira `unknown-role` e se resolve com `rename-role` declarado **depois** do `rename-type`. O `childType` do `set-role` pode ser o `id` **antigo** do filho: **escreva o `set-role` ANTES do `rename-type` do filho** para dar o papel enquanto o tipo ainda tem o nome antigo e não perder a informação do que vai ser renomeado (no SDUI, o evento `onClick` que vira `action` em `examples/specs/sdui.json` ganha o papel `click` antes do renome; o JSON abaixo é só ilustração e usa `navigate`).

```json
{
  "from": 2,
  "to": 3,
  "steps": [
    { "op": "set-role", "type": "button", "role": "click", "childType": "onClick" },
    { "op": "rename-type", "from": "onClick", "to": "navigate" }
  ]
}
```

- **Só suba para a `formatVersion` 12 se a especialização declara algum passo de papel.** Quem não usa `rename-role`, `remove-role` nem `set-role` fica na versão que o conteúdo pede (a 11, com papéis). Numa `formatVersion` de 4 a 11, o passo é erro (`só é permitido com formatVersion 12`, no caminho `migrations[i].steps[j].op`). A recíproca vale: uma v11 que tira um papel ou dá `childRoles` a um tipo sem o passo é recusada na atualização; suba para a 12 e declare-o.
- **Anti-padrão: remover um papel (ou renomeá-lo) sem o passo.** Os filhos ficam com um `parentRole` que o tipo não tem mais e o contrato de versão recusa a atualização (`removed-role`). Também não use o passo para consertar o que a origem não evidencia: sem evidência do papel, não invente `set-role`.

### 13. Versão

`formatVersion` é a **mínima** para o que a especialização usa. O que cada versão acrescenta:

- `formatVersion` 1: o básico, sem plataformas e sem `code`.
- `formatVersion` 2: plataformas e `code` (como se cria uma instância de cada tipo).
- `formatVersion` 3: `sources`, a ligação com elementos de um sistema externo.
- `formatVersion` 4: a biblioteca (pasta): `component`, `doc`, `examples`, `fonts`, `origins` ou `migrations`.
- `formatVersion` 5: `repo` em alguma plataforma.
- `formatVersion` 6: `containers`, os tamanhos prontos de container.
- `formatVersion` 7: `floating` ou `appliesTo` em algum tipo, ou uma coluna `ref` numa `table`.
- `formatVersion` 8: `suggestions` ou `linkedRef` em algum campo ou coluna `string`.
- `formatVersion` 9: `variants` no `code` de algum tipo.
- `formatVersion` 10: `notices` em algum tipo, campo ou coluna.
- `formatVersion` 11: cláusula em `allowedChildren`, `groups` (na camada ou no tipo), `childRoles`, `childRolesLabel`, `docRepos` ou `doc` como objeto.
- `formatVersion` 12: `rename-role`, `remove-role` ou `set-role` em `migrations`.

A versão atual do formato é a 12. **Só suba para a 9 se algum tipo usa `variants`, para a 10 se algum tipo, campo ou coluna usa `notices`, para a 11 se algo usa uma chave da lista acima (o `doc` em texto não conta) e para a 12 só se declara um passo de papel**: o resto da biblioteca fica na versão que o conteúdo pede (a Kotlin e a de notas ficam na 8). O **componente** tem a própria versão: `formatVersion` 1, 2 quando usa `repeat`, ou 3 quando usa `image` (a 1 continua aceita; `repeat` numa 1 é erro). Uma versão maior que o necessário impede a importação em apps antigas sem ganho.

- `version` é inteiro ≥ 1. Especialização nova: `1`. Atualização de uma já aplicada: um a mais que a aplicada (`update_specialization` exige versão maior). Nunca mude o `id` numa atualização: ele é a identidade.

## Validar antes de entregar

A validação é a mesma da importação da app, com o caminho exato do erro (`layers[0].annotationTypes[2].fields[1].default: …`). **Biblioteca (v4):** valide a **pasta inteira** (ver "Validar a biblioteca" abaixo), não só o arquivo. Rode, corrija o trecho apontado, rode de novo, até **zero erros**. Para cada **aviso** (plataforma declarada e não usada, plataforma com `path` e sem `repo`, tipo sem `code` numa especialização com plataformas, `format` antigo), ou corrija ou explique na entrega por que fica; o aviso `ignored-field` (campo `codeRef`) sempre se corrige, removendo o campo.

1. **Com o servidor MCP** (o caminho normal): `validate_specialization({ text })` com o JSON, ou `validate_specialization({ path })` se o arquivo estiver dentro das raízes. Não aplica a projeto algum.
2. **Sem MCP, com o repositório do Mapping ao alcance**: um teste descartável em `tests/model/`, rodado com `npx vitest run tests/model/spec-draft.test.ts` e apagado depois. Ele não dá avisos, só erros.

   ```ts
   import { readFileSync } from 'node:fs';
   import { expect, test } from 'vitest';
   import { parseSpecText } from '../../src/model/spec';

   test('a especialização em rascunho é válida', () => {
     const result = parseSpecText(readFileSync('/caminho/para/<id>.json', 'utf8'));
     if (!result.ok) console.log(result.errors.join('\n'));
     expect(result.ok).toBe(true);
   });
   ```

3. **Sem nenhum dos dois**: entregue dizendo que não validou. Não afirme que passa.

### Validar a biblioteca

Gerar, `validate_library`, corrigir, repetir até **zero erros**. Erro impede usar; **aviso deixa usar**, mas cada um se corrige ou se explica na entrega (fonte ausente do pacote e conteúdo maior que a caixa são esperados quando o desenho é fiel à origem). Os três níveis são sempre os mesmos: (1) cada arquivo, (2) a coerência entre eles (e o contrato de versão, com a versão anterior) e (3) a prova de desenho, que instancia cada componente e passa os exemplos de sistema externo pela declaração. Cada problema vem com `file`, `path`, `message` e `severity`.

1. **Com o servidor MCP:** `validate_library({ path: "<pasta>" })`, com `previous: "<arquivo da versão anterior>"` numa atualização. A pasta precisa estar dentro das raízes. Use `level: 1` ou `2` para iterar e feche com o padrão (3).
2. **Sem MCP, com o repositório do Mapping ao alcance:** um teste descartável em `tests/model/`, rodado com `npx vitest run tests/model/library-draft.test.ts` e apagado depois. Ele chama a mesma função `validateLibrary` da app.

   ```ts
   import { readFileSync, readdirSync } from 'node:fs';
   import { join } from 'node:path';
   import { expect, test } from 'vitest';
   import { validateLibrary, type LibraryFile } from '../../src/model/library';

   const DIR = '/caminho/para/<id>'; // a pasta do pacote

   function readPackage(dir: string): LibraryFile[] {
     return readdirSync(dir, { recursive: true, withFileTypes: true })
       .filter((entry) => entry.isFile())
       .map((entry) => {
         const full = join(entry.parentPath, entry.name);
         const path = full
           .slice(dir.length + 1)
           .split('\\')
           .join('/');
         return /\.(json|md)$/i.test(path)
           ? { path, text: readFileSync(full, 'utf8') }
           : { path, binary: true };
       });
   }

   test('a biblioteca em rascunho é válida', () => {
     const report = validateLibrary({ files: readPackage(DIR) });
     for (const i of report.issues)
       console.log(`${i.severity} ${i.file} ${i.path}: ${i.message}`);
     expect(report.errors).toEqual([]);
   });
   ```

   Numa atualização, passe também `previous` (a `Spec` da versão anterior, lida com `parseSpecText` de `src/model/spec`).

3. **Sem nenhum dos dois**: entregue dizendo que não validou.

**Quem aplica é a app:** o servidor MCP não aplica pacote v4 (`apply_specialization` em `propose_changes` o recusa). Entregue a pasta validada e diga à pessoa para aplicá-la na app (Especializações, pasta ou zip do pacote).

Além do validador, releia o arquivo com estas perguntas: cada tipo do inventário está lá, ou está listado como fora de escopo? Algum tipo entrou sem evidência na origem? Toda `description` diz algo que o nome não diz? Os `symbol` de `code` existem mesmo, e cada `path` aponta para o arquivo que os define?

## Entrega

**Revisão final, antes de entregar:** cada `symbol` é o que se chama para criar a instância (e não o nome do nó de saída), e cada plataforma com `path` tem `repo`?

1. O arquivo JSON no caminho combinado, formatado com dois espaços, chaves na ordem do exemplo comentado de `docs/SPEC-FORMAT.md` (`format`, `formatVersion`, `id`, `name`, `version`, `description`, `platforms`, `containers`, `layers`). Biblioteca: a **pasta** inteira (especialização, `components/`, `docs/`, `examples/`, `fonts/`), com os arquivos formatados com dois espaços.
2. Um resumo curto, nesta ordem:
   - uma tabela camada → tipos, com a evidência de origem de cada tipo;
   - as decisões de modelagem que não estavam no prompt (campo obrigatório ou não, o que ficou fora, etiquetas novas);
   - as dúvidas abertas, cada uma com a opção escolhida e a alternativa;
   - o resultado da validação (zero erros; avisos e o que foi feito com cada um); numa biblioteca, o resultado do `validate_library` (ou a ressalva de que não rodou) e, para cada componente, de onde saiu o desenho.

Não aplique a especialização a um projeto nem crie proposta, a menos que o prompt peça. Aplicar muda o projeto da pessoa; ela decide quando.

## Armadilhas frequentes

- Camada por módulo do código em vez de por natureza: os eventos acabam na mesma camada dos componentes e `allowedChildren` não valida.
- `id` de tipo repetido em camadas diferentes (`button` em Componentes e `button` em Telas): o id é único na especialização inteira.
- Booleano como `string` com `default: "true"`: use `enum`.
- `enum` para um texto que não se esgota na lista (o tipo de uma propriedade): trava valores legítimos; use `string` com `suggestions`. E o contrário: `suggestions` para um conjunto fechado, que não impede o valor errado.
- `default` fora de `options`, ou `default` em `ref`.
- `notices` carregado de uma rodada para outra depois que a diferença sumiu, ou aviso inventado sem ter visto a divergência nas fontes; `notices` numa especialização que ficou na `formatVersion` 9 ou menos.
- Campo `codeRef` (onde a instância foi escrita): saiu do formato; remova.
- `symbol` com o nome do nó de saída (`"onClick"`, `"image"`) em vez da função ou classe que o gera.
- Plataforma com `path` em algum tipo e sem `repo` (aviso): preencha `url` e `ref` do repositório que você leu.
- `requiresOwner: true` sem nenhum tipo listando o filho em `allowedChildren` (na 11, nem por id nem por cláusula que o cubra).
- Na `formatVersion` 11: o gatilho no id do tipo (`onClick` e `onHold` como tipos), um campo `trigger` em cada evento ou `allowedChildren` par a par com uma camada inteira listada id a id: use papéis (`childRoles`) e a cláusula `{ layer, groups? }`. Cláusula para a camada do próprio dono, `groups: []` ou grupo que não existe na camada citada; `childRoles` em tipo sem `allowedChildren`; `childRolesLabel` sem `childRoles`; `doc` objeto com `repo` fora de `docRepos` ou `path` com `#`; a 11 declarada numa especialização que não usa nenhuma dessas chaves.
- `code` referindo plataforma não declarada, ou `params` com chave que não é campo do tipo.
- `sources[].values` em campo que não é `enum`, ou destino que não está em `options`.
- `formatVersion` 3 numa especialização sem `sources`, só "para garantir".
- Nome de framework fora de `platforms`/`code`, ou especialização citando outra pelo nome.
- Biblioteca: caminho com `..` ou fora da pasta; arquivo de componente, documento ou exemplo que ninguém cita (vira aviso); template citando chave de campo que o tipo não tem; exemplo com valor fora das `options`; `fonts` declarada sem arquivo nem `LEIA-ME.txt`.
- Atualização de biblioteca que remove ou renomeia um papel de `childRoles` (ou dá papéis a um tipo que não tinha) sem `rename-role`, `remove-role` ou `set-role`; `set-role` escrito depois do `rename-type` do filho, quando a informação dependia do tipo antigo; a 12 declarada numa especialização sem nenhum passo de papel.
- Biblioteca: validar só o arquivo (`validate_specialization`) e achar que o pacote passa; renomear campo ou tipo numa atualização sem `migrations`; tentar aplicar o pacote por `propose_changes`.

## Prompt que invoca esta skill

O prompt só precisa especificar. Modelo:

> /spec-author
>
> Especialização **`<id>`** ("<Nome>") para o Mapping, `formatVersion` <1|2|3|4|5|6|7|8|9|10|11|12>.
>
> **Origem:** <repositório, pasta ou design system>, lendo <o que ler: pasta dos componentes, catálogo exportado, documento>. Ignore <o que ignorar>.
>
> **Plataformas:** <`id` → nome, linguagem, repositório da biblioteca (`url` e `ref`)>, <…>; para cada uma, o que se chama para criar uma instância de um tipo (composable, view, classe, função do BFF). (Omitir na `formatVersion` 1; o repositório só na 5.)
>
> **Origem externa:** `system` = <nome exato>, ids/nomes em <onde pegar>. (Só na `formatVersion` 3.)
>
> **Containers:** <tamanhos prontos (nome, largura × altura, cor de fundo) e de onde saem>. (Só na `formatVersion` 6; omitir sem evidência.)
>
> **Tipos flutuantes:** <tipos que são comentários soltos, fora de qualquer tela, e as tabelas de dados ligadas ao elemento por uma seta>. (Só na `formatVersion` 7; omitir sem evidência.)
>
> **Tipos de seta:** <tipos de anotação que descrevem a relação entre duas marcações (`appliesTo: ["arrow"]`)>. (Só na `formatVersion` 7; omitir sem evidência.)
>
> **Avisos:** <diferenças entre as fontes (contrato × código) a registrar em `notices`, com o `kind` de cada uma>. (Só na `formatVersion` 10; omitir sem evidência.)
>
> **Filhos, papéis e documentos externos:** <donos que aceitam uma camada ou grupos inteiros, os papéis de ligação do filho (`childRoles`) e os repositórios onde vive a documentação dos tipos (`docRepos`)>. (Só na `formatVersion` 11; omitir sem evidência.)
>
> **Migração dos papéis:** <papéis que saíram ou mudaram de `id` nesta atualização e os que um tipo passou a ter, com o destino dos filhos (`clear` ou `unlink`)>. (Só na `formatVersion` 12; omitir sem passo de papel.)
>
> **Fora:** <o que não modelar>.
>
> **Pasta de saída:** <caminho da pasta do pacote>. (Só na `formatVersion` 4, que escreve a biblioteca inteira.)
>
> **Origem dos componentes:** <SVG do Figma (arquivos ou frames), código (pasta e tema) ou documento (qual)>. (Só na `formatVersion` 4.)
>
> **Grave em:** <caminho do arquivo; na `formatVersion` 4, a pasta de saída>. Valide antes de entregar. Não aplique a nenhum projeto.

Numa biblioteca, o prompt também diz se há **versão anterior** (o arquivo, para o contrato de versão). Quando a especialização é uma **atualização** de uma já aplicada, o prompt diz qual (`get_specialization` dá o JSON atual) e o que muda; mantenha o `id`, suba a `version` e preserve ids de tipo e `key` de campo existentes, porque anotações já criadas apontam para eles.
