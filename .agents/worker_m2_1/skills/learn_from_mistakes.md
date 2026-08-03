# Learn From Mistakes Skill

This skill ensures that the AI agent actively learns from user corrections and avoids repeating engineering mistakes.

## Core Rules

1. **No Shortcuts on Firewalls**
   - Never attempt to bypass advanced API firewalls by spoofing headers.
2. **Live Verification Only**
   - Never declare a workflow or code "fixed" based solely on mock, pinned, or simulated data.
   - Always trigger a **live execution** to verify real-world API connectivity, token validity, and end-to-end functionality.
3. **Active Learning from Corrections**
   - When the user corrects an assumption or identifies a design flaw, immediately acknowledge it, update the active plan, and document the lesson.
4. **Keep Architectures Simple**
5. **Do Not Offload Automation to the User**
6. **Explain Repeated Permissions and Problems Clearly**
7. **Explicit User Authorization**
8. **Avoid Unnecessary Custom Code Nodes**
9. **Do Not Use LLMs for Simple Deterministic Tasks**
10. **Auditor Must Verify Architecture, Not Just Status**
11. **Verify Tool Capabilities BEFORE Use**
12. **Verify Tool Existence and Access BEFORE Recommending**
