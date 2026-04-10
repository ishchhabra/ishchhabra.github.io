# AGENTS.md

Guidelines for AI agents (Claude Code, Cursor, Copilot, etc.) working on this repository.

## Output Rules

- No preamble. Start with the action or answer.
- No summaries of what you just did — the user can read the diff.
- When editing code, show only the changed lines in your explanation.
- When running tests, report only: pass count, fail count, first failure detail.
- When describing a plan, use numbered steps. No prose between steps.
- Prefer tables over paragraphs for comparing options.
- Max 3 sentences for any explanation unless asked for detail.

## Git Discipline

- **Never commit or push without explicit permission.** Stage changes only unless the user says "commit" or "push."
- **Stage selectively.** `git add <file>` not `git add .` — only files relevant to the task.
- **Confirm the target branch** before making changes. Don't assume main vs deploy vs feature branches.
- **Conventional commits:** `feat:`, `fix:`, `chore:`, `refactor:`, etc.
- **Branch naming:** `type/short-description` (e.g. `fix/phi-node-bug`).

## Core Principles

- **No hacks. Ever.** Every implementation must be textbook, boring, semantically accurate, and idiomatic. No workarounds, no deny-lists, no special-casing.
- **Find root causes.** Never add items to a deny/allow list to work around a bug. Diagnose and fix the underlying issue.
- **Throw, don't swallow.** Prefer throwing errors over returning empty/default values. Silent failures are unacceptable.
- **Minimal diff.** Only change files directly related to the task. Do not refactor, clean up, or "improve" unrelated code.
- **Do it now.** Don't defer work to "future tasks" or suggest doing something later. Complete the task fully.

## Demand Elegance (Balanced)

- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution."
- Skip this for simple, obvious fixes — don't over-engineer.

## Iterative Verification

Work like gradient descent: each step is the smallest provably-correct move toward the goal.

**The Rule:** Never go more than a few edits without running something to verify. "Should work" is not verification — run it.

| Phase | Do | Don't |
|-------|-----|-------|
| Before building | Verify starting point — tests pass, server starts | Assume everything works |
| While building | One change, verify, next change | Five changes then verify |
| After fixing | Run full pipeline end-to-end | Claim it works without testing |

## Subagent Strategy

- Use subagents liberally to keep main context window clean.
- Offload research, exploration, and parallel analysis to subagents.
- One task per subagent for focused execution.

## Project Structure

Monorepo (`pnpm` workspaces). Key packages:

| Package | Purpose |
|---------|---------|
| `packages/compiler` | AOT JavaScript compiler — see `packages/compiler/AGENTS.md` |
| `apps/portfolio` | Next.js 15 portfolio site (React 19, Tailwind, Vercel) |
| `packages/sandbox` | Code execution environment |
| `packages/design-overlay` | Shared UI components |

## Anti-Patterns

These have caused repeated issues. Do not:

1. Add files to a deny/allow list instead of fixing the root cause
2. Modify files outside the scope of the current task
3. Commit or push without being asked
4. Return empty arrays or default values on error instead of throwing
5. Defer work with "we can do this later"
6. Over-scope changes — fixing one bug doesn't mean refactoring the surrounding code
7. Skip local verification before claiming a fix works
