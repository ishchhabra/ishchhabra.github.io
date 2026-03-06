import { createFileRoute } from "@tanstack/react-router";
import { Feed } from "feed";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ARTICLES } from "../lib/articles";
import { RenderModeProvider } from "../lib/render-mode";
import { DEFAULT_DESCRIPTION, SITE_BASE_URL, SITE_TITLE } from "../lib/seo";
import { StaticThemeProvider } from "../lib/theme";
import { PnpmMonorepoArticle } from "../pages/writing/PnpmMonorepoArticle";
import { SsrThemingArticle } from "../pages/writing/SsrThemingArticle";

const ARTICLE_COMPONENTS: Record<string, ComponentType> = {
  "pnpm-monorepo": PnpmMonorepoArticle,
  "ssr-theming": SsrThemingArticle,
};

function renderArticleToHtml(slug: string): string {
  const Component = ARTICLE_COMPONENTS[slug];
  if (!Component) {
    throw new Error(`Article component not found for slug: ${slug}`);
  }

  return renderToStaticMarkup(
    <RenderModeProvider mode="rss">
      <StaticThemeProvider>
        <Component />
      </StaticThemeProvider>
    </RenderModeProvider>,
  );
}

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
