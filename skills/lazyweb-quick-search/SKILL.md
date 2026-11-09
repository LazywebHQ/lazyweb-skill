---
name: lazyweb-quick-search
route: "Deprecated alias for screen research"
router-terms: quick search, ui references
router-exclude: true
description: Deprecated name for /lazyweb-quick-search. Use /lazyweb-search-screens instead.
---

# Lazyweb Quick Search (deprecated alias)

Use the MCP surface advertised by the client. When it exposes
`lazyweb_discover_tools` and `lazyweb_execute`, discover each action's live
schema, then call `await tools.NAME(args)` inside `lazyweb_execute` and check
its returned `isError`. If actions are advertised directly, call them directly.
Missing individual names in `tools/list` does not mean MCP is unavailable.


Use `/lazyweb-search-screens` and the canonical `lazyweb_search_screens` tool.
If MCP is unavailable, run `curl -fsSL https://www.lazyweb.com/install.sh | bash`
and call `lazyweb_health`.
