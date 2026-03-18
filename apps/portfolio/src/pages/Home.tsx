import { Link } from "@tanstack/react-router";
import { LabCard } from "../components/lab/LabCard";
import { Page } from "../components/Page";
import { ArticleCard } from "../components/writing/core/ArticleCard";
import { ARTICLES } from "../lib/articles";
import { LAB_PROJECTS } from "../lib/projects";

/** Latest articles for home page preview: slug, title, description, href, date. */
function getWritingPreview(
  limit = 5,
): Array<{ slug: string; title: string; description: string; href: string; date: string }> {
  return ARTICLES.slice(0, limit).map((a) => ({
    slug: a.slug,
    title: a.title,
    description: a.description,
    href: `/writing/${a.slug}`,
    date: a.dateShort,
  }));
}

const writingPreview = getWritingPreview();

export function Home() {
  return (
    <Page.Main variant="hero">
      {/* Hero */}
      <section className="pb-16">
        <Page.Hero title="Ish Chhabra">
          <p className="text-lg text-zinc-600 dark:text-zinc-500">
            I do computers. Currently building{" "}
            <a
              href="https://kniru.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-500 underline decoration-zinc-400 underline-offset-2 transition-colors hover:text-zinc-900 hover:decoration-zinc-600 dark:text-zinc-400 dark:decoration-zinc-700 dark:hover:text-white dark:hover:decoration-white/30"
            >
              Kniru
            </a>{" "}
            and{" "}
            <a
              href="https://clap.gg"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-500 underline decoration-zinc-400 underline-offset-2 transition-colors hover:text-zinc-900 hover:decoration-zinc-600 dark:text-zinc-400 dark:decoration-zinc-700 dark:hover:text-white dark:hover:decoration-white/30"
            >
              Clap
            </a>
            .
          </p>
        </Page.Hero>
      </section>

      {/* i2 labs */}
      <section id="lab" className="pb-16">
        <Page.SectionHeader
          title={
            <>
              <span className="lowercase">i2</span> <span className="uppercase">labs</span>
            </>
          }
          action={
            <Link
              to="/lab"
              className="text-[11px] text-zinc-600 transition-colors hover:text-zinc-900 dark:hover:text-white"
            >
              View all
            </Link>
          }
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {LAB_PROJECTS.map((p) => (
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
              className="text-[11px] text-zinc-600 transition-colors hover:text-zinc-900 dark:hover:text-white"
            >
              View all
            </Link>
          }
        />
        <div className="flex flex-col">
          {writingPreview.map((post) => (
            <ArticleCard.Link
              key={post.title}
              to={post.href}
              className="group -mx-3 flex items-baseline justify-between gap-8 rounded-lg px-3 py-3 transition-colors hover:bg-zinc-100 dark:hover:bg-white/2"
            >
              <div className="min-w-0">
                <ArticleCard.Title
                  as="h3"
                  className="text-sm font-medium text-zinc-700 transition-colors group-hover:text-zinc-900 dark:text-zinc-300 dark:group-hover:text-white"
                  slug={post.slug}
                />
                <ArticleCard.Description
                  as="div"
                  className="text-[13px] text-zinc-500"
                  slug={post.slug}
                />
              </div>
              <span className="shrink-0 text-[11px] tabular-nums text-zinc-500 dark:text-zinc-600">
                {post.date}
              </span>
            </ArticleCard.Link>
          ))}
        </div>
      </section>
    </Page.Main>
  );
}
