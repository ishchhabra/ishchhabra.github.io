import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RenderModeProvider } from "./render-mode";
import { StaticThemeProvider } from "./theme";
import { PnpmMonorepoArticle } from "../pages/writing/PnpmMonorepoArticle";
import { SsrThemingArticle } from "../pages/writing/SsrThemingArticle";

export const ARTICLE_COMPONENTS: Record<string, ComponentType> = {
  "pnpm-monorepo": PnpmMonorepoArticle,
  "ssr-theming": SsrThemingArticle,
};

export function renderArticleToHtml(slug: string): string {
  const Component = ARTICLE_COMPONENTS[slug];
  if (!Component) {
    throw new Error(`Article component not found for slug: ${slug}`);
  }

  return renderToStaticMarkup(
    <RenderModeProvider mode="rss">
      <StaticThemeProvider theme="light">
        <Component />
      </StaticThemeProvider>
    </RenderModeProvider>,
  );
}
