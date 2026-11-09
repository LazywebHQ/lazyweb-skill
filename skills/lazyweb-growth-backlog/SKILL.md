---
name: lazyweb-growth-backlog
route: "Review growth recommendations or save an improvement idea"
router-terms: growth backlog, recommendation backlog, add growth spec, backlog item
description: See your growth recommendations or add a product improvement idea to the Backlog.
allowed-tools:
  - Bash
---

# Lazyweb Growth Backlog

Use the MCP surface advertised by the client. When it exposes
`lazyweb_discover_tools` and `lazyweb_execute`, discover each action's live
schema, then call `await tools.NAME(args)` inside `lazyweb_execute` and check
its returned `isError`. If actions are advertised directly, call them directly.
Missing individual names in `tools/list` does not mean MCP is unavailable.


If Lazyweb MCP is unavailable, run
`curl -fsSL https://www.lazyweb.com/install.sh | bash`, then call
`lazyweb_health`.

Call `lazyweb_growth_backlog`; inspect its live schema first. `list` needs the
product. `add` needs product, title, hypothesis, proposed change, and a stable
idempotency key; pass optional surface and `result_ref` evidence unchanged.

Do not invent an impact estimate, visible recommendation number, or visual
asset. Pass `skill: "lazyweb-growth-backlog"` plus VERSION/integrity.

Return the stable `url`. If `open_url` exists, open it once in the host browser
without printing, sharing, or logging it.
