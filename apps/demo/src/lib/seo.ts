/**
 * Shared SEO constants and helpers for route head (title, description, Open Graph, Twitter, canonical).
 * Single source of truth to avoid duplicating meta across routes.
 */

/** Production site URL for canonicals and JSON-LD. */
export const SITE_BASE_URL = "https://ishchhabra.github.io";

export const SITE_TITLE = "Ish Chhabra";

export const DEFAULT_DESCRIPTION =
  "I do computers. Currently building Kniru and Clap.";

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
      ? [{ rel: "canonical" as const, href: `${SITE_BASE_URL}${path.startsWith("/") ? path : `/${path}`}` }]
      : undefined;
  return {
    meta,
    title,
    ...(links && { links }),
  };
}
