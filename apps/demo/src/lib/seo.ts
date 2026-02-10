/**
 * Shared SEO constants and helpers for route head (title, description, Open Graph, Twitter, canonical).
 * Single source of truth to avoid duplicating meta across routes.
 */

/** Production site URL for canonicals and JSON-LD. */
export const SITE_BASE_URL = "https://ishchhabra.github.io";

export const SITE_TITLE = "Ish Chhabra";

export const DEFAULT_DESCRIPTION = "I do computers. Currently building Kniru and Clap.";

/** Build head { title, meta, links? } from title, description, optional path for canonical. */
export function createPageMeta({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  /** Path for canonical URL (e.g. "/writing"). No leading slash needed for root use "/". */
  path?: string;
}) {
  const meta = [
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { name: "twitter:card", content: "summary" as const },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];
  const links =
    path !== undefined
      ? [
          {
            rel: "canonical" as const,
            href: `${SITE_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`,
          },
        ]
      : undefined;
  return {
    meta,
    title,
    ...(links && { links }),
  };
}

/** WebSite + Person schema for LLMO/site-wide context. */
export const WEBSITE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_TITLE,
  url: SITE_BASE_URL,
  description: DEFAULT_DESCRIPTION,
  author: {
    "@type": "Person",
    name: SITE_TITLE,
    url: SITE_BASE_URL,
    sameAs: ["https://github.com/ishchhabra", "https://linkedin.com/in/ishchhabra"],
  },
};

/** Script element for WebSite JSON-LD (use in root head.scripts). */
export function createWebsiteSchemaScript() {
  return {
    type: "application/ld+json" as const,
    children: JSON.stringify(WEBSITE_JSON_LD),
  };
}
