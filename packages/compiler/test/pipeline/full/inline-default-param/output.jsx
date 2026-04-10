function $0_0($3_0 = 5) {
  return $2_0.slice(0, $3_0).map(($10_0) => ({
    slug: $10_0.slug,
  }));
}
function $1_0() {
  const [$48_0 = 5] = [];
  const $17_0 = $2_0.slice(0, $48_0).map(($10_0) => ({
    slug: $10_0.slug,
  }));
  return (
    <div>
      {$2_0
        .slice(0, $48_0)
        .map(($10_0) => ({
          slug: $10_0.slug,
        }))
        .map(($28_0) => (
          <span key={$28_0.slug}>{$28_0.slug}</span>
        ))}
    </div>
  );
}
const $2_0 = [];
export { $1_0 as Home };
