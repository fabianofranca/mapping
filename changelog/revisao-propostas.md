# Revisão de propostas — [Não lançado] (épico `epic/revisao-propostas`, PR #1158, MCP 0.28.8, schema v18)

## Adicionado

## Alterado

## Corrigido

- Revisão de propostas: remover uma imagem deixou de aparecer como conflito falso quando a proposta é lida do disco (o `parentId`, derivado da geometria, não entra mais na comparação).
- Atualizar uma especialização cuja camada some (as anotações tipadas dela viram livres) deixou de ser anunciada como "aditiva": a janela mostra as camadas que viram livres e o `plan_library_update` devolve `additive: false` com a `hint` de confirmar com a pessoa.
- Visão Proposto: depois de um `revise_proposal` na revisão aberta, os componentes e as fontes do pacote proposto são relidos e registrados de novo, sem fechar e reabrir a revisão (MCP 0.28.8).
- Revisão de propostas, árvore dos níveis: Enter, Espaço e as setas nos botões ✓/✕ de uma linha agora decidem (ou nada fazem) sem mover a seleção nem o foco; as teclas da árvore só valem com o foco nela.
- Revisão de propostas: o leitor de tela anuncia a linha selecionada da árvore (`aria-activedescendant`, com posição e total do nível, também na lista virtualizada).
- Revisão de propostas: "Aceitar as N que faltam" e "Rejeitar as N que causam" decidem tudo numa gravação só, e o Desfazer do aviso devolve todas ao estado anterior; um erro é relatado uma vez.
- Revisão de propostas, comparação de imagem no modo Deslizar: a alça anuncia "{N}% do antes" (era "do depois", que contradizia o recorte); `Home` mostra só o depois e `End` só o antes. O modo Sobrepor continua "do depois".
- Revisão de propostas: o aviso "O agente revisou…" (e o de proposta alterada) deixou de ficar na tela depois de abrir a revisão pela janela Propostas; abrir a revisão tira da fila todos os avisos daquela proposta.
- Revisão de propostas: o título dos Detalhes não quebra mais no meio da palavra a 900×720 (os botões descem para a linha de baixo).
- Revisão de propostas, comparação de imagem no modo Deslizar: a alça aparece inteira com a divisória em 0% e em 100%, em vez de cortada pela metade.
- Revisão de propostas: o aviso "Aplicar bloqueado" por marcação sem imagem diz "depende de uma imagem que não está no projeto", sem o código interno.
- Revisão de propostas: a coluna Resumo da lista mostra os três contadores inteiros a 900×720 (a coluna do nome cede espaço).
- Revisão de propostas, diálogo Comparar: "Aceitar a troca" e "Rejeitar a troca" ficam no rodapé fixo do diálogo, sem precisar rolar o corpo.
