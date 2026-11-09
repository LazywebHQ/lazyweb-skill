---
name: lazyweb-growth-experiments
route: "Deprecated alias for experiment research"
router-terms: growth experiments, a/b tests
router-exclude: true
description: Deprecated name for /lazyweb-growth-experiments. Use /lazyweb-search-experiments instead.
---

# Lazyweb Growth Experiments (deprecated alias)

Use the MCP surface advertised by the client. When it exposes
`lazyweb_discover_tools` and `lazyweb_execute`, discover each action's live
schema, then call `await tools.NAME(args)` inside `lazyweb_execute` and check
its returned `isError`. If actions are advertised directly, call them directly.
Missing individual names in `tools/list` does not mean MCP is unavailable.


Use `/lazyweb-search-experiments` and the canonical
`lazyweb_search_experiments` tool. If MCP is unavailable, run
`curl -fsSL https://www.lazyweb.com/install.sh | bash` and call
`lazyweb_health`.
