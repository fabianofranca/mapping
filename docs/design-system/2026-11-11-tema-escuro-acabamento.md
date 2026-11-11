# Tema escuro e acabamentos — 2026-11-11 (épico `epic/tema-escuro-acabamento`)

## Pendências

- **`Container`:** o título do container ganha contorno da cor da superfície (`--color-surface`, espessura de 2 px de tela), para se ler sobre a imagem de qualquer raiz nos dois temas. Sem token novo.
- **`Canvas.md`:** o selo de chegada ("Veio de…") fica invertido, como a dica: caixa `--color-text` e rótulo `--color-surface` (escura no claro, clara no escuro). Contorno, raio e medidas não mudam.
- **Campo e célula `ref` (`.ref-control`):** a referência quebrada quebra entre palavras (`overflow-wrap: break-word` e `min-width: min-content` na célula quebrada), sem partir "referência".
- **`Home`:** a descrição dos botões das linhas recentes (`aria-describedby`) traz o último uso com segundos, num texto só para o leitor de tela. Sem mudança visível.

## Sincronização

Gravado no artefato **Mapping** em 2026-11-11: versão 80 (`1794364519-6f16`). Texto dos guias, nos arquivos `project/Canvas.md` (título do container com contorno de `color-surface`; selo "Veio de…" invertido, `color-text` com rótulo `color-surface`, e a linha de tokens de revisão e chegadas), `components/Container/README.md` (contorno do título), `components/RefCell/README.md` e `components/ReferenceField/README.md` (a referência quebrada quebra com `overflow-wrap: break-word`; na célula, `min-width: min-content`) e `components/Home/README.md` (descrição dos botões das linhas recentes com segundos, só para o leitor de tela). Índice `project/design-system.json` lido logo antes e gravado por último, com `lastChange`. Nenhum token, ícone nem arquivo foi acrescentado ou apagado; `tokens.json` não mudou (nenhum token novo).

## Ficou sem gravar

- **Previews de `Container`, `Home`, `RefCell` e `ReferenceField`:** os `preview.html` não foram regenerados para mostrar o título com contorno, a célula quebrada a 900 px e a linha de recentes. **Motivo:** o preview de cada um é uma rendição estática (Konva fora do jsdom, e HTML renderizado de 12 a 50 KB) que só se refaz abrindo a app e conferindo os dois temas num navegador; o fechamento não tem navegador e a decisão de 2026-11-02 manteve os previews como estão quando a mudança é só de comportamento.
- **Preview do selo "Veio de…" (`Canvas.md`):** nenhum preview mostra o selo invertido. **Motivo:** o selo é desenhado só no Konva e não há componente do DS para ele (o guia `Canvas.md` o descreve); criar um preview novo está fora do escopo do fechamento.
