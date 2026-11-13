# Rótulo do Carousel legível e roteiros alinhados — 2026-11-13 (épico `epic/rotulo-carousel-roteiros`, PR #1828, MCP 0.39.1 sem mudança, schema v19)

## Alterado

- Biblioteca `material3-compose` (versão 13, aditiva, sem migração): o véu sob o rótulo do `carousel` passa a ser um degradê de baixo para cima, de `scrim` com `alpha` 0,55 (sólido nos 36 px de baixo, onde fica a linha do rótulo) a 0 no topo. O 0,55 é escolha da biblioteca, não do Compose. O desenho de todo carrossel com rótulo muda; nenhum campo muda.
- Para quem conduz os testes: os comandos `%@` de uma linha do R17 (R17.19, R17.21, R17.41 e R17.42) levam uma borda preta de 1 px e os esperados acompanham o ImageMagick 6.9.12 (o da nuvem); o R17.42 cita o reservado certo da app (`CCC8CE` no claro e `48474C` no escuro); o R10.13 passa a esperar o que a Galeria mostra (a moldura rola até o **Perfil**); o R3, o R9.23 e o A18 seguem a versão nova (cadeia `mat-v14` a `mat-v17`).

## Corrigido

- O rótulo do Carousel da Material 3 fica legível sobre o reservado da imagem (contraste de pelo menos 4,5:1, antes cerca de 1,6:1), na app, no Catálogo e no PNG do MCP (que agora mostra o véu, uma faixa sólida de 0,55).
- Roteiro novo R17.47: confere o rótulo legível no PNG do `render_marking` (`575658`) e na app (`202022`), com o contraste calculado.
- A tabela **Campos** do Catálogo (diálogo de 820 px) cabe sem rolar na horizontal: a coluna Rótulo quebra entre palavras e a Descrição deixa de ser cortada, com "enum" e nomes como `preferredItemWidth` inteiros.
