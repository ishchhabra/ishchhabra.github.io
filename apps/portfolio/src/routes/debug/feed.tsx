import { createFileRoute } from "@tanstack/react-router";
import type { ComponentType } from "react";
import { ARTICLES } from "../../lib/articles";
import { RenderModeProvider } from "../../lib/render-mode";
import { StaticThemeProvider } from "../../lib/theme";
import { PnpmMonorepoArticle } from "../../pages/writing/PnpmMonorepoArticle";
import { SsrThemingArticle } from "../../pages/writing/SsrThemingArticle";

const ARTICLE_COMPONENTS: Record<string, ComponentType> = {
  "pnpm-monorepo": PnpmMonorepoArticle,
  "ssr-theming": SsrThemingArticle,
};

function FeedPreview() {
  return (
    <RenderModeProvider mode="rss">
      <StaticThemeProvider>
        <div
          style={{ maxWidth: 800, margin: "0 auto", padding: "40px 20px", fontFamily: "system-ui" }}
        >
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>RSS Feed Preview</h1>
          <p style={{ color: "#666", marginBottom: 40 }}>
            This is how articles render in the RSS feed.
          </p>
          {ARTICLES.map((article) => {
            const Component = ARTICLE_COMPONENTS[article.slug];
            if (!Component) return null;
            return (
              <div key={article.slug} style={{ marginBottom: 60 }}>
                <div
                  style={{
                    padding: "8px 12px",
                    background: "#f0f0f0",
                    borderRadius: 6,
                    marginBottom: 16,
                    fontSize: 13,
                    color: "#666",
                  }}
                >
                  {article.slug} — {article.date}
                </div>
                <div style={{ border: "1px solid #e0e0e0", borderRadius: 8, padding: 24 }}>
                  <Component />
                </div>
              </div>
            );
          })}
        </div>
      </StaticThemeProvider>
    </RenderModeProvider>
  );
}

export const Route = createFileRoute("/debug/feed")({
  component: FeedPreview,
});
