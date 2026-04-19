---
name: verify-compiler-on-portfolio
description: Use when a compiler change may have broken the portfolio site, when debugging AOT-compiled portfolio runtime errors, or when verifying a compiler fix end-to-end. Drives the Chrome MCP to iterate compile → build → serve → navigate → read console → repeat until all routes render cleanly. Invoke proactively whenever a compiler change needs end-to-end validation — do not ask the user to test in the browser.
---

# Verify compiler changes on the portfolio (AOT + node_modules + Vite)

Compiler bugs frequently only surface when the portfolio site is built with the full AOT pipeline — including `node_modules` compilation and the Vite production bundle. The dev server does **not** reproduce these bugs. You must drive the end-to-end pipeline yourself using the Chrome MCP. Do not punt verification to the user; assume they are away.

## The iteration loop

Repeat until no console errors on any route and every route renders correctly.

1. **Edit** the compiler fix.
2. **Compile + build + serve** (from `apps/portfolio`):
   ```bash
   AOT_NODE_MODULES=1 pnpm aot:compile
   ENABLE_AOT=1 pnpm build
   pnpm start            # NOT pnpm dev — dev server does not replicate AOT
   ```
3. **Drive Chrome** via the `claude-in-chrome` MCP:
   - Navigate to the served URL (typically `http://localhost:3000`, may vary — read the `pnpm start` output).
   - Click through **multiple routes**, not just the index. Minimum sweep: home, `/writing/*` (including `/writing/ssr-theming`), Lab anchor in the navbar, and any route touched by the fix.
   - After each navigation call `read_console_messages`. Treat any `console.error` as a failure.
4. **Diagnose and return to step 1.** Never stop after a single attempt. Iterate until clean.

## Key env vars

| Var | Effect |
|---|---|
| `ENABLE_AOT=1` | Vite reads from `.aot-src/` instead of `src/` |
| `AOT_NODE_MODULES=1` | AOT compilation includes `node_modules` |

Shortcut scripts in `apps/portfolio`:
- `pnpm build:aot` — compile source only + build
- `pnpm build:aot-nm` — compile source + node_modules + build
- `pnpm compare-build-sizes` — AOT vs non-AOT bundle sizes

## Bisecting node_modules-triggered bugs

When a bug reproduces only with `AOT_NODE_MODULES=1`:

1. Disable optimizer passes one by one to isolate which pass regresses.
2. If a single package is suspect, narrow by excluding packages from AOT compilation **for diagnosis only**.
3. Once the package + pass is identified, fix the root cause in the compiler.

**Do not ship a deny-list as the fix.** Deny-lists are diagnostic scaffolding and must be removed before the change lands (see compiler `CLAUDE.md` anti-patterns).

## Common mistakes to avoid

- Using `pnpm dev` — does not replicate AOT behavior.
- Only checking the home page — most AOT bugs surface on route transitions or SSR hydration of secondary pages.
- Skipping `read_console_messages` after a reload — silent `console.error`s are the whole point of checking.
- Declaring the fix done after one successful build without browsing.
- Asking the user to open the browser. The Chrome MCP is available; use it.
- Forgetting to re-run `pnpm aot:compile` after a compiler edit — stale `.aot-src/` will mask both fixes and regressions.

## When to invoke

Auto-invoke when any of the following hold:
- A compiler change (in `packages/compiler/`) needs end-to-end validation.
- The user reports a runtime error on the portfolio that only appears in production/AOT.
- The user asks to "verify", "test on portfolio", "check it actually works", or similar for a compiler change.
