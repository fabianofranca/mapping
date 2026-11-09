# CR da app, armazenamento, visualizador, scripts e CI — [Não lançado] (épico `epic/cr-app-infra`, PR #1287, MCP sem mudança, schema v18)

## Alterado

- Visualizador embutível (`mapping-viewer` 0.4.2): o pacote ficou ~52 kB menor (o Konva entra só com as formas usadas), `HostFonts` passou a ser exportado, o teto de pixel ratio é aplicado na criação do primeiro visualizador (não mais ao importar o módulo), as cores padrão do realce vêm dos tokens e o `dist-viewer/` é limpo antes de cada build (o aviso de licença do Konva fica no fim do bundle). `attachPinchZoom`, `freezeGroup` e `thawGroup`, código sem uso, saíram.
- `loadLibraryFromUrl` pede cada arquivo uma vez só e no máximo 6 por vez.

## Corrigido

- Soltar uma imagem e outro arquivo (que não é imagem) sobre uma imagem existente não troca mais a imagem: ela entra como imagem nova e o aviso dos arquivos ignorados aparece. A troca só acontece com exatamente um arquivo solto, a mesma regra do destaque ao arrastar.
- Colar uma imagem (Ctrl+V) com uma importação em andamento é ignorado, como o soltar; antes duas importações zeravam o progresso uma da outra.
- Ctrl+E com uma importação ou troca em andamento não exporta mais, como os botões.
- Ctrl+Shift+= (Ctrl++) aproxima o zoom do canvas, como Ctrl+=, em vez de cair no zoom do navegador.
- Com a app em inglês, o Diagnóstico mostra em inglês o estado das fontes (ausente, sem `FontFace`, falha ao carregar) e o problema "pacote grande demais para conferir".
- Ao exportar o zip de um projeto sem nome, o arquivo usa o nome padrão do idioma (`project.zip` em inglês).
- Ao importar imagens soltas na pasta do projeto, se a cópia para `images/` deu certo mas o original não pôde ser apagado, a imagem entra no projeto e a falha aparece no Diagnóstico (antes ela ficava duplicada e fora do projeto, sem aviso).
- Visualizador embutível: a tela que some e volta com o mesmo tamanho depois de o contêiner mudar é reenquadrada; o stage e `clientToScreen` descontam o padding e a borda do contêiner; o redimensionamento redesenha uma vez por quadro; com mais imagens remotas distintas na tela do que o cache guarda (64), o visualizador não recarrega mais as imagens em laço (as expulsas voltam ao reservado até a tela pedi-las de novo); e o invólucro React repassa `fonts`, `measure`, `selectionColor` e `hoverColor`.
