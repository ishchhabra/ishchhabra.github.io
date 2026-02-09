import { Link } from "react-router-dom";

const articles = [
  {
    slug: "pnpm-monorepo-scales",
    title: "Building a Monorepo That Actually Scales",
    description: "A practical guide to pnpm monorepos with true package isolation.",
    date: "Feb 9, 2026",
    readTime: "20 min read",
    tags: ["pnpm", "monorepo", "typescript"],
  },
];

export function Writing() {
  return (
    <main className="relative">
      <div className="mx-auto max-w-7xl px-6 pt-20 pb-24 sm:pt-28">
        <div className="max-w-3xl">
          <div className="accent-line mb-6 h-px w-12" />
          <h1
            className="mb-3 text-4xl font-bold tracking-tight text-white sm:text-5xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Writing
          </h1>
          <p className="mb-14 text-lg text-zinc-500">Things I wish someone had explained to me.</p>
        </div>

        <div className="flex max-w-3xl flex-col gap-1">
          {articles.map((post) => (
            <Link
              key={post.slug}
              to={`/writing/${post.slug}`}
              className="group flex flex-col gap-1 rounded-xl border border-transparent px-5 py-5 transition-colors hover:bg-white/2"
            >
              <div className="flex items-baseline justify-between gap-4">
                <h2
                  className="text-lg font-semibold text-zinc-200 transition-colors group-hover:text-white"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {post.title}
                </h2>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-[11px] tabular-nums text-zinc-600">{post.readTime}</span>
                  <span className="text-[11px] tabular-nums text-zinc-600">{post.date}</span>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-zinc-500">{post.description}</p>
              <div className="mt-2 flex gap-2">
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-zinc-500"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
