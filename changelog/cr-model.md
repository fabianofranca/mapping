# CR do modelo — [Não lançado] (épico `epic/cr-model`, PR #1191, MCP 0.28.11, schema v18)

## Corrigido

- Reenviar o mesmo `container` e o mesmo `rect` de uma marcação trancada (`update_marking`, reexportação completa) deixa de dar `locked`: repetir o espaço atual não é mudança, como já era com o `rect` sozinho.
- Um id de container não pode mais ser reusado por uma marcação, uma seta ou o envolver de itens (nem o de uma marcação ou seta por um container): antes os dois passavam e o projeto ficava com dois itens de mesmo id.
- O diálogo de exclusão de uma seleção passa a contar também as marcações trancadas que estão selecionadas e saem junto com a mãe ou o container selecionados: ele diz tudo o que apaga.
