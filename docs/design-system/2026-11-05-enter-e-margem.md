# Enter grava o campo longo e Envolver com margem exata — 2026-11-05 (épico `epic/enter-e-margem`)

## Sincronização

Nada foi gravado no artefato nesta sessão (o fechamento rodou sem acesso de escrita ao artefato **Mapping**). A EM1 (modelo e MCP) e a EM3 (foco do editor) não mudam tamanho, token, ícone nem anatomia. O único impacto é o da EM2, descrito abaixo.

## Ficou sem gravar

- **`TextField`:** o `TextArea` do `StringEditor` (campo `string` aberto em várias linhas pelo comprimento) passa a gravar com Enter enquanto o texto não tem quebra de linha; Shift+Enter quebra a linha, e com uma quebra no texto o Enter quebra. Depois do Enter que grava, o foco fica no campo, e passa ao campo novo (com o cursor no fim) quando o editor muda de uma linha para várias ou o contrário. Documentar a variante no `TextField` do artefato (EM2 e EM3).
