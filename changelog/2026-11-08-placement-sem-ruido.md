# Placement sem ruído — 2026-11-08 (épico `epic/placement-sem-ruido`, PR #978, MCP 0.28.4, schema v18)

## Corrigido

- O `mapping.json` não grava mais posições de container como `275.00000000000006`: ao mover, redimensionar, criar ou trocar a imagem de um container (pela app ou pelo MCP, `add_container` e `update_container`), um valor a menos de 1e-6 de um inteiro é gravado como o inteiro. A fração de verdade (arrasto com zoom) continua. Arquivos já gravados com ruído não são reescritos: o ruído some quando o container for editado.
