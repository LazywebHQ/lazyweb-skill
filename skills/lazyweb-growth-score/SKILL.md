---
name: lazyweb-growth-score
route: "Score a website or compare its progress"
router-terms: growth score, score website, website score, score change, compare scores
description: Score a website's growth readiness, create a new score, or compare progress over time.
allowed-tools:
  - Bash
---

# Lazyweb Growth Score

Use the MCP surface advertised by the client. When it exposes
`lazyweb_discover_tools` and `lazyweb_execute`, discover each action's live
schema, then call `await tools.NAME(args)` inside `lazyweb_execute` and check
its returned `isError`. If actions are advertised directly, call them directly.
Missing individual names in `tools/list` does not mean MCP is unavailable.


If Lazyweb MCP is unavailable, tell the user Lazyweb is not connected and point
them to https://www.lazyweb.com/mcp-install. Once it is connected, call
`lazyweb_health`.

Call `lazyweb_growth_score`; inspect its live schema first. Choose `get` for a
read, `generate` only when the user explicitly asks to create a score, and
`changes` for historical comparison. Pass up to ten websites in one batch.
Never turn a read, page open, or version mismatch into a regrade.

Pass `skill: "lazyweb-growth-score"` plus the installed VERSION/integrity tags.
Do not reproduce scoring rules in the skill.

On success, `open_url`, when provided, is the user's private link to the result:
open it once in the host browser. The link to give the user is the stable `url`,
with `share_url` when present.
