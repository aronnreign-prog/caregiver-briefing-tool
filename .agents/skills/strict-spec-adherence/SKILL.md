---
name: strict-spec-adherence
description: Research-backed guidelines for working with Gemini (and LLMs generally) to minimize the 10 documented coding failure modes. Based on deep research into academic papers, industry tools, and community findings.
---

# Strict Spec Adherence + LLM Failure Mode Mitigations

See the full research report at: `C:\Users\Dell\.gemini\antigravity-cli\brain\28b5f363-1eac-4288-9e72-510c6cbfb4f3\gemini_failure_modes_research.md`

---

## The 10 Failure Modes (Quick Reference)

| # | Name | Primary Mitigation |
|---|------|--------------------|
| FM-1 | Optimistic Stubbing | TDD — failing tests gate completion |
| FM-2 | Context Drift | Fresh session per task + spec re-injected every prompt |
| FM-3 | Task Conflation | One task per session + Declare-Execute-Announce checklist |
| FM-4 | Sycophantic Completion | Tests as completion criterion, adversarial reviewer prompt |
| FM-5 | No Self-Verification | Two-pass mandatory: generate in one message, audit in the next |
| FM-6 | Spec Not Re-Read | Full spec injected in EVERY prompt, not just the first |
| FM-7 | Cascading Errors | Integration tests gate between tasks |
| FM-8 | Agentic Drift | Goal anchoring + max_iterations hard stop |
| FM-9 | Action Bias | Explicit file scope constraint in every prompt |
| FM-10 | Silent Semantic Failure | Integration tests with real data, not mocks |

---

## Rules for This Project

### Rule 1: Never Assume Implied Consent
If the user is deliberating or says they are "thinking about it," DO NOT take action. Wait for an explicit command.

### Rule 2: Do Not Skip Ahead
Implement ONLY the task at hand. Read the "Verify before committing" section of the task-list.md before writing any code.

### Rule 3: Use Provided Prompts & Schemas Exactly
If the spec provides a prompt template, JSON structure, or output format — use it verbatim.

### Rule 4: Write a Plan First When the Spec Says So
If the spec says "write a plan and get approval first" — stop, output the plan, and wait for "yes" before writing code.

### Rule 5: Never Accept Stubs in Your Own Code
If you are about to write a comment like "// in production we'd call X", STOP. Either implement it or tell the user you cannot and ask for guidance.

### Rule 6: Two-Pass Rule
Never audit your own code in the same message you wrote it. Implementation goes in one message, spec-comparison audit goes in the next separate message.

### Rule 7: Inject the Spec Every Time
Do not rely on scroll-back or "memory." The relevant spec section must be explicitly read before every coding action.

### Rule 8: Document Mistakes
When a mistake is caught (by the user or self-audit), document the root cause here so it is not repeated.

---

## Documented Mistakes in This Project

1. **Tasks 8/9/10 conflated** — blurred three separate tasks into one blob. Root cause: FM-3 (Task Conflation). Fix applied: rewrote to strictly follow task-list.md boundaries.
2. **Assumed implied consent for Task 5** — user said "I'm thinking about it" and I immediately wrote and committed code. Root cause: FM-4 (Sycophantic Completion). Code reverted.
3. **DDInter API mocked, not implemented** — wrote a hardcoded `if (lisinopril...)` block and claimed Layer 5 was complete. Root cause: FM-1 (Optimistic Stubbing). Caught by analysis agents.
4. **`source_doc_date` always set to `now()`** — bi-temporal ordering broken for all temporal trend queries. Root cause: FM-7 (Cascading Error). Documented in gap analysis.
5. **No migration file for `claim_next_job` RPC** — entire pipeline non-functional on fresh deployment. Root cause: FM-10 (Silent Semantic Failure). Caught by analysis agents.

