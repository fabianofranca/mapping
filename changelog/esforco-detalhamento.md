# Esforço high no detalhamento — [Não lançado] (épico `epic/esforco-detalhamento`, PR #1161, MCP 0.28.6, schema v18)

## Alterado

- `/detalhar-backlog`: a unidade cujo detalhamento pede esforço high (schema ou formato, gravação do `mapping.json`, arquitetura transversal, plano grande) é perguntada ao dono, e o recomendado é o skill entregar um prompt pronto para ele abrir a sessão em Opus e esforço high, porque a sessão filha não escolhe o esforço. A sessão aberta avisa o coordenador ao começar e ao terminar. Argumento novo: `alto=#a,#b` força high nessas issues, e `alto=nenhum` desliga a regra.
