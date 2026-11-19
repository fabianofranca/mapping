# InconsistentProjectDialog

Diálogo **Projeto com dados inconsistentes** (`src/ui/InconsistentProjectDialog.tsx`), aberto pela tela inicial (`src/app/Home.tsx`) quando a abertura de um projeto é recusada por dados que quebram as invariantes (pai inexistente, retângulo fora da imagem, id repetido…). `Dialog` `size="md"` (560 px).

## O que o desenho mostra

A moldura: cartão `color-surface` com borda, raio 8 e sombra de popup; cabeçalho de 44 px com o `titulo` e o fechar; o corpo (slot *Conteúdo*, 16 px de margem); o rodapé com a divisória de cima.

## Filhos esperados

- O resumo (Texto, parágrafo): quantos problemas e se todos têm reparo automático.
- **Problemas** (Texto `t-title`) e uma linha por problema (Texto, parágrafo, com o marcador da lista como Texto), por exemplo *Marcação "Nome" (id): pai inexistente (id)*.
- Com reparo: **O que o reparo faz** e uma linha por reparo (*vira raiz da imagem*, *recortada aos limites da imagem*…).
- No rodapé: o estado da cópia (Texto `t-small` `muted`, *Lista copiada.*), **Copiar**, **Fechar** e, com reparo, **Reparar e abrir** (Button `primary`).

## O que fica de fora

O fundo escurecido (`color-backdrop`), o foco e o hover dos botões não são desenhados.
