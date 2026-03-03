import { createFileRoute } from "@tanstack/react-router";
import { createPageMeta, SITE_BASE_URL } from "../../lib/seo";
import { getArticleBySlug } from "../../pages/Writing";
import { SsrThemingArticle } from "../../pages/writing/SsrThemingArticle";

const slug = "ssr-theming";
const article = getArticleBySlug(slug)!;
const articlePath = `/writing/${slug}`;

export const Route = createFileRoute("/writing/ssr-theming")({
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
        { property: "article:published_time", content: article.dateISO },
        { name: "keywords", content: article.tags.join(", ") },
      ],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "TechArticle",
            headline: article.title,
            description: article.description,
            author: {
              "@type": "Person",
              name: "Ish Chhabra",
              url: SITE_BASE_URL,
            },
            datePublished: article.dateISO,
            dateModified: article.dateISO,
            url: `${SITE_BASE_URL}${articlePath}`,
            keywords: article.tags,
            proficiencyLevel: "Expert",
          }),
        },
      ],
    };
  },
  component: SsrThemingArticle,
});
