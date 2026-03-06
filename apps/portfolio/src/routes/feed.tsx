import { createFileRoute } from "@tanstack/react-router";
import { Feed } from "feed";
import { ARTICLES } from "../lib/articles";
import { renderArticleToHtml } from "../lib/article-renderer";
import { DEFAULT_DESCRIPTION, SITE_BASE_URL, SITE_TITLE } from "../lib/seo";

function generateFeed(): string {
  const feed = new Feed({
    title: SITE_TITLE,
    description: DEFAULT_DESCRIPTION,
    id: SITE_BASE_URL,
    link: SITE_BASE_URL,
    language: "en",
    feedLinks: {
      rss: `${SITE_BASE_URL}/feed`,
    },
    copyright: "",
    author: {
      name: SITE_TITLE,
      link: SITE_BASE_URL,
    },
  });

  for (const article of ARTICLES) {
    const content = renderArticleToHtml(article.slug);
    feed.addItem({
      title: article.title,
      id: `${SITE_BASE_URL}/writing/${article.slug}`,
      link: `${SITE_BASE_URL}/writing/${article.slug}`,
      description: article.description,
      date: new Date(article.dateISO),
      content,
    });
  }

  return feed.rss2();
}

export const Route = createFileRoute("/feed")({
  server: {
    handlers: {
      GET: () => {
        return new Response(generateFeed(), {
          headers: {
            "Content-Type": "application/rss+xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
