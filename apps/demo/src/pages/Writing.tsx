import { Link, useLocation, useViewTransitionState } from "react-router-dom";
import { Page } from "../components/Page";

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
  const location = useLocation();

  return (
    <Page.Main variant="hero">
      <div className="max-w-3xl">
        <Page.Hero title="Writing">
          <p className="mb-14 text-lg text-zinc-500">Things I wish someone had explained to me.</p>
        </Page.Hero>
      </div>

      <div className="flex max-w-3xl flex-col gap-1">
        {articles.map((post) => {
          const articleHref = `/writing/${post.slug}`;
          const isTransitioningToArticle = useViewTransitionState(articleHref);
          const isTransitioningToList =
            useViewTransitionState("/writing") &&
            (location.state as { fromArticle?: string } | null)?.fromArticle === post.slug;

          const shouldAnimateTitle = isTransitioningToArticle || isTransitioningToList;
          const shouldAnimateDescription = isTransitioningToArticle || isTransitioningToList;

          return (
            <Link
              key={post.slug}
              to={articleHref}
              viewTransition
              className="group flex flex-col gap-1 rounded-xl border border-transparent px-5 py-5 transition-colors hover:bg-white/2"
            >
              <div className="flex items-baseline justify-between gap-4">
                <h2
                  className="text-lg font-semibold text-zinc-200 transition-colors group-hover:text-white"
                  style={{
                    fontFamily: "var(--font-display)",
                    ...(shouldAnimateTitle && {
                      viewTransitionName: "article-title",
                    }),
                  }}
                >
                  {post.title}
                </h2>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-[11px] tabular-nums text-zinc-600">{post.readTime}</span>
                  <span className="text-[11px] tabular-nums text-zinc-600">{post.date}</span>
                </div>
              </div>
              <p
                className="text-sm leading-relaxed text-zinc-500"
                style={
                  shouldAnimateDescription ? { viewTransitionName: "article-description" } : {}
                }
              >
                {post.description}
              </p>
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
          );
        })}
      </div>
    </Page.Main>
  );
}
