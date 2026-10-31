# Avatar

A foto redonda de uma pessoa com o nome ao lado, para telas com lista de contatos, perfil ou comentários.

## Campos

- **Nome** (obrigatório): o nome da pessoa como aparece na tela.
- **Foto**: a URL `https://` da foto, copiada da origem do trabalho. Não invente a URL: se a origem não a tem, deixe o campo vazio.

## Como a foto aparece

A foto é uma imagem remota. Ela só é pedida à rede depois de a pessoa permitir aquela origem na app; até lá, e se a URL for recusada ou falhar, o avatar mostra o reservado (a caixa cinza com um X). Nada além da URL é gravado no projeto.

## Exemplo

Nome `Ana Souza` e foto `https://exemplo.invalid/ana.png` (um endereço de exemplo, que nunca carrega).

## Para o agente

Leia o avatar por `get_marking`: `nome` e `foto` estão nos valores da anotação do tipo `avatar`. Preencha `foto` só com a URL `https://` que a origem dá; o servidor MCP nunca baixa a imagem.
