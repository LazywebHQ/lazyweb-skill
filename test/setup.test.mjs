import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const setup = path.join(root, "setup");

function makeExecutable(file, body) {
  writeFileSync(file, body, { mode: 0o755 });
}

const EMAIL = "ada@example.com";
const MCP_URL = "https://lazyweb.example.com/mcp";

// A throwaway machine: an empty HOME and a PATH whose `curl` is a recording
// shim that fails. setup makes no network call, so the shim must never run.
function makeSandbox(prefix) {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  const home = path.join(dir, "home");
  const fakeBin = path.join(dir, "bin");
  mkdirSync(home, { recursive: true });
  mkdirSync(fakeBin, { recursive: true });
  symlinkSync(process.execPath, path.join(fakeBin, "node"));
  makeExecutable(path.join(fakeBin, "curl"), `#!/usr/bin/env sh\nprintf '%s\\n' "$*" >> "${dir}/curl.log"\nexit 97\n`);
  return { dir, home, fakeBin, claudeLog: path.join(dir, "claude.log"), curlLog: path.join(dir, "curl.log") };
}

function addClaudeCli({ fakeBin, claudeLog }) {
  makeExecutable(path.join(fakeBin, "claude"), `#!/usr/bin/env sh\nprintf '%s\\n' "$*" >> "${claudeLog}"\nexit 0\n`);
}

// Nothing is inherited from the developer's shell, so ambient client signals
// (CLAUDECODE, CODEX_THREAD_ID, CLAUDE_CONFIG_DIR, ...) cannot leak into a run.
function runSetup(home, fakeBin, args = ["--email", EMAIL, "--quiet"], extraEnv = {}) {
  return spawnSync("bash", [setup, ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      HOME: home,
      PATH: `${fakeBin}:/usr/bin:/bin:/usr/sbin:/sbin`,
      LAZYWEB_MCP_URL: MCP_URL,
      CODEX_HOME: path.join(home, ".codex"),
      ...extraEnv
    }
  });
}

function runSetupHost(home, fakeBin, host, { quiet = false } = {}) {
  return runSetup(home, fakeBin, ["--email", EMAIL, "--host", host, ...(quiet ? ["--quiet"] : [])]);
}

function listFiles(dir) {
  return readdirSync(dir, { recursive: true }).filter((file) => !lstatSync(path.join(dir, file)).isDirectory());
}

const HEADER_CODEX = `model = "gpt-5.4"\n\n[mcp_servers.lazyweb]\nurl = "${MCP_URL}"\nhttp_headers = { Authorization = "Bearer earlier-identity" }\n`;
const SIGNIN_CODEX = `[mcp_servers.lazyweb]\nurl = "${MCP_URL}"\n\n[mcp_servers.keep_me]\nurl = "https://example.com/mcp"\n`;
const headerJson = (urlKey = "url") =>
  `${JSON.stringify({ mcpServers: { lazyweb: { [urlKey]: MCP_URL, headers: { Authorization: "Bearer earlier-identity" } }, keep_me: { url: "https://example.com/mcp" } } }, null, 2)}\n`;
const signInJson = (urlKey = "url") =>
  `${JSON.stringify({ mcpServers: { lazyweb: { [urlKey]: MCP_URL }, keep_me: { url: "https://example.com/mcp" } } }, null, 2)}\n`;

test("setup holds no minting, attribution or greeting code", () => {
  const source = readFileSync(setup, "utf8");
  assert.doesNotMatch(source, /\bcurl\b|install-token|install_id|install_cookies|lazyweb_mcp_token/);
  assert.doesNotMatch(source, /journey|attribution|experiment-token|user-goal|discovery/i);
  assert.doesNotMatch(source, /Ali here|Welcome to Lazyweb|Show the|silent/i);
});

test("setup --email records the email and connects each detected client with it", () => {
  const box = makeSandbox("lazyweb-setup-email-");
  const { dir, home, fakeBin } = box;
  addClaudeCli(box);
  mkdirSync(path.join(home, ".codex"), { recursive: true });
  mkdirSync(path.join(home, ".cursor"), { recursive: true });

  try {
    const result = runSetup(home, fakeBin, ["--email", EMAIL, "--no-auto-update"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(existsSync(box.curlLog), false, "setup must not make a network call");

    assert.equal(readFileSync(path.join(home, ".lazyweb", "email"), "utf8"), `${EMAIL}\n`);
    for (const minted of ["lazyweb_mcp_token", "install_id", "install_cookies"]) {
      assert.equal(existsSync(path.join(home, ".lazyweb", minted)), false, `${minted} must not be created`);
    }

    assert.equal(
      readFileSync(path.join(home, ".codex", "config.toml"), "utf8"),
      `[mcp_servers.lazyweb]\nurl = "${MCP_URL}"\nhttp_headers = { Authorization = "Bearer ${EMAIL}" }\n`
    );
    const cursor = JSON.parse(readFileSync(path.join(home, ".cursor", "mcp.json"), "utf8"));
    assert.equal(cursor.mcpServers.lazyweb.url, MCP_URL);
    assert.equal(cursor.mcpServers.lazyweb.headers.Authorization, `Bearer ${EMAIL}`);
    assert.equal(
      readFileSync(box.claudeLog, "utf8"),
      `mcp remove -s user lazyweb\nmcp add --transport http --scope user lazyweb ${MCP_URL} --header Authorization: Bearer ${EMAIL}\n`
    );

    // The end-of-run output is a short factual summary for a person.
    const summary = result.stdout.slice(result.stdout.indexOf("\nLazyweb skill pack"));
    const version = readFileSync(path.join(root, "VERSION"), "utf8").trim();
    assert.equal(
      summary.replaceAll(home, "~"),
      [
        "",
        `Lazyweb skill pack ${version} is set up for ${EMAIL}.`,
        "  Codex: skills installed; MCP entry written to ~/.codex/config.toml",
        "  Claude Code: skills installed; MCP entry added with the claude CLI",
        "  Cursor: skills installed; MCP entry written to ~/.cursor/mcp.json",
        `Any other MCP client: URL ${MCP_URL}, header "Authorization: Bearer ${EMAIL}".`,
        "Restart your client to load the changes.",
        "Automatic updates left off. Enable later: touch ~/.lazyweb/auto_update",
        ""
      ].join("\n")
    );
    assert.doesNotMatch(result.stdout, /Welcome|Ali here|Show |Try these|lazyweb_execute|lazyweb_discover_tools|token/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("setup with no email and no Lazyweb connection prints one usage line and writes nothing", () => {
  const box = makeSandbox("lazyweb-setup-no-email-");
  const { dir, home, fakeBin } = box;
  addClaudeCli(box);
  mkdirSync(path.join(home, ".codex"), { recursive: true });
  mkdirSync(path.join(home, ".cursor"), { recursive: true });

  try {
    const result = runSetup(home, fakeBin, ["--no-auto-update"]);
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^Usage: setup --email you@company\.com[^\n]*\n$/);
    assert.deepEqual(listFiles(home), [], "nothing may be written");
    assert.equal(existsSync(box.claudeLog), false);
    assert.equal(existsSync(box.curlLog), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("setup with no email leaves an existing connection exactly as it is and only updates skills", () => {
  const box = makeSandbox("lazyweb-setup-existing-header-");
  const { dir, home, fakeBin } = box;
  addClaudeCli(box);
  mkdirSync(path.join(home, ".codex"), { recursive: true });
  mkdirSync(path.join(home, ".cursor"), { recursive: true });
  const configs = {
    [path.join(home, ".codex", "config.toml")]: HEADER_CODEX,
    [path.join(home, ".cursor", "mcp.json")]: headerJson(),
    [path.join(home, ".claude.json")]: headerJson()
  };
  for (const [file, content] of Object.entries(configs)) writeFileSync(file, content);

  try {
    const result = runSetup(home, fakeBin, ["--host", "all", "--quiet"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    for (const [file, content] of Object.entries(configs)) {
      assert.equal(readFileSync(file, "utf8"), content, `${file} must be untouched`);
    }
    assert.equal(existsSync(box.claudeLog), false, "the claude CLI must not be invoked");
    assert.equal(existsSync(box.curlLog), false);
    assert.equal(existsSync(path.join(home, ".lazyweb", "email")), false);
    assert.equal(existsSync(path.join(home, ".gemini")), false, "no MCP entry may be created without an email");
    assert.ok(existsSync(path.join(home, ".codex", "skills", "lazyweb-update", "SKILL.md")));
    assert.ok(existsSync(path.join(home, ".claude", "skills", "lazyweb-update", "SKILL.md")));
    assert.match(result.stdout, /No email was given, so existing MCP connections were not changed\./);
    assert.match(result.stdout, /^ {2}Codex: skills installed$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("setup --email never replaces a sign-in connection, in any client", () => {
  const box = makeSandbox("lazyweb-setup-signin-");
  const { dir, home, fakeBin } = box;
  addClaudeCli(box);
  mkdirSync(path.join(home, ".codex"), { recursive: true });
  mkdirSync(path.join(home, ".cursor"), { recursive: true });
  mkdirSync(path.join(home, ".gemini", "antigravity"), { recursive: true });
  const configs = {
    [path.join(home, ".codex", "config.toml")]: SIGNIN_CODEX,
    [path.join(home, ".cursor", "mcp.json")]: signInJson(),
    [path.join(home, ".gemini", "antigravity", "mcp_config.json")]: signInJson("serverUrl"),
    // Claude Code keeps a sign-in entry at local (per-project) scope here.
    [path.join(home, ".claude.json")]: `${JSON.stringify({ mcpServers: {}, projects: { "/work/app": { mcpServers: { lazyweb: { type: "http", url: MCP_URL } } } } })}\n`
  };
  for (const [file, content] of Object.entries(configs)) writeFileSync(file, content);

  try {
    const result = runSetup(home, fakeBin, ["--email", EMAIL, "--quiet"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    for (const [file, content] of Object.entries(configs)) {
      assert.equal(readFileSync(file, "utf8"), content, `${file} must be untouched`);
    }
    assert.equal(existsSync(box.claudeLog), false, "no claude mcp remove/add against a sign-in connection");
    assert.equal(result.stdout.match(/existing sign-in connection kept/g).length, 4);
    // Antigravity variants with no entry yet still get the email entry.
    const ide = JSON.parse(readFileSync(path.join(home, ".gemini", "antigravity-ide", "mcp_config.json"), "utf8"));
    assert.equal(ide.mcpServers.lazyweb.headers.Authorization, `Bearer ${EMAIL}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("setup --email replaces a header-based connection and keeps neighbouring entries", () => {
  const box = makeSandbox("lazyweb-setup-replace-header-");
  const { dir, home, fakeBin } = box;
  addClaudeCli(box);
  mkdirSync(path.join(home, ".codex"), { recursive: true });
  mkdirSync(path.join(home, ".cursor"), { recursive: true });
  writeFileSync(path.join(home, ".codex", "config.toml"), HEADER_CODEX);
  writeFileSync(path.join(home, ".cursor", "mcp.json"), headerJson());
  writeFileSync(path.join(home, ".claude.json"), headerJson());

  try {
    const result = runSetup(home, fakeBin, ["--email", EMAIL, "--quiet"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const codex = readFileSync(path.join(home, ".codex", "config.toml"), "utf8");
    assert.match(codex, /^model = "gpt-5\.4"/);
    assert.match(codex, /http_headers = \{ Authorization = "Bearer ada@example\.com" \}/);
    assert.doesNotMatch(codex, /earlier-identity/);
    const cursor = JSON.parse(readFileSync(path.join(home, ".cursor", "mcp.json"), "utf8"));
    assert.equal(cursor.mcpServers.lazyweb.headers.Authorization, `Bearer ${EMAIL}`);
    assert.equal(cursor.mcpServers.keep_me.url, "https://example.com/mcp");
    assert.match(readFileSync(box.claudeLog, "utf8"), /^mcp remove -s user lazyweb\nmcp add .* --header Authorization: Bearer ada@example\.com\n$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("setup rejects a malformed email and the removed attribution flags before writing anything", () => {
  const box = makeSandbox("lazyweb-setup-bad-args-");
  const { dir, home, fakeBin } = box;
  mkdirSync(path.join(home, ".codex"), { recursive: true });

  try {
    for (const args of [
      ["--email", "not-an-email"],
      ["--email", "ada@example"],
      ["--email", "ada@example.com\nX-Injected: 1"],
      ["--email", EMAIL, "--install-attribution"],
      ["--email", EMAIL, "--journey-id", "11111111-2222-4333-8444-555555555555"],
      ["--email", EMAIL, "--install-experiment-token", "ticket"],
      ["--email", EMAIL, "--host", "nope"]
    ]) {
      const result = runSetup(home, fakeBin, args);
      assert.notEqual(result.status, 0, `setup ${args.join(" ")} must fail`);
      assert.deepEqual(listFiles(home), [], `setup ${args.join(" ")} must write nothing`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("setup leaves a client config it cannot parse alone and exits non-zero", () => {
  const box = makeSandbox("lazyweb-setup-unparseable-");
  const { dir, home, fakeBin } = box;
  mkdirSync(path.join(home, ".cursor"), { recursive: true });
  const commented = '{ // my servers\n  "mcpServers": {}\n}\n';
  writeFileSync(path.join(home, ".cursor", "mcp.json"), commented);

  try {
    const result = runSetupHost(home, fakeBin, "cursor", { quiet: true });
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.equal(readFileSync(path.join(home, ".cursor", "mcp.json"), "utf8"), commented);
    assert.match(result.stdout, /Cursor: skills installed; MCP entry NOT written/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a recorded email lets a later no-email run update skills for a client whose MCP config setup does not write", () => {
  const box = makeSandbox("lazyweb-setup-skills-only-");
  const { dir, home, fakeBin } = box;
  mkdirSync(path.join(home, ".config", "opencode"), { recursive: true });

  try {
    const first = runSetup(home, fakeBin, ["--email", EMAIL, "--quiet"]);
    assert.equal(first.status, 0, first.stderr || first.stdout);
    assert.match(first.stdout, /OpenCode: skills installed; MCP entry not written \(add it in the OpenCode MCP settings\)/);

    const second = runSetup(home, fakeBin, ["--quiet"]);
    assert.equal(second.status, 0, second.stderr || second.stdout);
    assert.match(second.stdout, /^ {2}OpenCode: skills installed$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("auto setup targets the invoking Codex host before scanning other installed clients", () => {
  const box = makeSandbox("lazyweb-setup-active-codex-");
  const { dir, home, fakeBin } = box;
  makeExecutable(path.join(fakeBin, "codex"), "#!/usr/bin/env sh\nexit 0\n");
  addClaudeCli(box);

  try {
    const result = runSetup(home, fakeBin, ["--email", EMAIL, "--quiet"], { CODEX_THREAD_ID: "fresh-codex-eval" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.ok(existsSync(path.join(home, ".codex", "skills", "lazyweb", "SKILL.md")));
    assert.equal(existsSync(path.join(home, ".claude", "skills", "lazyweb", "SKILL.md")), false);
    assert.equal(existsSync(box.claudeLog), false, "Claude MCP must not be changed by a Codex-hosted install");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an explicit active Claude host overrides ambient Codex signals", () => {
  const box = makeSandbox("lazyweb-setup-active-claude-");
  const { dir, home, fakeBin } = box;
  makeExecutable(path.join(fakeBin, "codex"), "#!/usr/bin/env sh\nexit 0\n");
  addClaudeCli(box);

  try {
    const result = runSetup(home, fakeBin, ["--email", EMAIL, "--quiet"], {
      LAZYWEB_ACTIVE_HOST: "claude",
      CODEX_THREAD_ID: "ambient-codex-host"
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.ok(existsSync(path.join(home, ".claude", "skills", "lazyweb", "SKILL.md")));
    assert.equal(existsSync(path.join(home, ".codex", "skills", "lazyweb", "SKILL.md")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("setup installs visible skills and direct MCP config into detected local clients", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "lazyweb-setup-"));
  const home = path.join(dir, "home");
  const fakeBin = path.join(dir, "bin");
  mkdirSync(fakeBin, { recursive: true });
  mkdirSync(path.join(home, ".cursor"), { recursive: true });
  mkdirSync(path.join(home, ".gemini", "antigravity"), { recursive: true });

  symlinkSync(process.execPath, path.join(fakeBin, "node"));
  makeExecutable(path.join(fakeBin, "codex"), "#!/usr/bin/env sh\nexit 0\n");
  makeExecutable(path.join(fakeBin, "claude"), `#!/usr/bin/env sh\nprintf '%s\\n' "$*" >> "${dir}/claude.log"\nexit 0\n`);

  // Pre-0.15.8 consented autorouter install: a manifest-tracked block in the
  // user's CLAUDE.md plus the stale router binary. Setup must retire it.
  mkdirSync(path.join(home, ".claude"), { recursive: true });
  mkdirSync(path.join(home, ".lazyweb", "bin"), { recursive: true });
  const migratedFile = path.join(home, ".claude", "CLAUDE.md");
  writeFileSync(
    migratedFile,
    [
      "# My own instructions",
      "",
      "Keep answers short.",
      "",
      "",
      "",
      "Stay curious.",
      "",
      "<!-- LAZYWEB:ROUTER:BEGIN — managed by Lazyweb -->",
      "## Use Lazyweb for ALL product UI work",
      "route everything",
      "<!-- LAZYWEB:ROUTER:END -->",
      ""
    ].join("\n")
  );
  writeFileSync(
    path.join(home, ".lazyweb", "router.manifest.json"),
    JSON.stringify({ targets: [{ host: "claude", file: migratedFile, created_file: false }] })
  );
  writeFileSync(path.join(home, ".lazyweb", "bin", "lazyweb-router"), "#!/usr/bin/env bash\nexit 0\n");

  try {
    const first = runSetup(home, fakeBin);
    assert.equal(first.status, 0, first.stderr || first.stdout);
    // The end-of-run output is a factual summary for a person: no greeting,
    // and no list of things for an agent to do or to show the user.
    assert.match(first.stdout, /Lazyweb skill pack \d+\.\d+\.\d+ is set up for ada@example\.com\./);
    assert.match(first.stdout, /Antigravity: MCP entry written to /);
    assert.match(first.stdout, /Restart your client to load the changes\./);
    assert.doesNotMatch(first.stdout, /Welcome|Ali here|Show |Try these|First checks|lazyweb_execute|lazyweb_discover_tools/i);
    // The autorouter (persistent-instruction routing block + its agent-facing
    // opt-in ask) is removed: install output must never instruct an agent to
    // edit persistent instructions or run a router binary.
    assert.doesNotMatch(first.stdout, /Want me to make Lazyweb part of every product UI task\?/);
    assert.doesNotMatch(first.stdout, /lazyweb-router/);
    assert.doesNotMatch(first.stdout, /change persistent instructions/i);

    // Autorouter retirement: a manifest-tracked LAZYWEB:ROUTER block from a
    // pre-0.15.8 consented install is stripped on upgrade; everything outside
    // the markers is untouched, and the manifest + stale binary are removed.
    const migrated = readFileSync(migratedFile, "utf8");
    assert.doesNotMatch(migrated, /LAZYWEB:ROUTER/);
    assert.match(migrated, /# My own instructions/);
    assert.match(migrated, /Keep answers short\./);
    // User-authored whitespace outside the markers survives verbatim (the
    // migration normalizes only the splice seam).
    assert.match(migrated, /Keep answers short\.\n\n\n\nStay curious\./);
    assert.equal(existsSync(path.join(home, ".lazyweb", "router.manifest.json")), false);
    assert.equal(existsSync(path.join(home, ".lazyweb", "bin", "lazyweb-router")), false);
    const second = runSetup(home, fakeBin);
    assert.equal(second.status, 0, second.stderr || second.stdout);

    const expectedSkillRoots = [
      path.join(home, ".codex", "skills"),
      path.join(home, ".claude", "skills"),
      path.join(home, ".cursor", "skills")
    ];
    for (const skillsRoot of expectedSkillRoots) {
      for (const skillName of [
        "lazyweb",
        "lazyweb-growth-score",
        "lazyweb-growth-report",
        "lazyweb-growth-backlog",
        "lazyweb-search-experiments",
        "lazyweb-search-flows",
        "lazyweb-search-screens",
        "lazyweb-apply-design-best-practices",
        "lazyweb-update"
      ]) {
        const skillPath = path.join(skillsRoot, skillName, "SKILL.md");
        assert.ok(existsSync(skillPath), `missing installed skill ${skillPath}`);
        if (skillName === "lazyweb") {
          assert.equal(lstatSync(skillPath).isSymbolicLink(), false, "root lazyweb SKILL.md must be a regular file so Codex catalogs it");
          assert.equal(
            readFileSync(skillPath, "utf8"),
            readFileSync(path.join(root, "skills", "lazyweb", "SKILL.md"), "utf8"),
            "the installed router must come from the published skills/lazyweb package"
          );
        } else {
          assert.ok(lstatSync(path.dirname(skillPath)).isSymbolicLink(), `${skillName} should be symlinked for updates`);
        }
      }

      for (const oldSkillName of [
        "lazyweb-design-research",
        "lazyweb-quick-references",
        "lazyweb-paywall-optimization",
        "lazyweb-signup-optimization",
        "lazyweb-optimize-paywall",
        "lazyweb-deep-design-research",
        "lazyweb-optimize-sign-up",
        "lazyweb-design-create",
        "lazyweb-ab-test-research",
        "lazyweb-design-best-practices",
        "lazyweb-design-brainstorm",
        "lazyweb-design-improve",
        "lazyweb-lite-design-research",
        "lazyweb-paywall-cta",
        "lazyweb-growth-experiment",
        "lazyweb-explain-flow",
        "lazyweb-propose-ui-changes"
      ]) {
        const staleDir = path.join(skillsRoot, oldSkillName);
        mkdirSync(staleDir, { recursive: true });
        writeFileSync(path.join(staleDir, "SKILL.md"), "stale");
      }
      for (const aliasName of ["lazyweb-design", "lazyweb-quick-search", "lazyweb-growth-experiments"]) {
        const aliasDir = path.join(skillsRoot, aliasName);
        mkdirSync(aliasDir, { recursive: true });
        writeFileSync(path.join(aliasDir, "SKILL.md"), "stale alias");
      }
    }

    const cleanup = runSetup(home, fakeBin);
    assert.equal(cleanup.status, 0, cleanup.stderr || cleanup.stdout);
    for (const skillsRoot of expectedSkillRoots) {
      for (const oldSkillName of [
        "lazyweb-design-research",
        "lazyweb-quick-references",
        "lazyweb-paywall-optimization",
        "lazyweb-signup-optimization",
        "lazyweb-optimize-paywall",
        "lazyweb-deep-design-research",
        "lazyweb-optimize-sign-up",
        "lazyweb-design-create",
        "lazyweb-ab-test-research",
        "lazyweb-design-best-practices",
        "lazyweb-design-brainstorm",
        "lazyweb-design-improve",
        "lazyweb-lite-design-research",
        "lazyweb-paywall-cta",
        "lazyweb-growth-experiment",
        "lazyweb-explain-flow",
        "lazyweb-propose-ui-changes"
      ]) {
        assert.equal(existsSync(path.join(skillsRoot, oldSkillName)), false, `${oldSkillName} should be cleaned up from ${skillsRoot}`);
      }
      for (const aliasName of ["lazyweb-design", "lazyweb-quick-search", "lazyweb-growth-experiments"]) {
        const aliasSkill = path.join(skillsRoot, aliasName, "SKILL.md");
        assert.ok(existsSync(aliasSkill), `${aliasName} should remain available for an upgrading install`);
        assert.match(readFileSync(aliasSkill, "utf8"), /deprecated/i, `${aliasName} should be refreshed to the thin alias`);
      }
    }

    assert.equal(readFileSync(path.join(home, ".lazyweb", "email"), "utf8"), `${EMAIL}\n`);
    assert.equal(existsSync(path.join(home, ".lazyweb", "lazyweb_mcp_token")), false);
    assert.ok(existsSync(path.join(home, ".lazyweb", "bin", "lazyweb-context-detect")));
    assert.ok(existsSync(path.join(home, ".lazyweb", "bin", "lazyweb-update")));

    const codexConfig = readFileSync(path.join(home, ".codex", "config.toml"), "utf8");
    assert.match(codexConfig, /\[mcp_servers\.lazyweb\]/);
    assert.match(codexConfig, /url = "https:\/\/lazyweb\.example\.com\/mcp"/);
    assert.match(codexConfig, /http_headers = \{ Authorization = "Bearer ada@example\.com" \}/);
    assert.doesNotMatch(codexConfig, /mcp-remote|command = "sh"|args = \[/);
    assert.doesNotMatch(codexConfig, /plugins\."lazyweb@lazyweb"/);

    const cursorConfig = JSON.parse(readFileSync(path.join(home, ".cursor", "mcp.json"), "utf8"));
    assert.equal(cursorConfig.mcpServers.lazyweb.url, "https://lazyweb.example.com/mcp");
    assert.equal(cursorConfig.mcpServers.lazyweb.headers.Authorization, `Bearer ${EMAIL}`);

    const antigravityConfig = JSON.parse(readFileSync(path.join(home, ".gemini", "antigravity", "mcp_config.json"), "utf8"));
    assert.equal(antigravityConfig.mcpServers.lazyweb.serverUrl, "https://lazyweb.example.com/mcp");
    assert.equal(antigravityConfig.mcpServers.lazyweb.url, undefined);

    const claudeLog = readFileSync(path.join(dir, "claude.log"), "utf8");
    assert.match(claudeLog, /mcp remove -s user lazyweb/);
    assert.match(claudeLog, /mcp add --transport http --scope user lazyweb https:\/\/lazyweb\.example\.com\/mcp --header Authorization: Bearer ada@example\.com/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("setup upgrades the legacy Codex bridge to native HTTP without clobbering neighboring config", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "lazyweb-setup-codex-native-http-"));
  const home = path.join(dir, "home");
  const fakeBin = path.join(dir, "bin");
  const codexHome = path.join(home, ".codex");
  mkdirSync(fakeBin, { recursive: true });
  mkdirSync(codexHome, { recursive: true });
  symlinkSync(process.execPath, path.join(fakeBin, "node"));
  makeExecutable(path.join(fakeBin, "codex"), "#!/usr/bin/env sh\nexit 0\n");
  writeFileSync(path.join(codexHome, "config.toml"), [
    'model = "gpt-5.4"',
    "",
    "[mcp_servers.lazyweb]",
    'command = "sh"',
    'args = ["-lc", "exec npx -y mcp-remote https://old.lazyweb.example/mcp --header \\"Authorization: Bearer earlier-identity\\" --transport http-first"]',
    "",
    "[mcp_servers.keep_me]",
    'url = "https://example.com/mcp"',
    ""
  ].join("\n"));

  try {
    const result = runSetupHost(home, fakeBin, "codex", { quiet: true });
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const codexConfig = readFileSync(path.join(codexHome, "config.toml"), "utf8");
    assert.match(codexConfig, /^model = "gpt-5\.4"/m);
    assert.match(codexConfig, /\[mcp_servers\.keep_me\]\nurl = "https:\/\/example\.com\/mcp"/);
    assert.match(codexConfig, /\[mcp_servers\.lazyweb\]\nurl = "https:\/\/lazyweb\.example\.com\/mcp"/);
    assert.match(codexConfig, /http_headers = \{ Authorization = "Bearer ada@example\.com" \}/);
    assert.doesNotMatch(codexConfig, /mcp-remote|command = "sh"|args = \[/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("setup preserves an existing signed-OAuth Lazyweb connection", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "lazyweb-setup-codex-oauth-"));
  const home = path.join(dir, "home");
  const fakeBin = path.join(dir, "bin");
  const codexHome = path.join(home, ".codex");
  mkdirSync(fakeBin, { recursive: true });
  mkdirSync(codexHome, { recursive: true });
  symlinkSync(process.execPath, path.join(fakeBin, "node"));
  makeExecutable(path.join(fakeBin, "codex"), "#!/usr/bin/env sh\nexit 0\n");
  const original = '[mcp_servers.lazyweb]\nurl = "https://lazyweb.example.com/mcp"\n\n[mcp_servers.keep_me]\nurl = "https://example.com/mcp"\n';
  writeFileSync(path.join(codexHome, "config.toml"), original);

  try {
    const result = runSetupHost(home, fakeBin, "codex", { quiet: true });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(readFileSync(path.join(codexHome, "config.toml"), "utf8"), original);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("setup verifies the prune: removes legacy + future-rename skill dirs and prints a summary", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "lazyweb-setup-prune-"));
  const home = path.join(dir, "home");
  const fakeBin = path.join(dir, "bin");
  const skillsRoot = path.join(home, ".claude", "skills");
  mkdirSync(fakeBin, { recursive: true });
  mkdirSync(skillsRoot, { recursive: true });
  symlinkSync(process.execPath, path.join(fakeBin, "node"));
  makeExecutable(path.join(fakeBin, "claude"), "#!/usr/bin/env sh\nexit 0\n");

  // A known retired dir from the hardcoded legacy list.
  const legacyDir = path.join(skillsRoot, "lazyweb-design-research");
  mkdirSync(legacyDir, { recursive: true });
  writeFileSync(path.join(legacyDir, "SKILL.md"), "stale");
  // A lazyweb-* dir NOT in the legacy list — the sweep must still catch it.
  const futureDir = path.join(skillsRoot, "lazyweb-some-future-skill");
  mkdirSync(futureDir, { recursive: true });
  writeFileSync(path.join(futureDir, "SKILL.md"), "stale");

  try {
    const result = runSetupHost(home, fakeBin, "claude", { quiet: false });
    assert.equal(result.status, 0, result.stderr || result.stdout);

    // Both stale dirs gone.
    assert.equal(existsSync(legacyDir), false, "legacy skill dir should be pruned");
    assert.equal(existsSync(futureDir), false, "future-rename skill dir should be pruned");

    // Focused set installed.
    for (const skillName of ["lazyweb", "lazyweb-growth-score", "lazyweb-growth-report", "lazyweb-growth-backlog", "lazyweb-search-experiments", "lazyweb-search-flows", "lazyweb-search-screens", "lazyweb-apply-design-best-practices", "lazyweb-update"]) {
      assert.ok(existsSync(path.join(skillsRoot, skillName, "SKILL.md")), `missing ${skillName}`);
    }

    // Human-visible prune summary (non-quiet run).
    assert.match(result.stdout, /removed stale skill: lazyweb-design-research/);
    assert.match(result.stdout, /removed stale skill: lazyweb-some-future-skill/);
    assert.match(result.stdout, /stale skills remaining: none/);
    assert.doesNotMatch(result.stdout, /WARNING: stale Lazyweb skill dirs/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("setup purges retired distribution channels: legacy ~/.agents/skills root and the Claude Code plugin install", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "lazyweb-setup-legacy-"));
  const home = path.join(dir, "home");
  const fakeBin = path.join(dir, "bin");
  mkdirSync(fakeBin, { recursive: true });
  symlinkSync(process.execPath, path.join(fakeBin, "node"));
  makeExecutable(path.join(fakeBin, "claude"), "#!/usr/bin/env sh\nexit 0\n");

  // Legacy cross-agent root: the installer never writes here anymore, so even
  // `lazyweb` itself is stale. A non-lazyweb neighbor must survive.
  const agentsRoot = path.join(home, ".agents", "skills");
  for (const name of ["lazyweb", "lazyweb-design-improve", "lazyweb-quick-references", "free-trial-best-practices"]) {
    mkdirSync(path.join(agentsRoot, name), { recursive: true });
    writeFileSync(path.join(agentsRoot, name, "SKILL.md"), "stale");
  }

  // Retired Claude Code plugin install: registration + cache + marketplace.
  const pluginsDir = path.join(home, ".claude", "plugins");
  const cacheDir = path.join(pluginsDir, "cache", "lazyweb", "lazyweb", "0.1.1", "skills", "lazyweb-design-improve");
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(path.join(cacheDir, "SKILL.md"), "stale");
  const marketplaceDir = path.join(pluginsDir, "marketplaces", "lazyweb");
  mkdirSync(marketplaceDir, { recursive: true });
  writeFileSync(
    path.join(pluginsDir, "installed_plugins.json"),
    JSON.stringify({
      version: 2,
      plugins: {
        "lazyweb@lazyweb": [{ scope: "user", installPath: cacheDir, version: "0.1.1" }],
        "other@somewhere": [{ scope: "user", installPath: path.join(pluginsDir, "cache", "other"), version: "1.0.0" }]
      }
    }, null, 2)
  );
  writeFileSync(
    path.join(pluginsDir, "known_marketplaces.json"),
    JSON.stringify({
      lazyweb: {
        source: { source: "git", url: "https://github.com/aboul3ata/lazyweb-skill.git" },
        installLocation: marketplaceDir
      },
      "claude-plugins-official": {
        source: { source: "github", repo: "anthropics/claude-plugins-official" },
        installLocation: path.join(pluginsDir, "marketplaces", "claude-plugins-official")
      }
    }, null, 2)
  );

  try {
    const result = runSetupHost(home, fakeBin, "claude", { quiet: false });
    assert.equal(result.status, 0, result.stderr || result.stdout);

    // Legacy root: every lazyweb dir gone, unrelated neighbor untouched.
    for (const name of ["lazyweb", "lazyweb-design-improve", "lazyweb-quick-references"]) {
      assert.equal(existsSync(path.join(agentsRoot, name)), false, `${name} should be purged from ~/.agents/skills`);
    }
    assert.ok(existsSync(path.join(agentsRoot, "free-trial-best-practices")), "non-lazyweb skill must survive the legacy-root sweep");

    // Plugin: cache + marketplace dirs gone.
    assert.equal(existsSync(path.join(pluginsDir, "cache", "lazyweb")), false, "plugin cache should be deleted");
    assert.equal(existsSync(marketplaceDir), false, "plugin marketplace checkout should be deleted");

    // Registration surgically removed; unrelated plugin + marketplace survive.
    const installed = JSON.parse(readFileSync(path.join(pluginsDir, "installed_plugins.json"), "utf8"));
    assert.equal(installed.plugins["lazyweb@lazyweb"], undefined, "lazyweb@lazyweb should be deregistered");
    assert.ok(installed.plugins["other@somewhere"], "unrelated plugin registration must survive");
    const known = JSON.parse(readFileSync(path.join(pluginsDir, "known_marketplaces.json"), "utf8"));
    assert.equal(known.lazyweb, undefined, "lazyweb marketplace should be deregistered");
    assert.ok(known["claude-plugins-official"], "unrelated marketplace must survive");

    // Human-visible summary lines.
    assert.match(result.stdout, /removed stale skill: lazyweb \(/);
    assert.match(result.stdout, /removed legacy Claude Code plugin registration: lazyweb@lazyweb/);
    assert.match(result.stdout, /removed legacy Claude Code plugin marketplace: lazyweb/);
    assert.doesNotMatch(result.stderr, /WARNING: could not fully remove/);

    // Idempotent: a second run finds nothing to do and still succeeds.
    const second = runSetupHost(home, fakeBin, "claude", { quiet: false });
    assert.equal(second.status, 0, second.stderr || second.stdout);
    assert.doesNotMatch(second.stdout, /removed legacy Claude Code plugin/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("setup leaves a lazyweb-named marketplace alone when it does not point at lazyweb-skill", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "lazyweb-setup-foreign-mp-"));
  const home = path.join(dir, "home");
  const fakeBin = path.join(dir, "bin");
  mkdirSync(fakeBin, { recursive: true });
  symlinkSync(process.execPath, path.join(fakeBin, "node"));
  makeExecutable(path.join(fakeBin, "claude"), "#!/usr/bin/env sh\nexit 0\n");

  const pluginsDir = path.join(home, ".claude", "plugins");
  const marketplaceDir = path.join(pluginsDir, "marketplaces", "lazyweb");
  mkdirSync(marketplaceDir, { recursive: true });
  writeFileSync(
    path.join(pluginsDir, "known_marketplaces.json"),
    JSON.stringify({
      lazyweb: {
        source: { source: "git", url: "https://github.com/someone-else/unrelated-repo.git" },
        installLocation: marketplaceDir
      }
    }, null, 2)
  );

  try {
    const result = runSetupHost(home, fakeBin, "claude", { quiet: true });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const known = JSON.parse(readFileSync(path.join(pluginsDir, "known_marketplaces.json"), "utf8"));
    assert.ok(known.lazyweb, "foreign lazyweb-named marketplace must survive");
    assert.ok(existsSync(marketplaceDir), "foreign marketplace checkout must survive");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- Integrity marker (~/.lazyweb/INTEGRITY) — H5 Phase 0 producer ---

// Compute the expected skill-set hash the way setup's installed_skill_set_hash
// does: sha256 over the sorted, unique canonical lazyweb-* basenames shipped in
// $ROOT/skills. We shell out so the test tracks the real `shasum` output.
function expectedSetSha12() {
  const names = readdirSync(path.join(root, "skills"))
    .filter((n) => n.startsWith("lazyweb-"))
    .sort()
    .filter((n, i, a) => a.indexOf(n) === i);
  const listing = names.join("\n") + "\n";
  const out = spawnSync("shasum", ["-a", "256"], { input: listing, encoding: "utf8" });
  return out.stdout.trim().split(/\s+/)[0].slice(0, 12);
}

test("install_integrity_marker writes a well-formed lw1.<sha40>.<ver>.<set12> line for a git checkout", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "lazyweb-setup-integrity-"));
  const home = path.join(dir, "home");
  const fakeBin = path.join(dir, "bin");
  mkdirSync(fakeBin, { recursive: true });
  symlinkSync(process.execPath, path.join(fakeBin, "node"));
  makeExecutable(path.join(fakeBin, "claude"), "#!/usr/bin/env sh\nexit 0\n");

  try {
    // Real setup runs inside the repo's git checkout ($ROOT == root).
    const result = runSetupHost(home, fakeBin, "claude", { quiet: true });
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const markerPath = path.join(home, ".lazyweb", "INTEGRITY");
    assert.ok(existsSync(markerPath), "INTEGRITY marker should be written");
    const line = readFileSync(markerPath, "utf8").trimEnd();

    // lw1.<40-hex sha>.<version>.<12-hex set>
    const m = /^lw1\.([0-9a-f]{40})\.([^.\s][^.]*(?:\.[^.]+)*)\.([0-9a-f]{12})$/.exec(line);
    assert.ok(m, `marker is well-formed: ${line}`);

    // SHA matches this checkout's HEAD.
    const head = spawnSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
    assert.equal(m[1], head, "marker SHA matches git HEAD");

    // Version matches VERSION file.
    const ver = readFileSync(path.join(root, "VERSION"), "utf8").trim();
    assert.equal(m[2], ver, "marker version matches VERSION");

    // Set-hash matches the canonical shipped lazyweb-* set.
    assert.equal(m[3], expectedSetSha12(), "marker set-hash matches shipped skill set");

    // Single line, no `nogit` for a real checkout.
    assert.ok(!line.includes("nogit"), "git checkout must not emit nogit");
    assert.equal(readFileSync(markerPath, "utf8").split("\n").filter(Boolean).length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("install_integrity_marker writes lw1.nogit.<ver>.<set12> when $ROOT has no .git", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "lazyweb-setup-nogit-"));
  const home = path.join(dir, "home");
  const fakeBin = path.join(dir, "bin");
  // A throwaway $ROOT copy with VERSION + skills/ but NO .git.
  const fakeRoot = path.join(dir, "root");
  mkdirSync(fakeBin, { recursive: true });
  symlinkSync(process.execPath, path.join(fakeBin, "node"));
  // Build just enough of a $ROOT for the marker function: VERSION + skills/,
  // and deliberately NO .git directory.
  mkdirSync(fakeRoot, { recursive: true });
  writeFileSync(path.join(fakeRoot, "VERSION"), readFileSync(path.join(root, "VERSION"), "utf8"));
  mkdirSync(path.join(fakeRoot, "skills"), { recursive: true });
  for (const s of ["lazyweb-growth-score", "lazyweb-growth-report", "lazyweb-update", "lazyweb-design-create"]) {
    mkdirSync(path.join(fakeRoot, "skills", s), { recursive: true });
  }

  try {
    // Source the marker functions from setup and run them against the no-git
    // $ROOT, so we exercise the real `case`-based git/nogit branch.
    const script = `
      set -euo pipefail
      ROOT="${fakeRoot}"
      HOME="${home}"
      has_cmd() { command -v "$1" >/dev/null 2>&1; }
      log() { :; }
      # Extract the two functions verbatim from setup so the test tracks the
      # shipped implementation (no duplicated logic to drift).
      eval "$(sed -n '/^installed_skill_set_hash() {/,/^}/p' "${setup}")"
      eval "$(sed -n '/^install_integrity_marker() {/,/^}/p' "${setup}")"
      install_integrity_marker
      cat "$HOME/.lazyweb/INTEGRITY"
    `;
    const out = spawnSync("bash", ["-c", script], { encoding: "utf8" });
    assert.equal(out.status, 0, out.stderr || out.stdout);
    const line = out.stdout.trim();

    const ver = readFileSync(path.join(root, "VERSION"), "utf8").trim();
    const m = /^lw1\.nogit\.([^.\s][^.]*(?:\.[^.]+)*)\.([0-9a-f]{12})$/.exec(line);
    assert.ok(m, `nogit marker is well-formed: ${line}`);
    assert.equal(m[1], ver, "nogit marker carries the real version");
    assert.match(m[2], /^[0-9a-f]{12}$/, "nogit marker carries a 12-hex set-hash");
    // Never fabricate a SHA.
    assert.ok(!/[0-9a-f]{40}/.test(line), "nogit marker must not contain a 40-hex SHA");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("installed_skill_set_hash is deterministic and matches the shipped focused set", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "lazyweb-setsha-"));
  try {
    const run = () => {
      const out = spawnSync(
        "bash",
        [
          "-c",
          `set -euo pipefail
           ROOT="${root}"
           has_cmd() { command -v "$1" >/dev/null 2>&1; }
           eval "$(sed -n '/^installed_skill_set_hash() {/,/^}/p' "${setup}")"
           installed_skill_set_hash`,
        ],
        { encoding: "utf8" }
      );
      assert.equal(out.status, 0, out.stderr || out.stdout);
      return out.stdout.trim();
    };
    const a = run();
    const b = run();
    assert.equal(a, b, "skill-set hash is stable across invocations");
    assert.match(a, /^[0-9a-f]{64}$/, "skill-set hash is a full sha256");
    assert.equal(a.slice(0, 12), expectedSetSha12(), "first 12 hex match the canonical shipped set");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("releases.json parses and either contains the released HEAD or permits the next unreleased version", () => {
  const data = JSON.parse(readFileSync(path.join(root, "releases.json"), "utf8"));
  assert.equal(data.schema, "lw-releases-1");
  assert.ok(Array.isArray(data.releases) && data.releases.length > 0, "releases array non-empty");

  const head = spawnSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
  const ver = readFileSync(path.join(root, "VERSION"), "utf8").trim();

  // Every entry is well-shaped.
  const seen = new Set();
  for (const r of data.releases) {
    assert.match(r.sha, /^[0-9a-f]{40}$/, `entry sha is 40-hex: ${r.sha}`);
    assert.ok(typeof r.version === "string" && r.version.length, "entry has a version");
    assert.ok(typeof r.released_at === "string" && r.released_at.length, "entry has released_at");
    // expected_set is a 64-hex sha256 or null (older backfilled entries).
    assert.ok(r.expected_set === null || /^[0-9a-f]{64}$/.test(r.expected_set), `entry set ok: ${r.expected_set}`);
    assert.ok(!seen.has(r.sha), `no duplicate sha: ${r.sha}`);
    seen.add(r.sha);
  }

  // Release automation appends the merged commit. A feature branch may carry
  // the next VERSION before that immutable release entry can exist.
  const headEntry = data.releases.find((r) => r.sha === head);
  if (!headEntry) {
    assert.notEqual(ver, data.releases[0].version, "an unlisted HEAD must carry the next unreleased VERSION");
    return;
  }
  assert.equal(headEntry.version, ver, "HEAD entry version matches VERSION");
  assert.match(headEntry.expected_set, /^[0-9a-f]{64}$/, "HEAD entry has a real expected_set");

  // And that expected_set must match what setup actually stamps for HEAD.
  const out = spawnSync(
    "bash",
    [
      "-c",
      `set -euo pipefail
       ROOT="${root}"
       has_cmd() { command -v "$1" >/dev/null 2>&1; }
       eval "$(sed -n '/^installed_skill_set_hash() {/,/^}/p' "${setup}")"
       installed_skill_set_hash`,
    ],
    { encoding: "utf8" }
  );
  assert.equal(out.stdout.trim(), headEntry.expected_set, "HEAD expected_set matches the producer hash");
});

test("setup reports manual MCP config when no local clients are detected", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "lazyweb-setup-empty-"));
  const home = path.join(dir, "home");
  const fakeBin = path.join(dir, "bin");
  mkdirSync(fakeBin, { recursive: true });
  symlinkSync(process.execPath, path.join(fakeBin, "node"));
  try {
    const result = runSetup(home, fakeBin);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /No supported local coding client was found, so no skills were installed\./);
    assert.match(result.stdout, /Any other MCP client: URL https:\/\/lazyweb\.example\.com\/mcp, header "Authorization: Bearer ada@example\.com"\./);
    assert.doesNotMatch(result.stdout, /Restart your client/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
