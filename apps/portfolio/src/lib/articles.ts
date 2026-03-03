export type Article = {
  slug: string;
  title: string;
  description: string;
  dateShort: string;
  date: string;
  dateISO: string;
  readTime: string;
  tags: string[];
};

export const ARTICLES: Article[] = [
  {
    slug: "ssr-theming",
    title: "How to add theming to an SSR app (TanStack Start)",
    description: "A walkthrough of adding theming to an SSR app without flash or slowdown.",
    dateShort: "Mar 2026",
    date: "Mar 3, 2026",
    dateISO: "2026-03-03",
    readTime: "14 min read",
    tags: ["TanStack Start", "React", "theme"],
  },
  {
    slug: "pnpm-monorepo-scales",
    title: "Building a Monorepo That Actually Scales",
    description: "A practical guide to pnpm monorepos with true package isolation.",
    dateShort: "Feb 2026",
    date: "Feb 9, 2026",
    dateISO: "2026-02-09",
    readTime: "20 min read",
    tags: ["pnpm", "monorepo", "typescript"],
  },
];

const bySlug = new Map(ARTICLES.map((a) => [a.slug, a]));

export function getArticleBySlug(slug: string): Article | undefined {
  return bySlug.get(slug);
}
