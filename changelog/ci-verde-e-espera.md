# CI verde lido certo e coordenador com despertador — [Não lançado] (épico `epic/ci-verde-e-espera`, PR #0, MCP 0.30.0 sem mudança, schema v18)

## Alterado

- Editar um PR (título, corpo ou base) deixa de rodar o CI, e a execução toda `skipped` do mesmo commit deixa de aparecer. Para quem conduz o fluxo: não se troca a base de um PR aberto; com a base errada, abra um PR novo com a base certa (o `opened` roda o CI) e feche o antigo, sem reabrir e sem commit vazio.
