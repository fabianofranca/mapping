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
2. `docs/spec.schema.json`: a estrutura. Ele valida só a forma; as regras entre elementos (ids únicos, `allowedChildren` em outra camada (na 13, também na do próprio dono), `default` compatível, destinos de `values` em `options`) vivem no validador da app, e é ele que decide.
3. `examples/specs/sdui.json` (`formatVersion` 12: plataformas com `repo` e `code`, cláusulas, papéis, `docRepos`, `migrations`) e `examples/specs/modelo-de-dados.json` (`formatVersion` 1, com `table`, `tags` e `rowLabel`): copie o estilo, não o conteúdo.
4. Em `docs/AGENT-GUIDE.md`, a seção "Criando especializações: gerar, validar, corrigir" e, se a especialização tiver `sources`, o item "Especializações com `sources`" de "Reexportações". Para uma biblioteca (`formatVersion` 4), leia também "Escrevendo uma biblioteca", a seção "Biblioteca: o pacote" e o "Contrato de versão" do `docs/SPEC-FORMAT.md` e **inteiro** o `docs/COMPONENT-FORMAT.md` (template, tamanhos, expressões).
5. Para uma biblioteca, `libraries/material3-compose/` (a especialização, `components/`, `docs/`, `fonts/` e `icons/`; os exemplos nomeados são `values` no próprio tipo; para `origins`, `sources` e exemplos de sistema externo, veja `examples/libraries/sdui-backend/`): copie o estilo, não o conteúdo.

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
- `table`: colunas `string`, `number`, `date`, `enum` e, a partir da 7, `ref` (com `accepts`); `table` dentro de `table` não existe. Com `tags`, cada linha vira alvo de referência e `rowLabel` (uma coluna `string`) é obrigatório.
- `options` de `enum`: strings únicas, nos valores do domínio (os valores do código vão em `code.values`; os da origem externa, em `sources[].values`).
- **Movimento × aparência de estado.** O desenho é um quadro parado: sem animação, ripple animado nem troca de estado pelo mouse. A **aparência** de um estado de interação (hover, foco, pressionado, arrastado) é desenhável e, quando a origem a define (tokens de estado do design system), entra como um campo `enum` opcional do tipo, fora do `code`, como o desabilitado e o selecionado. Ao listar o que fica fora num plano ou na Fidelidade, separe movimento (fora) de aparência de estado (campo).
- **`suggestions` versus `enum`** (`formatVersion` 8): `enum` é um conjunto **fechado** (a pessoa só escolhe uma das `options`; booleanos, estados, estilos). `suggestions`, só em campo ou coluna `string`, é um vocabulário **aberto**: a lista aparece ao digitar, mas qualquer texto continua valendo (o tipo de uma propriedade de código, `String`, `Int`, mas também `String?` e `List<Endereco>`). Use `suggestions` quando o valor tem palavras recorrentes mas não se esgota nelas; `enum` quando valor fora da lista é erro do domínio. Regras: lista não vazia, até 200 itens, textos únicos, não vazios e sem espaço nas pontas; em outro tipo de campo é erro; numa versão anterior à 8 é erro (`só é permitido com formatVersion 8`). O `default` pode ficar fora da lista. Incluir, mudar ou tirar `suggestions` não é quebra e não pede migração.
- **`linkedRef`** (`formatVersion` 8): num campo ou coluna `string` de texto livre que **às vezes nomeia algo já mapeado** (o tipo de uma propriedade, que pode ser outra declaração do mapeamento), declare um campo `ref` ao lado (na `table`, uma coluna `ref`) e ponha `linkedRef` com a `key` dele. Os alvos mapeados entram na lista e, ao escolher um, o texto e o `ref` são preenchidos juntos. Não restringe o valor: o texto livre continua valendo, e o `ref` fica vazio quando o texto não nomeia nada mapeado. Combina com `suggestions` (alvos primeiro, depois a lista fixa). Diferente de `enum` (conjunto fechado) e de `suggestions` (palavras fixas, sem ligação com o mapeamento). Erro se a `key` não existir, não for `ref` ou o campo não for `string`; incluir, mudar ou tirar não é quebra.

### 5. Relações e referências

- `allowedChildren`: ids de tipos de outra camada (na `formatVersion` 13, também da **mesma** camada do dono) que podem ser vinculados a este (um dono, N filhos). Todo tipo com `requiresOwner: true` tem de aparecer no `allowedChildren` de algum **outro** tipo, senão o validador recusa (`exige dono, mas nenhum tipo o lista em allowedChildren`; se só ele mesmo o lista, `exige dono, mas nenhum outro tipo o aceita como filho`). Biblioteca que passava com isso antes pode ser recusada agora. Na `formatVersion` 11 o item também pode ser uma **cláusula** que cobre uma camada ou grupos dela, e o dono pode declarar **papéis** para os filhos (ver o passo 12).
- `ref` é referência **forte** a uma tupla de outra anotação, por **etiqueta**: o campo alvo declara `tags`, e o campo `ref` declara `accepts: { tags: [...], free: true|false }`, com ao menos uma etiqueta, `free: true` ou `annotations`. Etiquetas em `[a-z0-9-]+`.
- **Campo que recebe componentes (ou qualquer anotação inteira)** vira uma `table` com uma coluna `ref` e `accepts.annotations` (`formatVersion` 14): lista de ids de tipo ou cláusulas `{ layer, groups? }` **da mesma especialização**, com a sintaxe do `allowedChildren`. Ex.: `{ "key": "item", "type": "ref", "required": true, "accepts": { "annotations": [{ "layer": "componentes" }] } }`. Diga a regra na `description` do campo (quais componentes entram e por quê). Não use campo `string`/`json` para carregar essa estrutura, nem crie uma etiqueta só para virar alvo quando `annotations` serve.
- Uma especialização **nunca cita outra pelo nome**: a ligação entre elas é só por etiquetas. Reutilize `data-field` para atributo de um modelo de dados (classe, entidade, DTO); invente etiqueta nova só quando nenhuma existente serve, e registre-a na entrega.

### 6. Plataformas e `code` (`formatVersion` 2; `repo` na 5)

O `code` de um tipo diz como se cria uma instância dele em cada plataforma: `symbol` é o que se chama, `path` é o arquivo que o define, `params` e `values` dizem como passar os campos, `notes` orienta. O agente lê o arquivo para saber a assinatura e escreve a chamada na solução. O mapeamento não guarda nada sobre a solução: não é o código gerado para uma anotação.

- `platforms` na raiz: `{ id, name, language?, repo? }`. Uma plataforma é um alvo de código em que o agente escreve a solução (o app Android, o app iOS, o BFF que gera o JSON de uma tela). `id` em `[a-z0-9-]+` e único. Plataformas com o mesmo `id` em especializações diferentes são a mesma plataforma; alinhe com as já usadas no projeto (`get_project` mostra).
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

1. **Pacote:** a pasta `<id>/` leva a especialização na raiz e tudo o que ela cita, por caminho relativo ao arquivo dela, `/` como separador, **sem `..`**: `components/<tipo>.json`, `docs/<tipo>.md`, `examples/*.json`, `fonts/*`. Nada fora da pasta: um `..` que sai dela é recusado (`caminho fora da biblioteca: <ref>`, no caminho de quem cita). Na raiz de uma origem, `margin` sem `anchor` é erro (`margin só vale com anchor`).
2. **Um componente por tipo** (`component` no tipo, arquivo `mapping-component` em `components/`): desenho (template), `size` inicial, `minSize` e `preview` com valores de exemplo. O desenho é um quadro parado (sem animação nem ripple animado), mas a aparência de um estado de interação (hover, foco, pressionado, arrastado) é desenhável: se a origem define os tokens de estado, é um campo `enum` opcional do tipo, fora do `code` (regra em "4. Campos"); ao listar o que fica fora, separe movimento (fora) de aparência de estado (campo). Siga o `docs/COMPONENT-FORMAT.md`; as chaves de campo que o template cita (`$field`, `$has`, `$eq`, `$switch`) precisam existir no tipo. Cores, espaçamentos e tipografia saem da origem (SVG do Figma: camadas, `fill`, raios e fontes que você viu; código: tokens do tema; documento: a tabela do design system), nunca de memória. Tipo sem desenho (evento, entidade) fica sem `component`.
3. **Um documento por componente** (`doc`, `docs/<tipo>.md`): quando usar, variantes, o que não confundir; markdown simples (títulos, parágrafos, listas, tabelas, código). É o que o agente lê em `get_component`.
4. **Exemplos nomeados** (`examples` no tipo): `values` (chaves de campos do próprio tipo, valores válidos; num campo `table`, a lista de linhas, como no `preview` do componente: objetos coluna → valor, sem `_id`, coluna `ref` só `null`) com `name` único; para uma origem de sistema externo (`origins`), `system` + `file` (o JSON de **um nó** em `examples/`) e, na origem, telas inteiras em `examples[]`.
5. **Fontes:** `fonts` na raiz (`family`, `file`, `weight`, `style`). Os arquivos têm licença e peso: se não puder incluí-los, deixe `fonts/LEIA-ME.txt` dizendo quais arquivos faltam e de onde obtê-los (fonte ausente é **aviso**, não erro).
6. **Tokens de design (`formatVersion` 15 na especialização; `{ "$token": … }` no componente de formato 4).** Quando a origem tem um design system (tokens do tema, variáveis do Figma, tabela de cores), declare-o em `tokens` na raiz **em vez de repetir literais** em cada nó. O padrão é `light`/`dark`:

   ```json
   "tokens": {
     "modes": ["light", "dark"],
     "values": {
       "primary": { "light": "#6750A4", "dark": "#D0BCFF" },
       "on-primary": { "light": "#FFFFFF", "dark": "#381E72" },
       "radius-md": 12,
       "space-4": 16
     }
   }
   ```

   - `modes` é lista não vazia de nomes distintos `[a-z0-9][a-z0-9-]*`; o nome do token segue o mesmo padrão. **Cor vai por modo** (objeto com todos os modos e só eles, todos do mesmo tipo); **raio, espaçamento e tamanho** que não mudam com o tema são valores **simples** (valem em todos os modos). Um valor é texto (cor `#rrggbb`/`rgba()` ou família de fonte) ou número.
   - No componente, `{ "$token": "primary" }` vale onde se espera cor (`fill`, `color`, `stroke.color`, `shadow.color`, stops do gradiente, `run.color`/`background`), número (`gap`, `padding`, `font.size`, `cornerRadius`, `width`, `opacity`…) ou família (`font.family`), inclusive como resultado de `$switch` e `$if`. Não vale em enum, booleano nem texto.
   - **Embutidos:** `font-sans` e `font-mono` existem em toda biblioteca (a fonte do tema do hospedeiro) e `{ "$token": "font-mono" }` serve em `font.family`. O texto sem `font.family` usa `font-sans`, **não mais a `Inter`**: não escreva `Inter` por padrão e não conte com a largura dela. Redefinir `font-sans`/`font-mono` em `tokens.values` vence o hospedeiro.
   - Nesta versão o desenho usa sempre o **primeiro** modo de `modes` (modo não declarado cai no primeiro, sem aviso): ponha `light` primeiro.
   - `tokens` só tem as chaves `modes` e `values`: outra chave é recusada (`chave desconhecida: x`, no caminho `tokens.x`); biblioteca que trazia uma chave a mais e passava antes pode ser recusada agora.
   - `tokens` só com `formatVersion` 15 (antes: `só é permitido com formatVersion 15`) e `$token` só no componente de formato 4 (`só é permitido com formatVersion 4`). O `validate_library` recusa token inexistente (`o token "x" não existe nos tokens da especialização`) e de tipo errado (`o token "primary" é cor, mas aqui se espera número`), com o caminho do nó. Detalhes em `docs/SPEC-FORMAT.md` ("Tokens de design") e `docs/COMPONENT-FORMAT.md`.

7. **Conjunto de ícones (`formatVersion` 15 na especialização; nó `icon` no componente de formato 4).** Quando mais de um componente mostra ícone, ou um campo `enum` escolhe o ícone, **não repita os caminhos num `$switch`** dentro do componente: ponha os ícones num arquivo do pacote (`icons/icons.json`, `"format": "mapping-icons"`, `"formatVersion": 1`, `viewBox` padrão `[24, 24]` e `icons` por nome `^[a-z0-9][a-z0-9-_]*$`) e aponte `"icons": "icons/icons.json"` na raiz da especialização:

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
       }
     }
   }
   ```
   - Cada ícone tem `paths` (lista **não vazia** de `{ d, fill?, stroke?, width?, cap?, join? }`) e, se precisar, o próprio `viewBox`. `fill`/`stroke` `true` usam a cor do nó `icon`; um texto é cor própria; caminho sem `fill` nem `stroke` é preenchido com a cor do nó. A largura (`width`) é em unidades do `viewBox`. Use os `d` do SVG da origem (Figma, Material Symbols, o `icons.tsx` do app), nunca de memória.
   - No componente: `{ "type": "icon", "name": { "$field": "icone" }, "color": { "$token": "on-surface" }, "width": 24, "height": 24 }` (`strokeWidth` troca a largura dos traços; `hug` mede o `viewBox`). O `name` do nó `icon` é o do **ícone**, não um nome de nó. Ligue o `name` a um campo `enum` cujas `options` são os nomes do conjunto.
   - O `validate_library` confere o arquivo (nível 1), recusa nome **literal** fora do conjunto (`o ícone "nuvem" não existe no conjunto de ícones (icons/set.json)`, com o caminho do `name`) e avisa, no nível 3, a `option` de `enum` que não está no conjunto. Nome vindo de campo que não existe no conjunto desenha o reservado com o aviso `ícone desconhecido: <nome>`.
   - `icons` só com `formatVersion` 15 (antes: `só é permitido com formatVersion 15`) e o nó `icon` só no componente de formato 4 (`só é permitido com formatVersion 4`). Detalhes em `docs/SPEC-FORMAT.md` ("Conjunto de ícones") e `docs/COMPONENT-FORMAT.md`.

8. **Tamanho de tela, tipo estrutural e marcação mínima (`formatVersion` 15 na especialização; formato 4 no componente).**
   - **`screen`** na raiz do componente (`{ "anchor": "center" }`, padrão; ou `top-left`, `top`, `top-right`, `left`, `right`, `bottom-left`, `bottom`, `bottom-right`): o desenho tem o `size` em **pixels de tela** em qualquer zoom, ancorado no ponto do retângulo da marcação (pino, selo, emblema). Pode passar do retângulo sem a pendência "não cabe". `stroke.scale: false` mantém a largura do traço em px de tela. Em formato < 4: `só é permitido com formatVersion 4`.
   - **`"structural": true`** no tipo de anotação: o tipo só agrupa e não desenha (seção, compositor); a app não mostra o nome dele no canvas e não o conta como "sem componente". `structural` com `component` é erro (`um tipo estrutural não desenha: não pode ter component`); `structural` só com `formatVersion` 15.
   - Marcação de tipo **com componente** vale a partir de 1 px (itens de 1 a 7 px: divisória, ponto, separador), respeitando o `minSize` do componente; sem componente o mínimo continua 8 px. Não dimensione o `size` para 8 px por causa do mínimo antigo.
9. **Origem medida (`origins[].kind: "measured"`, `formatVersion` 15).** Quando a tela de origem existe e pode ser **medida** (uma página web aberta num navegador, a hierarquia de views de um app), declare `{ "system": "dom", "kind": "measured" }` em `origins` (só `system`, `kind`, `name` e `booleans`; `node`, `screen` e `examples` são erro) em vez de uma origem de árvore. O agente do projeto então mede e importa com a op `import_measured` do MCP (`docs/AGENT-GUIDE.md`, "Importar um layout medido"). O trabalho da especialização está nas `sources` com esse `system`:
   - **Tipo:** `{ "system": "dom", "name": "btn" }` e/ou `"id"`. O nó casa pelo `id` contra o `id` da source, depois cada classe do nó contra o `name`, depois o `type` do nó (a tag) contra o `name`; use classe para o que distingue (`btn`, `card`) e a tag para o resto (`img`, `input`).
   - **Campo:** `{ "system": "dom", "path": "label" }` lê o valor nas `props` do nó; num campo `enum`, `values` traduz o texto medido para as `options`. Sem `path` o campo fica no valor padrão.
   - Cor pelo token mais próximo e ícone reconhecido pelo traço **não existem**: o que a medida não traz fica no padrão. `kind` numa versão anterior à 15 é o erro `só é permitido com formatVersion 15`. Exemplo: `examples/libraries/medido/`.
10. **Atualização de biblioteca já aplicada:** preserve ids de tipo e `key` de campo, suba a `version`. **Aditivo** (não precisa de `migrations`): tipo novo, campo **opcional** novo, opção nova de `enum`, componente, documento, exemplo ou fonte novos, mudar só o desenho. **Quebra** (exige entrada em `migrations`, com `from`, `to` e `steps`; `to` ≤ `version`, `from` único, `steps` não vazia; a cadeia precisa ligar a versão aplicada à nova, senão toda quebra fica sem cobertura): remover ou renomear tipo, campo ou opção de `enum` (passos `rename-type {from,to}`, `remove-type {type,mode: convert|delete}` (`delete` apaga também as anotações), `rename-field {type,from,to}`, `remove-field {type,field}` e `map-values {type,field,values}`; a chave de campo pode ser `tabela.coluna`), tornar um campo obrigatório (inclusive um campo novo que já nasce obrigatório: cubra com `fill-field {type,field,default}`), mudar o `type` de um campo, tirar um papel de `childRoles` ou dar `childRoles` a um tipo que não tinha (passos `rename-role`, `remove-role` e `set-role`, da `formatVersion` 12: ver a seção 12). Passe a versão anterior à validação (`previous`).

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
2. O componente (`formatVersion` 2 do componente): um nó `repeat` com `field` = a chave do campo `table` e `template` = o desenho de **uma** linha; dentro do `template`, `{ "$field": "<coluna>" }` lê a coluna da linha. Copie o molde de `libraries/notas/components/tabela.json` (título, uma linha por registro, chave à esquerda e valor à direita) e troque as colunas. O `preview` traz 2 ou 3 linhas de exemplo (lista de objetos, uma chave por coluna). A altura da marcação **não** cresce com as linhas: dimensione o `size` para o `preview` caber (a prova de desenho avisa `conteúdo maior que a caixa` só no `size`; confira o `minSize` à mão).
3. Se a **relação** tem dado próprio, um segundo tipo com `appliesTo: ["arrow"]`.
4. No documento do tipo (`doc`), diga que a ligação com o alvo é uma seta e como o agente a encontra (`arrows` em `get_marking`).

Uma especialização **não cita outra**: a biblioteca de notas já traz a **Tabela** genérica (título e linhas chave/valor), mas uma especialização com colunas tipadas escreve o próprio tipo e o próprio componente do mesmo molde.

#### Imagem remota: o nó `image` (componente `formatVersion` 3)

Use `image` quando o desenho mostra uma foto cuja URL vem do dado (avatar, foto, logo). Ligue o `src` a um campo `string` do tipo, `{ "$field": "foto" }` (no `repeat`, a coluna `string` da `table`). Regras:

- `src` é só o literal (`https://...` absoluto) ou o `$field` puro: **nunca `$concat`**, `$switch` ou `$if`; nunca `http:`, `data:` nem caminho relativo.
- `fit`: `cover` (padrão), `contain` ou `fill`; na `formatVersion` 4 também `fill-width`, `fill-height` (ocupam a largura ou a altura, centradas e recortadas), `scale-down` (como `contain`, sem ampliar) e `none` (tamanho natural). Numa versão menor: `template.children[0].fit: só é permitido com formatVersion 4`. O PNG do MCP continua desenhando o reservado. Dê tamanho fixo, `fill` ou `%`; **nunca `hug`** (é erro). `fill` (cor) serve de fundo atrás da imagem e `cornerRadius` faz avatar redondo.
- Um componente com nó `image` usa a `formatVersion` 3 do componente. A especialização não muda (nada de declarar origem) e o `preview` traz uma URL `https://` só se você a viu na origem.

#### Calcule em vez de enumerar (componente `formatVersion` 4)

Na `formatVersion` 4 do **componente** as expressões fazem conta: `$add`, `$sub`, `$mul`, `$div`, `$mod` (resto com o sinal do divisor), `$round`, `$floor`, `$ceil`, `$abs`, `$min`, `$max`, `$clamp` e `$sin`/`$cos` (em graus), e as condições `$gt`, `$gte`, `$lt` e `$lte`. **Não escreva um `$switch` de dezenas de casos, nem um `$eq` por valor, sobre um campo `number`**: use a conta. Exemplo: a barra de progresso com `width: { "$mul": [{ "$field": "progress" }, 200] }` no lugar de 101 casos; o zero à esquerda do minuto, com `{ "$if": { "$lt": [{ "$field": "minute" }, 10] }, "then": "0" }` dentro de um `$concat`. Operando vazio, texto não numérico (a vírgula não vale) ou divisão por zero fazem a operação **não produzir valor** (vale o padrão do lugar, sem aviso), e um número não inteiro no `$concat` sai com até 6 casas (`0.1 + 0.2` vira `0.3`). O validador recusa operando literal que não é número (`template.width.$add[1]: precisa ser número`), a aridade errada (`template.width.$sub: precisa de 2 operandos`) e as chaves numa `formatVersion` menor que 4 (`template.width.$mul: só é permitido com formatVersion 4`). Também na `formatVersion` 4: `{ "$rows": "<campo table>" }` (o número de linhas; o validador recusa campo que não é `table`), `{ "$size": "width" }` ou `"height"` (a largura ou a altura da instância, que segue o redimensionamento da marcação; na prova de desenho e no `hug`, o `size` do componente), o `repeat` **por contagem** (`count` no lugar de `field`, exatamente um dos dois; `max(0, floor(count))` linhas, até 1000, com o aviso `repeat limitado a 1000 linhas: <nó>`) com `{ "$field": "$index" }` para o índice da linha (0, 1, …; vale também no `repeat` por `field`, não é campo do tipo e fora de um `repeat` é erro) e as **âncoras por expressão** (`left`, `right`, `top` e `bottom` de número; `centerX` e `centerY` de condição; sem número vale como âncora ausente). Exemplo: os números de 1 a 31 de um calendário, sem 31 campos nem 31 casos: `{ "type": "repeat", "count": 31, "template": { "type": "frame", "children": [{ "type": "text", "text": { "$add": [{ "$field": "$index" }, 1] } }] } }`; uma marca no meio da largura: `"anchors": { "left": { "$mul": [{ "$size": "width" }, 0.5] } }`. **Rotação:** `rotation` (graus, sentido horário, aceita expressão) gira qualquer nó em volta do centro da caixa dele, só no desenho (layout, medida e `hug` não mudam); os filhos e o `clip` de um quadro giram junto, e na raiz é erro (`template.rotation: não vale na raiz`). Use para ponteiro, alça ou indicador em vez de uma tabela de posições: `"rotation": { "$mul": [{ "$field": "fraction" }, 360] }`; o `rect` de 40 × 10 com `rotation` 90 vira uma barra de 10 × 40 no mesmo centro. Numa `formatVersion` menor que 4 cada uma dessas chaves dá `só é permitido com formatVersion 4`, no caminho dela. Detalhes em `docs/COMPONENT-FORMAT.md` ("Contas e comparações", "`repeat`", "Âncoras" e "Rotação").

#### Traço com ponta, canto e lados (componente `formatVersion` 4)

O `stroke` do desenho aceita, só na `formatVersion` 4 do **componente**, `cap` (`butt` padrão, `round`, `square`), `join` (`miter` padrão, `round`, `bevel`) e `sides` (lista não vazia, sem repetição, de `top`, `right`, `bottom`, `left`; ausente = os quatro). Todos aceitam expressão (`sides` por um `$switch` que devolve a lista). Use `sides` para divisória só embaixo ou borda parcial: o traço fica reto, sem arco no canto, mesmo com `cornerRadius`, e os lados pedidos têm a mesma cor, largura, `align` e `dash` (valores diferentes por lado pedem dois nós). `sides` só vale em `frame` e `rect` (em `ellipse` e `path`: `só vale em frame e rect (este é <tipo>)`). Numa `formatVersion` do componente menor que 4, as três chaves são erro: `template.children[0].stroke.cap: só é permitido com formatVersion 4`. A especialização não muda. Não existe sombra interna.

#### Extensões do formato 4: token em sombra e raios, tracejado, alpha, afastamento, vão do contorno, sombras em lista, cor herdada, `justify` e `reverse` (componente `formatVersion` 4)

Só na `formatVersion` 4 do **componente**; a especialização não muda. Numa versão menor, cada chave é erro `só é permitido com formatVersion 4`, no caminho dela (ex.: `template.children[0].stroke.offset: só é permitido com formatVersion 4`).

- **`$token` de número em `shadow.x`, `shadow.y`, `shadow.blur` e `shadow.spread`** e **em cada item da lista de `cornerRadius`** (`[{ "$token": "corner-extra-small" }, 0, 0, { "$token": "corner-extra-small" }]`; a lista continua com 4 itens): use no lugar de literal quando a origem tem o valor como token (elevação, formas). Só `$token`, nenhuma outra expressão. `blur` resolvido negativo vale 0, com o aviso `valor inválido em shadow.blur: <valor>`.
- **`stroke.dash` por expressão** (`$switch`/`$if`/`$field` que devolvem a lista de números ≥ 0) e `$token` de número em cada item. Valor resolvido inválido: sem tracejado, com o aviso `valor inválido em stroke.dash: <valor>`.
- **`alpha` no `$token` de cor:** `{ "$token": "scrim", "alpha": 0.32 }` multiplica o alfa da cor do token (use no véu, na alça, na parada transparente de um degradê com `alpha: 0`), em vez de declarar um token por opacidade. `alpha` é número de 0 a 1 ou `$token` de número. Fora de cor: `alpha só vale em $token de cor` (no caminho `…$token`); fora de 0 a 1: `esperava número entre 0 e 1`.
- **`over` no `$token` de cor:** `{ "$token": "on-surface", "alpha": 0.38, "over": "surface" }` compõe a cor (já com o `alpha`) sobre a de `over` e a deixa **opaca sobre uma base opaca** (o `compositeOver` do Compose; use no desabilitado que não pode empilhar transparência). `over` é o nome de um token de cor (nome desconhecido: o erro de token de sempre) ou uma cor literal; `none` continua `none`. Fora de cor: `over só vale em $token de cor` (no caminho `…$token`); `over` que não é texto: `esperava nome de token ou cor`.
- **`font.align: "justify"`:** o texto ocupa a largura da caixa e a última linha de cada parágrafo fica à esquerda (o `TextAlign.Justify`); aceita expressão. Numa versão menor: `template.children[0].font.align: só é permitido com formatVersion 4`. O texto rico (`runs`) ainda desenha `left`.
- **`stroke.offset`** (px ≥ 0, literal ou `$token`; só em `frame`, `rect` e `ellipse`: nos demais, `só vale em frame, rect e ellipse (este é <tipo>)`): afasta o traço da forma, como o `outline-offset` do CSS, e o recorte da raiz conta o afastamento. É a chave do anel de foco que passa da caixa (`outside` com `offset` 2). O anel cresce `offset` de cada lado e o raio de cada canto arredondado soma `offset`; a app, o visualizador e o PNG do MCP o desenham igual. `sides` com os quatro lados vale como `sides` ausente (o contorno inteiro com o raio).
- **`shadow.spread`** (px, literal ou `$token` de número; negativo vale): cresce (ou encolhe) a forma da sombra em cada lado, com os raios + `spread` (canto reto continua reto), como no CSS. Vale em `frame`, `rect` e `ellipse`, na app, no visualizador e no PNG do MCP; em outros tipos de nó é ignorado. O recorte da raiz conta o `spread` (alcance = `blur` + `spread`, mais o deslocamento).
- **`shadow` como lista de 1 a 4 sombras** (cada item é um objeto com as mesmas chaves de uma sombra): a primeira fica por cima, como no `box-shadow`, e o recorte da raiz conta todas as externas (vale a que passa mais). Lista vazia ou com mais de 4: `shadow: esperava de 1 a 4 sombras`. Numa versão menor: `…shadow: só é permitido com formatVersion 4`, no caminho de `shadow`. Num tipo que não é `frame`, `rect` ou `ellipse` a lista desenha só a primeira sombra (limite conhecido). O aviso de desenho `só a primeira sombra externa de cada nó foi desenhada` não existe mais.
- **`stroke.gap`** (`{ "node": "<nome de um nó do template>", "padding": 4 }`, só em `frame` e `rect`, `padding` padrão 0; expressão de número): o contorno é o de sempre (com o raio de cada canto), mas o lado que a caixa do nó nomeado atravessa fica **sem traço no trecho que ela cobre, mais o `padding` de cada lado**; é o recorte do contorno do `OutlinedTextField`, que segue a largura medida do rótulo minimizado. Vale o primeiro nó com esse nome na ordem do template (o nome padrão de um nó é o tipo dele); um nó invisível, ou que não atravessa nenhum lado, não abre vão; o vão fica só na parte reta do lado (os cantos com raio nunca se cortam) e a caixa usada é a sem giro. Erros: `template.children[0].stroke.gap.node: nó não encontrado: <nome>`, `template.children[0].stroke.gap: gap não vale com sides`, `…stroke.gap: só vale em frame e rect (este é <tipo>)`, `…stroke.gap.node: campo obrigatório` e `…stroke.gap: chave desconhecida: <chave>`. Modele o contorno outlined de um campo de texto como **um** nó com `stroke.gap` sobre o rótulo minimizado (`padding` 4), não com lados retos soltos.
- **Cor herdada: `provide` no slot e `$provided` na filha.** O `slot` aceita `"provide": { "<nome>": <expressão de texto ou número> }` e qualquer posição de **cor** da filha (cor do texto, do ícone, fundo, contorno, sombra) aceita `{ "$provided": "<nome>", "default": <expressão> }`; em posição que mexe na geometria (tamanho, espaço, texto) é o erro `$provided só vale onde se espera cor`, e o `src` da `image` continua só literal ou `{ "$field" }` (`src só aceita texto literal ou { "$field": "<campo>" }`). O nome é livre (sem nome de plataforma) e não pode ser vazio (`template…provide: nome vazio`); cada valor é resolvido **no pai** (campos, tokens e modo dele), e um valor que não produz nada (campo vazio sem `default`) não oferece. Em `provide`, `$token` só vale de cor; as operações numéricas valem. Vale o ancestral **mais próximo** que oferece o nome, pela árvore de pertencimento (`parentId`), como o `CompositionLocal` do Compose: quem não oferece o nome é atravessado, e pai e avô oferecendo valem pelo pai. Sem ancestral que ofereça (marcação flutuante, marcação do canvas sem pai, instância no nível da tela, a prova de desenho dos exemplos, o Catálogo), vale o `default`; sem `default`, o padrão do lugar. **Quando usar:** o contêiner (surface, scaffold, cartão) oferece a cor do conteúdo (por exemplo `content-color`) e o texto, o ícone e o botão de ícone a leem com `default` (o padrão do lugar, `on-surface`), em vez de um campo de cor em cada filha ou da mesma cor repetida. Só o primeiro `slot` do componente oferece. É só desenho: o `code` não muda e não há parâmetro de código; trocar o campo do pai que muda o valor redesenha só as filhas que leem. `$provided` sem nome (vazio ou não texto): `…$provided: esperava nome da cor oferecida (texto não vazio)`; outra chave junto: `chave desconhecida`. Numa versão menor, `provide` e `$provided` dão `só é permitido com formatVersion 4`, no caminho da chave (`…provide`, `…color.$provided`). Um MCP anterior a esta chave recusa `provide` e `$provided` como chave desconhecida.
- **`layout.justify`** ganha `space-around` e `space-evenly`, como no flexbox (com um filho só, centram), e **`layout.reverse`** (booleano ou expressão) inverte a ordem dos filhos no eixo principal e faz o `start` virar o fim (`row-reverse`/`column-reverse`, o `reverseLayout` do Compose). Valor de `justify` fora do conjunto: `esperava um de: start, center, end, space-between, space-around, space-evenly`.

#### Layout fiel: texto que quebra, linhas iguais, limites (componente `formatVersion` 4)

Na `formatVersion` 4 do **componente** o layout ganha quatro recursos; a especialização não muda. Em qualquer versão, a medição é em duas passagens (como o flexbox): um **texto `fill` (ou `%`) numa coluna ou quadro `hug`** é medido dentro do limite que o quadro recebe do pai e **quebra em linhas de palavras**, e o quadro tem a altura delas. Escreva o cartão como `hug` com o texto `fill`; **não precisa mais de altura fixa** para o texto não quebrar letra a letra. Só o `fill` no eixo **principal** de um quadro `hug` continua valendo 0 (aviso `fill dentro de hug vira 0`).

- **`distribute: "fill"` no `repeat`** (lista que ocupa o espaço do pai, linhas de alturas iguais): o `repeat` ocupa o eixo do pai e as linhas dividem o eixo por igual, menos os `gap`s. Sem ele, as linhas são `hug` e um `fill` no `template` vale 0.
- **`minWidth`, `maxWidth`, `minHeight`, `maxHeight`** (px, aceitam expressão) em qualquer nó: o `fill` que bate no `max` congela e a sobra vai para os outros `fill` do mesmo pai (flexbox); um texto `hug` cortado pelo `maxWidth` quebra na largura cortada. `min` literal maior que o `max` é erro (`template.children[1].minWidth: não pode ser maior que maxWidth`); por expressão vale o `min`. Na raiz, os limites só valem quando o componente é medido (`hug`).
- **Expressão** em `layout.type`, `layout.align`, `layout.justify`, `width` e `height` (em quadro e em slot): um `$switch` sobre um campo `enum` escolhe `row` ou `column`. Valor resolvido fora do conjunto cai no padrão com o aviso `valor inválido em <chave>: <valor>`; texto numérico puro (`"120"`) vale como px. Literais continuam conferidos na validação.
- Numa `formatVersion` do componente menor que 4, `distribute`, as quatro chaves de limite e expressão nessas chaves de layout são erro: `template.children[0].maxWidth: só é permitido com formatVersion 4`.
- Aviso novo da prova de desenho: `texto medido com largura 0: <nó>` (um texto com largura `fill` ou `%` sem largura de onde sair; dê largura ao pai).
- **Texto de uma linha, reticências e linhas máximas** (só `formatVersion` 4 do componente): o `font` do nó `text` aceita `wrap` (`"word"` padrão, `"none"` = uma linha por parágrafo, sem quebra), `ellipsis` (`true`: o texto que não cabe na largura, com `wrap: "none"`, ou além de `maxLines` termina em `…`) e `maxLines` (inteiro ≥ 1; a última linha permitida leva o `…` com `ellipsis` ou é cortada). Use para célula, título e assunto de uma linha só (`wrap: "none"` + `ellipsis: true`, em caixa de largura definida) e para parágrafo de N linhas (`maxLines` + `ellipsis`). Aceitam expressão (`maxLines: { "$field": "linhas", "default": 2 }`). Numa `formatVersion` menor que 4 são erro: `template.children[0].font.wrap: só é permitido com formatVersion 4`; `maxLines` 0 ou fracionário: `esperava inteiro maior ou igual a 1`. A especialização não muda.
- **`wrap: "none"` sem `ellipsis` em caixa de largura fixa** recorta a linha por pixel na caixa (a letra que passa sai cortada no meio); uma linha só quebra quando passa da largura por mais de 0,5 px.
- **A prova de desenho roda em cada modo** da especialização (`light`, `dark`…) com os tokens do modo: o aviso cita o modo (`tipo "card", o preview, modo dark, tamanho inicial 300×120: …`), e um texto cujo `size` vem de um token é medido com o tamanho do token. Um caso que só não cabe no `dark` avisa só nele; corrija o tamanho ou o token e valide de novo.
- Aviso novo da prova de desenho: `texto maior que a caixa: <nó>` (as linhas quebradas passam da altura do nó e nada as corta; dê mais altura, ou `maxLines`/`ellipsis`). Tolerância de 1 px por nó de texto; o aviso entra na pendência "o componente não cabe". A altura de linha segue o CSS: `lineHeight` em px (acima de 3) é a altura da linha como está, o múltiplo não arredonda.

#### Texto rico: trechos e chip no meio da linha (componente `formatVersion` 4)

Quando o desenho mostra **negrito, outra cor ou uma caixa com fundo no meio de uma frase** ("Fatura de **março** `vencida`"), use `runs` no nó `text`, no lugar de `text`: uma lista não vazia de trechos `{ "text", "weight"?, "italic"?, "color"?, "decoration"?, "family"?, "size"?, "background"?, "radius"?, "padding"? }`. A especialização não muda (a `formatVersion` dela fica como está). Regras:

- **Centro pela maiúscula** (só `formatVersion` 4 do componente): `font.verticalAlign: "cap-middle"` centra o bloco que vai do topo da maiúscula da primeira linha à linha de base da última na caixa do nó (aceita expressão: um `$switch` pode devolvê-lo). Use no **rótulo de uma linha** de botão, chip, aba e campo, onde o centro visual tem de ser o da letra em qualquer fonte; mantenha o `middle` em parágrafo, ou quando o desenho deve bater com o DOM linha a linha. Numa versão menor que 4 é erro: `template.children[0].font.verticalAlign: só é permitido com formatVersion 4`; valor fora do conjunto: `esperava um de: top, middle, bottom, cap-middle`. Com trechos (`runs`) maiores que o do nó, o centro pode ficar um pouco fora. A especialização não muda.
- **O nó é a base; o trecho sobrepõe.** O `font` e o `color` do nó valem para todos; o trecho sobrepõe só `weight`, `italic`, `family`, `size`, `decoration` e `color`. `lineHeight`, `letterSpacing`, `align`, `verticalAlign`, `wrap`, `ellipsis` e `maxLines` são só do nó e valem para os trechos (no trecho são chave desconhecida). Cada chave aceita expressão; o `text` do trecho aceita `$field` (`{ "text": { "$field": "label" }, "weight": 700 }`).
- **O chip é um trecho com `background`.** `background` mais `radius` e `padding` (número ou `[vertical, horizontal]`) fazem uma caixa em linha, inquebrável: a largura é o texto mais 2 vezes o respiro horizontal e a altura é a da linha do trecho mais 2 vezes o vertical. Não cabendo no resto da linha, vai inteiro para a de baixo. `radius` e `padding` sem `background` não fazem nada.
- **Quebra pela palavra, como um texto só.** Quebra nos espaços dos trechos sem fundo e nas bordas de um chip; `\n` num trecho sem fundo quebra e num chip vira espaço. Espaço no começo da linha é descartado fora do chip e mantido dentro dele. Prefira o espaço entre o texto e o chip no trecho sem fundo (`"Fatura "`, depois o chip): um espaço dentro do chip aumenta a caixa dele.
- **Use `runs` em vez de trocar o rótulo por espaços e desenhar o chip por cima** com outro nó: o chip por cima não acompanha o texto quando ele quebra ou muda de largura. Componente da biblioteca dentro da linha não existe (o chip é um trecho, não um nó), e os pedaços ficam centrados na linha, sem alinhar pela linha de base.
- `text` e `runs` no mesmo nó é erro (`template.children[0]: text e runs juntos: use um ou outro`); `runs: []`, `esperava lista não vazia de trechos`; chave desconhecida no trecho, `template.children[0].runs[1].bogus: chave desconhecida: bogus`. Numa `formatVersion` do componente menor que 4: `template.children[0].runs: só é permitido com formatVersion 4`. No MCP, `render_marking` e `render_container` (e o `get_marking_image` de um container sem arquivo) desenham o texto rico com letras de verdade, com o chip, pela fonte livre embutida ou pela `fonts` da biblioteca.

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

- `kind` (obrigatório): `pending` (uma fonte já tem e a outra ainda não; **o nome da plataforma ou da origem abre a `message`**, como `compose: …`, não vai em outro lugar; e cite o pedido registrado, a issue ou o ticket da biblioteca, quando houver), `deprecated` (obsoleto; a `message` diz o que usar no lugar), `diverges` (as fontes discordam; a `message` diz em quê) ou `removed` (saiu do contrato; não deve ser usado). `message` obrigatória, não vazia nem só espaços; `since` (data real `AAAA-MM-DD`) e `ref` (texto livre: a página do contrato, o arquivo do código) opcionais. Não repita o mesmo `kind` com a mesma `message` na lista (erro `aviso repetido`).
- **Regrave todos os avisos da sua origem, não os dos outros.** Há duas origens, diferenciadas pelo `ref`: o aviso **gerado por ferramenta** tem o arquivo de entrada dela como `ref` (a ferramenta regrava todos os desse `ref` a cada rodada e não toca nos outros); o **curado à mão** (o seu) tem outro `ref`, como o doc do tipo, e a ferramenta nunca o apaga. Você regrava os seus ao rever o doc, a partir do que as fontes mostram hoje: o aviso é um retrato da diferença, não um histórico. O aviso curado só sai quando você revê o doc e a diferença sumiu; não o carregue "por garantia" depois disso, e não apague o que tem o `ref` de uma ferramenta. **Nunca escreva à mão um aviso com o `ref` de uma ferramenta** (sumiria na próxima rodada dela) nem um aviso de fidelidade que repete o que um `pending` dela já diz.
- **Avisos de fidelidade, para qualquer biblioteca.** Ao escrever ou rever o doc de um componente, passe cada item da seção de diferenças pelo critério: vira aviso só a divergência de **desenho** ou de **comportamento** que **muda uma decisão** de quem marca (como recortar, que tipo ou campo escolher, o que esperar do desenho) ou de quem escreve o código (que parâmetro passar, que composable ou view trocar, o que conferir na tela). O que passa vira um `notices` no tipo (ou no campo, quando a diferença é de um campo) com `kind` `diverges`, o `ref` do doc (`docs/<tipo>.md`) e a `message` com o prefixo da plataforma; o resto fica só no doc (estados interativos que o desenho estático não mostra, valor literal em vez de token, subpixel, a referência dos arquivos usados). Use `pending` só quando o limite tem um pedido registrado, citado na `message`. Parâmetro que não é campo é do importador, não daqui.
  - Bom (vira aviso): `{ "kind": "diverges", "message": "compose: as filhas de um slot não têm weight; marque a largura real de cada uma", "ref": "docs/row.md" }`.
  - Ruim (fica no doc): `"sem o estado pressionado"`; e ruim também, qualquer aviso com `ref` de ferramenta (`signatures/…`).
- **Só informa.** Nenhum aviso, nem `removed`, impede importar, aplicar, criar anotação ou aceitar proposta, e não vira pendência. Por isso um campo que deve ser **obrigatório** continua com `required`, e um tipo que não pode mais existir continua precisando de migração, não de aviso.
- **Fora do contrato de versão:** incluir, mudar ou tirar `notices` nunca pede migração nem sobe a `version` por si só (`diffSpecs` os ignora); atualizar a especialização só por avisos não mostra impacto.
- **Só suba para a `formatVersion` 10 se algo usa `notices`.** Numa versão anterior, `notices` é erro (`só é permitido com formatVersion 10`, no caminho exato).

### 12. Filhos por camada e grupo, papéis e documentos externos (`formatVersion` 11)

Três recursos opcionais, cada um para um problema de modelagem. Use o que a origem pede e **não suba para a 11 por garantia**: sem nenhuma chave nova, a especialização fica na versão que o conteúdo pede.

**Cláusula no lugar de lista longa.** Quando um dono aceita **toda** uma camada (todo evento) ou uma parte coerente dela, escreva `allowedChildren: [{ "layer": "eventos" }]` ou `[{ "layer": "eventos", "groups": ["navegacao"] }]` em vez de listar os ids. Um tipo novo na camada passa a valer para o dono sem editá-lo. Itens em texto e cláusulas podem se misturar na mesma lista; a lista de ids continua certa para poucos filhos específicos. Com 20 ids ou mais em texto, o validador avisa que uma cláusula cobre a camada.

- **`groups`** (`layers[].groups`: `[{ id, name, description? }]`, `id` único na camada, a ordem é a dos cabeçalhos; `annotationTypes[].groups`: lista não vazia, sem repetição, de ids da **própria** camada; um tipo pode estar em vários grupos). Declare só os grupos que a origem evidencia (as seções do contrato, as pastas, as categorias do design system); grupo que nenhum tipo usa é aviso. Um tipo sem `groups` só entra por cláusula da camada inteira ou pelo id.
- A cláusula só tem `layer` e `groups`, aponta para **outra** camada (a do próprio dono é erro até a 12; a 13 aceita) e os `groups` dela existem na camada citada (`groups: []` é erro; para a camada inteira, omita). `requiresOwner` é conferido no conjunto **resolvido**: o filho precisa estar no conjunto de algum dono, por id, por camada ou por grupo.

**Papéis no vínculo.** Se o filho precisa dizer em que ponto do dono se liga, isso é papel, não campo nem id de tipo. Declare no **dono** `childRoles: [{ id, name, description? }]` (não vazia, `id` único no tipo; só em tipo com `allowedChildren`) e, se o nome padrão ("Papel" / "Role") não serve, `childRolesLabel` ("Trigger", "Slot"; só com `childRoles`). O papel pertence ao **vínculo**: o mesmo tipo de filho pode ocupar papéis diferentes no mesmo dono.

**`docRepos`: o documento mora noutro repositório.** Quando a documentação de um componente vive no repositório do design system ou do contrato, não a copie para o pacote (a cópia vira uma segunda fonte que envelhece): declare o repositório na raiz, `docRepos: [{ id, url, urlTemplate?, ref? }]` (as mesmas regras do `repo` de uma plataforma: `url` e `ref` do repositório que você leu, nunca de memória; `urlTemplate` com `{path}` só quando souber o formato do endereço de um arquivo no host), e aponte o `doc` do tipo para ele: `"doc": { "repo": "design-docs", "path": "components/button.md" }`. O `path` é relativo à raiz do repositório, termina em `.md`, sem `#`, `.`, `..` nem `/` no começo; o `repo` precisa estar em `docRepos`. O `doc` externo **não é arquivo do pacote**: uma biblioteca em que ele é o único arquivo citado vale como arquivo isolado, e a validação do pacote não o confere. O `doc` em texto (o `.md` do pacote) continua valendo; escreva o documento no pacote quando **você** o escreve. Repositório declarado que nenhum `doc` usa é aviso.

**Filhos da própria camada (`formatVersion` 13).** Quando um tipo se encadeia **na mesma camada** (um evento que dispara outro: `send-http-request` com os resultados Sucesso e Falha, cada um disparando um próximo evento), a 13 deixa `allowedChildren` aceitar a cláusula `{ "layer": "<a camada do próprio tipo>" }` e o id de um tipo da mesma camada, **inclusive o do próprio tipo**. O padrão é **encadear por papel**: o dono declara `childRoles` (`success`, `failure`) e aceita a si mesmo em `allowedChildren`; cada evento seguinte é **filho** do anterior no papel em que se liga, na mesma camada. No projeto, a anotação tipada pode ter dona da mesma camada quando o tipo da dona aceita; a **livre** continua só com dona de outra camada, e o ciclo continua barrado (`invalid-annotation-parent`). Antes da 13, a camada ou o tipo da própria camada em `allowedChildren` é o erro `filhos devem estar em outra camada`. Só suba para a 13 se algum tipo usa isso.

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
- `formatVersion` 13: a cláusula `{ layer }` da camada do próprio tipo, ou o id de um tipo da mesma camada (inclusive o do próprio tipo), em `allowedChildren`.
- `formatVersion` 14: `accepts.annotations` em campo ou coluna `ref` (a anotação inteira como alvo).
- `formatVersion` 15: `tokens` na raiz (tokens de design por modo, lidos por `{ "$token": … }` nos componentes de formato 4) ou `icons` na raiz (o conjunto de ícones lido pelo nó `icon`) ou `structural` num tipo ou `origins[].kind: "measured"` (a origem medida).

A versão atual do formato é a 15. **Só suba para a 9 se algum tipo usa `variants`, para a 10 se algum tipo, campo ou coluna usa `notices`, para a 11 se algo usa uma chave da lista acima (o `doc` em texto não conta) para a 12 só se declara um passo de papel para a 13 só se um tipo aceita filhos da própria camada para a 14 só se um `ref` usa `accepts.annotations` e para a 15 só se declara `tokens`, `icons`, `structural` ou `kind: "measured"`**: o resto da biblioteca fica na versão que o conteúdo pede (a de notas fica na 7, a Kotlin na 8 e a Material 3 na 9). O **componente** tem a própria versão: `formatVersion` 1, 2 quando usa `repeat`, ou 3 quando usa `image` (a 1 continua aceita; `repeat` numa 1 é erro). Uma versão maior que o necessário impede a importação em apps antigas sem ganho.

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

**Quem aplica é a pessoa:** entregue a pasta validada. O agente só aplica por proposta (`propose_changes` com `apply_specialization` ou `update_specialization` e `file` = a pasta; antes, `plan_library_update` mostra o impacto) se o pedido mandar; a revisão e o aceite são da pessoa, na app.

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

- Um `$switch` com dezenas de casos (ou um `$eq` por valor) sobre um campo `number`, para posição, tamanho ou texto: o arquivo incha e o desenho só vale para os valores listados. Calcule com `$mul`, `$add`, `$mod`, `$clamp`… (componente `formatVersion` 4), por exemplo `width: { "$mul": [{ "$field": "p" }, 200] }`; para uma lista de N itens iguais, `repeat` com `count` e `$index` no lugar de N nós copiados.
- `font.family` do componente com aspas sem fechar, item vazio numa pilha (`Roboto, , serif`) ou aspas no meio do nome: é **aviso** na validação e o texto cai em `sans-serif`. A família aceita uma pilha CSS (`system-ui, "Segoe UI", Roboto, sans-serif`) ou um nome genérico sozinho (`system-ui`); não ponha aspas em volta da pilha inteira.
- Negrito, cor ou chip no meio de uma frase desenhados com vários nós `text` lado a lado ou com um espaço no rótulo e um retângulo por cima: use `runs` (componente `formatVersion` 4). `runs` junto de `text`, ou numa `formatVersion` do componente menor que 4, é erro.
- Camada por módulo do código em vez de por natureza: os eventos acabam na mesma camada dos componentes e `allowedChildren` não valida.
- `id` de tipo repetido em camadas diferentes (`button` em Componentes e `button` em Telas): o id é único na especialização inteira.
- Booleano como `string` com `default: "true"`: use `enum`.
- `enum` para um texto que não se esgota na lista (o tipo de uma propriedade): trava valores legítimos; use `string` com `suggestions`. E o contrário: `suggestions` para um conjunto fechado, que não impede o valor errado.
- `default` fora de `options`, ou `default` em `ref`.
- `notices` curado à mão carregado de uma rodada para outra depois que você reviu o doc e a diferença sumiu (os que têm o `ref` de uma ferramenta não são seus: ela os regrava), aviso escrito à mão com o `ref` de uma ferramenta, `message` de aviso de plataforma sem o prefixo `<plataforma>: `, aviso de fidelidade para o que fica só no doc (estado pressionado, valor literal), ou aviso inventado sem ter visto a divergência nas fontes; `notices` numa especialização que ficou na `formatVersion` 9 ou menos.
- Campo `codeRef` (onde a instância foi escrita): saiu do formato; remova.
- `symbol` com o nome do nó de saída (`"onClick"`, `"image"`) em vez da função ou classe que o gera.
- Plataforma com `path` em algum tipo e sem `repo` (aviso): preencha `url` e `ref` do repositório que você leu.
- `requiresOwner: true` sem nenhum tipo listando o filho em `allowedChildren` (na 11, nem por id nem por cláusula que o cubra), ou com o próprio tipo como único dono (`nenhum outro tipo o aceita como filho`).
- Encadear eventos com campos do tipo, `chainedAfter` e `trigger` (o evento anterior e o gatilho como dado do filho): o "quando" é **papel** do vínculo, também entre eventos. Declare `childRoles` no evento dono, faça-o aceitar a si mesmo em `allowedChildren` e use a `formatVersion` 13.
- Cláusula `{ layer }` da própria camada (ou id de tipo da mesma camada) numa `formatVersion` abaixo da 13: o erro é `filhos devem estar em outra camada`. Suba para a 13, ou mude a modelagem.
- Campo `string`/`json` com a estrutura de uma lista de componentes, ou etiqueta criada só para o `ref` ter alvo, quando `accepts.annotations` (`formatVersion` 14) aponta para os tipos direto. `accepts.annotations: []` é erro; numa versão abaixo da 14 o erro é `só é permitido com formatVersion 14`.
- Na `formatVersion` 11: o gatilho no id do tipo (`onClick` e `onHold` como tipos), um campo `trigger` em cada evento ou `allowedChildren` par a par com uma camada inteira listada id a id: use papéis (`childRoles`) e a cláusula `{ layer, groups? }`. Cláusula para a camada do próprio dono, `groups: []` ou grupo que não existe na camada citada; `childRoles` em tipo sem `allowedChildren`; `childRolesLabel` sem `childRoles`; `doc` objeto com `repo` fora de `docRepos` ou `path` com `#`; a 11 declarada numa especialização que não usa nenhuma dessas chaves.
- `code` referindo plataforma não declarada, ou `params` com chave que não é campo do tipo.
- `sources[].values` em campo que não é `enum`, ou destino que não está em `options`.
- `formatVersion` 3 numa especialização sem `sources`, só "para garantir".
- Nome de framework fora de `platforms`/`code`, ou especialização citando outra pelo nome.
- Exemplo de um tipo com campo `table` (`items`, `options`) sem as linhas: no Catálogo ele sai sem o conteúdo (sem destinos, sem opções). Ponha no `values` a lista de linhas do `preview` do componente; o exemplo que não traz o campo não herda o `preview`.
- Biblioteca: caminho com `..` ou fora da pasta; arquivo de componente, documento ou exemplo que ninguém cita (vira aviso); template citando chave de campo que o tipo não tem; exemplo com valor fora das `options`; `fonts` declarada sem o arquivo (aviso; por convenção deixe `fonts/LEIA-ME.txt` dizendo o que falta).
- Atualização de biblioteca que remove ou renomeia um papel de `childRoles` (ou dá papéis a um tipo que não tinha) sem `rename-role`, `remove-role` ou `set-role`; `set-role` escrito depois do `rename-type` do filho, quando a informação dependia do tipo antigo; a 12 declarada numa especialização sem nenhum passo de papel.
- Biblioteca: validar só o arquivo (`validate_specialization`) e achar que o pacote passa; renomear campo ou tipo numa atualização sem `migrations`; propor a aplicação do pacote sem o pedido mandar.

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
