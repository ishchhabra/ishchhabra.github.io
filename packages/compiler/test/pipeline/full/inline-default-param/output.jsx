const $1_0 = function $1_0($3_0 = 5) {
  return ARTICLES.slice(0, $3_0).map(($10_0) => ({
    slug: $10_0.slug,
  }));
};
const ARTICLES = [];
export const Home = function Home() {
  const [$48_0 = 5] = [];
  const articles = ARTICLES.slice(0, $48_0).map(($10_0) => ({
    slug: $10_0.slug,
  }));
  return (
    <div>
      {articles.map(($29_0) => (
        <span key={$29_0.slug}>{$29_0.slug}</span>
      ))}
    </div>
  );
};
