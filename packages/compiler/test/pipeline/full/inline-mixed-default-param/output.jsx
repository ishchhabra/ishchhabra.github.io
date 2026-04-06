const $0_0 = function $0_0($3_0, $4_0 = 5) {
  return $3_0.slice(0, $4_0).map(($11_0) => ({
    slug: $11_0.slug,
  }));
};
const ARTICLES = [];
export const Home = function Home() {
  const [$51_0, $53_0 = 5] = [ARTICLES];
  const articles = $51_0.slice(0, $53_0).map(($11_0) => ({
    slug: $11_0.slug,
  }));
  return (
    <div>
      {articles.map(($30_0) => (
        <span key={$30_0.slug}>{$30_0.slug}</span>
      ))}
    </div>
  );
};
