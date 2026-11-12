# Passagem de contexto e painel da fila — [Não lançado] (épico `epic/passagem-e-painel`, PR #0, MCP 0.38.0 sem mudança, schema v19)

## Alterado

- Painel da fila: a etapa exclusiva começada e ainda não mesclada continua segurando a fila em qualquer estado, e o motivo das candidatas agora diz o estado real (`exclusiva #N falhou`, `exclusiva #N esperando dono`, `exclusiva #N aguardando`; `em andamento` como antes). A saída é só do dono: com a ordem dele no chat da fila, o coordenador grava `row '#N' exclusive=` e o `log` "exclusiva #N liberada pelo dono" (`painel.py` e "Paralelo" do skill `implementar-fila`).
- Troca de sessão do coordenador: na sessão nova, logo depois de baixar os três arquivos do painel e antes do `show`, roda-se `painel.py published <pasta> --done`. A cópia publicada traz o `publishing` do envio que deu certo, e sem esse passo o `show` dizia "não publicado" sem haver pendência (skill `implementar-fila`, "Troca de sessão" e "Painel").
