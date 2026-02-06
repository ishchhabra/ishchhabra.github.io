# Contributing

## Git workflow

### 1. Create a branch

Create a branch from `main` before making changes:

```bash
git checkout main
git pull origin main
git checkout -b <type>/<short-description>
```

**Branch naming:** `type/short-description` (e.g. `chore/add-agent-skills`, `feat/wallet-page`, `fix/sign-in-redirect`).

For larger epics with parallel agent work, see `.claude/rules/worktree-operations.md`.

### 2. Make commits

Commit in logical chunks. Use [conventional commits](https://www.conventionalcommits.org/):

- `feat:` new feature
- `fix:` bug fix
- `chore:` maintenance (deps, tooling, config)
- `refactor:` code change that neither fixes a bug nor adds a feature
- `docs:` documentation only

**Example (multi-commit PR):**

```bash
# Commit 1: dependency changes
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): add skills package"

# Commit 2: feature/content
git add .agents .claude .cursor
git commit -m "chore: add agent skills"
```

### 3. Before pushing

Run code quality checks:

```bash
pnpm format
pnpm lint
pnpm type-check
```

### 4. Open a PR

Push the branch and open a PR. Use the PR template; keep the PR small and focused.
