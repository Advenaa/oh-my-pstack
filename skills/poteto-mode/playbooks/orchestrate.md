### Orchestrate

**You run the program, never the code. Decide which agent does each piece of work, then check what each one produces.** For a whole project handed to one standing coordinator chat: multi-day, many stacked PRs, dozens to hundreds of delegated sessions, the human checking in twice a day instead of every five minutes. One task driven to a predicate is Autonomous run. One ambitious run needing a bespoke workflow is figure-it-out. Route here when the work outlives any single agent. Work one agent could finish inside the session's budget is not a program; measured head-to-head, this playbook's ceremony turned a half-hour 12-unit job into 1 landed unit while a plain agent landed all 12. Below that line, route to Autonomous run.

Ceremony must scale with the program. Every gate below prices in coordinator minutes; on cheap near-identical units, collapse it as each section directs rather than paying list price.

Run it with your own tools. Spawn every worker with `task`, one `tasks[]` item each, and let omp deliver the results itself, so you never poll and never relay messages or status between agents. Read a PR's live state with `gh` yourself. Keep the program's state in the store below and in the append-only overview. Call no orchestration script.

Three rules carry the rest.

- Completions are queue events, not interrupts.
- Every start and every follow-up carries the standing orders verbatim.
- The brief is the product. A vague brief fails quietly, because a worker must return ambiguity to the root instead of asking the user.

Open an explicit plan with the steps below copied in verbatim. A step you skip stays listed with `skip: <reason>`.

#### Roles and placement

- **Coordinator (this chat).** Local. Frames, assigns each piece of work to an agent, authors briefs, drains the inbox, owns the human report, makes judgment calls. It never authors or edits code: conflicted merges, restacks, and code changes are always tasks. Mechanically landing a verified unit (fast-forward or clean cherry-pick of a worker's commit, then push) is bookkeeping the coordinator may do itself on repos where local git is cheap; queueing finished work behind an idle owner is how a deadline harvests nothing. The loop is agentic end to end. It starts each session with `task` and gives a role's next round a fresh agent, per `skill://pstack-pi`.
- **Sub-coordinator.** A root-started canonical `owner` **Long-lived owner** session, one per track, and only when the program exceeds what one coordinator can drain. A track the coordinator can drain itself needs no middle layer: each layer re-pays a full orientation preamble, and a blocking sub-coordinator hides work while the root idles. It owns its track's units and boards, authors standalone worker and verifier briefs, and returns those briefs to the root to start. Children never start children. It rolls up aggregates at wave boundaries and never forwards raw reports. Cap in-flight children at what one drain can process, roughly ten, as a rolling window; never as blocking batches, which cost the slowest child of every batch.
- **Worker / verifier.** Root-started canonical `implementer`, `mechanical`, or `reviewer` sessions, with the model family and reasoning level the role's configuration in `skill://pstack-pi` names, raised or lowered for the job. A unit's verifier is an independent session from its worker, on a different model family, so a rerun on the worker's own model cannot pass for review. Choose isolation explicitly: a writer gets its own worktree (`isolated: true`) unless outputs are structurally disjoint. Sessions that need installed control capabilities, Studio, the Cua driver, workspace-scoped history, simulators, IDE state, or local authentication run where those resources exist. A bulk unit that needs none of them may run on a remote worker host when the host configuration has one; that unit stops at a pushed branch, and this chat lands it. Never copy files between machines. Briefs inline everything not available through named repository paths or runtime resources. Prefer fewer, broader workers; one writer per worktree or branch (principle-separate-before-serializing-shared-state).

Depth stays at coordinator, track, worker. Author the track decomposition per project (build, landing, and verification are common cuts, not a required shape); hard-coded swarm trees were tried and parked as too rigid.

#### Store layout

Create `orchestrate/<project-slug>/` in the current agent's store (path in the system prompt). Every file has exactly one writer; owners publish facts, readers aggregate at read time. The files are plain TSV, JSON, and markdown, written with the coordinator's own file tools one row or one pointer per event, and readable without any tooling.

- `preferences.md` is the standing-orders register: numbered lines, one constraint each (placement policy, stack shape and count, verification bar, forbidden paths, escalation policy). Paste it verbatim into every start and every follow-up; directives decay across resumes, and each dropped one costs a human turn. When you catch yourself restating an instruction, append the line before you act (principle-encode-lessons-in-structure).
- `overview.md` is the durable PR and issue DB and the program's tracker. Append; never rewrite wholesale per event.
- `units.tsv` has one row per unit: id, track, state, canonical role, agent id, job id, generation, branch, PR, head SHA, brief path. Read a child's full result from `agent://<id>` and its transcript from `history://<id>`, never by messaging it. Update rows in place.
- `frontier.json` is the computed merge frontier, per Stack safety.
- `ledger.tsv` is the verification ledger, per Verification.
- `inbox/` holds completion pointers with the unit, its status, and the report path. `gates.md` parks human gates (question, options, default on no answer) so a completion flood cannot wipe the active user-question state.
- `decisions.tsv` is the trail via the show-me-your-work skill.
- `status.md` is derived from `units.tsv` and `ledger.tsv` at each drain, never hand-maintained; regenerate it from the tables instead of narrating events into it, because hand-churned boards get rewritten on every event and go unreadable.

#### The brief

Your briefs to delegated sessions are your only product, and a sloppy brief compounds into slop across the whole tree. Every start carries all of it, including the evidence that proves the work is done; a field you cannot fill is a unit you have not scoped yet.

```
GOAL         one sentence, the outcome, executable by a stranger with no chat access
ROLE         canonical role and selected lifecycle protocol
SCOPE        paths this unit may write; paths it may not; its exclusive worktree or branch
CONTEXT      pointers to files and PRs; upstream reports pasted in full when this unit
             depends on them, because workers cannot see siblings
ACCEPTANCE   checkable criteria, one per line
VERIFY       exact commands or the control-skill path, plus known gotchas
TIMEBOX      rough cap on runtime; on expiry, return partial findings and stop rather than run on
FORBIDDEN    no rebase, force-push, base change, or PR close unless the brief grants that exact
             operation; no fixes outside scope; unit-specific bans
REPORT       status, branch, head SHA, PRs, verdict, what you actually ran, deviations,
             suggested follow-ups
STANDING     <preferences.md pasted verbatim>
```

Size the brief to the unit. A one-command unit gets the template collapsed to a paragraph that still names goal, scope, the verify command, and the report shape; a 4KB scaffold around a two-line edit costs more to write and obey than the edit. Sessions with access to the store may reference the standing-orders file by path; otherwise paste it verbatim on every start and follow-up.

A sub-coordinator brief adds its track boundary and unit list, its delegation budget and isolation rules, the drain protocol, and the rollup format (per child: name, status, PR, head SHA, verdict, one line; plus track status and frontier delta).

A dependency is a context relay, not just ordering: undeclared upstream context makes the worker guess. Missing fields are a refuse-to-start condition. Audit one sampled worker brief per sub-coordinator per wave, concurrently with the wave it samples, never as a gate in front of it; a failing brief stops that track and fixes the sub-coordinator's instructions, not just the worker, because brief quality decays late in a run. Never follow-up-chain a changed unit brief; start a fresh bounded session with consolidated scope.

#### Steps

1. **Frame.** State the done predicate as something countable ("all 126 units merged, each ledger-verified `unit-test-verified` or better"). Quantify scope: units, rough effort, expected stacks, and the wall-clock budget. If one agent could finish inside that budget, stop here and run Autonomous run instead. Collapsing must not depend on another document being present: it means do the work directly in this session, plain workers where they help, verification inline, landing as you go, and none of the store, register, or pilot machinery below. Schedule landing against the budget: by roughly 70% of it, stop starting new work and land what is verified, because finished-but-unlanded work counts as zero. Name the tracks per project. A contested decomposition or one-way door goes through the arena skill before the pilot. Present the framing once; reversible prep proceeds without waiting.
2. **Open the store.** Create the store files. Open the trail via the show-me-your-work skill, write the standing orders before any delegated start, and seed `frontier.json` from the open PRs with `gh pr list` and `gh pr view`.
3. **Pilot.** Push one unit through the whole path: brief, worker, verification, stack entry, ledger row, merge. The pilot exists to falsify the brief template, the verify recipe, and the unit size while that costs one agent instead of fifty. Fix the contract from pilot evidence before any fan-out. Scale the pilot to the unit: on programs of near-identical cheap units, the first unit is the pilot, run as a normal unit with its verify command inline, and fan-out starts the moment it lands. The dedicated pilot pipeline (separate verifier agent, audit gate) is for expensive or novel unit shapes, not for clone-units where a serialized pilot has nothing to falsify.
4. **Scale.** Start a rolling window of workers up to the in-flight cap, refilling as children finish; blocking batches pay the slowest child of every batch. Start track sub-coordinators only past the one-drain threshold in Roles. Recompute ready work after each drain; relay upstream reports into downstream briefs; keep sibling communication upward only. New work that needs a worker's built state, its checkout, its uncommitted changes, or a process it still runs, continues in that worktree on that branch instead of a fresh isolated copy. The sampled brief audit runs alongside the wave it samples and stops the next refill on failure, not the current one.
5. **Drain.** Run the queue discipline below at every drain point.
6. **Land.** Landing is continuous, never a terminal phase: integration starts with the first verified unit and runs alongside the remaining waves. On heavy repos the topology holder is a standing role from wave one, integrating as units verify; on repos where local git is cheap, the coordinator lands verified units itself per Roles. Keep the frontier green before upper-stack work; Stack safety governs. Advance `frontier.json` only on merge or reported new head SHAs.
7. **Close.** Drain the final inbox, reconcile every started session to a terminal row (done, abandoned, zombie-reconciled), confirm the predicate on the real artifact, confirm every landed PR has a verdict for its current head SHA, audit the trail per show-me-your-work including its independent reviewer pass, encode recurring corrections into `preferences.md` or the brief template. Leave the store intact; it is the postmortem.

#### Queue and drain

- On a completion, append its pointer to `inbox/` with the unit, the status, and the report path, then return to what you were doing. Never deep-review inline; a completion that needs review becomes a verifier unit. Never review a diff inside a drain.
- Drain in batches at four points: the end of a critical section, a track rollup, a frontier watcher wake (arm it through the **One-shot watcher** protocol, with a long root-controlled fallback), and before a human report. Arrivals during a drain wait for the next one.
- Nothing on this host pushes PR or CI events into the chat, so a watcher is one bounded session over one frontier generation and between its wakes the coordinator reads live state at the next drain. No polling loop runs in the coordinator.
- Critical sections you finish first: authoring a brief, a stack operation, a conflict decision, writing a gate, updating ledger or frontier.
- Each drain classifies every pointer (landed, needs-verify, failed, zombie, noise), writes the resulting rows into `units.tsv` and `ledger.tsv`, regenerates `status.md`, then starts the next wave with `task` before waiting.
- Account for every started participant at its track's rollup: arrived, respawned, or its scope explicitly absorbed. Silently redoing a missing child's work hides both the wasted spend and the coverage gap its result existed to close.
- A drain turn ends with the three lines from `status.md`: counts against the states, what changed, gates open. Detail lives in `status.md`; the full reply contract applies at checkpoints and close.

#### Stack safety

- **One owner per PR.** The owner is the only writer of its branch and carries the PR from build to merge; only the owner pushes its branch and rebases it. Closing or retargeting a base PR orphans every PR above it, so that call goes through the topology holder on your instruction, and conflicted merges, chain restacks, and fixes go to the owner whose branch moved.
- The frontier is a computed object, never narrative. Recompute `frontier.json` from the forge after every merge and retarget, because GitHub base refs drift mid-restack. It holds a generation number for the frontier as a whole, the lowest unmerged PR, and one entry per PR with its base ref, branch name, and head SHA. Read it with `gh pr view <n> --json number,baseRefName,headRefName,headRefOid` and `gh pr checks <n>`; a branch the forge cannot resolve is an error, never a guess.
- Exactly one topology holder per program changes a base or closes a PR, and the standing orders name it; an owner that thinks its base is wrong asks the holder instead of editing it. A restack of more than one branch in one motion runs in one isolated owner worktree, never on an interactive workstation, because two owners rebasing one chain race each other.
- A worker outside that grant never rebases or force-pushes, and its brief names the exact operation when it may. Babysitters follow `skill://poteto-mode/playbooks/babysit.md`, one per stack, scoped to one immutable frontier generation; they report conflicts to the owner rather than restacking.
- Merges and stack surgery are units with briefs like any other. One retro watcher follows merged PRs for reverts, post-merge CI breaks, and orphaned follow-ups.

#### Verification

Scale verification to the unit. When VERIFY is a single cheap command, the worker runs it and reports the output, and the coordinator spot-checks receipts; a dedicated verifier agent (in a session independent from the worker) is for units whose verification is expensive, judgment-laden, or high-blast-radius. A verifier agent whose entire product would be rerunning one command is ceremony, not verification.

Read the diff or the artifact, not only the worker's summary. Write each verdict as one row of `ledger.tsv`, keyed by PR number plus head SHA: `live-ui-verified | unit-test-verified | type-check-only | verifier-blocked | verifier-failed`. Confirm the current head with `gh pr view <n> --json headRefOid` before you trust a row. CI green is an input to a verdict, not a verdict. Behavioral work needs better than `type-check-only`. `verifier-blocked` is not a pass; start a fresh verifier when the runtime resource heals. `verifier-failed` gets a fix unit, not a re-verify. A worker may self-report; a verifier overrides it on the same key. A new head SHA voids the row, so re-verify after restack. The ledger answers "was this verified", not memory and not the transcript.

A unit is not done until its output is externalized the moment it lands, never batched to the end of the run: a worker pushes its branch, a verifier writes its ledger row, receipts land in the store. Work that exists only on one VM when that VM dies was never done.

Before you report on any PR, read its live state with `gh pr view` and `gh pr checks`, never the worker's last report.

#### Liveness and failure

- Judge a worker by its pushes and PR activity, not its status text. Never send a follow-up merely to check liveness; a message wakes an idle agent. Read `agent://<id>` and `history://<id>`, the ledger, `units.tsv`, `gh`, and the pushed branches instead. Session-history timestamps are not liveness.
- A silent death gets a synthetic postmortem row in the inbox (unit, failure mode, last evidence, options). Replan on evidence as it arrives; never wait for full quiescence.
- Retry by mode: cap-hit or oom, start fresh with smaller scope; network-drop, retry as-is; tool-error, start a fresh session with the same canonical role, a different model, and repaired tool instructions; unknown, retry once. Two retries, then abandon the unit and replan around it.
- A zombie that returns hours late reconciles against the current frontier and ledger before anything is accepted; the world moved while it slept. Salvage unique findings through a fresh unit, never a blind merge.
- When continued spawning would produce garbage tree-wide (bad upstream output, broken acceptance, dead infra), write a stop line at the top of the standing orders, let in-flight work finish, fix the cause, clear it.
- Bound your own infra retries the same way you bound a child's. After a few consecutive tool aborts, stop retrying: write a terminal handoff to durable state (what is done, where it lives, the exact command to resume) and end the run. Hours of retry loops against a dead executor produce nothing a handoff would not.
- After a host restart, trust durable artifacts rather than assumed session liveness. Re-read the standing orders and `units.tsv` from disk, recompute the frontier, reconcile work by PR, branch, and agent id, start one fresh sub-coordinator per track from its stored brief plus current state, drain, resume. Rows are written by hand, so reconcile two rows for one unit against the PR rather than trusting either.

#### Escalation

Reaches the human, batched into the status page rather than per item: irreversible actions (force-push to shared branches, deploys, deletions, closing someone else's PR), genuine product or preference calls no experiment settles, a standing order that contradicts observed reality, a program-level dead end that survived a replan. Park each as a `gates.md` entry before asking, and route work around it.

Never reaches the human: frontier nudges, restack mechanics, retries, CI flake triage, review-thread triage, format fixes, scope the brief already forbids (refuse and continue), and "should I keep going". When in doubt, act and log; deferring is the measured failure mode.

Mid-run discoveries fix only what blocks the frontier. Work that drifts from scope or grows past what the brief asked goes back as a narrower unit. Everything else parks in follow-ups; at this fan-out a small scope leak multiplies into PRs nobody asked for.

**Reply:** at checkpoints and close: the predicate and the count against it from `units.tsv` and `ledger.tsv`, tracks and what each landed, the frontier (PR list plus SHAs read from `gh` at report time), verdicts summary, what was abandoned and why, gates awaiting the human (the only asks), the store path, and the trail path. Numbers from the tables, not narrative. Include PR links.
