import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scriptsDir } from "./hooks/helpers.js";

const doctor = join(scriptsDir, "doctor.mjs");

type Check = { name: string; ok: boolean; detail: string; fix: string; skipped?: boolean };

/** A plugin root whose runtime manifest declares one native dependency. */
function pluginRoot() {
  const root = mkdtempSync(join(tmpdir(), "plugroot-"));
  mkdirSync(join(root, "runtime"));
  writeFileSync(
    join(root, "runtime/package.json"),
    JSON.stringify({ name: "brujula-runtime", dependencies: { "fake-native": "1.0.0" } }),
  );
  return root;
}

/** A local git repository standing in for the marketplace (no network). */
function marketplace() {
  const dir = mkdtempSync(join(tmpdir(), "market-"));
  execFileSync("git", ["init", "-q", "-b", "main", dir]);
  execFileSync("git", [
    "-C",
    dir,
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@t",
    "commit",
    "-q",
    "--allow-empty",
    "-m",
    "c",
  ]);
  return dir;
}

/** A project directory, optionally with a .claude/brujula.json. */
function project(config?: string) {
  const dir = mkdtempSync(join(tmpdir(), "project-"));
  execFileSync("git", ["init", "-q", dir]);
  if (config !== undefined) {
    mkdirSync(join(dir, ".claude"));
    writeFileSync(join(dir, ".claude/brujula.json"), config);
  }
  return dir;
}

function run(
  root: string,
  data: string,
  url: string,
  projectDir = project('{ "pullRequests": true }'),
  env: Record<string, string> = {},
) {
  const r = spawnSync(process.execPath, [doctor, root, data, url], {
    encoding: "utf8",
    // An empty Claude config dir by default: the tests never read the real ~/.claude.
    env: {
      ...process.env,
      PATH: withAz,
      CLAUDE_PROJECT_DIR: projectDir,
      CLAUDE_CONFIG_DIR: mkdtempSync(join(tmpdir(), "cfg-")),
      ...env,
    },
  });
  return { status: r.status, checks: JSON.parse(r.stdout) as Check[] };
}

const byName = (checks: Check[], name: string) => checks.find((c) => c.name === name);

/** A PATH where `az` exists (a stub), so the tests do not depend on the Azure CLI being installed. */
const withAz = (() => {
  const bin = mkdtempSync(join(tmpdir(), "stub-az-"));
  writeFileSync(join(bin, "az"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  return `${bin}:${process.env.PATH}`;
})();

/** A PATH with only git and bash: no jq, no az. */
function bareBin() {
  const bin = mkdtempSync(join(tmpdir(), "bare-bin-"));
  for (const tool of ["git", "bash", "dirname"]) {
    const real = execFileSync("bash", ["-c", `command -v ${tool}`], { encoding: "utf8" }).trim();
    symlinkSync(real, join(bin, tool));
  }
  return bin;
}

/**
 * A Claude config dir with the team marketplace registered at `knownRef` (its checkout holds the
 * plugin at `market`), a plugin root installed at `installed`, and a project pinned to `projectRef`.
 */
function installation(o: { installed: string; market: string; knownRef: string; projectRef?: string }) {
  const cfg = mkdtempSync(join(tmpdir(), "cfg-"));
  const checkout = mkdtempSync(join(tmpdir(), "market-checkout-"));
  mkdirSync(join(checkout, ".claude-plugin"));
  writeFileSync(
    join(checkout, ".claude-plugin/marketplace.json"),
    JSON.stringify({ name: "brujula-equipo", plugins: [{ name: "brujula", source: "./plugin" }] }),
  );
  mkdirSync(join(checkout, "plugin/.claude-plugin"), { recursive: true });
  writeFileSync(
    join(checkout, "plugin/.claude-plugin/plugin.json"),
    JSON.stringify({ name: "brujula", version: o.market }),
  );
  mkdirSync(join(cfg, "plugins"));
  writeFileSync(
    join(cfg, "plugins/known_marketplaces.json"),
    JSON.stringify({
      "brujula-equipo": { source: { source: "git", url: "u", ref: o.knownRef }, installLocation: checkout },
    }),
  );
  const root = pluginRoot();
  mkdirSync(join(root, ".claude-plugin"));
  writeFileSync(join(root, ".claude-plugin/plugin.json"), JSON.stringify({ name: "brujula", version: o.installed }));
  const proj = project('{ "pullRequests": true }');
  if (o.projectRef) {
    writeFileSync(
      join(proj, ".claude/settings.json"),
      JSON.stringify({
        extraKnownMarketplaces: { "brujula-equipo": { source: { source: "git", url: "u", ref: o.projectRef } } },
      }),
    );
  }
  const data = mkdtempSync(join(tmpdir(), "data-"));
  return run(root, data, marketplace(), proj, { CLAUDE_CONFIG_DIR: cfg });
}

describe("doctor.mjs", () => {
  it("fails on an empty data dir and gives the exact command that installs the runtime deps", () => {
    const root = pluginRoot();
    const data = mkdtempSync(join(tmpdir(), "data-"));
    const r = run(root, data, marketplace());
    expect(r.status).not.toBe(0);
    const deps = byName(r.checks, "runtime-deps");
    expect(deps).toMatchObject({ ok: false });
    expect(deps?.fix).toBe(`CLAUDE_PLUGIN_DATA="${data}" node "${join(root, "scripts/start-mcp.mjs")}" --install-only`);
  });

  it("passes when the data dir has every runtime dependency and the marketplace is reachable", () => {
    const root = pluginRoot();
    const data = mkdtempSync(join(tmpdir(), "data-"));
    mkdirSync(join(data, "node_modules/fake-native"), { recursive: true });
    writeFileSync(join(data, "node_modules/fake-native/package.json"), "{}");
    const r = run(root, data, marketplace());
    expect(r.checks.filter((c) => !c.ok)).toEqual([]);
    expect(r.status).toBe(0);
  });

  it("reports an unreachable marketplace with a copyable verification command", () => {
    const root = pluginRoot();
    const data = mkdtempSync(join(tmpdir(), "data-"));
    const missing = join(tmpdir(), "no-such-marketplace-repo");
    const r = run(root, data, missing);
    const git = byName(r.checks, "marketplace-git");
    expect(git?.ok).toBe(false);
    expect(git?.fix).toContain(`GIT_TERMINAL_PROMPT=0 git ls-remote "${missing}" HEAD`);
  });

  it("skips the marketplace check, without failing, when git cannot reach the credential helper (Claude Code's sandbox)", () => {
    const root = pluginRoot();
    const data = mkdtempSync(join(tmpdir(), "data-"));
    const bin = mkdtempSync(join(tmpdir(), "fake-git-"));
    // What git prints inside the sandbox on WSL: the Windows credential manager is out of reach.
    writeFileSync(
      join(bin, "git"),
      "#!/bin/sh\n" +
        "echo '<3>WSL (14 - ) ERROR: UtilBindVsockAnyPort:309: socket failed 1' >&2\n" +
        "echo \"fatal: could not read Password for 'https://x@dev.azure.com/o/p/_git/r': No such device or address\" >&2\n" +
        "exit 128\n",
      { mode: 0o755 },
    );
    const url = "https://dev.azure.com/o/p/_git/r";
    const r = run(root, data, url, project('{ "pullRequests": true }'), { PATH: `${bin}:${withAz}` });
    const git = byName(r.checks, "marketplace-git");
    expect(git).toMatchObject({ ok: true, skipped: true, fix: "" });
    expect(git?.detail).toContain("cannot be checked from inside Claude Code's sandbox");
    expect(git?.detail).toContain(`GIT_TERMINAL_PROMPT=0 git ls-remote "${url}" HEAD`);
    for (const d of [root, data, bin]) rmSync(d, { recursive: true, force: true });
  });

  it("reads the personal .claude/brujula.local.json too", () => {
    const root = pluginRoot();
    const data = mkdtempSync(join(tmpdir(), "data-"));
    const dir = project();
    mkdirSync(join(dir, ".claude"));
    writeFileSync(join(dir, ".claude/brujula.local.json"), '{ "pullRequests": false }');
    expect(byName(run(root, data, marketplace(), dir).checks, "pull-requests")).toMatchObject({
      ok: true,
      detail: "this project does not use pull requests: pushing to main is allowed",
    });
  });

  it("reports whether the project uses pull requests and how to declare it when unset", () => {
    const root = pluginRoot();
    const data = mkdtempSync(join(tmpdir(), "data-"));
    const url = marketplace();
    const without = project('{ "pullRequests": false }');
    expect(byName(run(root, data, url, without).checks, "pull-requests")).toMatchObject({
      ok: true,
      detail: "this project does not use pull requests: pushing to main is allowed",
    });
    const unset = project();
    const r = run(root, data, url, unset);
    expect(byName(r.checks, "pull-requests")).toMatchObject({
      ok: false,
      detail: `not declared in .claude/brujula.json or .claude/brujula.local.json of ${unset}`,
    });
    expect(byName(r.checks, "pull-requests")?.fix).toContain("/brujula:configurar");
    expect(byName(r.checks, "pull-requests")?.fix).toContain(".claude/brujula.local.json");
    expect(r.status).not.toBe(0);
    for (const d of [root, data, url, without, unset]) rmSync(d, { recursive: true, force: true });
  });

  describe("plugin-version", () => {
    it("passes when the installed plugin is the marketplace's version and the project's tag is the registered one", () => {
      const r = installation({ installed: "0.4.1", market: "0.4.1", knownRef: "v0.4.1", projectRef: "v0.4.1" });
      expect(byName(r.checks, "plugin-version")).toMatchObject({
        ok: true,
        detail: "installed 0.4.1, the marketplace's version",
      });
    });

    it("fails when the marketplace has a newer version than the installed one and gives the update commands", () => {
      const r = installation({ installed: "0.4.0", market: "0.4.1", knownRef: "v0.4.1" });
      const c = byName(r.checks, "plugin-version");
      expect(c).toMatchObject({ ok: false, detail: "installed 0.4.0, but the marketplace has 0.4.1" });
      expect(c?.fix).toContain(
        "claude plugin update brujula@brujula-equipo --scope user && claude plugin update brujula@brujula-equipo --scope project",
      );
      expect(r.status).not.toBe(0);
    });

    it("fails when the project pins a tag that Claude Code has not registered yet, and says to restart Claude first", () => {
      const r = installation({ installed: "0.4.0", market: "0.4.0", knownRef: "v0.4.0", projectRef: "v0.4.1" });
      const c = byName(r.checks, "plugin-version");
      expect(c).toMatchObject({
        ok: false,
        detail: "this project asks for the marketplace at v0.4.1, but Claude Code still has v0.4.0 registered",
      });
      expect(c?.fix).toMatch(
        /^close Claude and open it again in this project, then run in a terminal: claude plugin marketplace update brujula-equipo/,
      );
    });

    it("is skipped when the plugin was not installed from the team marketplace", () => {
      const r = run(pluginRoot(), mkdtempSync(join(tmpdir(), "data-")), marketplace());
      expect(byName(r.checks, "plugin-version")).toMatchObject({ ok: true, skipped: true, fix: "" });
    });
  });

  it("fails when jq or the Azure CLI are missing: without jq every guard switches off silently", () => {
    const r = run(pluginRoot(), mkdtempSync(join(tmpdir(), "data-")), marketplace(), undefined, { PATH: bareBin() });
    expect(byName(r.checks, "jq")).toMatchObject({ ok: false });
    expect(byName(r.checks, "jq")?.fix).toContain("sudo apt install jq");
    expect(byName(r.checks, "azure-cli")).toMatchObject({ ok: false });
    expect(byName(r.checks, "azure-cli")?.fix).toContain("az login");
    expect(r.status).not.toBe(0);
  });

  it("passes the jq and Azure CLI checks when both are installed", () => {
    const r = run(pluginRoot(), mkdtempSync(join(tmpdir(), "data-")), marketplace());
    expect(byName(r.checks, "jq")).toMatchObject({ ok: true });
    expect(byName(r.checks, "azure-cli")).toMatchObject({ ok: true });
  });

  it("skips the pull request question outside a code project (a PM's folder), without failing", () => {
    const folder = mkdtempSync(join(tmpdir(), "pm-folder-"));
    const r = run(pluginRoot(), mkdtempSync(join(tmpdir(), "data-")), marketplace(), folder);
    expect(byName(r.checks, "pull-requests")).toMatchObject({ ok: true, skipped: true, fix: "" });
  });

  it("checks the Node version", () => {
    const r = run(pluginRoot(), mkdtempSync(join(tmpdir(), "data-")), marketplace());
    expect(byName(r.checks, "node-version")).toMatchObject({ ok: true });
  });
});
