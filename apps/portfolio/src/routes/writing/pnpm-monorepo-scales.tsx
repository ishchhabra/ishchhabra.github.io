import { createFileRoute } from "@tanstack/react-router";
import { getArticle } from "../../pages/Writing";
import { createPageMeta, SITE_BASE_URL } from "../../lib/seo";
import { PnpmMonorepoArticle } from "../../pages/writing/PnpmMonorepoArticle";

const slug = "pnpm-monorepo-scales";
const article = getArticle(slug)!;
const articlePath = `/writing/${slug}`;

export const Route = createFileRoute("/writing/pnpm-monorepo-scales")({
  head: () => {
    const base = createPageMeta({
      title: `${article.title} | Ish Chhabra`,
      description: article.description,
      path: articlePath,
    });
    return {
      ...base,
      meta: [
        ...base.meta,
        { property: "og:type", content: "article" },
        { name: "author", content: "Ish Chhabra" },
        {
          property: "article:published_time",
          content: article.dateISO,
        },
      ],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: article.title,
            description: article.description,
            author: { "@type": "Person", name: "Ish Chhabra" },
            datePublished: article.dateISO,
            url: `${SITE_BASE_URL}${articlePath}`,
          }),
        },
      ],
    };
  },
  component: PnpmMonorepoArticle,
});
