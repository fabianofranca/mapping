# Formato da conversa ancorada (`mapping-thread`, `formatVersion` 1)

Uma **conversa** é uma sequência de mensagens, de pessoas e de agentes, ancorada num item do mapeamento (uma marcação, um campo de anotação, uma camada, um ponto solto do canvas…). Ela fica aberta até **uma pessoa** resolver. Este documento descreve o arquivo da conversa, a gramática das referências e citações e a API do modelo. O formato do projeto está em [`FORMAT.md`](FORMAT.md) e o da proposta, em [`PROPOSAL-FORMAT.md`](PROPOSAL-FORMAT.md).

**O formato é novo** (etapa Comentários; o `mapping.json` continua no schema v15). A app guarda e lê `comments/` (pasta, projeto local e zip) e mostra as conversas nos Detalhes, na janela Comentários e nos pinos do canvas; o servidor MCP (a partir da 0.25.0) lê a caixa de entrada, abre conversas, responde e liga propostas a elas (`list_threads`, `get_thread`, `open_thread`, `post_message`, `wait_for_comment` e o argumento `thread` do `propose_changes`; regras de uso no "Conversas" do guia do agente, `mapping-docs://AGENT-GUIDE.md`).

A validação (zod) e todas as regras ficam em `src/model/` (`thread.ts`, `threadOps.ts`, `threadView.ts`, `threadUsers.ts`, `threadFilters.ts`, `threadPins.ts`, `threadDelete.ts`, `citations.ts` e `refGrammar.ts`), como funções puras usadas pela app e pelo servidor MCP.

## Onde fica

```
meu-projeto/
├── mapping.json
├── images/
├── proposals/
└── comments/
    ├── 5d0e8a41-2c7b-4f1e-9a63-b8c1d4e7f902.json     # conversa aberta
    ├── c3a96f10-8e24-47bd-b5d0-1f7a2e9c6b38.json
    └── resolved/
        └── 91b7e2d5-0a4c-4c68-8f3e-6d2b5a1c9e70.json   # conversa resolvida
```

- **Um arquivo por conversa.** As abertas ficam em `comments/<id>.json`; as resolvidas, em `comments/resolved/<id>.json`. Duas pessoas que abrem conversa no mesmo item geram ids diferentes, e o git mescla sem conflito.
- **Fora do `mapping.json`.** A conversa não entra no desfazer, não vira proposta e não sobe o schema (continua v15).
- O `id` é um UUID e segue a regra do id de proposta: só `[A-Za-z0-9._-]` e não começa com ponto (vira nome de arquivo). O mesmo `id` aparece no nome do arquivo e no campo.
- **O campo `resolved` é a verdade; a pasta é só o índice.** Um arquivo em `comments/` com `resolved` preenchido, ou em `resolved/` com `resolved: null`, vale pelo campo. A app o muda de pasta na próxima gravação dela.
- O `repairProject` (reparo mecânico) e a limpeza da sessão **nunca leem** `comments/`: nada apaga uma conversa sozinho, nem a órfã.
- As conversas ficam na pasta do projeto, versionadas no git junto com o resto, e vão no zip exportado (veja "Zip, projeto local e somente leitura").

## Exemplo

```json
{
  "format": "mapping-thread",
  "formatVersion": 1,
  "id": "5d0e8a41-2c7b-4f1e-9a63-b8c1d4e7f902",
  "anchor": {
    "kind": "field",
    "annotationId": "3f2a9c1e-7b4d-4e0a-9d51-0a1b2c3d4e5f",
    "key": "variant"
  },
  "createdAt": "2026-11-07T09:14:03.000Z",
  "revision": 2,
  "resolved": null,
  "messages": [
    {
      "id": "0b6f31c2-5e8a-4d97-a1c4-72e9d03b8f15",
      "author": { "kind": "agent", "name": "Claude Code", "email": null },
      "at": "2026-11-07T09:14:03.000Z",
      "text": "A especialização não diz qual **variante** usar aqui. Pelo desenho parece `outlined`, mas o botão da [tela de login](mapping://meu-projeto/m/7c41b0e9) é `filled`. Qual vale?",
      "proposal": null
    },
    {
      "id": "e4a98d27-1b63-4f05-8c7a-3d5e0f2a6b91",
      "author": {
        "kind": "human",
        "name": "Marina Alves",
        "email": "marina@exemplo.com"
      },
      "at": "2026-11-07T09:41:20.000Z",
      "text": "É `outlined`. O da tela de login é o principal da página, por isso `filled`.",
      "proposal": null
    },
    {
      "id": "a2c5d718-9f04-4b3e-86d1-0e7b4a93c5f6",
      "author": { "kind": "agent", "name": "Claude Code", "email": null },
      "at": "2026-11-07T10:02:47.000Z",
      "text": "Proposta: [Variantes dos botões](mapping://meu-projeto/p/8c1f2d9e)",
      "proposal": "8c1f2d9e"
    }
  ]
}
```

Nesse exemplo a última mensagem é de agente, então a conversa **aguarda humano**. O assunto, derivado, é "A especialização não diz qual variante usar aqui. Pelo desenho parece outlined, mas o botão da tela…" (cortado em 80 caracteres).

## Campos da raiz

Todos são obrigatórios; o "vazio" é `null`, como na proposta.

| Campo           | Tipo             | Descrição                                                                                                                   |
| --------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `format`        | string           | Sempre `"mapping-thread"`.                                                                                                  |
| `formatVersion` | `1`              | Versão do formato.                                                                                                          |
| `id`            | string           | Id da conversa (nome do arquivo). `[A-Za-z0-9._-]`, sem começar com ponto.                                                  |
| `anchor`        | objeto           | Onde a conversa está ancorada (veja "Âncoras").                                                                             |
| `createdAt`     | string           | Data ISO 8601 (UTC) em que a conversa foi aberta.                                                                           |
| `revision`      | inteiro ≥ 0      | Contador de gravações do arquivo, com a mesma conferência do `mapping.json` e da proposta (veja "`revision` e a gravação"). |
| `resolved`      | objeto ou `null` | `{ "by": { "name", "email" }, "at" }` quando uma pessoa resolveu; `null` na conversa aberta. `name` e `email` não vazios.   |
| `messages`      | array            | As mensagens (abaixo), ao menos uma. A leitura as ordena por `at` e, no empate, por `id`.                                   |

### Mensagem

| Campo      | Tipo             | Descrição                                                                                                                                           |
| ---------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`       | string           | Único na conversa.                                                                                                                                  |
| `author`   | objeto           | `{ "kind": "human" \| "agent", "name", "email" }`. `name` não vazio; `email` é obrigatório na pessoa e `null` no agente.                            |
| `at`       | string           | Data ISO 8601 (UTC).                                                                                                                                |
| `text`     | string           | Markdown, não vazio (nem só espaços) e com até 10.000 caracteres (`String.length`). Pode conter citações (veja "Referências e citações").           |
| `proposal` | string ou `null` | Id de uma proposta ligada à mensagem. Só o servidor MCP o preenche, no `propose_changes` com `thread`; na app a mensagem vira o cartão da proposta. |

- **Só se acrescenta:** ninguém altera nem remove uma mensagem. Para apagar, apaga-se a conversa inteira (veja "Quem grava o quê").
- Campos desconhecidos são descartados na leitura (e, por isso, não voltam na gravação): uma versão nova do formato sobe o `formatVersion`.

## Âncoras

A âncora é **por id**: acompanha o item que se move ou troca de pai. São nove formas:

| `kind`       | Campos                         | Aponta para                                                                                                      | Onde o pino mora (hospedeiro)   |
| ------------ | ------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `marking`    | `id`                           | Uma marcação.                                                                                                    | A própria marcação.             |
| `container`  | `id`                           | Um container.                                                                                                    | O próprio container.            |
| `annotation` | `id`                           | Uma anotação.                                                                                                    | A marcação ou a seta dona dela. |
| `arrow`      | `id`                           | Uma seta.                                                                                                        | A própria seta.                 |
| `layer`      | `id`                           | Uma camada.                                                                                                      | Nenhum (a camada não tem pino). |
| `field`      | `annotationId`, `key`          | Um campo tipado da anotação (a `key` do campo).                                                                  | A dona da anotação.             |
| `entry`      | `annotationId`, `entryId`      | Um par da anotação livre.                                                                                        | A dona da anotação.             |
| `row`        | `annotationId`, `key`, `rowId` | Uma linha de uma `table` (o `_id` da linha) no campo `key`.                                                      | A dona da anotação.             |
| `point`      | `containerId`, `x`, `y`        | Um ponto solto. `containerId` não nulo: pixels do container, e o ponto anda com ele; `null`: unidades do canvas. | O próprio ponto.                |

- O container de um ponto é decidido **uma vez**, quando a conversa é criada: o container mais alto sob o cursor, ou o canvas. O ponto não é marcação e não passa pelo `settleHierarchy`. `x` e `y` são números quaisquer (podem ser negativos e fracionários, no canvas).
- **Um pino por item que hospeda a âncora, não por proximidade:** a conversa num campo aparece no pino da marcação dona, sem um segundo pino em cima do primeiro.

### Órfã

É a conversa cuja âncora **não existe mais no projeto**: o item apagado, ou o container do ponto apagado. A resolução diz o que sumiu (`marking`, `container`, `arrow`, `layer`, `annotation`, `entry` ou `row`):

- `field`: basta a anotação existir; `entry` e `row` também precisam existir (o par entre os pares da anotação, a linha entre as linhas da tabela);
- `point` só fica órfão com `containerId` não nulo e o container apagado;
- uma `annotation` ou um `field` cuja dona não existe mais não tem pino, mas também não é órfã.

A conversa órfã continua listada, sem pino ("<tipo> apagado(a) · órfã"). **Nada a apaga sozinho.**

## Estados e o que é derivado

O arquivo guarda só os fatos (mensagens e `resolved`). Tudo o que segue é **calculado** pelo modelo e **nunca é gravado**:

| Derivado       | Regra                                                                                                                                                                                                                                                                            |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Aguardando** | Só na conversa aberta. A última mensagem (na ordem `at`, `id`) de **pessoa** dá **Aguardando agente**; a de **agente** dá **Aguardando humano**. Ninguém é marcado. A resolvida não aguarda ninguém.                                                                             |
| **Assunto**    | A primeira linha com texto da primeira mensagem, sem a marcação do markdown (título, lista, citação, ênfase, código), com o rótulo das citações como texto e cortada em 80 caracteres (a reticência `…` conta).                                                                  |
| **Não lida**   | **Por dispositivo.** A conversa é não lida quando tem mensagem de **outra pessoa** (outro e-mail) ou de **agente** estritamente depois do `lastReadAt` daquela conversa. A própria mensagem nunca conta. O `lastReadAt` fica no `localStorage` do dispositivo, nunca no arquivo. |
| **Órfã**       | A âncora não existe no projeto (acima).                                                                                                                                                                                                                                          |
| **Pino**       | Grupos por item hospedeiro, com a cor da conversa mais urgente: aguardando humano, depois aguardando agente, depois resolvida. A resolvida só tem pino enquanto está selecionada. Camada e órfã não têm pino. Mostrar ou esconder os pinos é estado da interface.                |
| **Citada em**  | Backlinks: para cada conversa citada por outra (`c/<código>`), as conversas que a citam. Considera as abertas e as resolvidas.                                                                                                                                                   |

Consequência aceita do "aguardando": uma conversa só entre pessoas fica "Aguardando agente" enquanto a última mensagem for de pessoa. O guia do agente manda responder só ao que lhe é pedido.

## Quem grava o quê

- **A app** grava como `human`, com a identidade das Configurações (nome e e-mail, por dispositivo, nunca no projeto): abre a conversa, acrescenta mensagens, **resolve** (grava `resolved` e muda o arquivo para `comments/resolved/`), **reabre** (limpa o campo e devolve o arquivo) e **apaga** (conversa a conversa ou em lote, com o aviso de quem são as mensagens que vão embora). Sem identidade, a pessoa só lê.
- **O servidor MCP** (a partir da 0.25.0) grava só como `agent`, com `email: null`, e só em `comments/<id>.json`:
  - **Conversa nova** (`open_thread`): arquivo novo por **arquivo temporário + hard link**, que nunca sobrescreve um existente (num disco sem hard link, grava direto, ainda sem sobrescrever). O `id` e o da primeira mensagem são UUIDs gerados pelo servidor.
  - **Mensagem acrescentada** (`post_message`, e o `propose_changes` com `thread`, que acrescenta uma mensagem com `proposal`): **relê o arquivo imediatamente antes de gravar**, refaz a operação sobre a versão do disco se a app a mudou no meio e grava o arquivo inteiro de forma **atômica** (temporário + renomear) com `revision + 1`; depois de 3 tentativas sem estabilidade, recusa com `revision-conflict`. O `post_message` exige o `after` (o id da última mensagem lida): se entrou mensagem depois, não grava (`stale-thread`). O horário da mensagem nunca fica antes da última da conversa.
  - **Nunca** resolve, reabre nem apaga uma conversa (não há tool para isso), **nunca** grava em `comments/resolved/` (uma mensagem do MCP numa conversa resolvida é recusada com `thread-resolved`) e **nunca** altera o `mapping.json`. Um arquivo ilegível não é sobrescrito (`invalid-thread`).
  - O nome do autor é o argumento `author` da tool, senão o `clientInfo.name` do cliente MCP, senão "agente". O servidor nunca assina como pessoa: não existe `kind: "human"` vindo do MCP.
- **O `kind` nunca vem do chamador:** a app só escreve `human` e o MCP só `agent`. No modelo, o autor entra como argumento das funções; o modelo não decide quem é humano.
- **Ninguém altera nem remove uma mensagem.**
- **Nenhum outro código escreve em `comments/`.** Uma alteração externa (o MCP, um editor de texto, o git) vira recarga na app.

## `revision` e a gravação

Toda gravação, da app ou do MCP, **relê o arquivo** antes de gravar:

1. Se o texto mudou desde a última leitura ou gravação, adota a versão do disco.
2. **Refaz a operação sobre ela** (acrescentar, resolver e reabrir são funções puras) e grava `revision + 1`.
3. Um arquivo que ficou ilegível **não é sobrescrito**.

Convenção do modelo: toda operação que **muda** a conversa devolve `revision + 1`; a que não muda (resolver uma conversa já resolvida, reabrir uma aberta) devolve a mesma conversa, intacta, sem tocar na `revision`. Assim, refazer a operação sobre uma versão do disco que outra pessoa já resolveu não muda nada.

## A mesma conversa em duas pastas

Uma mesclagem do git, ou uma mudança de pasta que falhou no meio (resolver ou reabrir), pode deixar o mesmo `id` em `comments/` e em `comments/resolved/`. A leitura **junta as duas cópias** (`mergeThreadCopies`):

- **Uma cópia só:** vale ela, e o campo `resolved` diz o lugar.
- **Duas cópias:**
  - as mensagens são a **união por `id`** (um id repetido é a mesma mensagem; vale a da cópia aberta);
  - a `revision` é a **maior** das duas (sem somar: quem grava o resultado é que soma);
  - se as duas cópias têm **as mesmas mensagens** e `revision` diferente, a cópia de **maior `revision`** decide: aberta (a reabertura interrompida, aberta na `revision` 6 e resolvida na 5, não se perde) ou resolvida (com o `resolved` dela);
  - nos demais casos (mensagens diferentes, ou a mesma `revision`), a conversa fica **resolvida só se** o `resolved.at` da cópia resolvida é **posterior à última mensagem** da união; senão fica aberta, com `resolved: null` (alguém escreveu depois de resolverem, o que equivale a reabrir);
  - a âncora e o `createdAt` vêm da cópia de maior `revision` (a aberta, no empate).
- A próxima gravação da app grava no lugar certo (a pasta que o campo `resolved` indica) e apaga a outra cópia. O MCP lê do mesmo jeito.
- Cópias de ids diferentes, ou nenhuma cópia, são `invalid-thread`.

## O limite do git: duas máquinas na mesma conversa

Duas pessoas que acrescentam mensagens à **mesma** conversa em máquinas diferentes têm **conflito textual** no git, porque as duas escrevem no fim da lista `messages` (e mudam a linha `revision`). O conflito é só textual: nenhum dado se perde, e a ordenação por `at` e `id` da leitura aceita o resultado. Para resolver:

1. `git status` mostra `comments/<id>.json` como "both modified". Abra o arquivo: as marcas `<<<<<<<`, `=======` e `>>>>>>>` cercam o fim de `messages` (e, às vezes, a linha `revision`).
2. **Fique com as duas mensagens.** Apague só as três linhas de marca e deixe os dois blocos de mensagem, um depois do outro. A ordem entre eles não importa (a leitura ordena por `at` e `id`, e a próxima gravação da app regrava na ordem canônica).
3. Confira a **vírgula** entre os dois blocos (o último objeto de cada lado não tem vírgula e, juntos, precisam de uma) e que o array continua fechando com `]`. Nenhuma marca do git pode sobrar: o arquivo precisa ser JSON válido.
4. Na linha `revision`, fique com o **maior** dos dois números. Qualquer inteiro ≥ 0 é válido; a app apenas adota o que está no disco e soma 1 na gravação seguinte.
5. Se os dois lados acrescentaram a **mesma** mensagem (mesmo `id`), fique com uma só: o `id` é único na conversa.
6. Se um lado **resolveu** e o outro acrescentou mensagem, fique com as duas coisas (as duas mensagens e o `resolved` de um dos lados): a regra da junção das cópias decide sozinha (a conversa só fica resolvida se a resolução é posterior à última mensagem).
7. `git add comments/<id>.json` e conclua a mesclagem. Um conflito "modificado aqui, apagado lá" (uma pessoa apagou a conversa, a outra escreveu nela) é decisão sua: apagar é irreversível; na dúvida, fique com o arquivo.

Se o arquivo continuar inválido, a app e o MCP o tratam como ilegível: não o sobrescrevem e mostram o erro com o caminho exato.

## Zip, projeto local e somente leitura

- **Zip exportado:** leva `comments/` e `comments/resolved/`. Na importação entram **só esses dois caminhos**, com id válido (o nome do arquivo, sem a extensão, segue a regra do `id`; nada de `..`). O texto de um arquivo inválido volta idêntico ao exportar de novo, como o da proposta: nada é perdido por não ser entendido.
- **Projeto local** (IndexedDB): as chaves são as mesmas caminhos. Gravar marca o projeto como "não exportado". No projeto local a conversa funciona entre pessoas, sem agente, e não é observada (não há `stat` para comparar).
- **Somente leitura:** num projeto aberto só para leitura (`readOnly`), as conversas também ficam só para leitura. A pessoa lê, mas não grava, resolve nem apaga. Durante a revisão de uma proposta, as conversas também ficam só para leitura (a revisão mostra o projeto proposto, e uma âncora que só existe na prévia ficaria órfã).

## Regras de validade

`parseThread` / `parseThreadText` validam o arquivo e devolvem os erros com o caminho exato (`errors`, no formato `caminho: mensagem`, e `issues`, com `path` e `message` à parte); a leitura devolve também `warnings` (vazio na `formatVersion` 1). Os erros reais:

| Situação                                                        | Erro                                                                                                             |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Não é JSON                                                      | `JSON inválido: Expected property name or '}' in JSON at position 1 (line 1 column 2)`                           |
| `format` ou `formatVersion` errado                              | `format: deve ser "mapping-thread"`, `formatVersion: deve ser 1`                                                 |
| Id da conversa inválido                                         | `id: id inválido; use [A-Za-z0-9._-], sem começar com ponto`                                                     |
| Data que não é ISO 8601                                         | `createdAt: data inválida; use ISO 8601 (UTC)` (também em `messages[i].at` e `resolved.at`)                      |
| Conversa sem mensagem                                           | `messages: deve ter ao menos uma mensagem`                                                                       |
| Id de mensagem repetido                                         | `messages[2].id: id "a" repetido`                                                                                |
| Pessoa sem e-mail                                               | `messages[2].author.email: obrigatório na pessoa`                                                                |
| Agente com e-mail                                               | `messages[2].author.email: deve ser null no agente`                                                              |
| `kind` do autor inválido                                        | `messages[2].author.kind: deve ser "human" ou "agent"`                                                           |
| Nome vazio                                                      | `messages[2].author.name: não pode ser vazio` (e `resolved.by.name`)                                             |
| Texto vazio, só com espaços                                     | `messages[2].text: não pode ser vazio`                                                                           |
| Texto com mais de 10.000 caracteres                             | `messages[2].text: no máximo 10000 caracteres`                                                                   |
| `kind` da âncora inválido                                       | `anchor.kind: deve ser "marking", "container", "annotation", "arrow", "layer", "field", "entry", "row", "point"` |
| Campo da âncora que falta                                       | `anchor.key: Invalid input: expected string, received undefined`                                                 |
| Campo obrigatório que falta (inclusive `resolved` e `proposal`) | `resolved: Invalid input: expected object, received undefined`                                                   |
| `resolved` inválido                                             | `resolved.by.name: não pode ser vazio`, `resolved.at: data inválida; use ISO 8601 (UTC)`                         |

Em resumo:

- raiz com todos os campos; `format` e `formatVersion` exatos; `id` pela regra do id de proposta; datas ISO 8601 (aceitam fuso, e a leitura as normaliza para UTC com `Z`); `revision` inteiro ≥ 0;
- `messages` com ao menos uma mensagem, ids únicos, `text` não vazio e até `THREAD_MESSAGE_MAX` (10.000) caracteres, `proposal` string ou `null`;
- autor `human` com `email` preenchido e `agent` com `email: null`;
- âncora de uma das nove formas, com `id`, `annotationId`, `key`, `entryId` e `rowId` não vazios, e `containerId` string ou `null`, `x` e `y` números;
- `resolved` `null` ou `{ by: { name, email }, at }`, com `name` e `email` não vazios.

Fora do arquivo (regras de quem chama, não do formato): uma mensagem do MCP numa conversa resolvida (`thread-resolved`) e a guarda `after` do `post_message`. As operações do modelo lançam `ThreadError` com `thread-message-duplicate` (acrescentar um `id` que já existe) ou `invalid-thread` (dado inválido, cópias que não casam).

A gravação (`serializeThread`) é canônica: chaves sempre na mesma ordem, mensagens na ordem `at`/`id`, indentação de 2 espaços e quebra de linha no final. Assim, uma mensagem acrescentada é um bloco novo no fim do array e o diff do git fica pequeno.

## Referências e citações

### Gramática da referência

A referência `mapping://` é a mesma para a app e para o MCP (`refGrammar.ts`, sobre `itemRef.ts`). As letras e os segmentos vêm **depois do código**, nunca como sufixo:

```
mapping://<projeto>/<m|i|a|p|l|c>/<código>              item, proposta, camada (l) ou conversa (c)
mapping://<projeto>/a/<código>/f/<campo>                campo tipado (a key, codificada)
mapping://<projeto>/a/<código>/e/<código>               par da anotação livre
mapping://<projeto>/a/<código>/f/<campo>/r/<código>     linha de table
```

| Forma                                                    | Exemplo                                                                |
| -------------------------------------------------------- | ---------------------------------------------------------------------- |
| Marcação ou seta (`m`; os ids dos dois dividem o espaço) | `mapping://meu-projeto/m/7c41b0e9`                                     |
| Container (`i`)                                          | `mapping://meu-projeto/i/9b1c4d2e`                                     |
| Anotação (`a`)                                           | `mapping://meu-projeto/a/3f2a9c1e`                                     |
| Proposta (`p`)                                           | `mapping://meu-projeto/p/8c1f2d9e`                                     |
| Camada (`l`)                                             | `mapping://meu-projeto/l/d41e7a05`                                     |
| Conversa (`c`)                                           | `mapping://meu-projeto/c/5d0e8a41`                                     |
| Campo tipado                                             | `mapping://meu-projeto/a/3f2a9c1e/f/variant`                           |
| Campo cuja key tem caracteres especiais (codificada)     | `mapping://meu-projeto/a/3f2a9c1e/f/cor%20de%20fundo`                  |
| Par da anotação livre                                    | `mapping://meu-projeto/a/3f2a9c1e/e/b07c15d3`                          |
| Linha de `table`                                         | `mapping://meu-projeto/a/3f2a9c1e/f/passos/r/2e90a6f4`                 |
| Forma curta (sem o projeto)                              | `c/5d0e8a41`, `a/3f2a9c1e/f/variant`, `a/3f2a9c1e/f/passos/r/2e90a6f4` |

- **Códigos curtos.** O código é o início do id normalizado (sem hífens, em minúsculas): 8 caracteres, crescendo de 4 em 4 se houver colisão. O código de `m` é único entre marcações e setas; o de `i`, entre containers; o de `a`, entre anotações; o de `l`, entre camadas; o de `p`, entre as propostas do projeto; o de `c`, entre as conversas do projeto (abertas e resolvidas); o do par (`e`), entre os pares da anotação; o da linha (`r`), entre as linhas da tabela. Na resolução, o id cujo normalizado é exatamente o código vence; senão, vale o único id que começa com ele (mais de um é ambíguo).
- **`<projeto>`** é o nome da pasta, codificado com o conjunto _unreserved_ da RFC 3986 (`A-Z a-z 0-9 - . _ ~`; o resto vira `%XX` em UTF-8, `( ) ! ' *` também).
- **`<campo>`** é a `key` do campo, codificada do mesmo jeito (a leitura a decodifica; `%` inválido dá `null`).
- **Leitura estrita** (`parseAnyRef`): qualquer coisa depois do código, `?`, `#`, espaço no meio, segmento vazio, letra desconhecida ou `e`/`f`/`r` fora do lugar dão `null` (o MCP o chama de `invalid-ref`). Só se aceita a URL completa, ou a curta começando pela letra (`c/…`, `a/…`); o código solto é do `parseRef` antigo (`m`, `i`, `a`).
- **Os links dos documentos da biblioteca** (`mapping://<typeId>` e `mapping://<specId>/<typeId>`) têm no máximo dois segmentos depois do esquema, e a gramática exige a letra seguida do código: nunca se confundem com uma referência, e `extractCitations` os ignora.
- As referências de antes (`m`, `i`, `a`, `p`) continuam valendo, sem mudança. O servidor MCP aceita as formas novas (`l`, `c`, `/f/`, `/e/`, `/r/`) a partir da 0.25.0: `resolve` as entende todas, e `get_annotation` e as outras tools de item aceitam campo, par e linha como a anotação que os contém (numa tool de marcação ou de container, uma parte é `wrong-kind`; um sufixo que a gramática não conhece, `invalid-ref`).

### A citação é um link markdown

Não há sintaxe nova: a citação é o link `[<nome atual>](<referência>)` no texto da mensagem, e o texto continua legível em qualquer leitor de markdown (no git, no editor).

- A app grava o rótulo com `[`, `]` e `\` escapados (`formatCitation`, `escapeCitationLabel`): `[a\[0\] da lista](mapping://meu-projeto/a/3f2a9c1e/f/lista)`. Um rótulo vazio não é link em markdown: quem não tem nome usa um texto neutro.
- **Dentro de uma conversa, a citação vale no projeto da conversa.** O `<projeto>` da URL só informa quem lê o arquivo cru: a app e o MCP resolvem o código no projeto da conversa, e uma pasta renomeada não quebra nada. Num projeto local, a app escreve o nome do projeto nesse segmento.
- `extractCitations` lê o texto com o mesmo leitor de markdown que desenha a mensagem (com `lineBreaks`), então vale o que a tela mostra como link; link dentro de bloco de código não conta. Um link `mapping://` que não fecha a gramática volta com `ref: null` (citação **quebrada**); links comuns (`https://`, `#âncora`) e os da biblioteca não são citações.

### O chip vivo

O chip mostra o nome **de agora** do alvo, resolvido pela referência (`liveLabel`):

| Alvo                                | Rótulo do chip                                                  |
| ----------------------------------- | --------------------------------------------------------------- |
| Marcação, container, seta, anotação | O nome (a anotação, o nome da instância ou do tipo).            |
| Campo                               | O `label` do campo (a `key`, se não há tipo).                   |
| Par                                 | A `key` do par.                                                 |
| Linha                               | O valor da coluna do `rowLabel` (a posição `#n` se não houver). |
| Camada                              | O nome.                                                         |
| Conversa                            | O assunto.                                                      |
| Proposta                            | O título.                                                       |

- O rótulo entre colchetes do link é a **reserva**. Com o alvo apagado (ou o código que não resolve), o chip fica riscado com esse rótulo e a dica diz que o alvo não existe mais. O motivo é `missing` (o código não existe, ou o campo, par ou linha não existe na anotação), `ambiguous` (o código curto serve a mais de um alvo) ou `invalid` (o link nem fecha a gramática).
- Alvo que existe mas não tem nome (marcação sem nome, por exemplo) volta com `label: null`; a interface mostra o texto traduzido.
- O clique leva ao alvo: seleciona o item e foca o campo, abre a conversa, ou mostra a proposta na janela Propostas.
- **Citada em:** uma conversa citada por outra (`c/<código>`) lista as conversas que a citam; é derivado das conversas carregadas, e ninguém o escreve à mão (`backlinks`).

## API em `src/model/`

- Formato (`thread.ts`): `THREAD_FORMAT`, `THREAD_FORMAT_VERSION`, `COMMENTS_DIR`, `RESOLVED_DIR`, `THREAD_MESSAGE_MAX`, `THREAD_ID_RE`, `THREAD_ANCHOR_KINDS`, `threadFilePath`, `compareThreadMessages`, `sortThreadMessages`, `parseThread`, `parseThreadText`, `serializeThread`, e os schemas `threadSchema`, `threadMessageSchema`, `threadAuthorSchema`, `threadAnchorSchema`, `threadResolvedSchema`, `threadResolverSchema`; tipos `Thread`, `ThreadMessage`, `ThreadAuthor`, `ThreadAuthorKind`, `ThreadAnchor`, `ThreadAnchorKind`, `ThreadResolved`, `ThreadResolver`, `ThreadParseResult`.
- Operações puras (`threadOps.ts`): `openThread`, `appendMessage`, `resolveThread`, `reopenThread`, `mergeThreadCopies` (a junção das duas cópias), `threadLocation` (`open` ou `resolved`, a pasta onde o arquivo deve ficar), a classe `ThreadError` (`thread-message-duplicate`, `invalid-thread`); tipos `OpenThreadArgs`, `MergedThread`, `ThreadLocation`, `ThreadErrorCode`.
- Vista (`threadView.ts`): `resolveAnchor`, `isOrphan`, `hostOf`, `hostKey` (âncora, órfã e hospedeiro do pino), `lastMessage`, `awaiting`, `threadSubject` (com `SUBJECT_MAX` e um `resolveLabel` opcional para o rótulo vivo das citações), `isUnread`; tipos `ThreadHost`, `ThreadMissingKind`, `AnchorResolution`, `ThreadAwaiting`, `SubjectLabelResolver`, `ThreadViewer`.
- Usuários (`threadUsers.ts`): `normalizeEmail`, `userKey` (`human:<e-mail>` ou `agent:<nome>`), `userLabel`, `initials` (primeira e última palavra; o agente é `AG`), `threadUsers` (o filtro Usuário, com a contagem de conversas de cada um); tipo `ThreadUser`.
- Filtros (`threadFilters.ts`): `filterThreads` (status, usuário, texto sem diferença de caixa nem de acento e "só as que citam a seleção", em conjunto); tipos `ThreadFilter`, `ThreadStatusFilter`, `ThreadSelectionFilter`.
- Pinos (`threadPins.ts`): `pinGroups` (um grupo por item hospedeiro, com cor, iniciais, número de mensagens, rótulo e "não lida"); tipos `PinGroup`, `PinColor`, `PinGroupOptions`.
- Apagar (`threadDelete.ts`): `deleteImpact` (as mensagens e os autores que vão embora, e se dá para apagar direto), `bulkDeleteCandidates` ("Só as resolvidas" e "última mensagem antes de"); tipos `DeleteImpact`, `DeleteAuthorCount`, `MessageSummary`, `BulkDeleteCriteria`, `BulkDeleteCandidates`.
- Gramática (`refGrammar.ts`): `parseAnyRef`, `formatAnyRef`, `formatSubRef`, `ANY_REF_KINDS`, `layerShortCodes`, `layerShortCode`, `matchLayerCode`, `threadShortCodes`; tipos `AnyRef`, `AnyRefKind`, `ItemAnyRef`, `FieldAnyRef`, `EntryAnyRef`, `RowAnyRef`, `SubRef`, `ParsedAnyRef`. `parseRef` e `formatRef` (`itemRef.ts`) seguem como estavam.
- Citações (`citations.ts`): `extractCitations`, `escapeCitationLabel`, `formatCitation`, `resolveCitation`, `citationTargetKey`, `liveLabel`, `liveCitation`, `citedTargets`, `backlinks`; tipos `Citation`, `CitationTarget`, `CitationTargetKind`, `CitationResolution`, `CitationContext`, `CitationProposal`, `LiveLabel`, `LiveCitation`.
- Markdown (`markdown.ts`): `parseMarkdown(texto, { lineBreaks: true })` quebra a linha dentro do parágrafo, para as mensagens; o Catálogo continua como está.

## Na app e no MCP

A app usa o modelo para o armazenamento (pasta, projeto local e zip), a sessão com a conferência de `revision`, a identidade e o "não lida". O servidor MCP o usa nas tools `list_threads`, `get_thread`, `open_thread`, `post_message`, `wait_for_comment`, no `propose_changes` com `thread` e no `resolve` com a gramática nova, e serve este documento como o recurso `mapping-docs://COMMENT-FORMAT.md`. O guia do agente (`mapping-docs://AGENT-GUIDE.md`, seção "Conversas") traz as regras de uso: quando abrir uma conversa, o `after`, e o que o agente nunca faz.
