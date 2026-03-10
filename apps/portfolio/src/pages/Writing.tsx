import { Page } from "../components/Page";
import { ArticleCard } from "../components/writing/core/ArticleCard";
import { ARTICLES } from "../lib/articles";

export { getArticleBySlug } from "../lib/articles";
export type { Article } from "../lib/articles";

export function Writing() {
  return (
    <Page.Main variant="hero">
      <div className="max-w-3xl">
        <Page.Hero title="Writing">
          <p className="mb-14 text-lg text-zinc-600 dark:text-zinc-500">
            Things I wish someone had explained to me.
          </p>
        </Page.Hero>
      </div>

      <div className="flex max-w-3xl flex-col gap-1">
        {ARTICLES.map((post) => {
          const articleHref = `/writing/${post.slug}`;

          return (
            <ArticleCard.Link
              key={post.slug}
              to={articleHref}
              className="group flex flex-col gap-1 rounded-xl border border-transparent px-5 py-5 transition-colors hover:bg-zinc-100 dark:hover:bg-white/2"
            >
              <div className="flex items-baseline justify-between gap-4">
                <ArticleCard.Title
                  as="h2"
                  className="text-lg font-semibold text-zinc-700 transition-colors group-hover:text-zinc-900 dark:text-zinc-200 dark:group-hover:text-white [font-family:var(--font-display)]"
                  slug={post.slug}
                />
                <ArticleCard.Meta className="flex shrink-0 items-center gap-3">
                  <span className="text-[11px] tabular-nums text-zinc-500 dark:text-zinc-600">
                    {post.readTime}
                  </span>
                  <span className="text-[11px] tabular-nums text-zinc-500 dark:text-zinc-600">
                    {post.date}
                  </span>
                </ArticleCard.Meta>
              </div>
              <ArticleCard.Description
                as="p"
                className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-500"
                slug={post.slug}
              />
              <ArticleCard.Tags className="mt-2 flex gap-2">
                {post.tags.default.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-white/5"
                  >
                    {tag}
                  </span>
                ))}
              </ArticleCard.Tags>
            </ArticleCard.Link>
          );
        })}
      </div>
    </Page.Main>
  );
}
