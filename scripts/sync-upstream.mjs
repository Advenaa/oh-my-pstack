#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(
  process.env.PSTACK_SYNC_ROOT ?? dirname(fileURLToPath(import.meta.url)),
  process.env.PSTACK_SYNC_ROOT ? "." : "..",
);
const lockPath = join(root, "upstream.lock.json");
const boundaryLock = JSON.parse(readFileSync(lockPath, "utf8"));

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeContent(source) {
  return source
    .replaceAll("~/.cursor/rules/pstack-models.mdc", "$PSTACK_CONFIG (or .pstack/config.md)")
    .replaceAll(".cursor/skills/", "skills/")
    .replaceAll(".cursor/plugins/", "plugins/")
    .replaceAll("subagent_type:", "agent:")
    .replaceAll("AskQuestion", "structured interaction tool")
    .replaceAll('environment: "cloud"', "environment: host-managed")
    .replaceAll("environment: 'cloud'", "environment: host-managed")
    .replaceAll("claude-fable-5-thinking-max", "host-configured role/model")
    .replaceAll("gpt-5.6-sol-max", "host-configured role/model")
    .replaceAll("grok-4.6-fast-xhigh", "host-configured role/model")
    .replaceAll("claude-opus-5-thinking-xhigh", "host-configured role/model")
    .replaceAll(/\bTask (?:subagent|tool)\b/g, "host task runner")
    .replaceAll("subagent_type:", "agent:")
    .replaceAll("the `deslop` skill from the `cursor-team-kit` plugin (`/deslop`)", "the unslop skill")
    .replaceAll("(`/deslop`)", "(the unslop skill)")
    .replaceAll("`control-cli`", "the `bash` tool with `pty`")
    .replaceAll("`control-ui`", "`cua-driver`")
    .replaceAll("`deslop`", "the unslop skill")
    .replaceAll("**create-skill** skill", "authoring-a-skill playbook")
    .replaceAll("via create-skill:", "via the authoring-a-skill playbook:")
    .replaceAll("via create-skill>", "via the authoring-a-skill playbook>")
    .replaceAll("`create-skill`", "the authoring-a-skill playbook")
    .replaceAll("`/loop`", "a run-until instruction")
    .replaceAll("/loop until", "continue until")
    .replaceAll("`cursor-team-kit`", "the host's own tooling")
    .replaceAll("`subagent_type`", "`agent`");
}

export function isProtectedPath(path) {
  return (
    boundaryLock.protectedPaths.includes(path) ||
    boundaryLock.protectedPrefixes.some((prefix) => path.startsWith(prefix))
  );
}

async function filesUnder(directory) {
  const files = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else files.push(path);
    }
  }
  await walk(directory);
  return files;
}

function parseArgs(argv) {
  const sourceIndex = argv.indexOf("--source");
  return {
    mode: argv.includes("--check") ? "check" : argv.includes("--apply") ? "apply" : argv.includes("--dry-run") ? "apply" : null,
    dryRun: argv.includes("--dry-run"),
    source: sourceIndex === -1 ? null : argv[sourceIndex + 1],
  };
}

async function sourceRepository(lock, sourceArg) {
  if (sourceArg) return { path: resolve(sourceArg), cleanup: null };
  const path = await mkdtemp(join(tmpdir(), "pstack-upstream-"));
  try {
    execFileSync(
      "git",
      ["clone", "--depth", "1", "--branch", lock.ref, lock.repository, path],
      { stdio: "inherit" },
    );
    try {
      execFileSync(
        "git",
        ["fetch", "--quiet", "--depth", "1", "origin", lock.commit],
        { cwd: path },
      );
    } catch {
      // A missing baseline makes protected-file review fail closed.
    }
    return { path, cleanup: path };
  } catch (error) {
    await rm(path, { recursive: true, force: true });
    throw error;
  }
}


export function posixKey(path) {
  return path.split(sep).join("/");
}

const DRIFT_SHOWN = 10;

async function protectedDrift(lock, sourceRoot) {
  const baselineCommit = lock.commit;
  const changes = [];

  for (const mapping of lock.sourceRoots) {
    const sourceDirectory = join(sourceRoot, mapping.source);
    for (const sourceFile of await filesUnder(sourceDirectory)) {
      const destinationKey = `${mapping.destination}/${relative(sourceDirectory, sourceFile).split(sep).join("/")}`;
      if (!isProtectedPath(destinationKey)) continue;
      const sourcePath = relative(sourceRoot, sourceFile).split(sep).join("/");
      try {
        const latest = hash(await readFile(sourceFile));
        const baseline = hash(execFileSync("git", ["show", `${baselineCommit}:${sourcePath}`], { cwd: sourceRoot }));
        if (latest !== baseline) changes.push(destinationKey);
      } catch {
        const here = existsSync(join(root, destinationKey));
        changes.push(`${destinationKey} (${here ? "hand-ported here; upstream has newer text" : `upstream added it after ${baselineCommit.slice(0, 8)} and the port does not have it`})`);
      }
    }
  }
  return changes;
}

async function applyUpdate(lock, sourceRoot, commit, dryRun) {
  const changed = [];
  for (const mapping of lock.sourceRoots) {
    const sourceDirectory = join(sourceRoot, mapping.source);
    for (const sourceFile of await filesUnder(sourceDirectory)) {
      const destination = join(
        root,
        mapping.destination,
        relative(sourceDirectory, sourceFile),
      );
      const destinationKey = posixKey(relative(root, destination));
      if (isProtectedPath(destinationKey)) continue;
      const next = normalizeContent(await readFile(sourceFile, "utf8"));
      let current = null;
      try {
        current = await readFile(destination, "utf8");
      } catch {
        // New upstream file.
      }
      if (current === next) continue;
      changed.push(destinationKey);
      if (!dryRun) {
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, next);
      }
    }
  }

  if (changed.length === 0) {
    console.log(`No managed skill changes for upstream ${commit}.`);
  } else {
    console.log(`${dryRun ? "Would update" : "Updated"} ${changed.length} managed files:`);
    for (const path of changed) console.log(`- ${path}`);
  }
  const frozen = await protectedDrift(lock, sourceRoot);
  if (frozen.length > 0) {
    console.log("");
    const shown = frozen.slice(0, DRIFT_SHOWN);
    console.log(`Upstream moved ${frozen.length} files the port owns and the updater never writes:`);
    for (const path of shown) console.log(`- ${path}`);
    if (frozen.length > shown.length) {
      console.log(`- ... and ${frozen.length - shown.length} more, listed in full by --check`);
    }
    console.log("Merge these by hand, then advance the pin. Until then the port is frozen at the older text.");
  }
  if (!dryRun && changed.length > 0) {
    await writeFile(
      lockPath,
      `${JSON.stringify({ ...lock, commit }, null, 2)}\n`,
    );
  }
  return 0;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args.mode || (args.source !== null && !args.source)) {
    console.error("Usage: sync-upstream.mjs --check [--source DIR]");
    console.error("       sync-upstream.mjs --apply [--dry-run] [--source DIR]");
    return 64;
  }
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  const source = await sourceRepository(lock, args.source);
  try {
    const commit = git(["rev-parse", "HEAD"], source.path);
    console.log(`pinned=${lock.commit}`);
    console.log(`latest=${commit}`);
    if (commit === lock.commit) {
      console.log("Upstream is already pinned at the latest checked revision.");
      return 0;
    }
    if (args.mode === "check") return 10;
    return await applyUpdate(lock, source.path, commit, args.dryRun);
  } finally {
    if (source.cleanup) await rm(source.cleanup, { recursive: true, force: true });
  }
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
