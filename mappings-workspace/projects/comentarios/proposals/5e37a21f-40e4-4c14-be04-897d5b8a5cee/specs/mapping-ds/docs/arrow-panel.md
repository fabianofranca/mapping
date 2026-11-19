# ArrowPanel

Os Detalhes da seta selecionada (`src/ui/ArrowPanel.tsx`, o mesmo `.panel-details` do MarkingPanel). Sem fundo nem borda no app: a marcação só agrupa os filhos.

- **Identidade**: como a da marcação, com o nome da seta (Texto `t-title`, que quebra o ID e a trava para a linha de baixo quando é longo) e o "Liga A a B" (Texto `t-small` `muted`).
- **Seção Seta** (PropertyGrid): Nome (TextField `sm`), Origem e Destino (Button `ghost` `sm`, que seleciona a ponta) e Estilo (Segmented Reta, Curva, Canto).
- **Anotações** (LayerGroup por camada; os tipos com `appliesTo` `arrow`), **Conversas** e o Button **Excluir seta** (`danger`).
