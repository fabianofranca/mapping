# Exemplos enxutos — 2026-11-02 (épico `epic/exemplos-enxutos`, PR #273, MCP 0.12.0, schema v13)

## Adicionado

- Todo recurso dos formatos de especialização e de componente tem um exemplo, de preferência nas bibliotecas prontas de `libraries/`; um teste (`tests/examples/featureCoverage.test.ts`) quebra se um recurso novo do schema ficar sem exemplo. A única exceção é `fonts[].style` (`italic` e `normal`): a fonte é fixa no cliente mobile, fora do SDUI.
- Biblioteca de exemplo **SDUI do backend** (`examples/libraries/sdui-backend/`, 6 tipos e 5 componentes): um sistema externo fictício que descreve telas, com a origem executável (`origins`, `sources`, a tela de exemplo na galeria) e `migrations`. O roteiro R10 ganhou os passos da origem.
- `examples/README.md`: guia dos exemplos, com uma seção para cada biblioteca de `libraries/` e cada exemplo de `examples/`, os roteiros que os usam e a tabela "Onde ver cada recurso"; um teste exige uma seção por exemplo no disco.

## Alterado

- O projeto de exemplo (`examples/exemplo-completo.zip`), o guia interativo, o `proposta-componentes.zip` e os roteiros (R3, R9, R10, R12, R13 e R15) usam a biblioteca **Material 3 (Compose)** no lugar do pacote antigo de 15 tipos. O zip do projeto de exemplo cresceu (289.104 bytes, eram 64.988).
- O botão **Abrir projeto de exemplo** e o zip embutido saíram da app, porque embutir o zip levaria o `dist/index.html` a 1.868.223 bytes, acima do orçamento de 1,5 MiB: a Ajuda e o guia orientam a baixar `examples/exemplo-completo.zip` do repositório e abri-lo como zip.
- `examples/libraries/` ficou só com a `analytics` e a `sdui-backend`; saíram a `material3` de 15 tipos, a `pessoas` e `examples/specs/biblioteca.json`, e o gerador (`npm run build:examples`). Os testes passaram a ler cópias congeladas em `tests/fixtures/`.
- Roteiro R8.1b passou a abrir a própria cópia da Loja pelo `proposta-exemplo.zip`, sem depender do R4; textos dos roteiros R9, R10, R13 e R15 corrigidos pelas duas rodadas do Cowork.

## Corrigido

- Diagnóstico › Imagens remotas: quando a mesma URL muda de situação (de "endereço não aceito" a "origem sem permissão" e a "não carregou"), a linha troca a razão no lugar, em vez de ficar com a razão antiga.
- O editor de texto de várias linhas tira a quebra de linha do fim ao gravar: a `url` de uma imagem remota deixa de ir ao `mapping.json` com `\n` quando se confirma com Enter.
