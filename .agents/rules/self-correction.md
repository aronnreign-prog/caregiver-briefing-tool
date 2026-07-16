# Self-Correction Rules (Always Active)

These rules are NON-NEGOTIABLE. They override convenience and speed.

---

## Rule 1: NEVER Stub, Mock, or Placeholder

- Do NOT write `// TODO`, `// placeholder`, `// in production we'd...`, `throw new Error('not implemented')`
- Do NOT use hardcoded if-else blocks pretending to be API calls
- Do NOT write mock data and claim the feature is "complete"
- If you cannot implement something, SAY SO. Do not fake it.

**Test:** Before declaring any function complete, verify: does it make a REAL API call / database query / computation, or is it a stub? If stub → you are violating this rule.

---

## Rule 2: Self-Audit Checklist Before Declaring Complete

Before saying "Task X is complete" or "Done", answer these YES/NO questions explicitly in your response:

1. Did I re-read the relevant spec section BEFORE coding? (Rule 3)
2. Does every function have real implementation (no stubs/TODOs)? (Rule 1)
3. Did I only implement what this specific task requires (no scope creep)?
4. Does the code compile (`tsc --noEmit` would pass)?
5. Are all imports resolving to real modules that exist?
6. Did I create any required migration/schema files?
7. Would this work on a fresh deployment (no hidden dependencies)?

If ANY answer is NO → do not declare complete. Fix it first.

---

## Rule 3: Re-Read the Spec Before Every Coding Action

- Before writing ANY code, re-read the relevant section of `docs/task-list.md`
- Do NOT rely on what you "remember" from earlier in the conversation
- After reading, state: "I re-read Task X. Requirements are: [list them]"
- Only then begin coding

---

## Rule 4: One Task at a Time

- Implement ONLY the task the user asked for
- Do NOT combine multiple tasks into one response
- Do NOT "while I'm here, let me also..." adjacent tasks
- Each task = one commit with a clear message

---

## Rule 5: Two-Pass Verification

- NEVER audit your own code in the same message you wrote it
- Message 1: Write the implementation
- Message 2: Compare implementation against spec requirements point-by-point
- If the audit finds gaps → fix them before declaring complete
