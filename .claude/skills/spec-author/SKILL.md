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
5. Para uma biblioteca, `examples/libraries/material3/` (a especialização, `components/`, `docs/`, `examples/` e `fonts/LEIA-ME.txt`): copie o estilo, não o conteúdo.

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

### 5. Relações e referências

- `allowedChildren`: ids de tipos de outra camada que podem ser vinculados a este (um dono, N filhos). Todo tipo com `requiresOwner: true` tem de aparecer no `allowedChildren` de algum tipo, senão o validador recusa.
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
6. **Atualização de biblioteca já aplicada:** preserve ids de tipo e `key` de campo, suba a `version`. **Aditivo** (não precisa de `migrations`): tipo novo, campo **opcional** novo, opção nova de `enum`, componente, documento, exemplo ou fonte novos, mudar só o desenho. **Quebra** (exige entrada em `migrations`, com `from`, `to` e `steps`): remover ou renomear tipo, campo ou opção de `enum`, tornar um campo obrigatório, mudar o `type` de um campo. Passe a versão anterior à validação (`previous`).

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

### 11. Versão

- `formatVersion` é a **mínima** para o que a especialização usa: 1 sem plataformas e sem `code`; 2 com qualquer deles; 3 com `sources`; 4 com `component`, `doc`, `examples`, `fonts`, `origins` ou `migrations`; 5 com `repo` em alguma plataforma; 6 com `containers`; 7 com `floating` ou `appliesTo` em algum tipo ou com uma coluna `ref` numa `table`. A versão atual do formato é a 7. O **componente** tem a própria versão: `formatVersion` 1, 2 quando usa `repeat`, ou 3 quando usa `image` (a 1 continua aceita; `repeat` numa 1 é erro). Uma versão maior que o necessário impede a importação em apps antigas sem ganho.
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
- `default` fora de `options`, ou `default` em `ref`.
- Campo `codeRef` (onde a instância foi escrita): saiu do formato; remova.
- `symbol` com o nome do nó de saída (`"onClick"`, `"image"`) em vez da função ou classe que o gera.
- Plataforma com `path` em algum tipo e sem `repo` (aviso): preencha `url` e `ref` do repositório que você leu.
- `requiresOwner: true` sem nenhum tipo listando o filho em `allowedChildren`.
- `code` referindo plataforma não declarada, ou `params` com chave que não é campo do tipo.
- `sources[].values` em campo que não é `enum`, ou destino que não está em `options`.
- `formatVersion` 3 numa especialização sem `sources`, só "para garantir".
- Nome de framework fora de `platforms`/`code`, ou especialização citando outra pelo nome.
- Biblioteca: caminho com `..` ou fora da pasta; arquivo de componente, documento ou exemplo que ninguém cita (vira aviso); template citando chave de campo que o tipo não tem; exemplo com valor fora das `options`; `fonts` declarada sem arquivo nem `LEIA-ME.txt`.
- Biblioteca: validar só o arquivo (`validate_specialization`) e achar que o pacote passa; renomear campo ou tipo numa atualização sem `migrations`; tentar aplicar o pacote por `propose_changes`.

## Prompt que invoca esta skill

O prompt só precisa especificar. Modelo:

> /spec-author
>
> Especialização **`<id>`** ("<Nome>") para o Mapping, `formatVersion` <1|2|3|4|5|6|7>.
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
> **Fora:** <o que não modelar>.
>
> **Pasta de saída:** <caminho da pasta do pacote>. (Só na `formatVersion` 4, que escreve a biblioteca inteira.)
>
> **Origem dos componentes:** <SVG do Figma (arquivos ou frames), código (pasta e tema) ou documento (qual)>. (Só na `formatVersion` 4.)
>
> **Grave em:** <caminho do arquivo; na `formatVersion` 4, a pasta de saída>. Valide antes de entregar. Não aplique a nenhum projeto.

Numa biblioteca, o prompt também diz se há **versão anterior** (o arquivo, para o contrato de versão). Quando a especialização é uma **atualização** de uma já aplicada, o prompt diz qual (`get_specialization` dá o JSON atual) e o que muda; mantenha o `id`, suba a `version` e preserve ids de tipo e `key` de campo existentes, porque anotações já criadas apontam para eles.
