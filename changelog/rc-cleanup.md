# MCP release candidates cleaned up by ancestry — [Não lançado] (épico `epic/rc-cleanup`, PR #3134, MCP unchanged 0.73.1, schema v26)

## Corrigido

- `mcp-release.yml` deletes the release candidates (`mcp-v<x.y.z>-rc.<n>`, release and tag) in their own job, on every push to `main`, also when the push publishes no new version. An rc goes when its commit is already in `main`, whatever its version, so the rcs of an epic that closed with another version no longer stay on the Releases page; the rc of an epic still open stays for the tester.
