import { renderArticleToMarkdown } from "../src/lib/article-markdown";
import { ARTICLES } from "../src/lib/articles";
import { SITE_BASE_URL } from "../src/lib/seo";

const HASHNODE_API = "https://gql.hashnode.com";

async function gql<T>(
  token: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(HASHNODE_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Hashnode API error: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length)
    throw new Error(`Hashnode GraphQL error: ${json.errors.map((e) => e.message).join(", ")}`);
  if (!json.data) throw new Error("Hashnode returned no data");
  return json.data;
}

interface HashnodePost {
  id: string;
  title: string;
  slug: string;
  url: string;
  content: { markdown: string };
  tags: { slug: string }[];
  publishedAt: string;
}

interface PublicationPostsResponse {
  publication: {
    posts: {
      edges: { node: HashnodePost }[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };
}

async function fetchAllPosts(token: string, publicationId: string): Promise<HashnodePost[]> {
  const posts: HashnodePost[] = [];
  let after: string | null = null;

  while (true) {
    const data: PublicationPostsResponse = await gql<PublicationPostsResponse>(
      token,
      `query ($publicationId: ObjectId!, $first: Int!, $after: String) {
        publication(id: $publicationId) {
          posts(first: $first, after: $after) {
            edges {
              node {
                id
                title
                slug
                url
                content { markdown }
                tags { slug }
                publishedAt
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      }`,
      { publicationId, first: 50, after },
    );

    for (const edge of data.publication.posts.edges) {
      posts.push(edge.node);
    }

    if (!data.publication.posts.pageInfo.hasNextPage) break;
    after = data.publication.posts.pageInfo.endCursor;
  }

  return posts;
}

function sanitizeTags(tags: string[]): { slug: string; name: string }[] {
  return tags.slice(0, 5).map((t) => ({
    slug: t
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, ""),
    name: t,
  }));
}

interface CreateDraftResponse {
  createDraft: { draft: { id: string } };
}

async function createDraft(
  token: string,
  publicationId: string,
  article: {
    title: string;
    markdown: string;
    canonicalUrl: string;
    tags: { slug: string; name: string }[];
    publishedAt: string;
  },
): Promise<{ id: string }> {
  const data = await gql<CreateDraftResponse>(
    token,
    `mutation ($input: CreateDraftInput!) {
      createDraft(input: $input) {
        draft { id }
      }
    }`,
    {
      input: {
        publicationId,
        title: article.title,
        contentMarkdown: article.markdown,
        originalArticleURL: article.canonicalUrl,
        tags: article.tags,
        publishedAt: article.publishedAt,
      },
    },
  );
  return data.createDraft.draft;
}

interface UpdatePostResponse {
  updatePost: { post: { id: string; url: string } };
}

async function updatePost(
  token: string,
  postId: string,
  article: {
    title: string;
    markdown: string;
    tags: { slug: string; name: string }[];
    publishedAt: string;
  },
): Promise<{ id: string; url: string }> {
  const data = await gql<UpdatePostResponse>(
    token,
    `mutation ($input: UpdatePostInput!) {
      updatePost(input: $input) {
        post { id url }
      }
    }`,
    {
      input: {
        id: postId,
        title: article.title,
        contentMarkdown: article.markdown,
        tags: article.tags,
        publishedAt: article.publishedAt,
      },
    },
  );
  return data.updatePost.post;
}

async function main() {
  const token = process.env["HASHNODE_PAT"];
  if (!token) {
    console.error("Missing HASHNODE_PAT environment variable.");
    console.error("Get one from: https://hashnode.com/settings/developer");
    process.exit(1);
  }

  const publicationId = process.env["HASHNODE_PUBLICATION_ID"];
  if (!publicationId) {
    console.error("Missing HASHNODE_PUBLICATION_ID environment variable.");
    console.error("Find it in your Hashnode blog dashboard settings.");
    process.exit(1);
  }

  console.log(`Site: ${SITE_BASE_URL}`);
  console.log(`Found ${ARTICLES.length} local article(s).`);

  console.log("Fetching existing Hashnode posts...");
  const existingPosts = await fetchAllPosts(token, publicationId);
  // Index by title since Hashnode doesn't expose canonical URL in the query easily
  const byTitle = new Map(existingPosts.map((p) => [p.title, p]));
  console.log(`Found ${existingPosts.length} post(s) on Hashnode.\n`);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const article of ARTICLES) {
    const canonicalUrl = `${SITE_BASE_URL}/writing/${article.slug}`;
    const markdown = renderArticleToMarkdown(article.slug);
    const tags = sanitizeTags(article.tags.hashnode ?? article.tags.default);
    const existing = byTitle.get(article.title);

    if (!existing) {
      console.log(`[CREATE DRAFT] "${article.title}"`);
      const result = await createDraft(token, publicationId, {
        title: article.title,
        markdown,
        canonicalUrl,
        tags,
        publishedAt: `${article.dateISO}T00:00:00.000Z`,
      });
      console.log(`  -> draft id: ${result.id}\n`);
      created++;
      continue;
    }

    const remoteMarkdown = existing.content.markdown;
    const localTagSlugs = tags.map((t) => t.slug).sort();
    const remoteTagSlugs = existing.tags.map((t) => t.slug).sort();
    const bodyMatch = remoteMarkdown.trim() === markdown.trim();
    const tagsMatch =
      localTagSlugs.length === remoteTagSlugs.length &&
      localTagSlugs.every((s, i) => s === remoteTagSlugs[i]);
    const dateMatch = existing.publishedAt.startsWith(article.dateISO);
    if (bodyMatch && tagsMatch && dateMatch) {
      console.log(`[SKIP]   "${article.title}" (unchanged)`);
      skipped++;
      continue;
    }

    console.log(`[UPDATE] "${article.title}"`);
    const result = await updatePost(token, existing.id, {
      title: article.title,
      markdown,
      tags,
      publishedAt: `${article.dateISO}T00:00:00.000Z`,
    });
    console.log(`  -> ${result.url}\n`);
    updated++;
  }

  console.log(`\nDone. Created: ${created}, Updated: ${updated}, Skipped: ${skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
