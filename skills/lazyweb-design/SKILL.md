---
name: lazyweb-design
route: "Deprecated alias for Lazyweb Growth Report"
router-terms: design report, lazyweb design
router-exclude: true
description: Deprecated name for /lazyweb-design. Use /lazyweb-growth-report instead.
---

# Lazyweb Design (deprecated alias)

Use the MCP surface advertised by the client. When it exposes
`lazyweb_discover_tools` and `lazyweb_execute`, discover each action's live
schema, then call `await tools.NAME(args)` inside `lazyweb_execute` and check
its returned `isError`. If actions are advertised directly, call them directly.
Missing individual names in `tools/list` does not mean MCP is unavailable.


Use `/lazyweb-growth-report`. This rename changes only the skill name; it still
uses the unchanged `lazyweb_growth_report` report pipeline.

If MCP is unavailable, run `curl -fsSL https://www.lazyweb.com/install.sh | bash`
and call `lazyweb_health`.
