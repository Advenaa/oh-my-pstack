---
name: maintain-formal-verification-skill
description: "Bring a project's formal verification back in line with the code after the code changes, by finding the commits that touched verified code, updating the model, harness, or properties to describe the code as it is now, rerunning, and saying whether each failure is drift in the verification or a bug in the code. Use for /maintain-formal-verification-skill, \"is the model still true to the code\", or after merges and refactors that touched verified code without rechecking it."
disable-model-invocation: true
---

# Maintain a formal verification skill

Follow the [portable runtime contract](../pstack-pi/references/runtime.md) for project-local skill paths and questions. This pass needs no child roles.

A formal check proves a property of what it describes. When the code changes and the verification does not, the check can keep passing while it describes code that no longer exists. That pass is the dangerous case, because it looks like a proof. This skill is the upkeep loop for a verify skill that **create-formal-verification-skill** generated, or for any project-local skill that runs a model checker, a prover, or a code-level verifier against named code.

The project-local skill handles a change an agent makes while it uses that skill. This skill handles the changes that skipped it, which are merges, edits made without the skill, and drift that builds up across many commits. **maintain-verification-skill** runs the same upkeep for a skill that drives the app, and its scope carries over except where a model or a property file sits outside the skill directory. This file adds only the parts that a model, a property, and a sync commit change.

## Outcomes

Give each check one outcome, and say which.

- **in sync.** No change since the last sync alters what the check describes, and the check passes.
- **updated.** The code changed, the verification now describes the new code, and the check passes.
- **bug.** The verification describes the current code, and the code breaks the property. This is a finding about the code, not drift.
- **blocked.** The check could not be brought back in line or could not run. Say exactly why.

One check can be both updated and bug, when the update makes the verification describe the code again and the property then fails on it.

## Edit scope

Edit the verification and nothing else, which here means its models, harnesses, property files, and the verify skill, wherever those files live. A formal check often keeps its spec outside the skill directory, so the sibling **maintain-verification-skill** directory rule would put the model out of reach, and the rest of its scope applies as written. Product code stays untouched during a run. When a property fails on the current code, the create skill's findings rule decides what to do, and none of the options it allows is a weaker property.

## Pass

1. **Find the checks.** A verify skill has no fixed name, so find it by what it does, which is a project skill that runs a model checker, a prover, or another verifier against named code. Read each one you find, or the one the user named. For each check, collect the property, the code it covers, the bounds and assumptions, the command that runs it, and the commit where it was last confirmed to describe the code. If no verify skill exists, stop and point at the sibling **create-formal-verification-skill** skill. If a skill records no sync commit, use the last commit that changed the verification files, and say that you did.

2. **Run it as it is.** Run each check once before you change anything, and record the result. A pass here says the old description still holds, not that the code is correct. A failure here can be drift or a bug, so do not decide which until step 5.

3. **Read every change to covered code.** Diff the covered files from the sync commit to the current commit, and read each commit message. Look also for code that moved, since a covered function that is renamed, split, or moved to another file is still covered code, and for new code that touches the state a check guards, such as a new function that writes the same fields. For each change, decide which of these it is.
   - **No effect.** The change alters nothing the verification describes, such as formatting, comments, or code paths the verification does not cover. Check this against the model or harness, not against the commit message.
   - **The verification no longer describes the code.** A step that was one indivisible action is now two, a branch was added or removed, a check moved, a new path reaches the guarded state, or a value now has a different range. The model or harness must change.
   - **The promise changed on purpose.** The change alters what the code promises, and evidence in the change says that this is intended, such as the doc comment, the tests, the changelog, or the commit message. The property must change, and you must cite that evidence.
   - **The promise may be broken.** The code changed and no evidence says the promise changed. Treat a failure that follows as a bug candidate.

4. **Update from the code, not from the result.** Restore the true-to-the-code fidelity that **create-formal-verification-skill** requires, for each changed part. Write the update from the code before you rerun, and never shape it by what makes the check pass. Change a property only for a promise that changed on purpose, and write down the old wording, the new wording, and the evidence. Keep the bounds unless the change makes them wrong, and say so in the report when you must reduce one.

5. **Rerun and judge each result.** Both results are suspect, since a pass can come from a check that lost the ability to fail and a failure can be the verification talking about code that is gone.
   - **On a pass,** apply the create skill's proof step to the new code, breaking it where the property guards against and confirming the check catches it, then drop the break.
   - **On a failure,** replay the counterexample against the real code, step by step. If a step cannot happen in the code, the verification is wrong, so fix it and say what was wrong. If every step can happen, it is a bug. Name the commit that introduced it and state the harm in one sentence, with the counterexample told in the form the create skill asks for. When a cheap test or reproduction against the real code shows the bug, put it in the report as evidence and keep it out of product code.

6. **Update the verify skill.** Update the code each check covers, the commands, the bounds, the assumptions, and the sync commit. Set the sync commit to the commit you checked. Do not move it for a blocked check, and say so in the report. Then follow the verify skill once as the next agent would, so that you know its steps still run.

## Report

For each check, state the outcome and the commits you read. Then state what changed in the verification and why, with a short reason for each change, which is either that the code changed shape or that the promise changed on purpose with its evidence. Then give the rerun result and the break you used to show the updated check can still fail. Then give each bug in plain words, with its counterexample, its harm, and the commit that introduced it. Then say what the verification still does not cover, including new code that it should cover and does not.

Say outright which failures were drift in the verification and which were bugs in the code. For a check that passed before you updated it and fails after, say that the old pass was on a stale description. Ship the updates the way **maintain-verification-skill** step 6 ships a changed pass, with any product fix left out.
