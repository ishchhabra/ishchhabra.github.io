# Compiler — AGENTS.md

## Research Before Design

Before making architectural decisions, research how production compilers handle it. Check in order of relevance:

1. ECMAScript spec (tc39.es/ecma262) — the source of truth for JS semantics (hoisting, scoping, iteration protocols, destructuring, etc.)
2. React Compiler (closest to our domain — JS-to-JS, React-aware)
3. LLVM (SSA construction, pass infrastructure, phi optimization)
4. GCC (phiopt, tree passes)
5. Closure Compiler / Terser (JS-specific optimizations)

Present findings before implementing. Understand the design space first.

## Pipeline

Frontend (Oxc parser) → HIR → SSA construction → optimization passes → codegen → JS output.

**Critical:** The compiler outputs JavaScript, not machine code. Copy propagation must account for getter side effects when duplicating property reads. Object property access is not free.

## Testing

- **Unit tests:** `pnpm test` (from this directory)
- **Fixture tests:** Add a test fixture for every bug fix and new feature.

## AOT Verification (End-to-End)

When fixing compiler bugs that affect the portfolio site, verify with the full AOT pipeline. Do not claim a fix works without running it end-to-end in a browser.

Use the **`verify-compiler-on-portfolio`** skill — it covers the compile → build → serve → Chrome MCP iteration loop, route sweep, console-reading cadence, and node_modules bisection.

## Anti-Patterns (Compiler-Specific)

1. Using `pnpm dev` to verify AOT behavior — dev server does not replicate production behavior
2. Making all assignments `let` to dodge SSA correctness issues — fix the SSA construction instead
3. Adding packages to the denied list in `aot-prebuild.mjs` instead of fixing the compilation bug
4. Implementing a pass without checking how React Compiler / LLVM handles the same problem
