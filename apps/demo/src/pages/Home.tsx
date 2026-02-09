import { Link } from "react-router-dom";
import { Page } from "../components/Page";

const labProjects = [
  {
    title: "React Sandbox",
    description:
      "Secure, sandboxed React rendering for AI-generated UI. CSP isolation, full hooks, zero host DOM access.",
    href: "/lab/sandbox",
    tag: "Experiment",
    accent: "emerald" as const,
  },
  {
    title: "Design Overlay",
    description:
      "Point at any element, describe what you want in natural language, watch it change. AI-powered visual editing.",
    href: "/lab/design-overlay",
    tag: "Experiment",
    accent: "blue" as const,
  },
  {
    title: "JS AOT Transpiler",
    description:
      "Ahead-of-time compilation for non-hot-path JavaScript. Babel plugin, performance research.",
    href: "https://github.com/ishchhabra/babel-plugin-javascript-aot",
    tag: "Research",
    accent: "violet" as const,
    external: true,
  },
];

const writing = [
  {
    title: "Building a Monorepo That Actually Scales",
    description:
      "Per-package isolation with pnpm — independent lockfiles, correct peer dependency resolution, and a setup that survives a fresh CI clone.",
    href: "/writing/pnpm-monorepo-scales",
    date: "Feb 2026",
  },
];

const tagStyles: Record<string, string> = {
  Experiment: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  Research: "bg-violet-500/15 text-violet-400 border-violet-500/20",
};

const accentGradients: Record<string, string> = {
  emerald: "from-emerald-500/10 via-transparent to-transparent group-hover:from-emerald-500/15",
  blue: "from-blue-500/10 via-transparent to-transparent group-hover:from-blue-500/15",
  violet: "from-violet-500/10 via-transparent to-transparent group-hover:from-violet-500/15",
};

function LabCard({ project }: { project: (typeof labProjects)[number] }) {
  const isExternal = "external" in project;

  const inner = (
    <>
      <div
        className={`pointer-events-none absolute inset-0 bg-linear-to-br opacity-0 transition-opacity duration-500 group-hover:opacity-100 ${accentGradients[project.accent] ?? ""}`}
      />
      <div className="relative flex h-full flex-col">
        <div className="mb-3 flex items-center gap-2.5">
          <h3
            className="text-lg font-semibold text-white"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {project.title}
          </h3>
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium leading-tight ${tagStyles[project.tag] ?? ""}`}
          >
            {project.tag}
          </span>
        </div>
        <p className="mb-5 flex-1 text-sm leading-relaxed text-zinc-400">{project.description}</p>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 transition-colors duration-300 group-hover:text-white">
          {isExternal ? "View on GitHub" : "Try it"}
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="transition-transform duration-300 group-hover:translate-x-0.5"
            aria-hidden="true"
          >
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </span>
      </div>
    </>
  );

  const cls =
    "group relative overflow-hidden rounded-2xl border border-white/5 bg-white/2 p-7 transition-all duration-300 hover:border-white/10 hover:bg-white/4";

  if (isExternal) {
    return (
      <a href={project.href} target="_blank" rel="noopener noreferrer" className={cls}>
        {inner}
      </a>
    );
  }
  return (
    <Link to={project.href} className={cls}>
      {inner}
    </Link>
  );
}

export function Home() {
  return (
    <Page.Main variant="hero">
      {/* Hero */}
      <section className="pb-16">
        <Page.Hero title="Ish Chhabra">
          <p className="text-lg text-zinc-500">
            I do computers. Currently building at{" "}
            <a
              href="https://kniru.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-400 underline decoration-zinc-700 underline-offset-2 transition-colors hover:text-white hover:decoration-white/30"
            >
              Kniru
            </a>{" "}
            and{" "}
            <a
              href="https://clap.gg"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-400 underline decoration-zinc-700 underline-offset-2 transition-colors hover:text-white hover:decoration-white/30"
            >
              Clap
            </a>
            .
          </p>
        </Page.Hero>
      </section>

      {/* i2 labs */}
      <section id="lab" className="pb-16">
        <Page.SectionHeader title="i2 labs" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {labProjects.map((p) => (
            <LabCard key={p.title} project={p} />
          ))}
        </div>
      </section>

      {/* Writing */}
      <section id="writing" className="pb-20">
        <Page.SectionHeader
          title="Writing"
          action={
            <Link
              to="/writing"
              className="text-[11px] text-zinc-600 transition-colors hover:text-white"
            >
              View all
            </Link>
          }
        />
        <div className="flex flex-col">
          {writing.map((post) => (
            <Link
              key={post.title}
              to={post.href}
              className="group -mx-3 flex items-baseline justify-between gap-8 rounded-lg px-3 py-3 transition-colors hover:bg-white/2"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-zinc-300 transition-colors group-hover:text-white">
                  {post.title}
                </div>
                <div className="text-[13px] text-zinc-500">{post.description}</div>
              </div>
              <span className="shrink-0 text-[11px] tabular-nums text-zinc-600">{post.date}</span>
            </Link>
          ))}
        </div>
      </section>
    </Page.Main>
  );
}
