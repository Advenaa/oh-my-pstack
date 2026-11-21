#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(
  process.env.PSTACK_SYNC_ROOT ?? dirname(fileURLToPath(import.meta.url)),
  process.env.PSTACK_SYNC_ROOT ? "." : "..",
);
const lockPath = join(root, "upstream.lock.json");
const boundaryLock = JSON.parse(readFileSync(lockPath, "utf8"));

function git(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function lf(text) {
  return text.replaceAll("\r\n", "\n");
}

export const VENDOR_MODEL_ID =
  /\b(?:claude|gpt|grok|gemini|composer)(?:-[a-z]+)*-[0-9][a-z0-9.]*(?:-[a-z0-9.]+)*\b/gu;

export function normalizeContent(source) {
  return source
    .replaceAll("~/.cursor/rules/pstack-models.mdc", "$PSTACK_CONFIG (or .pstack/config.md)")
    .replaceAll(".cursor/skills/", "skills/")
    .replaceAll(".cursor/plugins/", "plugins/")
    .replaceAll("subagent_type:", "agent:")
    .replaceAll("AskQuestion", "structured interaction tool")
    .replaceAll('environment: "cloud"', "environment: host-managed")
    .replaceAll("environment: 'cloud'", "environment: host-managed")
    .replaceAll(VENDOR_MODEL_ID, "host-configured role/model")
    .replaceAll(/\bTask (?:subagent|tool)\b/g, "host task runner")
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

function destinationKey(lock, sourcePath) {
  for (const mapping of lock.sourceRoots) {
    if (sourcePath.startsWith(`${mapping.source}/`)) {
      return `${mapping.destination}/${sourcePath.slice(mapping.source.length + 1)}`;
    }
  }
  return null;
}

function upstreamFiles(lock, sourceRoot, commit) {
  const sources = lock.sourceRoots.map((mapping) => mapping.source);
  return git(["ls-tree", "-r", "-z", "--name-only", commit, "--", ...sources], sourceRoot)
    .split("\0")
    .filter(Boolean)
    .map((sourcePath) => ({ sourcePath, key: destinationKey(lock, sourcePath) }));
}

function upstreamChanges(lock, sourceRoot, baselineCommit, commit) {
  const sources = lock.sourceRoots.map((mapping) => mapping.source);
  let output;
  try {
    output = git(
      ["diff", "--name-status", "-z", "--no-renames", baselineCommit, commit, "--", ...sources],
      sourceRoot,
    );
  } catch (error) {
    const detail = String(error?.stderr ?? error).trim();
    throw new Error(`Cannot compare the pinned upstream ${baselineCommit} with ${commit}, so drift is unknown: ${detail}`);
  }
  const fields = output.split("\0").filter(Boolean);
  const changes = [];
  for (let index = 0; index < fields.length; index += 2) {
    changes.push({ status: fields[index], key: destinationKey(lock, fields[index + 1]) });
  }
  return changes;
}

function parseArgs(argv) {
  const sourceIndex = argv.indexOf("--source");
  return {
    mode: argv.includes("--check") ? "check" : argv.includes("--apply") || argv.includes("--dry-run") ? "apply" : null,
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
      ["clone", "--depth", "1", "--no-checkout", "--branch", lock.ref, lock.repository, path],
      { stdio: "inherit" },
    );
    try {
      git(["fetch", "--quiet", "--depth", "1", "origin", lock.commit], path);
    } catch {
      // upstreamChanges fails closed when the baseline is missing.
    }
    return { path, cleanup: path };
  } catch (error) {
    await rm(path, { recursive: true, force: true });
    throw error;
  }
}

const DRIFT_SHOWN = 10;

function protectedDrift(changes, baselineCommit) {
  const since = baselineCommit.slice(0, 8);
  return changes
    .filter((change) => isProtectedPath(change.key))
    .map(({ status, key }) => {
      if (status === "A") {
        const here = existsSync(join(root, key));
        return `${key} (added upstream after ${since}; ${here ? "the port already has a file there" : "the port does not have it"})`;
      }
      if (status === "D") return `${key} (deleted upstream after ${since})`;
      return key;
    });
}

async function syncManaged(lock, sourceRoot, commit, changes, dryRun) {
  const changed = [];
  for (const { sourcePath, key } of upstreamFiles(lock, sourceRoot, commit)) {
    if (isProtectedPath(key)) continue;
    const destination = join(root, key);
    const next = normalizeContent(lf(git(["show", `${commit}:${sourcePath}`], sourceRoot)));
    let current = null;
    try {
      current = lf(await readFile(destination, "utf8"));
    } catch {
      // New upstream file.
    }
    if (current === next) continue;
    changed.push(key);
    if (!dryRun) {
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, next);
    }
  }
  const removed = [];
  for (const { status, key } of changes) {
    if (status !== "D" || isProtectedPath(key) || !existsSync(join(root, key))) continue;
    removed.push(key);
    if (!dryRun) await rm(join(root, key));
  }
  return { changed, removed };
}

async function review(lock, sourceRoot, commit, { dryRun, fullDrift }) {
  const changes = upstreamChanges(lock, sourceRoot, lock.commit, commit);
  const { changed, removed } = await syncManaged(lock, sourceRoot, commit, changes, dryRun);

  if (changed.length === 0 && removed.length === 0) {
    console.log(`No managed skill changes for upstream ${commit}.`);
  }
  if (changed.length > 0) {
    console.log(`${dryRun ? "Would update" : "Updated"} ${changed.length} managed files:`);
    for (const path of changed) console.log(`- ${path}`);
  }
  if (removed.length > 0) {
    console.log(`${dryRun ? "Would remove" : "Removed"} ${removed.length} managed files upstream deleted:`);
    for (const path of removed) console.log(`- ${path}`);
  }

  const frozen = protectedDrift(changes, lock.commit);
  if (frozen.length > 0) {
    console.log("");
    const shown = fullDrift ? frozen : frozen.slice(0, DRIFT_SHOWN);
    console.log(`Upstream moved ${frozen.length} files the port owns and the updater never writes:`);
    for (const path of shown) console.log(`- ${path}`);
    if (frozen.length > shown.length) {
      console.log(`- ... and ${frozen.length - shown.length} more, listed in full by --check`);
    }
    console.log("Merge these by hand, then advance the pin. Until then the pin stays at the older revision.");
  }

  if (!dryRun && frozen.length === 0 && changed.length + removed.length > 0) {
    await writeFile(lockPath, `${JSON.stringify({ ...lock, commit }, null, 2)}\n`);
  }
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
    const commit = git(["rev-parse", "HEAD"], source.path).trim();
    console.log(`pinned=${lock.commit}`);
    console.log(`latest=${commit}`);
    if (commit === lock.commit) {
      console.log("Upstream is already pinned at the latest checked revision.");
      return 0;
    }
    if (args.mode === "check") {
      await review(lock, source.path, commit, { dryRun: true, fullDrift: true });
      return 10;
    }
    await review(lock, source.path, commit, { dryRun: args.dryRun, fullDrift: false });
    return 0;
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
