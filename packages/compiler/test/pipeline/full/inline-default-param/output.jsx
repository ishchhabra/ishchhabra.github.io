function $0_0($3_0 = 5) {
  return ARTICLES.slice(0, $3_0).map(($10_0) => ({
    slug: $10_0.slug,
  }));
}
const ARTICLES = [];
export function Home() {
  const [$47_0 = 5] = [];
  const articles = ARTICLES.slice(0, $47_0).map(($10_0) => ({
    slug: $10_0.slug,
  }));
  return (
    <div>
      {ARTICLES.slice(0, $47_0)
        .map(($10_0) => ({
          slug: $10_0.slug,
        }))
        .map(($28_0) => (
          <span key={$28_0.slug}>{$28_0.slug}</span>
        ))}
    </div>
  );
}
