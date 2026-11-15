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
- `setup` never replaces an existing sign-in (OAuth) Lazyweb connection with a header-based one, in any client. An entry is header-based only if it carries an Authorization header; any other header leaves it a sign-in entry.
- With no email `setup` installs or updates the skills, leaves an existing connection as it is and adds none; with no connection on the machine it still exits 0 and prints how to connect. Only an MCP entry in a client config counts as a connection, not `~/.lazyweb/email` or `~/.lazyweb/VERSION`.
- `setup` takes the email from `--email` and nowhere else: not git config, not a client's login file, not the environment. `~/.lazyweb/email` is its own record of that address.
- Install and update guidance states plainly what each step does. A skill that finds Lazyweb unavailable tells the user it is not connected and points to https://www.lazyweb.com/mcp-install; it does not run a remote script, and the agent asks the user before running the updater.
- Wherever guidance words the connect steps itself, it uses the step 0, step 1 and "cannot be asked" sentences exactly as README.md has them, and the Claude Code command carries `--scope user`. The only thing an agent is asked to do beyond connecting is to ask its user for an email address.
- A returned `open_url` is described as what it is, the user's private link to the result, opened once in the host browser; the link given to the user is the stable `url`.
