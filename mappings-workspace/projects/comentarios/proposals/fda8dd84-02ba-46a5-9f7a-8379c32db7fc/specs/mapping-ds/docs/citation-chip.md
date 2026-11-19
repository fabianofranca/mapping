# CitationChip

Chip de citação (`src/ui/comments/CitationChip.tsx`): o link `[nome](mapping://…)` de uma mensagem, mostrado com o nome **de agora** do alvo.

- Alvo existe: fundo `color-selection`, texto `color-accent`. Clicar leva ao alvo.
- `quebrada` `sim` (o alvo foi apagado): fundo `color-selection-muted`, texto cinza e **riscado**, com o rótulo de reserva.

Mede 22 px: a linha de 20 px mais a borda transparente de 1 px. No texto corrido o chip é `inline`; aqui ele é uma peça solta.
