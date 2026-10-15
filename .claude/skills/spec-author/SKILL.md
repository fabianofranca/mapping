---
name: spec-author
description: Escreve, revisa ou atualiza uma especialização do Mapping (arquivo JSON "mapping-spec" com camadas, tipos de anotação, campos, relações, plataformas/code e origens) a partir de um código-fonte, design system ou documento, e a valida antes de entregar. Use sempre que o pedido envolver criar ou mexer numa especialização, spec, "mapping-spec", tipos de anotação do Mapping, mapear componentes de um design system ou de um app para o Mapping, ou ligar tipos a código (code com symbol e path, platforms) ou a uma origem externa (sources, Figma) — mesmo que a palavra "especialização" não apareça.
---

# Autor de especializações do Mapping

Uma **especialização** é o arquivo JSON que ensina o Mapping a falar a língua de um domínio: quais camadas existem, que tipos de anotação cada uma aceita, que campos cada tipo tem, como os tipos se relacionam e, opcionalmente, como cada tipo vira código em cada plataforma (`formatVersion` 2) e a que elemento de um sistema externo ele corresponde (`formatVersion` 3). O formato completo está em `docs/SPEC-FORMAT.md` do repositório do Mapping; esta skill é o método para produzir um arquivo que passe na validação de primeira e que modele bem o domínio.

O prompt que invoca a skill traz o que muda de uma especialização para outra: id, nome, origem do material, `formatVersion`, plataformas e o que fica fora. Tudo o que não muda está aqui.

## Modelo e esforço

Para quem vai disparar o agente: **Opus 5.5 com esforço alto** é o padrão (o esforço padrão desse modelo é médio, e as regras entre elementos da especialização são onde o esforço baixo erra). **Fable 5.1 alto** para a primeira especialização de uma plataforma grande ou uma `formatVersion` 3 com muitas origens a casar. **Sonnet 5.5** para manutenção (acrescentar um tipo, renomear campo, corrigir um erro do validador).

## Leitura obrigatória, nesta ordem

1. `docs/SPEC-FORMAT.md`: o formato, as regras de validação e o exemplo comentado. Leia inteiro; é curto.
2. `docs/spec.schema.json`: a estrutura. Ele valida só a forma; as regras entre elementos (ids únicos, `allowedChildren` em outra camada, `default` compatível, destinos de `values` em `options`) vivem no validador da app, e é ele que decide.
3. `examples/specs/sdui.json` (`formatVersion` 2, com plataformas e `code`) e `examples/specs/modelo-de-dados.json` (`formatVersion` 1, com `table`, `tags` e `rowLabel`): copie o estilo, não o conteúdo.
4. Em `docs/AGENT-GUIDE.md`, a seção "Criando especializações: gerar, validar, corrigir" e, se a especialização tiver `sources`, "Especializações com `sources`".

Quando o agente roda fora do repositório do Mapping (o caso normal: ele roda no repositório do código que está sendo mapeado), esses documentos chegam pelo servidor MCP como recursos `mapping-docs://SPEC-FORMAT.md` e `mapping-docs://AGENT-GUIDE.md`; os exemplos e o schema ficam só no repositório do Mapping. Se nem o MCP nem o repositório estiverem ao alcance, pare e diga o que falta: escrever uma especialização sem o formato na mão produz um arquivo que não importa.

## O que o prompt dá e o que fazer quando falta

| O prompt diz                                           | Se não disser                                                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `id` e `name` da especialização                        | Derive do domínio (`id` em `[a-z0-9-]+`) e registre como decisão.                                      |
| A origem: repositório, pasta, design system, documento | Pergunte. Sem origem não há o que modelar.                                                             |
| O que ler na origem e o que ignorar                    | Leia o catálogo público (componentes exportados, entidades, eventos); ignore internos e testes.        |
| `formatVersion` desejada                               | Use a mínima para o que a especialização usa (ver "Versão").                                           |
| Plataformas e linguagens                               | Só declare plataformas que o material de origem evidencie. Nenhuma, se for `formatVersion` 1.          |
| Onde gravar o arquivo                                  | `<id>.json` na pasta de trabalho; diga onde ficou.                                                     |
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

### 6. Plataformas e `code` (`formatVersion` 2)

- `platforms` na raiz: `{ id, name, language }`, `id` em `[a-z0-9-]+` e único. Plataformas com o mesmo `id` em especializações diferentes são a mesma plataforma; alinhe com as já usadas no projeto (`get_project` mostra).
- `code` por tipo, por id de plataforma declarada: `symbol` (obrigatório; confira que existe no código, com caminho, antes de escrever), `path` (opcional: o arquivo que define o `symbol`, **relativo à raiz do repositório da plataforma**, `/` como separador, sem `.`, `..` nem linha; preencha quando o arquivo for conhecido porque você o viu, nunca invente), `params` (chave do campo → nome do parâmetro; só o que é passado), `values` (só campos `enum`; valor do mapping → valor no código), `notes` (orientação curta para quem implementa).
- **Nunca crie um campo `codeRef`** (nem outro campo para guardar onde a instância foi implementada): esse tipo saiu do formato. A especialização guarda só o que ajuda a **gerar** o código (`symbol`, `path`, `params`, `values`, `notes`), não referência ao código gerado. Ao revisar ou atualizar uma especialização que tem um campo `"type": "codeRef"`, **remova o campo** (e as chaves de `params` que o citam), suba a `version` e registre a remoção na entrega; o validador o aceita só por compatibilidade, com o aviso `ignored-field`.
- Nome de plataforma, linguagem ou framework só aparece dentro de `platforms` e `code`. O resto da especialização descreve o domínio, não a tecnologia.

### 7. Origens (`formatVersion` 3)

- `sources` no tipo: `{ system, id?, name? }`, ao menos `id` ou `name`; o `id` é mais forte que o `name`, então prefira os dois quando a origem der. Um tipo pode corresponder a vários elementos (variantes antiga e nova).
- `sources` no campo ou coluna: `{ system, name, values? }`, com `values` só em `enum` e cada destino existindo em `options`.
- `system`, `id` e `name` são comparados exatamente, maiúsculas contam: copie da origem, não digite de memória.

### 8. Versão

- `formatVersion` é a **mínima** para o que a especialização usa: 1 sem plataformas e sem `code`; 2 com qualquer deles; 3 com `sources`. Uma versão maior que o necessário impede a importação em apps antigas sem ganho.
- `version` é inteiro ≥ 1. Especialização nova: `1`. Atualização de uma já aplicada: um a mais que a aplicada (`update_specialization` exige versão maior). Nunca mude o `id` numa atualização: ele é a identidade.

## Validar antes de entregar

A validação é a mesma da importação da app, com o caminho exato do erro (`layers[0].annotationTypes[2].fields[1].default: …`). Rode, corrija o trecho apontado, rode de novo, até **zero erros**. Para cada **aviso** (plataforma declarada e não usada, tipo sem `code` numa especialização com plataformas, `format` antigo), ou corrija ou explique na entrega por que fica; o aviso `ignored-field` (campo `codeRef`) sempre se corrige, removendo o campo.

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

Além do validador, releia o arquivo com estas perguntas: cada tipo do inventário está lá, ou está listado como fora de escopo? Algum tipo entrou sem evidência na origem? Toda `description` diz algo que o nome não diz? Os `symbol` de `code` existem mesmo, e cada `path` aponta para o arquivo que os define?

## Entrega

1. O arquivo JSON no caminho combinado, formatado com dois espaços, chaves na ordem do exemplo comentado de `docs/SPEC-FORMAT.md` (`format`, `formatVersion`, `id`, `name`, `version`, `description`, `platforms`, `layers`).
2. Um resumo curto, nesta ordem:
   - uma tabela camada → tipos, com a evidência de origem de cada tipo;
   - as decisões de modelagem que não estavam no prompt (campo obrigatório ou não, o que ficou fora, etiquetas novas);
   - as dúvidas abertas, cada uma com a opção escolhida e a alternativa;
   - o resultado da validação (zero erros; avisos e o que foi feito com cada um).

Não aplique a especialização a um projeto nem crie proposta, a menos que o prompt peça. Aplicar muda o projeto da pessoa; ela decide quando.

## Armadilhas frequentes

- Camada por módulo do código em vez de por natureza: os eventos acabam na mesma camada dos componentes e `allowedChildren` não valida.
- `id` de tipo repetido em camadas diferentes (`button` em Componentes e `button` em Telas): o id é único na especialização inteira.
- Booleano como `string` com `default: "true"`: use `enum`.
- `default` fora de `options`, ou `default` em `ref`.
- Campo `codeRef` (onde foi implementado): saiu do formato; remova.
- `requiresOwner: true` sem nenhum tipo listando o filho em `allowedChildren`.
- `code` referindo plataforma não declarada, ou `params` com chave que não é campo do tipo.
- `sources[].values` em campo que não é `enum`, ou destino que não está em `options`.
- `formatVersion` 3 numa especialização sem `sources`, só "para garantir".
- Nome de framework fora de `platforms`/`code`, ou especialização citando outra pelo nome.

## Prompt que invoca esta skill

O prompt só precisa especificar. Modelo:

> /spec-author
>
> Especialização **`<id>`** ("<Nome>") para o Mapping, `formatVersion` <1|2|3>.
>
> **Origem:** <repositório, pasta ou design system>, lendo <o que ler: pasta dos componentes, catálogo exportado, documento>. Ignore <o que ignorar>.
>
> **Plataformas:** <`id` → nome, linguagem>, <…>. (Omitir na `formatVersion` 1.)
>
> **Origem externa:** `system` = <nome exato>, ids/nomes em <onde pegar>. (Só na `formatVersion` 3.)
>
> **Fora:** <o que não modelar>.
>
> **Grave em:** <caminho>. Não aplique a nenhum projeto.

Quando a especialização é uma **atualização** de uma já aplicada, o prompt diz qual (`get_specialization` dá o JSON atual) e o que muda; mantenha o `id`, suba a `version` e preserve ids de tipo e `key` de campo existentes, porque anotações já criadas apontam para eles.
