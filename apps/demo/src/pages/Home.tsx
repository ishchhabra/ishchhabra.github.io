import { Link } from "react-router-dom";

const projects = [
  {
    title: "Sandbox",
    description:
      "Secure, sandboxed React rendering for AI-generated UI. Full React with hooks, interactivity, and CSP isolation — no network access, no host DOM access.",
    href: "/projects/sandbox",
    accent: "emerald",
  },
  {
    title: "Design Overlay",
    description:
      "Visual element selection and AI-powered editing overlay. Select any element on the page and make changes with natural language.",
    href: "/projects/design-overlay",
    accent: "blue",
  },
];

export function Home() {
  return (
    <main className="relative">
      <section className="mx-auto max-w-7xl px-6 py-24 sm:py-32">
        <div className="max-w-3xl">
          <h1
            className="mb-6 text-5xl font-bold tracking-tight text-white sm:text-6xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Experimentation
            <br />
            <span className="text-zinc-500">and tooling.</span>
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-zinc-400">
            Modern web development, refined. We build tools and explore ideas at
            the edge of what's possible.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-24">
        <h2
          className="mb-8 text-sm font-medium tracking-widest text-zinc-500 uppercase"
          style={{ letterSpacing: "0.15em" }}
        >
          Projects
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {projects.map((project) => (
            <Link
              key={project.href}
              to={project.href}
              className="group relative overflow-hidden rounded-2xl border border-white/5 bg-white/2 p-8 transition-all duration-300 hover:border-white/10 hover:bg-white/4"
            >
              <div className="relative">
                <h3
                  className="mb-3 text-xl font-semibold text-white"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {project.title}
                  <span className="ml-2 inline-block text-zinc-500 transition-transform duration-300 group-hover:translate-x-1">
                    &rarr;
                  </span>
                </h3>
                <p className="text-sm leading-relaxed text-zinc-400">
                  {project.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
