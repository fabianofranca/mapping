# CR do modelo — [Não lançado] (épico `epic/cr-model`, PR #1191, MCP 0.28.12, schema v18)

## Alterado

- Uma especialização com uma chave desconhecida em `tokens` (além de `modes` e `values`) passa a ser recusada, com o erro `chave desconhecida: <chave>` no caminho dela; antes a chave a mais passava em silêncio. A `formatVersion` continua 15.
- Um tipo com `requiresOwner` cujo único dono possível é ele mesmo (na `formatVersion` 13, que aceita filhos da própria camada) passa a ser recusado, com o erro `nenhum outro tipo o aceita como filho`, no caminho `…requiresOwner`: nenhuma anotação poderia ser a dona. Uma biblioteca que passava assim antes pode ser recusada agora.
- Uma biblioteca que cita componente, fonte, ícones ou `componentPaths` com `..` saindo da pasta do pacote passa a ter o problema `caminho fora da biblioteca: <ref>`, no caminho de quem cita; antes o `..` era descartado em silêncio
- Uma raiz de `origins` com `margin` e sem `anchor` passa a ser recusada (`margin só vale com anchor`, no caminho `margin` da raiz); antes passava

## Corrigido

- O rótulo de uma instância nunca mostra `[object Object]`: valor de tabela conta como vazio e cai no nome do tipo
- Duas especializações com o mesmo `system` na importação de medidas (`measured`) usam cada uma os próprios `booleans`
- A tradução de um JSON externo sem `system` usa a primeira origem `tree`; só com origens `measured`, o erro manda passar o `system`
- O `padding` de um trecho de `runs` aceita `$token` de número, como o doc já dizia
- Um `slot` dentro de `repeat` aninhado deixa de ser reportado duas vezes
- Atualizar uma biblioteca com um passo `map-values` que mapeia um valor para ele mesmo, ou um `rename-field` com o mesmo nome nos dois lados, deixa de contar valores e anotações como alterados no relatório da migração.
- O aviso `path-without-repo` (plataforma com `path` e sem `repo`) passa a contar também o `path` dos casos de `variants.cases`.

- Um rótulo de citação com `*`, `_` ou crase (`a*b*c`) volta igual ao ser relido do texto da conversa: antes os marcadores eram lidos como ênfase e sumiam.
- Citar uma proposta apagada (`p/botoes`) deixa de apontar para outra proposta de id parecido (`botoes-2`): a citação de proposta só resolve pelo id exato.
- Colar `**mapping://…**` (ou com `_`, crase ou `~~` em volta) no compositor das conversas vira o chip normalmente, sem levar os marcadores para dentro do endereço.
- Uma lista de markdown cujo primeiro item é recuado e seguido de itens sem recuo (`  - a` e `- b`) fica numa lista só, em vez de duas.
- Duas cópias de uma conversa com as mesmas mensagens passam a seguir a cópia de maior `revision`: uma reabertura interrompida (aberta na `revision` 6, resolvida na 5) fica aberta, em vez de voltar a resolvida.
- O assunto da conversa mostra o rótulo vivo de uma citação como ele é (`__init__` não vira `init`).
- Reenviar o mesmo `container` e o mesmo `rect` de uma marcação trancada (`update_marking`, reexportação completa) deixa de dar `locked`: repetir o espaço atual não é mudança, como já era com o `rect` sozinho.
- Um id de container não pode mais ser reusado por uma marcação, uma seta ou o envolver de itens (nem o de uma marcação ou seta por um container): antes os dois passavam e o projeto ficava com dois itens de mesmo id.
- O diálogo de exclusão de uma seleção passa a contar também as marcações trancadas que estão selecionadas e saem junto com a mãe ou o container selecionados: ele diz tudo o que apaga.
- Um link de arquivo de código cujo `urlTemplate` tem `{line}` na query e no fragmento deixa de sobrar `{line}` literal: os dois saem.
- Imagens remotas de hosts `.home.arpa`, `.lan` e `.intranet` passam a ser tratadas como rede local (recusadas com o interruptor desligado), como `.local` e `.internal`.
- Um `mapping.json` mais novo que a v10 ou a v12, editado à mão com `urlTemplate` em `platformRepos` ou `inherit` numa anotação, deixa de ganhar o aviso de dados descartados na migração.
- Uma anotação removida numa proposta anterior à v14 (sem `parentRole` no valor de antes) deixa de aparecer como conflito falso na revisão: `parentRole` ausente vale `null`, dos dois lados.
- Uma anotação tipada com um campo chamado `toString` (ou outro nome herdado de `Object.prototype`) ausente deixa de derrubar `computeChanges` e o `propose_changes` do MCP.
- Um componente com `$switch` num campo cujo valor é `toString`, `constructor` ou outro nome herdado de `Object.prototype` cai no `default`, em vez de devolver uma função.
- O `padding` do `layout` vindo de `$field` aceita texto numérico (`"16"`): texto não numérico vale 0 e o valor nunca fica abaixo de 0, como o `gap`.
- As reticências (`ellipsis`) de um texto cortado no meio de um emoji deixam de produzir um caractere quebrado: o corte é por ponto de código.
- Uma tela com raiz `fill` ancorada nunca fica com largura ou altura negativa.
- Num `layout` de tela, os filhos `fill` no eixo principal com `minSize` redistribuem o excedente (o tamanho final respeita o `minSize` e a soma cabe no pai), como na instanciação de um componente.
- Mover uma instância da tela uma posição para baixo (`moveSibling` com `delta` positivo) a coloca depois do irmão seguinte, em vez de pular outro.
