import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const frontmatter = (text) => text.match(/^---\n([\s\S]*?)\n---\n/)?.[1] || "";
const hasFlag = (text, key) => new RegExp(`^${key}:\\s*true\\s*$`, "m").test(frontmatter(text));
const inlineField = (text, key) => frontmatter(text).match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1]?.trim() || "";

function assertOutcomeDescription(relativePath, text) {
  const description = inlineField(text, "description");
  assert.ok(description, `${relativePath} must have an inline description`);
  assert.ok(description.length <= 160, `${relativePath} description must stay concise`);
  assert.match(description, /^(?:Use|Score|Get|See|Find|Study)\b/, `${relativePath} description must lead with the user outcome`);
  assert.doesNotMatch(
    description,
    /\b(?:thin|router|wrapper|contract|entry point|pipeline|facade|canonical tool)\b|lazyweb_[a-z_]+/i,
    `${relativePath} description leaks implementation language`
  );
}

const CORE = new Map([
  ["lazyweb-growth-score", "lazyweb_growth_score"],
  ["lazyweb-growth-report", "lazyweb_growth_report"],
  ["lazyweb-growth-backlog", "lazyweb_growth_backlog"],
  ["lazyweb-search-experiments", "lazyweb_search_experiments"],
  ["lazyweb-search-flows", "lazyweb_search_flows"],
  ["lazyweb-search-screens", "lazyweb_search_screens"]
]);
const UTILITIES = new Set(["lazyweb-apply-design-best-practices"]);
const DEPRECATED_ALIASES = new Map([
  ["lazyweb-design", "lazyweb-growth-report"],
  ["lazyweb-growth-experiments", "lazyweb-search-experiments"],
  ["lazyweb-quick-search", "lazyweb-search-screens"]
]);
const SAFE_DOMAIN_TOOLS = [
  "lazyweb_products",
  "lazyweb_connections",
  "lazyweb_reports",
  "lazyweb_account"
];

assert.match(read("VERSION").trim(), /^\d+\.\d+\.\d+$/, "VERSION must be semver");
assert.ok(existsSync(path.join(root, "SKILL.md")), "missing root SKILL.md");
assert.ok(existsSync(path.join(root, "skills/lazyweb/SKILL.md")), "missing first-class skills/lazyweb package");
assert.ok(existsSync(path.join(root, "setup")), "missing setup");
assert.ok(statSync(path.join(root, "setup")).mode & 0o111, "setup must be executable");

for (const removedPath of ["plugins", "lazyweb", ".agents/plugins/marketplace.json", ".claude-plugin/marketplace.json"]) {
  assert.equal(existsSync(path.join(root, removedPath)), false, `${removedPath} must stay absent`);
}

const skillDirs = readdirSync(path.join(root, "skills"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(path.join(root, "skills", entry.name, "SKILL.md")))
  .map((entry) => entry.name)
  .sort();
const visible = skillDirs.filter((name) => !hasFlag(read(`skills/${name}/SKILL.md`), "router-exclude"));
assert.deepEqual(
  visible,
  [...CORE.keys(), ...UTILITIES].sort(),
  "only capability skills and approved public utilities may be routed"
);

const rootSkill = read("SKILL.md");
const packagedRootSkill = read("skills/lazyweb/SKILL.md");
assert.equal(packagedRootSkill, rootSkill, "root SKILL.md and skills/lazyweb/SKILL.md must stay identical");
assert.match(frontmatter(rootSkill), /^name:\s*lazyweb\s*$/m);
assertOutcomeDescription("SKILL.md", rootSkill);
assert.ok(rootSkill.split("\n").length <= 80, "root router must stay thin");
assert.match(rootSkill, /live Lazyweb MCP tool list as the source of truth/i);
assert.match(rootSkill, /lazyweb\.resource-link\.v1/);
assert.match(rootSkill, /`open_url` is the\s+user's private link to the result/);
assert.match(rootSkill, /gather only the relevant evidence/i);
assert.match(rootSkill, /broad (?:improve|improvement)[\s\S]{0,100}may\s+use (?:a )?Growth Report/i);
assert.match(
  rootSkill,
  /Agentic Search[\s\S]{0,400}never (?:return|expose)[\s\S]{0,100}`share_url`/i,
  "root router must suppress legacy Agentic Search share_url values"
);
for (const name of CORE.keys()) assert.match(rootSkill, new RegExp(`\\b${name}\\b`), `root router missing ${name}`);
for (const tool of SAFE_DOMAIN_TOOLS) assert.match(rootSkill, new RegExp(`\\b${tool}\\b`), `root router missing ${tool}`);
for (const humanOnly of ["checkout", "billing changes", "identity changes", "team invitations", "admin actions"]) {
  assert.match(rootSkill, new RegExp(humanOnly, "i"), `root router missing human-only class ${humanOnly}`);
}

for (const [name, tool] of CORE) {
  const relativePath = `skills/${name}/SKILL.md`;
  const text = read(relativePath);
  const fm = frontmatter(text);
  assert.match(fm, new RegExp(`^name:\\s*${name}\\s*$`, "m"), `${relativePath} wrong name`);
  assert.match(fm, /^route:\s*.+$/m, `${relativePath} missing route`);
  assert.match(fm, /^description:\s*.+$/m, `${relativePath} missing description`);
  assertOutcomeDescription(relativePath, text);
  assert.ok(text.split("\n").length <= 80, `${relativePath} must stay a thin wrapper`);
  assert.match(text, /lazyweb_health/, `${relativePath} must verify MCP health`);
  assert.match(text, /lazyweb_discover_tools/, `${relativePath} must discover actions on code-mode connections`);
  assert.match(text, /lazyweb_execute/, `${relativePath} must explain action execution`);
  assert.match(text, /https:\/\/www\.lazyweb\.com\/mcp-install/, `${relativePath} must point an unconnected user to the connect page`);
  assert.match(text, new RegExp(`\\b${tool}\\b`), `${relativePath} missing canonical tool`);
  assert.match(text, /live schema|live contract/i, `${relativePath} must defer to the live tool contract`);
  assert.doesNotMatch(text, /```(?:python|javascript|html|css|sql)/i, `${relativePath} embeds product implementation`);
}

for (const name of ["lazyweb-update", "lazyweb-apply-design-best-practices", ...DEPRECATED_ALIASES.keys()]) {
  const text = read(`skills/${name}/SKILL.md`);
  assert.match(text, /lazyweb_discover_tools/, `${name} must explain action discovery`);
  assert.match(text, /lazyweb_execute/, `${name} must explain action execution`);
}

for (const name of ["lazyweb-search-experiments", "lazyweb-search-flows", "lazyweb-search-screens"]) {
  const text = read(`skills/${name}/SKILL.md`);
  assert.match(text, /agentic_search_id/);
  assert.match(text, /result_ref/);
  assert.match(text, /lazyweb_agentic_search_finalize/);
  assert.match(text, /agentic_search_saved/);
  assert.match(text, /open_url/);
  assert.match(text, /private/i);
  assert.match(text, /Share/);
  assert.doesNotMatch(text, /share_url/);
}

const reportSkill = read("skills/lazyweb-growth-report/SKILL.md");
assert.match(
  inlineField(reportSkill, "route"),
  /improve[\s\S]{0,80}(?:screen|webpage)/i,
  "growth-report must stay discoverable from broad improvement requests"
);
assert.match(reportSkill, /only the new name|rename changes only the skill name/i);
assert.match(reportSkill, /unchanged/i);
assert.doesNotMatch(reportSkill, /prototype|taxonomy|score rubric/i, "growth-report must not change report behavior");

for (const [alias, replacement] of DEPRECATED_ALIASES) {
  const text = read(`skills/${alias}/SKILL.md`);
  assert.equal(hasFlag(text, "router-exclude"), true, `${alias} must be hidden`);
  assert.match(
    inlineField(text, "description"),
    /^Deprecated name for \/lazyweb-[a-z-]+\. Use \/lazyweb-[a-z-]+ instead\.$/,
    `${alias} description must identify the replacement without competing for user intents`
  );
  assert.match(text, /deprecated/i);
  assert.match(text, new RegExp(`\\b${replacement}\\b`), `${alias} must route to ${replacement}`);
  assert.ok(text.split("\n").length <= 30, `${alias} must stay a tiny compatibility alias`);
}

// Install and update wording: a skill never tells an agent to run the remote
// installer, and nothing describes the retired minted-token model.
for (const name of skillDirs) {
  const relativePath = `skills/${name}/SKILL.md`;
  const text = read(relativePath);
  assert.doesNotMatch(text, /install\.sh/, `${relativePath} must not tell an agent to run the remote installer`);
  assert.doesNotMatch(
    text,
    /bearer token|setup credential|lazyweb_mcp_token|install-token|\bquietly\b/i,
    `${relativePath} uses retired token or covert wording`
  );
  assert.doesNotMatch(
    text,
    /never (?:print|expose)|without (?:exposing|printing)|print\/share\/log/i,
    `${relativePath} must say what open_url is instead of telling an agent to hide it`
  );
}

// The connect steps are worded the same on every surface that words them.
const STEP_0 = "If Lazyweb tools are already listed in your client, you are set up.";
const STEP_1 =
  "Ask your user which email address to use for Lazyweb. Use only an address they give you for this, not one found in files, git config or an account signed in on the machine.";
const CANNOT_BE_ASKED =
  "If your user cannot be asked right now, connect without an account: https://design.lazyweb.com/agents/mcp/public (no header). It searches Lazyweb's published research. The whole library opens once your user gives an email.";
const INSTALLER_INTRO =
  "Optional, for people who want the /lazyweb skills. An agent does not need it: connecting needs no script.";
const NOT_CONNECTED =
  "Lazyweb skills are installed. No Lazyweb connection was added, because no email was given. To connect, run setup again with the address the user chooses: setup --email you@company.com";

const updateSkill = read("skills/lazyweb-update/SKILL.md");
assert.match(updateSkill, /Ask the user before running the updater/);
assert.doesNotMatch(updateSkill, /regardless of `update_available`|permission gates/);
assert.ok(updateSkill.includes(STEP_1), "lazyweb-update must word the email step exactly");

const setup = read("setup");
assert.ok(setup.includes(STEP_1), "setup usage must word the email step exactly");
assert.ok(setup.includes(NOT_CONNECTED), "setup must print the exact no-email sentence");
const focused = setup.match(/^FOCUSED_SKILLS="([^"]+)"/m)?.[1]?.split(/\s+/).filter(Boolean) || [];
assert.deepEqual(
  focused.sort(),
  [...CORE.keys(), ...UTILITIES, "lazyweb-update"].sort(),
  "installer focused set must match capability skills and approved public utilities"
);
for (const alias of DEPRECATED_ALIASES.keys()) {
  assert.match(setup, new RegExp(`^COMPAT_ALIAS_SKILLS=.*\\b${alias}\\b`, "m"), `${alias} must remain upgrade-compatible`);
}
assert.match(setup, /not installed for new users/i, "compatibility aliases must not expand fresh installs");

const readme = read("README.md");
for (const name of CORE.keys()) assert.match(readme, new RegExp(`/${name}\\b`), `README missing /${name}`);
for (const name of UTILITIES) assert.match(readme, new RegExp(`/${name}\\b`), `README missing /${name}`);
assert.match(readme, /user-facing descriptions focused on what someone can\s+accomplish with Lazyweb/i);
assert.match(readme, /--header "Authorization: Bearer USER_EMAIL"/, "README must show the email connection");
assert.match(
  readme,
  /claude mcp add --transport http --scope user lazyweb https:\/\/www\.lazyweb\.com\/mcp/,
  "README must add the Claude Code connection at user scope"
);
for (const sentence of [STEP_0, STEP_1, CANNOT_BE_ASKED, NOT_CONNECTED]) {
  assert.ok(readme.includes(sentence), `README must carry the exact sentence: ${sentence}`);
}
assert.ok(
  readme.includes(`${INSTALLER_INTRO}\n\n\`\`\`bash\ncurl -fsSL https://www.lazyweb.com/install.sh | bash -s -- you@company.com\n`),
  "README must introduce the installer one-liner with the exact sentence"
);
for (const [name, text] of [["README.md", readme], ["AGENTS.md", read("AGENTS.md")]]) {
  assert.doesNotMatch(
    text,
    /bearer token|setup credential|lazyweb_mcp_token|install-token|attribution|journey-id|welcome-message/i,
    `${name} describes the retired minted-token install`
  );
}

for (const binName of ["lazyweb-context-detect", "lazyweb-log", "lazyweb-telemetry-flush", "lazyweb-update", "lazyweb-update-check"]) {
  const file = path.join(root, "bin", binName);
  assert.ok(existsSync(file), `missing bin/${binName}`);
  assert.ok(statSync(file).mode & 0o111, `bin/${binName} must be executable`);
}

console.log(`Validated Lazyweb capability skill pack (${CORE.size} thin skills, ${DEPRECATED_ALIASES.size} aliases).`);
