# Child notices follow the coordinator through every switch — [Não lançado] (épico `epic/queue-child-notice-target`, PR #0, MCP unchanged, schema v23)

## Corrigido

- A child session's final notice now reaches the current queue coordinator, however many times it was replaced since the child was created (#2704). The old coordinator writes `replaced by <new id>` in its own title when it hands over, the phase, fix and tester sessions read the title of the id they hold before every message to the coordinator and follow the pointer (up to 8 hops), and the new coordinator archives its predecessor only when it is no longer working, so a notice still being forwarded is not lost.
