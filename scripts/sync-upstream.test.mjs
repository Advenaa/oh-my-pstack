import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { isProtectedPath, normalizeContent } from "./sync-upstream.mjs";

test("normalization removes the supported Cursor runtime bindings", () => {
  const source = [
    "config: ~/.cursor/rules/pstack-models.mdc",
    "agent: Task subagent",
    "question: AskQuestion",
    "model: claude-fable-5-thinking-max",
    "panel: claude-opus-5-5-xhigh-fast, gemini-4-neon-xhigh, grok-4.7-xhigh-fast",
  ].join("\n");

  const normalized = normalizeContent(source);

  assert.doesNotMatch(normalized, /~\/\.cursor\/|AskQuestion|claude|gemini|grok/u);
  assert.match(normalized, /\$PSTACK_CONFIG/u);
  assert.match(normalized, /host task runner/u);
});

test("normalization removes the bindings a newly published skill arrives with", () => {
  const source = [
    "Before commit → the `deslop` skill from the `cursor-team-kit` plugin (`/deslop`).",
    "Shipping UI → `control-ui` for pages, `control-cli` for terminals.",
    "Agent-facing prose follows the **create-skill** skill.",
    "Long work → `/loop until X`.",
    'Use `subagent_type: "poteto-agent"` and each skill sets its own `subagent_type`.',
  ].join("\n");

  const normalized = normalizeContent(source);

  for (const token of ["cursor-team-kit", "control-ui", "control-cli", "/deslop", "deslop", "/loop", "create-skill", "subagent_type"]) {
    assert.equal(normalized.includes(token), false, `${token} survived normalization`);
  }
  assert.match(normalized, /the unslop skill/u);
  assert.match(normalized, /`cua-driver`/u);
  assert.match(normalized, /`agent: "poteto-agent"`/u);
  assert.doesNotMatch(normalized, /\(the unslop skill\) \(the unslop skill\)/u);
});

test("protected paths remain outside automatic upstream ownership", () => {
  assert.equal(isProtectedPath("skills/poteto-mode/SKILL.md"), true);
  assert.equal(isProtectedPath("skills/pstack-pi/SKILL.md"), true);
  assert.equal(isProtectedPath("skills/how/SKILL.md"), true);
  assert.equal(isProtectedPath("skills/arena/SKILL.md"), true);
  assert.equal(isProtectedPath("skills/why/references/sources/slack.md"), false);
});

test("apply updates an upstream-owned file and advances the lock", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "pstack-sync-test-"));
  const source = join(fixture, "source");
  const target = join(fixture, "target");
  try {
    await mkdir(join(source, "pstack/skills/blast-radius"), { recursive: true });
    await mkdir(
      join(source, "pstack/automations/benny/skills/setup-benny"),
      { recursive: true },
    );
    await mkdir(join(target, "skills"), { recursive: true });
    await writeFile(
      join(source, "pstack/skills/blast-radius/SKILL.md"),
      "---\nname: blast-radius\ndescription: source\n---\nagent: Task subagent\n",
    );
    await writeFile(
      join(source, "pstack/automations/benny/skills/setup-benny/SKILL.md"),
      "---\nname: setup-benny\ndescription: protected\n---\n",
    );
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: source });
    execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: source });
    execFileSync("git", ["config", "user.name", "pstack test"], { cwd: source });
    execFileSync("git", ["add", "."], { cwd: source });
    execFileSync("git", ["commit", "-q", "-m", "baseline"], { cwd: source });
    const baseline = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: source,
      encoding: "utf8",
    }).trim();
    await writeFile(
      join(source, "pstack/skills/blast-radius/SKILL.md"),
      "---\nname: blast-radius\ndescription: updated\n---\nagent: Task subagent\n",
    );
    execFileSync("git", ["add", "."], { cwd: source });
    execFileSync("git", ["commit", "-q", "-m", "update"], { cwd: source });
    await writeFile(
      join(target, "upstream.lock.json"),
      `${JSON.stringify({
        repository: "local",
        ref: "main",
        path: "pstack",
        commit: baseline,
        protectedPrefixes: [],
        protectedPaths: ["skills/setup-benny/SKILL.md"],
        sourceRoots: [
          { source: "pstack/skills", destination: "skills" },
          { source: "pstack/automations/benny/skills", destination: "skills" },
        ],
      })}\n`,
    );

    execFileSync(
      process.execPath,
      [join(process.cwd(), "scripts/sync-upstream.mjs"), "--apply", "--source", source],
      { cwd: target, env: { ...process.env, PSTACK_SYNC_ROOT: target } },
    );

    const synced = await readFile(
      join(target, "skills/blast-radius/SKILL.md"),
      "utf8",
    );
    assert.match(synced, /host task runner/u);
    const lock = JSON.parse(await readFile(join(target, "upstream.lock.json"), "utf8"));
    assert.notEqual(lock.commit, "0".repeat(40));
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("a change inside a protected prefix is reported rather than silently skipped", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "pstack-sync-drift-"));
  const source = join(fixture, "source");
  const target = join(fixture, "target");
  try {
    await mkdir(join(source, "pstack/skills/poteto-mode"), { recursive: true });
    await mkdir(join(target, "skills/poteto-mode"), { recursive: true });
    await writeFile(join(source, "pstack/skills/poteto-mode/SKILL.md"), "first\n");
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: source });
    execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: source });
    execFileSync("git", ["config", "user.name", "pstack test"], { cwd: source });
    execFileSync("git", ["add", "."], { cwd: source });
    execFileSync("git", ["commit", "-q", "-m", "baseline"], { cwd: source });
    const baseline = execFileSync("git", ["rev-parse", "HEAD"], { cwd: source, encoding: "utf8" }).trim();
    await writeFile(join(source, "pstack/skills/poteto-mode/SKILL.md"), "second\n");
    execFileSync("git", ["add", "."], { cwd: source });
    execFileSync("git", ["commit", "-q", "-m", "newer upstream text"], { cwd: source });
    await writeFile(join(target, "skills/poteto-mode/SKILL.md"), "the port's own text\n");
    await writeFile(
      join(target, "upstream.lock.json"),
      `${JSON.stringify({
        repository: "local",
        ref: "main",
        path: "pstack",
        commit: baseline,
        protectedPrefixes: ["skills/poteto-mode/"],
        protectedPaths: [],
        sourceRoots: [{ source: "pstack/skills", destination: "skills" }],
      })}\n`,
    );

    const output = execFileSync(
      process.execPath,
      [join(process.cwd(), "scripts/sync-upstream.mjs"), "--apply", "--source", source],
      { cwd: target, env: { ...process.env, PSTACK_SYNC_ROOT: target }, encoding: "utf8" },
    );

    assert.match(output, /skills\/poteto-mode\/SKILL\.md/u);
    assert.match(output, /Merge these by hand/u);
    assert.equal(await readFile(join(target, "skills/poteto-mode/SKILL.md"), "utf8"), "the port's own text\n");
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

function commitAll(cwd, message) {
  execFileSync("git", ["add", "-A"], { cwd });
  execFileSync("git", ["commit", "-q", "-m", message], { cwd });
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
}

test("drift lists exactly the protected files upstream changed, whatever the source checkout's line endings", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "pstack-sync-eol-"));
  const source = join(fixture, "source");
  const target = join(fixture, "target");
  const upstream = (path) => join(source, "pstack/skills", path);
  try {
    for (const directory of ["poteto-mode", "blast-radius"]) {
      await mkdir(upstream(directory), { recursive: true });
      await mkdir(join(target, "skills", directory), { recursive: true });
    }
    await writeFile(upstream("poteto-mode/SKILL.md"), "first\n");
    await writeFile(upstream("poteto-mode/kept.md"), "unchanged upstream\n");
    await writeFile(upstream("poteto-mode/retired.md"), "retired upstream\n");
    await writeFile(upstream("blast-radius/SKILL.md"), "managed\n");
    await writeFile(upstream("blast-radius/gone.md"), "managed and deleted upstream\n");
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: source });
    execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: source });
    execFileSync("git", ["config", "user.name", "pstack test"], { cwd: source });
    const baseline = commitAll(source, "baseline");
    await writeFile(upstream("poteto-mode/SKILL.md"), "second\n");
    await writeFile(upstream("poteto-mode/worker.md"), "new upstream\n");
    await rm(upstream("poteto-mode/retired.md"));
    await rm(upstream("blast-radius/gone.md"));
    await writeFile(upstream("blast-radius/SKILL.md"), "managed, newer\n");
    commitAll(source, "newer upstream");
    // A Windows clone with core.autocrlf=true checks every text file out with CRLF.
    for (const path of ["poteto-mode/SKILL.md", "poteto-mode/kept.md", "poteto-mode/worker.md", "blast-radius/SKILL.md"]) {
      const text = await readFile(upstream(path), "utf8");
      await writeFile(upstream(path), text.replaceAll("\n", "\r\n"));
    }

    await writeFile(join(target, "skills/poteto-mode/SKILL.md"), "the port's own text\n");
    await writeFile(join(target, "skills/poteto-mode/kept.md"), "unchanged upstream\r\n");
    await writeFile(join(target, "skills/blast-radius/SKILL.md"), "managed\r\n");
    await writeFile(join(target, "skills/blast-radius/gone.md"), "managed and deleted upstream\n");
    const lock = {
      repository: "local",
      ref: "main",
      path: "pstack",
      commit: baseline,
      protectedPrefixes: ["skills/poteto-mode/"],
      protectedPaths: [],
      sourceRoots: [{ source: "pstack/skills", destination: "skills" }],
    };
    await writeFile(join(target, "upstream.lock.json"), `${JSON.stringify(lock)}\n`);
    const run = (mode) => spawnSync(
      process.execPath,
      [join(process.cwd(), "scripts/sync-upstream.mjs"), mode, "--source", source],
      { cwd: target, env: { ...process.env, PSTACK_SYNC_ROOT: target }, encoding: "utf8" },
    );

    const check = run("--check");
    assert.equal(check.status, 10, check.stderr);
    const drift = check.stdout.split("\n").filter((line) => line.startsWith("- skills/poteto-mode/"));
    assert.deepEqual(drift, [
      "- skills/poteto-mode/SKILL.md",
      `- skills/poteto-mode/retired.md (deleted upstream after ${baseline.slice(0, 8)})`,
      `- skills/poteto-mode/worker.md (added upstream after ${baseline.slice(0, 8)}; the port does not have it)`,
    ]);
    assert.equal(check.stderr, "");

    const apply = run("--apply");
    assert.equal(apply.status, 0, apply.stderr);
    assert.match(apply.stdout, /Updated 1 managed files:\n- skills\/blast-radius\/SKILL\.md\n/u);
    assert.match(apply.stdout, /Removed 1 managed files upstream deleted:\n- skills\/blast-radius\/gone\.md\n/u);
    assert.equal(await readFile(join(target, "skills/blast-radius/SKILL.md"), "utf8"), "managed, newer\n");
    await assert.rejects(readFile(join(target, "skills/blast-radius/gone.md")));
    assert.equal(await readFile(join(target, "skills/poteto-mode/SKILL.md"), "utf8"), "the port's own text\n");
    const after = JSON.parse(await readFile(join(target, "upstream.lock.json"), "utf8"));
    assert.equal(after.commit, baseline, "the pin advanced past protected files nobody merged");
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
