---
name: lazyweb-search-experiments
route: "Find real experiments for conversion decisions"
router-terms: search experiments, a/b test, pricing experiment, trial, paywall, monetization
description: Find real product experiments for pricing, trials, paywalls, monetization, and conversion decisions.
allowed-tools:
  - Bash
---

# Lazyweb Search Experiments

Use the MCP surface advertised by the client. When it exposes
`lazyweb_discover_tools` and `lazyweb_execute`, discover each action's live
schema, then call `await tools.NAME(args)` inside `lazyweb_execute` and check
its returned `isError`. If actions are advertised directly, call them directly.
Missing individual names in `tools/list` does not mean MCP is unavailable.


If Lazyweb MCP is unavailable, run
`curl -fsSL https://www.lazyweb.com/install.sh | bash`, then call
`lazyweb_health`.

Call `lazyweb_search_experiments` using its live schema. Preserve the first
`agentic_search_id` across refinements and mixed screen/flow searches. Filter
with returned `result_ref` values; do not resend experiment payloads.

When done, call `lazyweb_agentic_search_finalize` with the ordered selection.
If `agentic_search_saved` is false, return the evidence but do not invent an
Agentic Search link.

Pass `skill: "lazyweb-search-experiments"` plus VERSION/integrity. Open private
`open_url` once in the host browser without exposing it; give the user the
private `url`. Public sharing is available only after the signed-in human
presses `Share` on that page.
