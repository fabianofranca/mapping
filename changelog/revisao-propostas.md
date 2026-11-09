# Revisão de propostas — [Não lançado] (épico `epic/revisao-propostas`, PR #1158, MCP 0.28.8, schema v18)

## Adicionado

## Alterado

## Corrigido

- Revisão de propostas: remover uma imagem deixou de aparecer como conflito falso quando a proposta é lida do disco (o `parentId`, derivado da geometria, não entra mais na comparação).
- Atualizar uma especialização cuja camada some (as anotações tipadas dela viram livres) deixou de ser anunciada como "aditiva": a janela mostra as camadas que viram livres e o `plan_library_update` devolve `additive: false` com a `hint` de confirmar com a pessoa.
- Visão Proposto: depois de um `revise_proposal` na revisão aberta, os componentes e as fontes do pacote proposto são relidos e registrados de novo, sem fechar e reabrir a revisão (MCP 0.28.8).
