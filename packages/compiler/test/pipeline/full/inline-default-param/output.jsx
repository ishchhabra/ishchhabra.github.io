function $0_0($3_0 = 5) {
  return $2_0.slice(0, $3_0).map(($12_0) => ({
    slug: $12_0.slug,
  }));
}
function $1_0() {
  const [$52_0 = 5] = [];
  const $19_0 = $2_0.slice(0, $52_0).map(($12_0) => ({
    slug: $12_0.slug,
  }));
  return (
    <div>
      {$2_0
        .slice(0, $52_0)
        .map(($12_0) => ({
          slug: $12_0.slug,
        }))
        .map(($30_0) => (
          <span key={$30_0.slug}>{$30_0.slug}</span>
        ))}
    </div>
  );
}
const $2_0 = [];
export { $1_0 as Home };
