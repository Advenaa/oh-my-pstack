---
name: create-formal-verification-skill
description: "Generate a project-local verification skill that formally verifies the code where a bug costs the most and tests reach the least, in any language, with whichever verification tool fits. Use for /create-formal-verification-skill, \"model-check this race\", \"prove this invariant\", or when concurrency, retries, state machines, parsers, or unsafe code need more than tests."
disable-model-invocation: true
---

# Create a formal verification skill

Follow the [portable runtime contract](../pstack-pi/references/runtime.md) for project-local skill paths, invocation, and user interaction.

A test checks the cases someone thought to write. Formal verification checks every case in a stated scope, which may be every order of steps in a model, every input up to a bound, or every input. This skill picks the promise in the repo where that coverage matters most, verifies one property of it, and leaves a project-local skill that lets the next agent check a change against that property. It is the formal sibling of **create-verification-skill**, which keeps the shared work of interviewing the repo, shaping a project-local skill, and proving what it generates. This file covers only what a model, an invariant, a state machine, or a proof obligation changes. The user must be able to trust the result and act on it without learning the verification language.

## Choose the target from the code

Run the interview in **create-verification-skill** step 1 first, then use its answer to pick the promise to verify. Take only the answers a checker needs, since a model check wants the surface and the code paths behind it, not ports or seed data, and the drive and observe answers matter only when the check runs the app. If the user named an area or a bug, start there.

A good target is a promise the code makes where a break harms users and tests rarely reach the case that breaks it. Choose the strongest such target in the repo, not the one that is easiest to verify. Concurrency, retries, state machines, parsers, and unsafe code are where these promises usually live, because the case that breaks one is an ordering, an input, or a size that a hand-written test did not think to write.

## Let the question choose the tool

Pick the tool that answers the question at the lowest cost, whether a model checker, a proof assistant, an SMT-backed verifier, or another tool, and tell the user why you chose it.

- Whether events can happen in a bad order usually suits a model checker over a small model of the design, and TLA+ is the default for that in any language.
- Whether the code itself behaves for every input, as with memory safety, overflow, or a data-structure invariant, usually suits a verifier that runs on the code.
- If no verifier runs on this language, say so, and test the real code with generated inputs rather than a model you wrote by hand.
- A property that must hold at every size, where a bound is not enough, can need a proof.

Prefer a tool the repo's developers can install and run, with a version you can pin.

## What makes it good

- **True to the code.** Every part of the model or proof points to code a reviewer can open. What the verification treats as one indivisible step is one indivisible step in the code, and the names come from this repo.
- **Able to fail.** A check you have never seen fail proves nothing. Show each property failing on a broken variant of the code it guards, such as a removed check or a reordered step.
- **Findings stay findings.** When the current code breaks the property, report it with the counterexample in the code's terms. Do not weaken the property or the model until it passes, and leave product code alone unless the user asks for a fix.
- **Honest about scope.** State what is verified, under which bounds and assumptions, and what is left out. A pass covers the model or the bound, never the whole system.
- **Readable without the tool.** State the property and the harm in one plain sentence each, and tell each counterexample as a short sequence of steps in the code's words.
- **Cheap to rerun.** One command, a reproducible tool version, and a run short enough that the next agent will use it on every relevant change.
- **Kept in step with the code.** Record the files and functions each check covers and the commit at which you last confirmed that the verification describes them. When covered code changes after that commit, the next agent can see that the verification needs another look.

## Generate the verify skill

Generate the skill as **create-verification-skill** step 2 generates one, in the same place and with the same structure, and add the formal parts below.

Give it frontmatter as step 2 does, with a description that names the area and says when to use it. From the skill alone the next agent must be able to tell whether a change touches the verified code, run the check, tell a real bug from a modeling error, and update the verification when a change is intended.

The skill carries two things the informal one does not. Its coverage record lists the files and functions each check covers. Its sync commit is the commit at which you last confirmed that the verification describes them. Tell the next agent to move the sync commit forward only after it confirms that the verification describes the code at the new commit.

A check that runs the app also needs the launch, doctor, drive, evidence, and cleanup sections from step 2. A model or a code-level verifier usually runs offline, so include them only when the check needs a running instance.

If the check is a TLA+ model, tell the next agent to read every result with the sibling **statechart** skill, which gives each rule that breaks as its shortest path in plain words and charts how the system moves between states. Refer to that skill by name and copy none of its commands, options, or file paths, which change between releases and machines.

## Prove it before you hand off

Run the generated skill as the next agent would and fix what does not run, as **create-verification-skill** step 4 requires. The unit of proof here is a break. Make a scratch change that breaks the property in the real code and confirm the check catches it. Then drop the scratch change and confirm the check is back where it started, passing or failing only on the findings you will report. If the skill misses the break, fix the skill or the verification, never the scratch change.

## Hand off

Tell the user what you verified, which tool you used and why, the bounds, what the check found in plain words, how to run it, and what it does not cover. Suggest a second target only if you found a close one. Point the user at the sibling **maintain-formal-verification-skill** skill for bringing the verification back in line after changes that did not recheck it.
