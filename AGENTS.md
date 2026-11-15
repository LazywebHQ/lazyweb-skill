# Lazyweb Skill Pack

- Keep user-facing skills, setup/install behavior, documentation, and tool-name validation aligned; use the repository’s current validation scripts.
- Reports should show real visual evidence beside each claim and distinguish observation, inference, and proposed changes.
- Lead with a ranked recommendation and a concrete next action rather than an undifferentiated menu.
- Quantify evidence only from the actual inspected corpus. Label thin or mismatched evidence; never invent companies, metrics, references, or causal lift.
- Keep the human-visible recommendation and machine handoff consistent about scope, confidence, and the selected direction.
- Reuse each skill’s canonical report components and rendering contract. Keep real controls, hypotheses, and locked evidence distinguishable.
- Use HTML/CSS prototypes or generated visuals for proposed layouts; keep actual evidence separate and do not substitute ASCII diagrams for visual work.
- Verify changed workflows through package validation and the real MCP workflow listing/recommendation path when applicable.
- Prefer native Streamable HTTP when supported; use `mcp-remote` only for clients that require a stdio bridge.
- A local client identifies its user with `Authorization: Bearer <email>`. The email is an identifier, not a secret; `setup` calls no Lazyweb endpoint, mints nothing, and records nothing about how an install happened.
- `setup` never replaces an existing sign-in (OAuth, header-less) Lazyweb connection with a header-based one, in any client. With no email it leaves an existing connection as it is and only updates the skills.
- Install and update guidance states plainly what each step does. A skill that finds Lazyweb unavailable tells the user it is not connected and points to https://www.lazyweb.com/mcp-install; it does not run a remote script, and the agent asks the user before running the updater.
