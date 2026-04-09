function $0_0($3_0, $4_0 = 5) {
  return $3_0.slice(0, $4_0).map(($11_0) => ({
    slug: $11_0.slug,
  }));
}
const ARTICLES = [];
export function Home() {
  const [$3_1, $4_1 = 5] = [ARTICLES];
  const articles = $3_1.slice(0, $4_1).map(($11_0) => ({
    slug: $11_0.slug,
  }));
  return (
    <div>
      {$3_1
        .slice(0, $4_1)
        .map(($11_0) => ({
          slug: $11_0.slug,
        }))
        .map(($29_0) => (
          <span key={$29_0.slug}>{$29_0.slug}</span>
        ))}
    </div>
  );
}
