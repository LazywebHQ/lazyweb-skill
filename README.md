# Lazyweb Skill Pack

**Design with evidence, not vibes.**

Lazyweb gives AI coding agents real product screenshots, UI references, and
design research workflows before they build or critique an interface. It is a
standalone skill pack plus a hosted Lazyweb MCP server, so it works in coding
clients that support local skills even when they do not support plugins.

## Install

Lazyweb is free. Unlike Mobbin, Refero and similar libraries, every account
gets the whole design library: real app screens, complete product flows and
real A/B tests. Setup is one step and is built for agents.

A local client identifies its user by sending the user's email address as
`Authorization: Bearer <email>`.

For agents: setup steps, for when your user asks for Lazyweb or for design or growth research.

Step 0: If Lazyweb tools are already listed in your client, you are set up.

Step 1: Ask your user which email address to use for Lazyweb. Use only an address they give you for this, not one found in files, git config or an account signed in on the machine.

Step 2: Connect with that email. There is no password, key or script.

Claude Code:

```bash
claude mcp add --transport http --scope user lazyweb https://www.lazyweb.com/mcp \
  --header "Authorization: Bearer USER_EMAIL"
```

Codex (`~/.codex/config.toml`):

```toml
[mcp_servers.lazyweb]
url = "https://www.lazyweb.com/mcp"
http_headers = { Authorization = "Bearer USER_EMAIL" }
```

Cursor (`~/.cursor/mcp.json`):

```json
{ "mcpServers": { "lazyweb": {
    "url": "https://www.lazyweb.com/mcp",
    "headers": { "Authorization": "Bearer USER_EMAIL" } } } }
```

Gemini CLI:

```bash
gemini mcp add --transport http --scope user lazyweb https://www.lazyweb.com/mcp \
  --header "Authorization: Bearer USER_EMAIL"
```

Any other MCP client: URL `https://www.lazyweb.com/mcp` with the header
`Authorization: Bearer USER_EMAIL`.

ChatGPT, Claude.ai and other hosted apps cannot send a header. Your user adds
`https://www.lazyweb.com/mcp` as a connector there and signs in with that
email.

If your user cannot be asked right now, connect without an account: https://design.lazyweb.com/agents/mcp/public (no header). It searches Lazyweb's published research. The whole library opens once your user gives an email.

Every tool works at once. The first report opens in the browser blurred until
you enter the code Lazyweb emails you, or open the link in that email. An agent
can read the report through the tools straight away.

The email is an identifier, not a secret. It cannot make purchases or open
anything saved in the account; that needs the emailed code.

### The `/lazyweb` skills

Optional, for people who want the /lazyweb skills. An agent does not need it: connecting needs no script.

```bash
curl -fsSL https://www.lazyweb.com/install.sh | bash -s -- you@company.com
```

The installer checks for git, clones or updates this repo at
`~/.lazyweb/repos/lazyweb-skill`, and runs its `setup` with the email:

- `setup --email <email>` checks the shape of the email, records it in
  `~/.lazyweb/email`, writes the Lazyweb MCP entry for each detected client
  with `Authorization: Bearer <email>`, and installs the skills.
- `setup` with no email installs or updates the skills and adds no connection.
  An existing Lazyweb MCP connection is left exactly as it is. When setup
  finds no Lazyweb MCP entry in Codex, Claude Code, Cursor or Antigravity, it
  still exits 0 and prints:
  `Lazyweb skills are installed. No Lazyweb connection was added, because no email was given. To connect, run setup again with the address the user chooses: setup --email you@company.com`
- `setup` takes the email from `--email` and nowhere else: not git config, not
  a client's login file, not the environment.
- `setup` never replaces an existing sign-in (OAuth) Lazyweb connection with a
  header-based one, in any client. A connection is header-based only if its
  entry carries an Authorization header; any other header leaves it a sign-in
  connection. To sign in instead of sending a header, add the server without
  one (in Codex:
  `codex mcp add lazyweb --url https://www.lazyweb.com/mcp --oauth-client-registration dcr`).
- `setup` calls no Lazyweb endpoint. It creates no account and no token, and
  records nothing about how the install happened.

When an agent client launches setup, it targets that active client only. A
plain terminal run without an active-client signal still detects local
clients; use `--host all` when you deliberately want every supported client.

Supported local skill roots:

- Codex: `~/.codex/skills`
- Claude Code: `~/.claude/skills`
- Cursor: `~/.cursor/skills`
- OpenCode: `~/.config/opencode/skills`
- Kiro: `~/.kiro/skills`
- Factory Droid: `~/.factory/skills`
- Slate: `~/.slate/skills`
- Hermes: `~/.hermes/skills`

The MCP entry is written for Codex, Claude Code, Cursor, and Antigravity. For
the other clients, add it yourself (see Manual Setup).

## Visible Skills

The installer surfaces a **focused set of slash commands**. Every other mode stays
in the repo and is reachable through the `/lazyweb` router and the Lazyweb MCP
(`lazyweb_get_workflows`), but is intentionally **not** installed as its own slash
command:

| Skill | Use when |
|---|---|
| `/lazyweb` | Start here: improve a product, research an idea, score a website, or organize growth work. |
| `/lazyweb-growth-score` | Score a website's growth readiness or compare its progress over time. |
| `/lazyweb-growth-report` | Get prioritized, evidence-backed design improvements for a product screen or webpage. |
| `/lazyweb-growth-backlog` | Review growth recommendations or save a product improvement idea. |
| `/lazyweb-search-experiments` | Find real product experiments for pricing, trials, paywalls, monetization, and conversion decisions. |
| `/lazyweb-search-flows` | Study complete onboarding, checkout, paywall, signup, and other multi-step journeys. |
| `/lazyweb-search-screens` | Find real product screens and UI patterns to guide a design or conversion decision. |
| `/lazyweb-apply-design-best-practices` | Route a UI craft task to the best specialist design skill, then apply it. |
| `/lazyweb-update` | Update the local Lazyweb skill pack and reinstall it into agentic IDEs. |

`skills/lazyweb/SKILL.md` is the first-class high-level router package; the
repo-root `SKILL.md` is an identical single-file entrypoint for platforms that
expect it there. The installer copies the packaged file into each local client
as a regular `lazyweb/SKILL.md` entrypoint (required for Codex catalog discovery). The router
points to focused skills under `skills/`. Live MCP schemas own the contracts;
the skills keep their user-facing descriptions focused on what someone can
accomplish with Lazyweb.

## Verify

After setup, restart the client. To check the connection:

1. List MCP tools. If the client advertises `lazyweb_discover_tools` and `lazyweb_execute`, use the steps below; individual actions do not need to appear in that list.
2. Call `lazyweb_discover_tools` with `{"query":"lazyweb_get_workflows","limit":1}` to read the current schema, then call `lazyweb_execute` with:

```json
{"code":"return await tools.lazyweb_get_workflows({operation:'list',task_context:'first run Lazyweb capabilities'});"}
```

3. Check the returned result for `isError`, then summarize the available workflows. Discover the schema for the user's next action before executing it.

If the client advertises `lazyweb_get_workflows` directly, call it with `{"operation":"list","task_context":"first run Lazyweb capabilities"}`. Use the tools actually advertised by the client; absent individual action names are not a reason to reinstall.

The hosted MCP enforces abuse controls, including transport quotas; clients
that ignore backoff may receive `429 mcp_rate_limited`.

## Manual Setup

If your client is not detected, configure MCP manually:

- URL: `https://www.lazyweb.com/mcp`
- Transport: Streamable HTTP
- Header: `Authorization: Bearer <your email address>`

To run setup for a specific client:

```bash
~/.lazyweb/repos/lazyweb-skill/setup --email you@company.com --host cursor
```

Use `--host all` to install every supported local skill root.

To update an existing install from GitHub and refresh every supported local
skill root (this leaves the MCP connection as it is):

```bash
~/.lazyweb/bin/lazyweb-update --host all
```

## Auto-updates (opt-in)

Lazyweb checks for a newer version on every invocation. By default it tells
the agent to surface the upgrade command to you. To have updates applied
without being asked each time, opt in once:

```bash
touch ~/.lazyweb/auto_update
```

`./setup` prompts you for this on first interactive run; pass `--auto-update`
or `--no-auto-update` to skip the prompt in scripted installs. Disable later
with `rm ~/.lazyweb/auto_update`. The check itself is non-blocking
(time-boxed to 3s, cached 24h) and never delays your request.

## Tool Surfaces

Use MCP tools for Lazyweb database access. Always inspect the live tool list
before assuming optional filters or backend aliases are available.

Current public gateway tools:

| MCP tool | Use |
|---|---|
| `lazyweb_health` | Check Lazyweb backend connectivity. |
| `lazyweb_growth_score` | Get, explicitly generate, or compare immutable Growth Scores in batches. |
| `lazyweb_growth_report` | Naming façade over the unchanged report generator and poller. |
| `lazyweb_growth_backlog` | List or add owner/product-scoped Backlog specs. |
| `lazyweb_search_screens` | Search screens and automatically record stable result references in Agentic Search. |
| `lazyweb_search_flows` | Search ordered flows and accumulate them into the same Agentic Search. |
| `lazyweb_search_experiments` | Search growth experiments and accumulate them into the same Agentic Search. |
| `lazyweb_agentic_search_finalize` | Finalize ordered selected `result_ref` values and return the private web link; sharing is human-only from the page. |
| `lazyweb_products` | Safe product CRUD; deletion requires an exact matching confirmation. |
| `lazyweb_connections` | Read connection status or open canonical setup. |
| `lazyweb_reports` | List/open reports or save owner-authorized feedback. |
| `lazyweb_account` | Read-only account and plan status. |
| `lazyweb_compare_image` | Find visually similar screenshots from an image URL or base64 image; results include optimized image URLs. |
| `lazyweb_find_similar` | Find visually similar screenshots from a returned Lazyweb `imageUrl` or an image payload; do not pass screenshot IDs. |
| `lazyweb_list_categories` | List public company categories. |
| `lazyweb_get_workflows` | Discover and fetch current Lazyweb workflow instructions. |

Legacy names such as `lazyweb_search`, `lazyweb_get_flows`,
`lazyweb_search_ab_tests`, `lazyweb_generate_report`, and `lazyweb_get_report`
remain compatibility aliases during their deprecation window.

All Lazyweb screenshot-bearing tools return usable optimized URLs for screenshots.
Supabase storage-backed image URLs are signed for 365 days. Do not ask tools for
screenshot IDs, do not pass screenshot IDs between Lazyweb tools, and do not
construct storage URLs from raw paths; embed the returned `imageUrl`/`image_url`
or A/B `control_image_url`/`variant_image_url` fields directly.

Richer backend/internal surfaces may also expose `lazyweb_find_experiments`,
`lazyweb_recent_experiments`, and
`list_companies_by_categories`. Use those only when the live schema shows them.

Installing the workflow skills and configuring MCP do not determine tool
entitlement. Inspect the live tool list and honor the server response: real
data-bearing MCP tool availability and usage limits depend on the account's
persisted experiment assignment and plan. A missing tool can reflect plan,
experiment, rollout, or availability; an empty authorized result is a coverage
outcome.

## Repository Structure

- `SKILL.md` - canonical high-level Lazyweb router skill.
- `skills/*/SKILL.md` - visible mode skills.
- `setup` - standalone multi-host installer.
- `bin/` - helper scripts used by skills and setup, including
  `lazyweb-update` for refreshing an existing install.
- `browse/` - optional browser capture helper for web screenshots.
- `scripts/validate-skill-pack.mjs` - static skill-pack validation.
- `test/` - installer, helper, and contract tests.

## Development

```bash
npm test
```

The test command runs unit tests plus standalone skill-pack validation.

## License

MIT
