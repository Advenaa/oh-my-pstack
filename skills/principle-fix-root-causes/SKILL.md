---
name: principle-fix-root-causes
description: "Apply when debugging. Reproduce first, then trace each symptom to the first place the system went wrong and fix it there; a guard is a fix only when the state it handles is legitimate."
disable-model-invocation: true
---

# Fix Root Causes

When debugging, fix the fault, not the place where it surfaced. The symptom is where a wrong state became visible. The root cause is the first place the system did something it should not do, or failed to handle a state it should handle.

**Why:** A symptom fix hides the evidence and leaves the fault free to surface somewhere else. Each one makes the system harder to reason about, because the code now carries a workaround for a bug that nobody named. Root-cause fixes are slower upfront but reduce total debugging time.

**Pattern:**
- Reproduce first (if you can't reproduce it, you can't verify your fix)
- Ask "why" at each step until the answer is a wrong decision in the code, not a consequence of an earlier one
- When stuck, instrument. Read the actual error and the actual state. Don't guess (add a log line, dump the state)
- Ask whether the state that triggered the symptom is legitimate. If the system may be in that state, the code that broke on it is the root cause, and handling the state there is the fix. If the state should never exist, a check where it broke hides the bug. Find what produced the state. A nil check added to silence a crash is the usual version of this, and guards, retries, swallowed errors, clamped values, and discarded state are the usual ways to hide a bug
- Check for the pattern, not just the instance (grep for the same pattern, fix every place with the same fault)
- If a workaround needs a paragraph-long comment to justify it, the code is wrong (fix the code, not the comment)
- If the deciding fact took a deep dig to find, propose the cheap, always-on signal that would have shown it at first look

**Restart bugs: suspect state before code**

Code doesn't change between runs. State does. When something "fails after restart," suspect stale persistent state first: config files, caches, lock files, serialized state. If clearing a state file restores behavior, prioritize state validation as the fix.
