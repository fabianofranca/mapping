# ContainerDialog

Diálogo **Novo container** (`src/ui/ContainerDialog.tsx`, formulário em `src/ui/containerForm.ts`), aberto pelo botão Novo container da barra. Cria um container sem arquivo de imagem no centro da vista. `Dialog` `size="sm"` (480 px).

## O que o desenho mostra

A moldura do diálogo: cartão `color-surface` com borda, raio 8 e sombra de popup; cabeçalho de 44 px com o `titulo` e o fechar; o corpo (slot *Formulário*, 16 px de margem e 12 px entre os campos, `.container-form`); o rodapé com a divisória de cima.

## Filhos esperados

- O texto de apoio (Texto `muted`, parágrafo).
- **Nome** (TextField), **Tamanho predefinido** (Select: Personalizado, Tamanho da seleção e os tamanhos prontos das especializações), **Largura** e **Altura** lado a lado (TextField, 8 px entre eles) e **Cor de fundo** (TextField), cada um com o rótulo como Texto `t-small` `muted`.
- A dica *No formato #RRGGBB.* (Texto `muted`) e, depois de um erro, a mensagem `.field-error` (Texto `danger`); o campo com erro fica `invalido`.
- No rodapé: **Cancelar** e **Criar container** (Button `primary`).

## O que fica de fora

O fundo escurecido (`color-backdrop`), o foco e o hover dos botões não são desenhados.
