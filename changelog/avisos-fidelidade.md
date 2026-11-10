# Avisos de fidelidade — [Não lançado] (épico `epic/avisos-fidelidade`, PR #1508, MCP 0.32.0, schema v18)

## Adicionado

- O `docs/SPEC-FORMAT.md` ganha a subseção "Avisos de fidelidade e origens do aviso": o critério do que vira aviso, o `ref` (o doc do tipo), o prefixo `<plataforma>: ` na `message`, as duas origens (gerado por ferramenta × curado à mão) e como a app mostra as duas (a mesma lista na janela Avisos; a origem só nos Detalhes).
- A skill `spec-author` e o `docs/AGENT-GUIDE.md` trazem a regra: passar cada diferença do doc pelo critério, ignorar os avisos com prefixo de outra plataforma e contar ao usuário o que for `diverges`.

## Alterado

- A regra de regravar avisos vale para a origem de cada um: a ferramenta regrava os do `ref` dela, e o aviso curado à mão só sai quando o autor revê o doc e a diferença sumiu (antes, os textos diziam para regravar todos a cada rodada).
