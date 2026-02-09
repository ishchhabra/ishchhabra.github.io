import { Link } from "react-router-dom";
import { Page } from "../../components/Page";
import {
  A,
  Callout,
  Code,
  CodeBlock,
  Collapsible,
  Divider,
  H2,
  H3,
  LI,
  OL,
  P,
  SectionLabel,
  Strong,
  Table,
  UL,
} from "../../components/writing/Prose";
import { ScrollProgress } from "../../components/writing/ScrollProgress";
import { TableOfContents } from "../../components/writing/TableOfContents";
import {
  InjectedDiagram,
  NodeResolutionDiagram,
} from "../../components/writing/diagrams/SymlinkDiagram";
import {
  SyncBeforeAfterDiagram,
  SyncLifecycleDiagram,
} from "../../components/writing/diagrams/SyncLifecycleDiagram";

const tocItems = [
  { id: "the-bug", label: "The problem with shared packages" },
  { id: "node-resolution", label: "How Node resolves imports", indent: true },
  { id: "two-apps", label: "With two apps, it gets worse", indent: true },
  { id: "why-isolation", label: "Why isolation matters" },
  { id: "injected-deps", label: "Injected dependencies" },
  { id: "proving-it", label: "Proving it with a test", indent: true },
  { id: "making-it-work", label: "Making it work in practice" },
  { id: "rebuild-sync", label: "prepare", indent: true },
  { id: "hard-link-sync", label: "pnpm-sync & watch", indent: true },
  { id: "cmd-click", label: "Cmd+Click to source", indent: true },
  { id: "why-not-bun", label: "Why not Bun?" },
  { id: "troubleshooting", label: "Troubleshooting" },
  { id: "references", label: "References" },
];

export function PnpmMonorepoArticle() {
  return (
    <>
      <ScrollProgress />
      <Page.Main>
        <Page.Hero>
          {/* Hero + content in one container for aligned left edges */}
          <header className="max-w-4xl pb-8">
            <Link
              to="/writing"
              className="mb-8 inline-flex items-center gap-1.5 text-[12px] text-zinc-600 transition-colors hover:text-zinc-400"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Writing
            </Link>
            <div className="accent-line mb-6 h-px w-12" />
            <h1
              className="mb-4 text-3xl font-bold tracking-tight text-white sm:text-[42px] sm:leading-[1.15]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Building a Monorepo That Actually Scales
            </h1>
            <p className="mb-6 text-lg leading-relaxed text-zinc-500">
              A practical guide to pnpm monorepos with true package isolation.
            </p>
            <div className="flex items-center gap-4 text-[12px] text-zinc-600">
              <span>Ish Chhabra</span>
              <span className="h-3 w-px bg-zinc-800" />
              <span>Feb 9, 2026</span>
              <span className="h-3 w-px bg-zinc-800" />
              <span>20 min read</span>
              <span className="h-3 w-px bg-zinc-800" />
              <span>Written with AI</span>
            </div>
          </header>

          {/* Content grid: article + sidebar ToC */}
          <div className="flex gap-10 pt-8">
            <article className="min-w-0 max-w-4xl flex-1">
              {/* ============================================================ */}
              {/*  THE BUG                                                     */}
              {/* ============================================================ */}
              <SectionLabel>The story</SectionLabel>
              <H2 id="the-bug">The problem with shared packages</H2>

              <P>
                You're building an app. It grows. You extract shared code into a workspace package —
                a design system, some utilities, a data layer. <Code>pnpm-workspace.yaml</Code>,
                workspace packages, <Code>pnpm install</Code>. Everything should just work.
              </P>

              <P>
                The shared package declares a <Code>peerDependency</Code> on React (or any library
                with internal state). It also has React in <Code>devDependencies</Code> for local
                type-checking. Your app has React in <Code>dependencies</Code>. You run the app:
              </P>

              <CodeBlock language="error">{`Invariant Violation: Invalid hook call. Hooks can only be called inside
of the body of a function component.`}</CodeBlock>

              <CodeBlock language="error">{`Error: No QueryClient set, use QueryClientProvider to set one`}</CodeBlock>

              <P>
                The first error is React saying "I found two copies of myself." The second is
                TanStack Query saying "the provider exists, but I can't see it" — because it's
                looking in a different React instance's Context tree.
              </P>

              <H3 id="node-resolution">How Node resolves imports</H3>

              <P>
                When pnpm installs a workspace package, it creates a symlink from your app's{" "}
                <Code>node_modules/@packages/shared</Code> pointing to <Code>packages/shared/</Code>
                . When code inside that package runs <Code>require("react")</Code>, Node resolves
                from the <Strong>symlink target</Strong> — the package's directory on disk — not
                from the consuming app's directory.
              </P>

              <NodeResolutionDiagram />

              <P>
                Node walks up from <Code>packages/shared/dist/</Code>, finds{" "}
                <Code>packages/shared/node_modules/react</Code> (the devDependency), and stops. It
                never reaches <Code>apps/my-app/node_modules/react</Code>. Even if both are the{" "}
                <Strong>exact same version</Strong>, your app loads its own copy separately. Two
                Reacts in memory, two dispatchers, two Context trees.
              </P>

              <Callout type="note">
                Any library with module-level state breaks when duplicated: React (hook dispatcher,
                Context), event emitters, caches, registries. If it stores state in a module
                closure, loading it twice creates two invisible parallel universes that can't
                communicate.
              </Callout>

              <H3 id="two-apps">With two apps, it gets worse</H3>

              <P>
                With one app, both copies might be the same version — duplicate state, but at least
                the same API. With two apps that need different versions, it gets worse. The shared
                package's <Code>devDependencies</Code> can only pin one version. Whichever app
                doesn't match ends up with not just two instances — but two{" "}
                <Strong>different versions</Strong>.
              </P>

              <Divider />

              {/* ============================================================ */}
              {/*  WHY ISOLATION MATTERS                                       */}
              {/* ============================================================ */}
              <SectionLabel>The why</SectionLabel>
              <H2 id="why-isolation">Why isolation matters</H2>

              <P>
                Tools like Nx{" "}
                <A href="https://nx.dev/concepts/decisions/dependency-management">recommend</A>{" "}
                keeping all packages on the same version of every dependency. That works when one
                person (or a small team) owns the entire repo. On a larger project with multiple
                teams, it creates a coordination problem: upgrading React 18 → 19 becomes an
                all-or-nothing migration that blocks every team until every app is ready.
              </P>

              <P>
                Setting <Code>shared-workspace-lockfile=false</Code> in <Code>.npmrc</Code> gives
                each package its own <Code>pnpm-lock.yaml</Code>. This is the foundation that makes
                everything else possible:
              </P>

              <UL>
                <LI>
                  <Strong>No cross-team merge conflicts.</Strong> A single shared lockfile changes
                  every time any team adds or updates a dependency. On an active repo, that means
                  constant lockfile conflicts in PRs. Per-package lockfiles scope changes — updating
                  a dependency in one package only touches that package's lockfile. Other teams' PRs
                  are unaffected.
                </LI>
                <LI>
                  <Strong>Easier review.</Strong> A lockfile diff scoped to one package is
                  straightforward to review. A diff in a shared lockfile that spans 50 packages is
                  not.
                </LI>
                <LI>
                  <Strong>Gradual migration.</Strong> One app can move to React 19 while others stay
                  on 18. Migrate one consumer at a time, test it, ship it, move on. No big-bang
                  upgrades.
                </LI>
                <LI>
                  <Strong>Independent tooling.</Strong> Team A upgrades ESLint 8 → 9 without waiting
                  for Team B. Each package evolves on its own schedule. Consumers import from{" "}
                  <Code>dist/</Code>, so internal tooling changes don't ripple outward.
                </LI>
              </UL>

              <P>
                The peer resolution problem from the previous section is solved separately with{" "}
                <Strong>injected dependencies</Strong> — covered next. Per-package lockfiles give
                you the independence; injected deps give you correct resolution. Together, they make
                the monorepo behave as if each package were published to npm and installed
                separately.
              </P>

              <Divider />

              {/* ============================================================ */}
              {/*  INJECTED DEPENDENCIES                                       */}
              {/* ============================================================ */}
              <SectionLabel>The fix</SectionLabel>
              <H2 id="injected-deps">Injected dependencies</H2>

              <P>
                The resolution bug happens because Node walks from the symlink target. To fix it, we
                need the shared package's code to resolve from the <Strong>consumer's</Strong>{" "}
                <Code>node_modules</Code> instead. pnpm has a flag for exactly this:{" "}
                <Code>dependenciesMeta.injected: true</Code>.
              </P>

              <P>
                Instead of creating a symlink to <Code>packages/shared/</Code>, pnpm creates a{" "}
                <Strong>hard-linked copy</Strong> of each file inside the consumer's{" "}
                <Code>node_modules</Code>. When the shared code runs <Code>require("react")</Code>,
                Node resolves from the consumer's directory tree — and finds the consumer's React.
                Not the package's.
              </P>

              <CodeBlock filename="apps/web-app/package.json" language="json">{`{
  "dependencies": {
    "react": "^18",
    "@packages/ui": "workspace:*"
  },
  "dependenciesMeta": {
    "@packages/ui": { "injected": true }
  }
}`}</CodeBlock>

              <InjectedDiagram />

              <P>
                Each consumer gets its own copy. Each copy resolves from the consumer's tree. App A
                gets React 18. App B gets React 19. One shared package, correct resolution
                everywhere.
              </P>

              <Collapsible title="What about bundler resolution?" defaultOpen={false}>
                <P>
                  Another approach: configure the app's bundler so peer deps resolve from the app's{" "}
                  <Code>node_modules</Code>. Next.js does this specifically to resolve React to its
                  own vendored copy.
                </P>
                <P>
                  The problem: <Strong>each consumer has to make the change</Strong>. That means
                  maintenance overhead — every app that uses the shared package must configure its
                  bundler to resolve React from the app's <Code>node_modules</Code>. And each
                  consumer might use a different bundler: Next.js uses Webpack/Turbopack, Vite uses
                  Rollup, React Native uses Metro. Each has its own config format and setup. With
                  pnpm injected, there's no bundler config needed — it works at the package manager
                  level, regardless of what each consumer uses.
                </P>
              </Collapsible>

              <H3 id="proving-it">Proving it with a test</H3>

              <P>
                Here's a minimal test from a{" "}
                <A href="https://github.com/ishchhabra/pnpm-workspace-example">test repo</A> that
                proves the behavior:
              </P>

              <CodeBlock
                filename="packages/example-lib/index.js"
                language="js"
              >{`// Returns whichever version of lodash gets resolved at runtime
module.exports = function getLodashVersion() {
  return require("lodash/package.json").version;
};`}</CodeBlock>

              <CodeBlock filename="packages/example-lib/package.json" language="json">{`{
  "name": "example-lib",
  "main": "index.js",
  "peerDependencies": { "lodash": "*" },
  "devDependencies": { "lodash": "4.17.20" }
}`}</CodeBlock>

              <P>
                Two consumers — both have lodash <Code>4.17.21</Code>. One uses default symlinks,
                one uses injected:
              </P>

              <Table
                headers={["Consumer", "Resolved version"]}
                rows={[
                  [
                    "Symlink (default)",
                    <span className="text-red-400">4.17.20 — package's devDep</span>,
                  ],
                  [
                    "Hardlink (injected dependency)",
                    <span className="text-emerald-400">4.17.21 — consumer's version ✓</span>,
                  ],
                ]}
              />

              <Divider />

              {/* ============================================================ */}
              {/*  MAKING IT WORK                                              */}
              {/* ============================================================ */}
              <SectionLabel>DX</SectionLabel>
              <H2 id="making-it-work">Making it work in practice</H2>

              <P>
                Injected dependencies fix the resolution problem, but they introduce DX challenges.
                Let's solve them one by one.
              </P>

              <H3 id="rebuild-sync">Problem 1: Manual builds on a fresh clone</H3>

              <P>
                You clone the repo, run <Code>pnpm install</Code>, start the app — and it fails.{" "}
                <Code>dist/</Code> doesn't exist yet. You have to manually build every shared
                package before any consumer can import from it. And if packages depend on each
                other, you have to build them in the right order — leaf packages first, then their
                consumers, up the chain.
              </P>

              <P>
                The{" "}
                <A href="https://docs.npmjs.com/cli/v8/using-npm/scripts#life-cycle-scripts">
                  <Code>prepare</Code>
                </A>{" "}
                lifecycle hook solves this — it runs automatically on <Code>pnpm install</Code>:
              </P>

              <CodeBlock filename="packages/ui/package.json (scripts)" language="json">{`{
  "build": "tsc",
  "prepare": "pnpm build"
}`}</CodeBlock>

              <P>
                Now <Code>pnpm install</Code> automatically builds the package. One command,{" "}
                <Code>dist/</Code> exists, consumers can import.
              </P>

              <SyncBeforeAfterDiagram />

              <H3 id="hard-link-sync">Problem 2: Changes don't propagate</H3>

              <P>
                You change a component in the shared package. Nothing happens in the consuming app.
                With injected deps, consumers get a <Strong>hard-linked copy</Strong> of{" "}
                <Code>dist/</Code> created at install time. When <Code>tsc</Code> rebuilds, it
                writes new files with new inodes — but the consumer's hard links still point to the
                old ones. The consumer doesn't see the new build.
              </P>

              <P>
                This is where <A href="https://github.com/tiktok/pnpm-sync">pnpm-sync</A> (by
                TikTok) comes in. It re-copies <Code>dist/</Code> into each consumer's{" "}
                <Code>node_modules</Code> after every build:
              </P>

              <OL>
                <LI>
                  <Code>pnpm-sync prepare</Code> — writes a <Code>.pnpm-sync.json</Code> config
                  describing which consumers need copies and where their stores are.
                </LI>
                <LI>
                  <Code>pnpm-sync copy</Code> — reads that config and copies <Code>dist/</Code> into
                  each consumer.
                </LI>
              </OL>

              <P>
                We wire these into the existing scripts. The <Code>prepare</Code> hook now also
                writes the sync config, and <Code>postbuild</Code> runs the copy after every build:
              </P>

              <CodeBlock filename="packages/ui/package.json (scripts)" language="json">{`{
  "build": "tsc",
  "postbuild": "pnpm-sync copy",
  "prepare": "pnpm sync:prepare && pnpm build"
}`}</CodeBlock>

              <P>
                On a fresh clone: <Code>pnpm install</Code> → <Code>prepare</Code> runs → writes
                sync config → builds <Code>dist/</Code> → <Code>postbuild</Code> fires →{" "}
                <Code>pnpm-sync copy</Code> syncs output to consumers. One command and everything is
                ready.
              </P>

              <SyncLifecycleDiagram />

              <P>
                During development, we want <Code>pnpm-sync copy</Code> to run after every
                successful recompilation too. <Code>tsc --watch</Code> doesn't support running a
                command on success, so we swap it for{" "}
                <A href="https://www.npmjs.com/package/tsc-watch">tsc-watch</A>, which adds an{" "}
                <Code>--onSuccess</Code> hook:
              </P>

              <CodeBlock filename="packages/ui/package.json (scripts)" language="json">{`{
  "build:watch": "tsc-watch --onSuccess \\"pnpm postbuild\\""
}`}</CodeBlock>

              <P>The full script setup for a shared package:</P>

              <CodeBlock filename="packages/ui/package.json" language="json">{`{
  "name": "@packages/ui",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "postbuild": "pnpm-sync copy",
    "prepare": "pnpm sync:prepare && pnpm build",
    "build:watch": "tsc-watch --onSuccess \\"pnpm postbuild\\"",
    "sync:prepare": "pnpm sync:prepare:web-app",
    "sync:prepare:web-app": "pnpm-sync prepare -l ../../apps/web-app/pnpm-lock.yaml -s ../../apps/web-app/node_modules/.pnpm"
  },
  "peerDependencies": { "react": "^18 || ^19" },
  "devDependencies": {
    "@types/react": "^18 || ^19",
    "tsc-watch": "^7.1.1",
    "typescript": "^5"
  }
}`}</CodeBlock>

              <Callout type="note">
                <Strong>Multiple consumers?</Strong> Chain the prepare scripts:{" "}
                <Code>"sync:prepare": "pnpm sync:prepare:app-a && pnpm sync:prepare:app-b"</Code> —
                each pointing to its consumer's lockfile and store path.
              </Callout>

              <H3 id="cmd-click">Problem 3: Cmd+Click opens .d.ts, not source</H3>

              <P>
                Since consumers import from <Code>dist/</Code>, Cmd+Click in VSCode opens{" "}
                <Code>Link.d.ts</Code> instead of <Code>Link.tsx</Code>. Unlike using{" "}
                <Code>transpilePackages</Code> in Next.js or similar bundler-level source
                resolution, our approach lets each package own its build tooling. The tradeoff is
                that we need declaration maps to get good navigation.
              </P>

              <P>
                Enable <Code>declarationMap: true</Code> in the package's tsconfig:
              </P>

              <CodeBlock filename="packages/ui/tsconfig.json" language="json">{`{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}`}</CodeBlock>

              <P>
                But even with declaration maps, VSCode still opens <Code>.d.ts</Code> files. There's
                an open bug (
                <A href="https://github.com/microsoft/TypeScript/issues/62009">TypeScript #62009</A>
                ) where VSCode doesn't follow declaration maps when the source root is relative.
              </P>

              <P>
                The workaround: pass an absolute <Code>sourceRoot</Code> at build time using{" "}
                <Code>$(pwd)</Code>:
              </P>

              <CodeBlock
                filename="build command"
                language="bash"
              >{`tsc --sourceRoot "$(pwd)/src"`}</CodeBlock>

              <P>
                At build time, <Code>$(pwd)</Code> expands to the package's absolute path. The
                declaration maps embed this absolute path, so VSCode resolves to the actual source
                file. Add this flag to both your <Code>build</Code> and <Code>build:watch</Code>{" "}
                scripts.
              </P>

              <Divider />

              {/* ============================================================ */}
              {/*  WHY NOT BUN                                                 */}
              {/* ============================================================ */}
              <SectionLabel>Bun</SectionLabel>
              <H2 id="why-not-bun">Why not Bun?</H2>

              <P>
                <A href="https://bun.sh/docs/pm/isolated-installs">Bun's isolated installs</A>{" "}
                provide strict dependency isolation. But even with isolated installs, workspace
                packages are still <Strong>symlinked to their source directory</Strong>. There's no{" "}
                <Code>dependenciesMeta.injected</Code> equivalent. No hard-linked copies. Resolution
                still follows from the package's directory.
              </P>

              <P>
                Same test, same setup — package has lodash <Code>4.17.20</Code> as devDep, consumer
                has <Code>4.17.21</Code>:
              </P>

              <Table
                headers={["", "pnpm (injected)", "Bun (isolated)"]}
                rows={[
                  [
                    "Resolved version",
                    <span className="text-emerald-400">4.17.21 (consumer's) ✓</span>,
                    <span className="text-red-400">4.17.20 (package's) ✗</span>,
                  ],
                  ["Workspace packages", "Hard-linked copy", "Symlinked to source"],
                  ["Fix for peer deps", "Built-in (one flag)", "Requires bundler config"],
                ]}
              />

              <P>
                Without an injected equivalent, Bun can't correctly resolve peer dependencies for
                workspace packages. That's why I still use pnpm for monorepos.
              </P>

              <Divider />

              {/* ============================================================ */}
              {/*  TROUBLESHOOTING                                             */}
              {/* ============================================================ */}
              <SectionLabel>Debugging</SectionLabel>
              <H2 id="troubleshooting">Troubleshooting</H2>

              <Collapsible title="Missing .d.ts files after pnpm install">
                <P>
                  <Strong>Error:</Strong> "Could not find a declaration file for module
                  '@packages/ui'"
                </P>
                <P>
                  <Strong>Why:</Strong> Stale <Code>tsconfig.tsbuildinfo</Code>. The incremental
                  build cache can cause tsc to skip recompilation or use outdated information,
                  leading to missing or incorrect <Code>.d.ts</Code> files.
                </P>
                <CodeBlock filename="terminal" language="bash">{`rm packages/ui/tsconfig.tsbuildinfo
pnpm --filter @packages/ui build`}</CodeBlock>
              </Collapsible>

              <Divider />

              {/* ============================================================ */}
              {/*  REFERENCES                                                  */}
              {/* ============================================================ */}
              <H2 id="references">References</H2>

              <UL>
                <LI>
                  <A href="https://pnpm.io/package_json#dependenciesmetainjected">
                    pnpm dependenciesMeta.injected
                  </A>
                </LI>
                <LI>
                  <A href="https://github.com/tiktok/pnpm-sync">TikTok pnpm-sync</A>
                </LI>
                <LI>
                  <A href="https://docs.npmjs.com/cli/v8/using-npm/scripts">
                    npm scripts lifecycle (prepare)
                  </A>
                </LI>
                <LI>
                  <A href="https://github.com/microsoft/TypeScript/issues/62009">
                    TypeScript #62009 — declaration map sourceRoot
                  </A>
                </LI>
                <LI>
                  <A href="https://bun.sh/docs/pm/isolated-installs">Bun isolated installs</A>
                </LI>
                <LI>
                  <A href="https://pnpm.io/npmrc#shared-workspace-lockfile">
                    pnpm shared-workspace-lockfile
                  </A>
                </LI>
                <LI>
                  <A href="https://developers.tiktok.com/blog/subspaces-divide-and-conquer-your-npm-upkeep">
                    TikTok — Subspaces: Divide and conquer your npm upkeep
                  </A>
                </LI>
              </UL>

              <div className="mt-16 rounded-xl border border-white/5 bg-white/2 p-8 text-center">
                <p className="mb-2 text-sm text-zinc-400">
                  That's all. Hope this saves you the hours of debugging that I went through.
                </p>
                <p className="text-[13px] text-zinc-600">
                  Found an issue?{" "}
                  <A href="https://github.com/ishchhabra/ishchhabra.github.io">Open a PR</A> or{" "}
                  <A href="mailto:ishchhabra12@gmail.com">send me an email</A>.
                </p>
              </div>
            </article>

            {/* Sidebar: Table of Contents */}
            <TableOfContents items={tocItems} />
          </div>
        </Page.Hero>
      </Page.Main>
    </>
  );
}
