import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";
import Markdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import { ARTICLES } from "../../lib/articles";
import { ARTICLE_COMPONENTS } from "../../lib/article-renderer";
import { renderArticleToMarkdown } from "../../lib/article-markdown";
import { RenderModeProvider } from "../../lib/render-mode";
import { StaticThemeProvider } from "../../lib/theme";

const getMarkdown = createServerFn()
  .inputValidator((slug: unknown) => String(slug))
  .handler(({ data: slug }) => renderArticleToMarkdown(slug));

type Tab = "rss" | "markdown-preview" | "markdown-raw";

function FeedDebug() {
  const [slug, setSlug] = useState(ARTICLES[0]?.slug ?? "");
  const [markdown, setMarkdown] = useState("");
  const [tab, setTab] = useState<Tab>("rss");

  async function loadMarkdown() {
    const md = await getMarkdown({ data: slug });
    setMarkdown(md);
  }

  const Component = ARTICLE_COMPONENTS[slug];

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="mb-2 text-2xl font-semibold text-zinc-900 dark:text-white">Feed Debug</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Preview how articles render in the RSS feed and as Markdown (for Dev.to).
      </p>

      <div className="mb-6 flex items-center gap-3">
        <select
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setMarkdown("");
          }}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
        >
          {ARTICLES.map((a) => (
            <option key={a.slug} value={a.slug}>
              {a.slug}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4 flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {(["rss", "markdown-preview", "markdown-raw"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              if (t !== "rss" && !markdown) loadMarkdown();
            }}
            className={`px-3 py-1.5 text-sm capitalize ${
              tab === t
                ? "border-b-2 border-zinc-900 font-medium text-zinc-900 dark:border-white dark:text-white"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            {t.replace("-", " ")}
          </button>
        ))}
        {markdown && (
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(markdown)}
            className="ml-auto rounded-md border border-zinc-300 bg-zinc-100 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            Copy MD
          </button>
        )}
      </div>

      {tab === "rss" && Component && (
        <RenderModeProvider mode="rss">
          <StaticThemeProvider>
            <div className="rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
              <Component />
            </div>
          </StaticThemeProvider>
        </RenderModeProvider>
      )}

      {tab === "markdown-preview" && markdown && (
        <div className="prose prose-zinc dark:prose-invert max-w-none rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
          <Markdown rehypePlugins={[rehypeRaw]}>{markdown}</Markdown>
        </div>
      )}

      {tab === "markdown-raw" && markdown && (
        <pre className="overflow-auto rounded-lg border border-zinc-200 bg-zinc-950 p-5 text-[13px] leading-relaxed text-zinc-300 break-words whitespace-pre-wrap dark:border-zinc-800">
          {markdown}
        </pre>
      )}
    </div>
  );
}

export const Route = createFileRoute("/debug/feed")({
  component: FeedDebug,
});
