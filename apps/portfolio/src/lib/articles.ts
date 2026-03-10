export type Article = {
  slug: string;
  title: string;
  description: string;
  dateShort: string;
  date: string;
  dateISO: string;
  readTime: string;
  tags: {
    /** Tags displayed on the main website. */
    default: string[];
    /** Tags optimized for dev.to discoverability (max 4). Falls back to `default` if omitted. */
    devTo?: string[];
    /** Tags optimized for Hashnode discoverability (max 5). Falls back to `default` if omitted. */
    hashnode?: string[];
  };
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
    tags: {
      default: ["TanStack Start", "React", "theme"],
      devTo: ["react", "webdev", "ssr", "tanstackstart"],
    },
  },
  {
    slug: "pnpm-monorepo",
    title: "How to build a pnpm monorepo, the right way",
    description:
      "A practical guide to building a pnpm monorepo with isolated dependencies and a smooth development experience.",
    dateShort: "Feb 2026",
    date: "Feb 9, 2026",
    dateISO: "2026-02-09",
    readTime: "20 min read",
    tags: {
      default: ["pnpm", "monorepo", "typescript"],
      devTo: ["javascript", "node", "pnpm", "monorepo"],
    },
  },
];

const bySlug = new Map(ARTICLES.map((a) => [a.slug, a]));

export function getArticleBySlug(slug: string): Article | undefined {
  return bySlug.get(slug);
}
