import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { getArticleBySlug } from "../../../lib/articles";
import { useRenderMode } from "../../../lib/render-mode";
import { Page } from "../../Page";
import { Surface } from "../../Surface";
import { ArticleCard } from "./ArticleCard";
import { NewsletterSignup } from "../NewsletterSignup";
import { A } from "./Prose";
import { ScrollProgress } from "./ScrollProgress";
import { type TocItem, TableOfContents } from "./TableOfContents";

const separator = <span className="h-3 w-px bg-zinc-300 dark:bg-zinc-800" aria-hidden />;

function ArticleMeta({ slug, writtenWithAI = false }: { slug: string; writtenWithAI?: boolean }) {
  const article = getArticleBySlug(slug);
  if (!article) return null;
  return (
    <div className="flex items-center gap-4 text-[12px] text-zinc-500 dark:text-zinc-600">
      <span>Ish Chhabra</span>
      {separator}
      <span>{article.date}</span>
      {separator}
      <span>{article.readTime}</span>
      {writtenWithAI && (
        <>
          {separator}
          <span>Written with AI</span>
        </>
      )}
    </div>
  );
}

export function ArticleHeader({
  slug,
  writtenWithAI = false,
}: {
  slug: string;
  writtenWithAI?: boolean;
}) {
  return (
    <header className="max-w-4xl pb-8">
      <Link
        to="/writing"
        className="mb-8 inline-flex items-center gap-1.5 text-[12px] text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-600 dark:hover:text-zinc-400"
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
      <Page.Hero title={<ArticleCard.Title as="h1" slug={slug} />}>
        <ArticleCard.Description
          as="p"
          className="mb-6 text-lg leading-relaxed text-zinc-600 dark:text-zinc-500"
          slug={slug}
        />
        <ArticleMeta slug={slug} writtenWithAI={writtenWithAI} />
      </Page.Hero>
    </header>
  );
}

function ArticleFooter() {
  return (
    <Surface className="mt-16 p-8">
      <div className="mb-6 text-center">
        <p className="mb-2 text-sm text-zinc-600 dark:text-zinc-400">
          That's all. Hope this saves you the hours of debugging that I went through.
        </p>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-600">
          Found an issue?{" "}
          <A href="https://github.com/ishchhabra/ishchhabra.github.io">Open a PR</A> or{" "}
          <A href="mailto:hello@ishchhabra.com">send me an email</A>.
        </p>
      </div>
      <div className="border-t border-zinc-200 pt-6 dark:border-white/5">
        <NewsletterSignup variant="inline" />
      </div>
    </Surface>
  );
}

function ArticleRoot({ children }: { children: ReactNode }) {
  return (
    <>
      <ScrollProgress />
      <Page.Main variant="hero">{children}</Page.Main>
    </>
  );
}

function ArticleContent({ tocItems, children }: { tocItems: TocItem[]; children: ReactNode }) {
  return (
    <div className="flex gap-10 pt-8">
      <article className="min-w-0 max-w-4xl flex-1">{children}</article>
      <TableOfContents items={tocItems} />
    </div>
  );
}

function ArticleLayout({
  slug,
  writtenWithAI = false,
  tocItems,
  children,
}: {
  slug: string;
  writtenWithAI?: boolean;
  tocItems: TocItem[];
  children: ReactNode;
}) {
  const mode = useRenderMode();
  if (mode === "rss") return <article>{children}</article>;

  return (
    <ArticleRoot>
      <ArticleHeader slug={slug} writtenWithAI={writtenWithAI} />
      <ArticleContent tocItems={tocItems}>
        {children}
        <ArticleFooter />
      </ArticleContent>
    </ArticleRoot>
  );
}

export const Article = {
  Root: ArticleRoot,
  Header: ArticleHeader,
  Content: ArticleContent,
  Footer: ArticleFooter,
  Layout: ArticleLayout,
};
