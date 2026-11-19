# HelpDialog

Diálogo **Ajuda** (`src/ui/HelpDialog.tsx`), aberto pelo botão de ajuda da barra, por F1 ou pelas Configurações (direto na seção Atalhos). É um `Dialog` `size="lg"` (`size-dialog-lg` 820 × `size-dialog-lg-height` 640) com o corpo `flush` (sem margem nem rolagem própria).

## O que o desenho mostra

- O cartão: fundo `color-surface`, borda `color-border`, raio 8 e a sombra de popup.
- O cabeçalho de 44 px (`size-touch`, com a divisória) com o `titulo` (`t-title`) e o fechar.
- O corpo dividido pela divisória do índice: à esquerda o índice de 200 px (`size-help-nav`, `.help-side`), à direita o conteúdo que rola (`.help-content`, 16 px de margem).
- O rodapé: a divisória de cima e 52 px para o botão **Fechar**.

## Filhos esperados

- No índice: o campo **Buscar na ajuda** (TextField) e um Texto por assunto; o assunto atual tem a Caixa `selection` atrás (`aria-current`).
- No conteúdo: os títulos das seções (Texto `t-title`), os parágrafos e itens de lista (Texto, com o marcador como Texto), as teclas (`.kbd`, Caixa e Texto `t-kbd`), os blocos de código (Caixa `bg` e Texto `t-code`) e as linhas da tabela de atalhos (Caixa com a borda de cima).
- No rodapé: o Button **Fechar**.

## O que fica de fora

O fundo escurecido (`color-backdrop`), o foco e o hover dos botões não são desenhados. O conteúdo que passa da área visível (o resto da rolagem) não é desenhado.
