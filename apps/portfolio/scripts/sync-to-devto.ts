import { renderArticleToMarkdown } from "../src/lib/article-markdown";
import { ARTICLES } from "../src/lib/articles";
import { SITE_BASE_URL } from "../src/lib/seo";

const DEVTO_API = "https://dev.to/api";

const HEADERS = (apiKey: string) => ({
  "api-key": apiKey,
  Accept: "application/vnd.forem.api-v1+json",
  "Content-Type": "application/json",
});

function sanitizeTags(tags: string[]): string[] {
  return tags.slice(0, 4).map((t) => t.toLowerCase().replace(/[^a-z0-9]/g, ""));
}

interface DevtoArticle {
  id: number;
  url: string;
  canonical_url: string | null;
  body_markdown: string;
  title: string;
}

async function fetchMyArticles(apiKey: string): Promise<DevtoArticle[]> {
  const articles: DevtoArticle[] = [];
  let page = 1;
  while (true) {
    const res = await fetch(`${DEVTO_API}/articles/me/all?page=${page}&per_page=100`, {
      headers: HEADERS(apiKey),
    });
    if (!res.ok) throw new Error(`Failed to fetch articles: ${res.status} ${await res.text()}`);
    const batch = (await res.json()) as DevtoArticle[];
    if (batch.length === 0) break;
    articles.push(...batch);
    page++;
  }
  return articles;
}

async function fetchArticleBody(apiKey: string, id: number): Promise<string> {
  const res = await fetch(`${DEVTO_API}/articles/${id}`, {
    headers: HEADERS(apiKey),
  });
  if (!res.ok) throw new Error(`Failed to fetch article ${id}: ${res.status}`);
  const article = (await res.json()) as DevtoArticle;
  return article.body_markdown;
}

async function createArticle(
  apiKey: string,
  article: { title: string; markdown: string; canonicalUrl: string; tags: string[] },
): Promise<{ id: number; url: string }> {
  const res = await fetch(`${DEVTO_API}/articles`, {
    method: "POST",
    headers: HEADERS(apiKey),
    body: JSON.stringify({
      article: {
        title: article.title,
        body_markdown: article.markdown,
        published: false,
        tags: sanitizeTags(article.tags),
        canonical_url: article.canonicalUrl,
      },
    }),
  });
  if (!res.ok) throw new Error(`Failed to create article: ${res.status} ${await res.text()}`);
  return (await res.json()) as { id: number; url: string };
}

async function updateArticle(
  apiKey: string,
  id: number,
  article: { title: string; markdown: string; tags: string[] },
): Promise<{ id: number; url: string }> {
  const res = await fetch(`${DEVTO_API}/articles/${id}`, {
    method: "PUT",
    headers: HEADERS(apiKey),
    body: JSON.stringify({
      article: {
        title: article.title,
        body_markdown: article.markdown,
        tags: sanitizeTags(article.tags),
      },
    }),
  });
  if (!res.ok) throw new Error(`Failed to update article ${id}: ${res.status} ${await res.text()}`);
  return (await res.json()) as { id: number; url: string };
}

async function main() {
  const apiKey = process.env["DEVTO_API_KEY"];
  if (!apiKey) {
    console.error("Missing DEVTO_API_KEY environment variable.");
    console.error("Get one from: https://dev.to/settings/extensions");
    process.exit(1);
  }

  console.log(`Site: ${SITE_BASE_URL}`);
  console.log(`Found ${ARTICLES.length} local article(s).`);

  // Fetch existing Dev.to articles and index by canonical URL
  console.log("Fetching existing Dev.to articles...");
  const devtoArticles = await fetchMyArticles(apiKey);
  const byCanonical = new Map(
    devtoArticles.filter((a) => a.canonical_url).map((a) => [a.canonical_url!, a]),
  );
  console.log(`Found ${devtoArticles.length} article(s) on Dev.to.\n`);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const article of ARTICLES) {
    const canonicalUrl = `${SITE_BASE_URL}/writing/${article.slug}`;
    const markdown = renderArticleToMarkdown(article.slug);
    const existing = byCanonical.get(canonicalUrl);

    if (!existing) {
      console.log(`[CREATE] "${article.title}"`);
      const result = await createArticle(apiKey, {
        title: article.title,
        markdown,
        canonicalUrl,
        tags: article.tags.devTo ?? article.tags.default,
      });
      console.log(`  → ${result.url}\n`);
      created++;
      continue;
    }

    // Fetch full body to compare (the list endpoint may not include it)
    const remoteBody = existing.body_markdown ?? (await fetchArticleBody(apiKey, existing.id));
    if (remoteBody.trim() === markdown.trim()) {
      console.log(`[SKIP]   "${article.title}" (unchanged)`);
      skipped++;
      continue;
    }

    console.log(`[UPDATE] "${article.title}"`);
    const result = await updateArticle(apiKey, existing.id, {
      title: article.title,
      markdown,
      tags: article.tags.devTo ?? article.tags.default,
    });
    console.log(`  → ${result.url}\n`);
    updated++;
  }

  // Warn about Dev.to articles whose canonical URL points to our site but no longer matches a local article
  const localCanonicals = new Set(ARTICLES.map((a) => `${SITE_BASE_URL}/writing/${a.slug}`));
  const orphaned = devtoArticles.filter(
    (a) => a.canonical_url?.startsWith(SITE_BASE_URL) && !localCanonicals.has(a.canonical_url),
  );
  if (orphaned.length > 0) {
    console.log(
      `\n⚠ ${orphaned.length} orphaned article(s) on Dev.to (no matching local article):`,
    );
    for (const a of orphaned) {
      console.log(`  - "${a.title}" (${a.url})`);
    }
  }

  console.log(`\nDone. Created: ${created}, Updated: ${updated}, Skipped: ${skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
