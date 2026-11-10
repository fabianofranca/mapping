# CI verde lido certo e coordenador com despertador — [Não lançado] (épico `epic/ci-verde-e-espera`, PR #0, MCP 0.30.0 sem mudança, schema v18)

## Alterado

- Editar um PR (título, corpo ou base) deixa de rodar o CI, e a execução toda `skipped` do mesmo commit deixa de aparecer. Para quem conduz o fluxo: não se troca a base de um PR aberto; com a base errada, abra um PR novo com a base certa (o `opened` roda o CI) e feche o antigo, sem reabrir e sem commit vazio.
- A regra do CI verde fica num texto só, a **Leitura do CI** do item 6 da "Para a sessão da fase" (`docs/FLOW.md`): `check`, `e2e` e, no PR de épico, `epic` em `success`, nada `queued` ou `in_progress`, nenhuma falha, só o workflow CI, só o commit atual; o subagente do Merge aponta para ela. A fase e a correção mesclam o próprio PR no épico, e o coordenador ganha um `send_later` por PR que espera por ele e passa a registrar no `log`, no mesmo turno, o aviso que chega no meio de outro ciclo. Os resumos do `FLOW.md` (`Depende de`, `paralelo=N` e a conferência de hora em hora) foram corrigidos.
