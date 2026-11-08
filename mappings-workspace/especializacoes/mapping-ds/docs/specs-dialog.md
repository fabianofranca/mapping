# SpecsDialog

Diálogo **Especializações** (`src/ui/SpecsDialog.tsx`, importação de pacote em `src/ui/specPackageImport.ts`): aplicar, atualizar e remover as especializações do projeto. `Dialog` `size="md"` (`size-dialog-md` 560 px). O mesmo componente abre os diálogos de cada etapa, por cima dele, com a mesma moldura e outro `titulo`: **Pacote "…"** (revisão de um pacote lido), **Atualizar "…"?** (arquivo único), **Remover "…"?** e os avisos (*Arquivo de especialização inválido*, *Nada a fazer*).

## O que o desenho mostra

A moldura: cartão `color-surface` com borda, raio 8 e sombra de popup; cabeçalho de 44 px com o `titulo` e o fechar; o corpo (slot *Conteúdo*, 16 px de margem e de espaço entre os blocos); o rodapé com a divisória de cima.

## Filhos esperados

- Os textos de apoio (Texto `muted`) e o resultado da última operação (`.notice`: Caixa `success-bg` ou `danger-bg` e Texto).
- A fileira **Aplicar especialização…** (Button `primary`), **Aplicar pasta…** e **Aplicar zip…**.
- Uma Caixa por especialização aplicada (`.spec-item`: borda `color-border`, raio 8) com o nome (Texto `t-body-strong`), a versão e as camadas (Texto `muted`), as plataformas (Texto `t-small`, o marcador, o link do repositório sublinhado em `accent` e a referência) e os botões **Atualizar versão…**, **Atualizar de pasta…**, **Atualizar de zip…** e **Remover** (Button `danger`).
- Na revisão de um pacote: o resumo, o UpdateImpact (numa atualização), a contagem de erros e avisos e o LibraryIssueList; no rodapé, **Cancelar** e **Atualizar** ou **Aplicar** (desabilitado com erros).
- No rodapé da lista: **Fechar**.

## O que fica de fora

O fundo escurecido (`color-backdrop`), o foco e o hover dos botões não são desenhados. O diálogo de baixo, quando outro abre por cima, é outro container.
