import { createFileRoute } from "@tanstack/react-router";
import { createPageMeta, SITE_BASE_URL } from "../../lib/seo";
import { PnpmMonorepoArticle } from "../../pages/writing/PnpmMonorepoArticle";

const ARTICLE_TITLE = "Building a Monorepo That Actually Scales | Ish Chhabra";
const ARTICLE_HEADLINE = "Building a Monorepo That Actually Scales";
const ARTICLE_DESCRIPTION = "A practical guide to pnpm monorepos with true package isolation.";
const ARTICLE_PATH = "/writing/pnpm-monorepo-scales";
const ARTICLE_DATE = "2026-02-09";

export const Route = createFileRoute("/writing/pnpm-monorepo-scales")({
  head: () => {
    const base = createPageMeta({
      title: ARTICLE_TITLE,
      description: ARTICLE_DESCRIPTION,
      path: ARTICLE_PATH,
    });
    return {
      ...base,
      meta: [
        ...base.meta,
        { property: "og:type", content: "article" },
        { name: "author", content: "Ish Chhabra" },
        {
          property: "article:published_time",
          content: "2026-02-09",
        },
      ],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: ARTICLE_HEADLINE,
            description: ARTICLE_DESCRIPTION,
            author: { "@type": "Person", name: "Ish Chhabra" },
            datePublished: ARTICLE_DATE,
            url: `${SITE_BASE_URL}${ARTICLE_PATH}`,
          }),
        },
      ],
    };
  },
  component: PnpmMonorepoArticle,
});
