# CR do modelo — [Não lançado] (épico `epic/cr-model`, PR #1191, MCP 0.28.11, schema v18)

## Corrigido

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
