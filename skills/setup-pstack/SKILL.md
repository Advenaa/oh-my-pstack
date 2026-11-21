---
name: setup-pstack
description: Configure which host-supported roles or models pstack uses per workflow role and at what reasoning budget. Detects the live host inventory and writes portable project-local configuration. Use for /setup-pstack, "configure pstack models", "pstack budget", or changing pstack's role choices.
---

# Setup pstack

Follow the [portable runtime contract](../pstack-pi/references/runtime.md) throughout this setup.

Write the optional pstack configuration at `$PSTACK_CONFIG` when that variable is set; otherwise use `.pstack/config.md` in the current project. It sets pstack's model and reasoning budget per role. This is an override layer, not a requirement. Never write to a vendor-specific home directory.

## Steps

Model discovery and model assignment are different capabilities. A model listed by
`pi --list-models` is available to the current Pi process, but that does not mean a
workflow can send work to it. Per-role assignment also requires a host task or
subagent facility that accepts a model choice. Native Pi intentionally does not
include subagents. Do not claim that a role was assigned when that facility is
absent.

### Pi delegation prerequisite

For native Pi, recommend the maintained `pi-subagents` package when the user wants
parallel workers or per-role models:

```bash
pi install npm:pi-subagents
```

Tell the user to restart Pi after installation, then run `/subagents-doctor`.
Continue setup only when the `subagent` tool and the expected agents are visible.
The package supplies the delegation facility; it does not choose pstack's model
policy by itself.

### OpenCode delegation prerequisite

OpenCode has its own native primary and subagent agents. Do not install
`pi-subagents` or write Pi-specific settings when the current host is OpenCode.
Use the agents and concrete `provider/model-id` choices reported by OpenCode, and
keep their model configuration in the host's `opencode.json` or
`opencode.jsonc`. If OpenCode does not expose a usable subagent, report that
limitation instead of substituting a Pi-specific mechanism.

### 1. Detect available choices

Detect each of these independently:

1. The model IDs the current host actually exposes.
2. Whether the current host exposes a task or subagent facility that can select a
   model for each child.
3. The reasoning levels each model accepts, when the host exposes a reasoning setting.

For Pi, `pi --list-models` is the model inventory and the `provider/model-id` form
is the concrete value to record. With `pi-subagents` installed, the `subagent`
tool and `/subagents-doctor` establish the delegation inventory. The live host
inventory is authoritative. Never copy a vendor slug from prose or guess that a
model is available.

If the host has a task facility but cannot enumerate models, use only a host role
mapping that the facility documents. Do not ask the user to invent a raw slug.
`inherit-parent` is valid only when the host can pass the current model to a child.

### 2. Load current state

The default role mapping is the shape shown in step 5, with each placeholder filled by the model the host maps to that canonical role. Read the selected configuration path when it exists and treat its `# budget` line and its concrete values as the current choices. Otherwise start from those defaults. If it contains only portable role aliases from a host without per-child delegation, treat those aliases as stale inactive state and start from the detected models instead of carrying them into Pi's agent overrides.

A line whose role is not in step 5, such as `hardest tasks`, `how critics`, `why investigators`, `reflect tooling`, or `architect runners`, is from a retired role. Drop it. A configuration without the `# defaults: 3` line comes from an older setup; after dropping its retired lines, every remaining explicit value is the user's choice and stays. Tell the user which lines you dropped.

### 3. Budget, map, and confirm

If the host exposes models but no task or subagent facility, stop model mapping
with an explicit capability report. For native Pi, recommend
`pi install npm:pi-subagents`, a restart, and `/subagents-doctor`. For OpenCode,
explain that its native agents are not visible or configured and point the user
to the host's agent configuration. For any other host, name the missing
capability without proposing a vendor-specific substitute. Say that no pstack
role can receive a different model in this session and do not present the
portable defaults as an assignment or overwrite an existing role configuration
with inactive aliases.

**(a) Ask for a budget.** Use the host's structured question facility, or one focused chat question when it has none. Offer these three options with these exact labels, and name the current budget when the configuration records one. With no configuration, say that `large` matches the skill defaults.

- `large — xhigh reasoning`
- `medium — high reasoning`
- `small — medium reasoning`

**(b) Apply it.** Build the working table from the defaults, and on a re-run keep any role the user changed by model, family, list, or `inherit-parent`. Families are the ones Phase A of the **arena** skill defines. Each role has a target level, which is its default level moved by the budget. `large` keeps it, `medium` lowers it one step, and `small` lowers it two steps, on the ladder `xhigh` > `high` > `medium` > `low`. No role runs above `xhigh`, and a target at the bottom of the ladder stays there. The code playbook roles and `judgment and prose` default to `xhigh`, so each budget label names where those land. Panel entries and `swarm workers` default to `high`. Set the reasoning level of every explicit model in the role, panel entries included, to the role's target. If the host does not offer that level for the model, use the highest level it offers at or below the target, else mark the role as needing a choice. `inherit-parent` does not change. If the host has no per-child reasoning setting, keep the models, record the budget, and say that the level cannot be applied on this host.

**(c) Show the roles and confirm.** Show every workflow role with its concrete `provider/model-id` choice and level. Mark an explicit model absent from the live inventory as needing a replacement, and list each line step 2 dropped. Ask the user to accept or change the choices, offering only detected model IDs at `xhigh` or below and `inherit-parent` when supported (it means the role runs on the parent chat model). Use the host's structured question facility, or one focused chat question when it has none.

For panel roles (`arena runners` and `interrogate reviewers`), the value is a list, and one child runs per entry, alias entries included, so list length controls fan-out. Prefer diversity for judgment-sensitive panels. `arena cross-judge pool` is also a list, but Arena runs one judge. It tries only values from a vendor other than the parent's, in list order, so order it by preference and list more than one vendor. An `inherit-parent` value never judges. `swarm workers` is the default choice for every worker unless a race or comparison assigns another choice per arm.

### 4. Validate

Every explicit model written must be present in the detected host inventory and at
`xhigh` or below. Role aliases pass only when the host task facility documents those
aliases. `inherit-parent` passes only when the host can pass the current model to a
child. If a selected explicit model is unavailable, stop and ask for a replacement.
Never write a configuration that requires another host.

### 5. Write the configuration

When the host supports per-child selection, create the parent directory when
needed and overwrite the selected file so re-runs remain idempotent. Write the
`# defaults: 3` line, a `# budget` line with the chosen label and the level that
label names, and one line per role, using the same labels poteto-mode uses. Use
concrete detected model IDs in this shape. Replace every placeholder with a model the
current host reported, and use `inherit-parent` only when the host supports it.
Write each model's level in the form the host accepts: as part of the model value
when the host takes it there, otherwise in the host's separate reasoning setting.

```md
# pstack role and model configuration. One line per role. Delete a line to fall back to the host default for that role.
# Values are concrete provider/model-id choices confirmed by the host. `inherit-parent` runs the role on the parent chat model; alias entries in a panel list still count toward its fan-out.
# defaults: 3
# budget: large (xhigh)
feature, refactoring: <implementer-model>
bug-fix: <reviewer-model>
perf-issue: <reviewer-model>
hillclimb: <implementer-model>
judgment and prose: <reviewer-model>
arena runners: <designer-model>, <planner-model>, <reviewer-model>
arena cross-judge pool: <reviewer-model>, <planner-model>
swarm workers: <implementer-model>
interrogate reviewers: <reviewer-model>, <planner-model>, <designer-model>
```

For Pi with `pi-subagents`, also preserve unrelated keys and update the project's
`.pi/settings.json` with the concrete model assignments for the discovered
subagent names. Use this mapping unless the user chooses different agents:

| pstack role | pi-subagents agent |
| --- | --- |
| `explorer`, `watcher` | `scout` |
| `researcher` | `researcher` |
| `implementer`, `mechanical` | `worker` |
| `reviewer` | `reviewer` |
| `planner`, `designer`, `synthesizer` | `oracle` |
| `owner` | `delegate` |

Write the selected IDs under `subagents.agentOverrides.<agent>.model`:

```json
{
  "subagents": {
    "agentOverrides": {
      "scout": { "model": "<explorer-model>" },
      "researcher": { "model": "<researcher-model>" },
      "worker": { "model": "<implementer-model>" },
      "reviewer": { "model": "<reviewer-model>" },
      "oracle": { "model": "<planner-model>" },
      "delegate": { "model": "<owner-model>" }
    }
  }
}
```

For OpenCode, do not write `.pi/settings.json`. Keep the concrete model choices in
the user's existing `opencode.json` or `opencode.jsonc`, and use the live
OpenCode agent names in the pstack role map. Preserve unrelated configuration.

### 6. Confirm

If a concrete configuration was written, tell the user the exact path, the budget,
and the model IDs assigned to each role family. It applies to children spawned after
it was written, and re-running this skill updates it. For Pi, name both
`.pstack/config.md` and `.pi/settings.json`, and tell the user to run
`/subagents-models` to inspect the live mapping. For OpenCode, name the
`opencode.json` or `opencode.jsonc` path used. State that configuration does not
create models, child agents, permissions, or delegation facilities.

If the host lacks per-child model selection, report that no role configuration was
written or activated. Tell the user which model is active and how to switch the
single Pi session model.

### 7. Offer a verification skill (optional)

Check whether the project has a way to drive the real app for proof, such as a `verify-*` skill or an existing harness. If not, offer once to invoke the sibling **create-verification-skill** skill, so agents can drive the app the way a user does and prove changes work. On no, move on without pushing.

### 8. Offer a formal verification skill (optional)

Check whether the project already has a formal verification skill (a project skill that runs a model checker, a proof, or another verifier against the code). If not, offer once to invoke the sibling **create-formal-verification-skill** skill, so agents can prove a key property of the code holds in every case in scope, not only the cases tests reach. On no, move on without pushing.
