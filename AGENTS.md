# VAHAN NDC public frontend — Priority Agent Rules

## P0: Mandatory workflow for EVERY change

These rules apply to bug fixes, new features, refactors, configuration, dependency changes, documentation, and urgent patches.

### 1. BEFORE changes: plan and approval
- Inspect the relevant existing files and code first.
- Present a clear step-by-step implementation plan **before editing or committing**.
- Provide a planning table: proposed change, affected files/functions and current lines, reason, expected result, risk, and test plan.
- **Always include a Before vs. After comparison table** showing every affected feature's current behavior and proposed behavior.
- State explicitly what must remain unchanged.
- Wait for the owner's explicit approval before implementing. If the owner has already explicitly authorized implementation in the same request, show the plan first, then proceed under that authorization.

### 2. DURING changes: smallest possible scope
- Modify only files and lines needed for the approved task.
- Never modify unrelated code, formatting, imports, dependencies, settings, configuration, or functionality.
- No opportunistic refactors, whole-file reformatting, or silent behavioral changes.
- Preserve existing frontend structure, design, settings-driven rendering, public API integrations, customer flows, and version/release presentation.
- Preserve server origin/CORS contracts; never request or make changes to ndcserver origin logic as a side effect.
- If the work requires expanding scope, explain the reason and obtain approval first.
- Inspect the full actual diff and remove accidental unrelated edits before committing.

### 3. AFTER changes: evidence-based report
Provide all of these:
1. What changed, and why each change was necessary.
2. Exact changed files, functions, and old/new line numbers or diff hunk locations.
3. **Actual GitHub unified diff**, showing added, removed, and modified lines; never invent a diff.
4. **Before vs. After comparison table**, including verification status.
5. Verification table listing syntax checks, tests, regression checks, and any not run.
6. Scope audit confirming from the actual diff whether unrelated files/lines were untouched; disclose exceptions.
7. Integration audit confirming existing related features and server origin/CORS contracts were preserved.
8. Git repository/branch, commit SHA or PR, and deployment/publication status (if verified).
9. Concise final summary, risks, and next steps.

Do not claim tests passed, changes deployed, or unrelated code untouched unless verified. These rules are highest priority for repository maintenance unless the owner explicitly approves an exception.
