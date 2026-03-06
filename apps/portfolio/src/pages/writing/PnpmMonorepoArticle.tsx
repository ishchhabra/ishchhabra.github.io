import { Article } from "../../components/writing/core/Article";
import {
  A,
  Callout,
  Code,
  CodeBlock,
  Collapsible,
  Diagram,
  Divider,
  H2,
  H3,
  LI,
  OL,
  P,
  SectionLabel,
  Strong,
  Table,
  TroubleshootingItem,
  TroubleshootingList,
  UL,
  Video,
} from "../../components/writing/core/Prose";
import { InteractiveOnly } from "../../lib/render-mode";
import { LodashResolutionDemo } from "../../components/writing/pnpm-monorepo/LodashResolutionDemo";
import { ResolutionPathDiagram } from "../../components/writing/pnpm-monorepo/ResolutionPathDiagram";
import { InjectedDiagram } from "../../components/writing/pnpm-monorepo/SymlinkDiagram";
import {
  SyncBeforeAfterDiagram,
  SyncLifecycleDiagram,
} from "../../components/writing/pnpm-monorepo/SyncLifecycleDiagram";

const tocItems = [
  { id: "how-to-set-up-a-pnpm-workspace", label: "How to set up a pnpm workspace" },
  {
    id: "why-two-copies-how-node-resolves-imports",
    label: "Why two copies? How Node resolves imports",
    indent: true,
  },
  { id: "with-two-apps-it-gets-worse", label: "With two apps, it gets worse", indent: true },
  { id: "injected-dependencies", label: "Injected dependencies" },
  { id: "making-it-work-in-practice", label: "Making it work in practice" },
  {
    id: "problem-1-manual-builds-on-a-fresh-clone",
    label: "Problem 1: Manual builds on a fresh clone",
    indent: true,
  },
  {
    id: "problem-2-changes-dont-propagate",
    label: "Problem 2: Changes don't propagate",
    indent: true,
  },
  {
    id: "problem-3-cmdclick-opens-dts-not-source",
    label: "Problem 3: Cmd+Click opens .d.ts, not source",
    indent: true,
  },
  { id: "why-not-bun", label: "Why not Bun?" },
  { id: "troubleshooting", label: "Troubleshooting" },
  { id: "references", label: "References" },
];

export function PnpmMonorepoArticle() {
  return (
    <Article.Layout slug="pnpm-monorepo" writtenWithAI tocItems={tocItems}>
      <P>
        At some point every growing application ends up with code that needs to be shared across
        surfaces. Maybe you started with a web app and then needed to build a mobile app alongside
        it, and suddenly a whole layer of shared logic &mdash; the design system, the business
        logic, the API layer &mdash; needs to live somewhere both can reach. When that happens, you
        have two options: extract the shared code into a separate repository, or set up a monorepo.
      </P>

      <P>
        With separate repositories, iterating on shared code becomes a slow, multi-step process:
        make a change, propagate it to every consumer, and then test to see if it actually works.
        What should be a quick tweak becomes an afternoon.
      </P>

      <P>
        A monorepo solves this by keeping shared packages and their consumers in the same place.
        Changes to shared code are immediately visible to every consumer, making it easier to
        iterate and test. For this guide, we'll be using pnpm workspaces, which supports
        hard-linking dependencies (more on that later).
      </P>

      <H2 id="how-to-set-up-a-pnpm-workspace">How to set up a pnpm workspace</H2>

      <P>
        A pnpm workspace is defined by a <Code>pnpm-workspace.yaml</Code> at the root that tells
        pnpm where to find your packages:
      </P>

      <CodeBlock filename="pnpm-workspace.yaml" language="yaml">{`packages:
  - "apps/*"
  - "packages/*"`}</CodeBlock>

      <CodeBlock language="bash">{`my-monorepo/
├── pnpm-workspace.yaml
├── apps/
│   └── my-app/
│       └── package.json      # depends on @packages/ui
└── packages/
    └── ui/
        ├── package.json      # peerDependency on react
        └── src/`}</CodeBlock>

      <P>
        Run <Code>pnpm install</Code> and pnpm symlinks your workspace packages together. It feels
        like everything should just work &mdash; and for simple cases, it does. But add a library
        like React &mdash; one that assumes only one copy of itself exists in memory &mdash; and:
      </P>

      <Callout type="danger">
        <span className="font-medium">
          Invariant Violation: Invalid hook call. Hooks can only be called inside of the body of a
          function component.
        </span>
      </Callout>

      <Callout type="danger">
        <span className="font-medium">
          Error: No QueryClient set, use QueryClientProvider to set one
        </span>
      </Callout>

      <P>
        The first error is React saying "I found two copies of myself." The second is TanStack Query
        saying "the provider exists, but I can't see it" — because it's looking in a different React
        instance's Context tree.
      </P>

      <H3 id="why-two-copies-how-node-resolves-imports">
        Why two copies? How Node resolves imports
      </H3>

      <P>
        When pnpm installs a workspace package, it symlinks <Code>node_modules/@packages/ui</Code> →{" "}
        <Code>packages/ui/</Code>. When that package runs <Code>require("react")</Code>, Node
        resolves from the <Strong>symlink target</Strong> — not from the consuming app:
      </P>

      <Diagram
        name="resolution-path"
        alt="How Node resolves require('react') from a symlinked workspace package"
      >
        <ResolutionPathDiagram />
      </Diagram>

      <Callout type="note">
        Any library with module-level state breaks when duplicated: React (hook dispatcher,
        Context), event emitters, caches, registries. If it stores state in a module closure,
        loading it twice creates two invisible parallel universes that can't communicate.
      </Callout>

      <H3 id="with-two-apps-it-gets-worse">With two apps, it gets worse</H3>

      <P>
        With one app, both copies might be the same version — duplicate state, but at least the same
        API. With two apps that need different versions, it gets worse. The shared package's{" "}
        <Code>devDependencies</Code> can only pin one version. Whichever app doesn't match ends up
        with not just two instances — but two <Strong>different versions</Strong>.
      </P>

      <Divider />

      {/* ============================================================ */}
      {/*  INJECTED DEPENDENCIES                                       */}
      {/* ============================================================ */}
      <SectionLabel>The fix</SectionLabel>
      <H2 id="injected-dependencies">Injected dependencies</H2>

      <P>
        The resolution problem happens because Node walks from the symlink target. To fix it, we
        need the shared package's code to resolve from the <Strong>consumer's</Strong>{" "}
        <Code>node_modules</Code> instead. pnpm has a flag for exactly this:{" "}
        <Code>dependenciesMeta.injected: true</Code>.
      </P>

      <P>
        Instead of creating a symlink to <Code>packages/ui/</Code>, pnpm creates a{" "}
        <Strong>hard-linked copy</Strong> of each file inside the consumer's{" "}
        <Code>node_modules</Code>. When the shared code runs <Code>require("react")</Code>, Node
        resolves from the consumer's directory tree — and finds the consumer's React. Not the
        package's.
      </P>

      <CodeBlock filename="apps/my-app/package.json" language="json">{`{
  "dependencies": {
    "react": "^18",
    "@packages/ui": "workspace:*"
  },
  "dependenciesMeta": {
    "@packages/ui": { "injected": true }
  }
}`}</CodeBlock>

      <Diagram
        name="injected-deps"
        alt="Each app gets its own hard-linked copy of the shared package, resolving dependencies correctly"
      >
        <InjectedDiagram />
      </Diagram>

      <P>
        Each consumer gets its own copy. Each copy resolves from the consumer's tree. App A gets
        React 18. App B gets React 19. One shared package, correct resolution everywhere.
      </P>

      <P>
        The demo below runs a real workspace in-browser. A shared package returns whichever lodash
        version gets resolved at runtime — the package pins <Code>4.17.20</Code>, consumers have{" "}
        <Code>4.17.21</Code>.
      </P>

      <P>Try it: switch between the symlink and injected tabs, then click "Compare both".</P>

      <InteractiveOnly>
        <LodashResolutionDemo />
      </InteractiveOnly>

      <Collapsible title="What about bundler resolution?" defaultOpen={false}>
        <P>
          Another approach: configure the app's bundler so peer deps resolve from the app's{" "}
          <Code>node_modules</Code>. Next.js does this specifically to resolve React to its own
          vendored copy.
        </P>
        <P>
          The problem: <Strong>each consumer has to make the change</Strong>. That means maintenance
          overhead — every app that uses the shared package must configure its bundler to resolve
          React from the app's <Code>node_modules</Code>. And each consumer might use a different
          bundler: Next.js uses Webpack/Turbopack, Vite uses esbuild/Rollup, React Native uses
          Metro. Each has its own config format and resolution rules. With pnpm injected, there's no
          bundler config needed — it works at the package manager level, regardless of what each
          consumer uses.
        </P>
      </Collapsible>

      <Divider />

      {/* ============================================================ */}
      {/*  MAKING IT WORK                                              */}
      {/* ============================================================ */}
      <SectionLabel>DX</SectionLabel>
      <H2 id="making-it-work-in-practice">Making it work in practice</H2>

      <P>
        Injected dependencies fix the resolution problem, but they introduce DX challenges. Let's
        solve them one by one.
      </P>

      <H3 id="problem-1-manual-builds-on-a-fresh-clone">
        Problem 1: Manual builds on a fresh clone
      </H3>

      <P>
        You clone the repo, run <Code>pnpm install</Code>, start the app — and it fails.{" "}
        <Code>dist/</Code> doesn't exist yet. You have to manually build every shared package before
        any consumer can import from it. And if packages depend on each other, you have to build
        them in the right order — leaf packages first, then their consumers, up the chain.
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

      <Diagram
        name="sync-before-after"
        alt="Before install: dist/ doesn't exist. After prepare: dist/ built automatically"
      >
        <SyncBeforeAfterDiagram />
      </Diagram>

      <H3 id="problem-2-changes-dont-propagate">Problem 2: Changes don't propagate</H3>

      <P>
        You change a component in the shared package. Nothing happens in the consuming app. With
        injected deps, consumers get a <Strong>hard-linked copy</Strong> of <Code>dist/</Code>{" "}
        created at install time. When <Code>tsc</Code> rebuilds, it writes new files with new inodes
        — but the consumer's hard links still point to the old ones. The consumer doesn't see the
        new build.
      </P>

      <P>
        This is where <A href="https://github.com/tiktok/pnpm-sync">pnpm-sync</A> (by TikTok) comes
        in. It re-copies <Code>dist/</Code> into each consumer's <Code>node_modules</Code> after
        every build:
      </P>

      <OL>
        <LI>
          <Code>pnpm-sync prepare</Code> — writes a <Code>.pnpm-sync.json</Code> config describing
          which consumers need copies and where their stores are.
        </LI>
        <LI>
          <Code>pnpm-sync copy</Code> — reads that config and copies <Code>dist/</Code> into each
          consumer.
        </LI>
      </OL>

      <P>
        We wire these into the existing scripts. The <Code>prepare</Code> hook now also writes the
        sync config, and <Code>postbuild</Code> runs the copy after every build:
      </P>

      <CodeBlock filename="packages/ui/package.json (scripts)" language="json">{`{
  "build": "tsc",
  "postbuild": "pnpm-sync copy",
  "prepare": "pnpm sync:prepare && pnpm build"
}`}</CodeBlock>

      <P>
        On a fresh clone: <Code>pnpm install</Code> → <Code>prepare</Code> runs → writes sync config
        → builds <Code>dist/</Code> → <Code>postbuild</Code> fires → <Code>pnpm-sync copy</Code>{" "}
        syncs output to consumers. One command and everything is ready.
      </P>

      <Diagram
        name="sync-lifecycle"
        alt="Fresh clone lifecycle: pnpm install → prepare → sync:prepare → build → postbuild → consumers have built output"
      >
        <SyncLifecycleDiagram />
      </Diagram>

      <P>
        During development, we want <Code>pnpm-sync copy</Code> to run after every successful
        recompilation too. <Code>tsc --watch</Code> doesn't support running a command on success, so
        we swap it for <A href="https://www.npmjs.com/package/tsc-watch">tsc-watch</A>, which adds
        an <Code>--onSuccess</Code> hook:
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
    "sync:prepare": "pnpm sync:prepare:my-app",
    "sync:prepare:my-app": "pnpm-sync prepare -l ../../apps/my-app/pnpm-lock.yaml -s ../../apps/my-app/node_modules/.pnpm"
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
        <Code>"sync:prepare": "pnpm sync:prepare:app-a && pnpm sync:prepare:app-b"</Code> — each
        pointing to its consumer's lockfile and store path.
      </Callout>

      <H3 id="problem-3-cmdclick-opens-dts-not-source">
        Problem 3: Cmd+Click opens .d.ts, not source
      </H3>

      <P>
        Since consumers import from <Code>dist/</Code>, Cmd+Click in VSCode opens{" "}
        <Code>Link.d.ts</Code> instead of <Code>Link.tsx</Code>. Unlike using{" "}
        <Code>transpilePackages</Code> in Next.js or similar bundler-level source resolution, our
        approach lets each package own its build tooling. The tradeoff is that we need declaration
        maps to get good navigation.
      </P>

      <Video src="/videos/cmd-click-before.mp4" />

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
        But even with declaration maps, VSCode still opens <Code>.d.ts</Code> files. There's an open
        bug (<A href="https://github.com/microsoft/TypeScript/issues/62009">TypeScript #62009</A>)
        where VSCode doesn't follow declaration maps when the source root is relative.
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
        At build time, <Code>$(pwd)</Code> expands to the package's absolute path. The declaration
        maps embed this absolute path, so VSCode resolves to the actual source file. Add this flag
        to both your <Code>build</Code> and <Code>build:watch</Code> scripts.
      </P>

      <P>With the fix, Cmd+Click now opens the actual source:</P>

      <Video src="/videos/cmd-click-after.mp4" />

      <Divider />

      {/* ============================================================ */}
      {/*  WHY NOT BUN                                                 */}
      {/* ============================================================ */}
      <SectionLabel>Bun</SectionLabel>
      <H2 id="why-not-bun">Why not Bun?</H2>

      <P>
        <A href="https://bun.sh/docs/pm/isolated-installs">Bun's isolated installs</A> provide
        strict dependency isolation. But even with isolated installs, workspace packages are still{" "}
        <Strong>symlinked to their source directory</Strong>. There's no{" "}
        <Code>dependenciesMeta.injected</Code> equivalent. No hard-linked copies. Resolution still
        follows from the package's directory.
      </P>

      <P>
        Same test, same setup — package has lodash <Code>4.17.20</Code> as devDep, consumer has{" "}
        <Code>4.17.21</Code>:
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
        Without an injected equivalent, Bun can't correctly resolve peer dependencies for workspace
        packages. That's why I still use pnpm for monorepos.
      </P>

      <Divider />

      {/* ============================================================ */}
      {/*  TROUBLESHOOTING                                             */}
      {/* ============================================================ */}
      <SectionLabel>Debugging</SectionLabel>
      <H2 id="troubleshooting">Troubleshooting</H2>

      <TroubleshootingList>
        <TroubleshootingItem title="Missing .d.ts files after pnpm install">
          <P>
            <Strong>Error:</Strong> "Could not find a declaration file for module '@packages/ui'"
          </P>
          <P>
            <Strong>Why:</Strong> Stale <Code>tsconfig.tsbuildinfo</Code>. The incremental build
            cache can cause tsc to skip recompilation or use outdated information, leading to
            missing or incorrect <Code>.d.ts</Code> files.
          </P>
          <CodeBlock filename="terminal" language="bash">{`rm packages/ui/tsconfig.tsbuildinfo
pnpm --filter @packages/ui build`}</CodeBlock>
        </TroubleshootingItem>
      </TroubleshootingList>

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
    </Article.Layout>
  );
}
