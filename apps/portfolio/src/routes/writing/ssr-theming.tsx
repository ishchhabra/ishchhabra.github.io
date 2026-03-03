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
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: [
              {
                "@type": "Question",
                name: "Why does localStorage cause a flash in SSR dark mode?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "The server has no access to localStorage — it only exists in the browser. So the server renders with a default theme. After hydration, the client reads localStorage, finds a different preference, and updates state. That visible flip from one theme to another is the flash.",
                },
              },
              {
                "@type": "Question",
                name: "How do cookies fix the dark mode flash in TanStack Start?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Cookies are sent with every HTTP request. Store the theme in a cookie, then read it in a server function called from the root route's beforeLoad. The server knows the theme before rendering, so the first HTML paint is correct.",
                },
              },
              {
                "@type": "Question",
                name: "Why is the theme toggle slow with cookie-based theming?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Toggling calls setThemeServerFn to write the cookie on the server, then router.invalidate() to re-run beforeLoad and re-read the cookie. The UI doesn't change until both round-trips complete. Fix this with React 19's useOptimistic to show the new theme instantly.",
                },
              },
              {
                "@type": "Question",
                name: "Why does TanStack Start navigation slow down with theme in beforeLoad?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "TanStack Start runs beforeLoad on every client-side navigation. If it calls a server function (getThemeServerFn), that triggers a network request on every link click, back, and forward. The route can't finish loading until the response arrives.",
                },
              },
              {
                "@type": "Question",
                name: "How to avoid calling the server for theme on every navigation?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Check typeof window in beforeLoad. On the server (initial load), call getThemeServerFn(). On the client, return the theme from a module-level cache. Seed the cache from server context in a useEffect, and update it on toggle before calling router.invalidate().",
                },
              },
            ],
          }),
        },
      ],
    };
  },
  component: SsrThemingArticle,
});
