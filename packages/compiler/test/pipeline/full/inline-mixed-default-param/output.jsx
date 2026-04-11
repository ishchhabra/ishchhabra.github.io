function $0_0($3_0, $4_0 = 5) {
  return $3_0.slice(0, $4_0).map(($13_0) => ({
    slug: $13_0.slug,
  }));
}
function $1_0() {
  const [$53_0, $54_0 = 5] = [$2_0];
  return (
    <div>
      {$53_0
        .slice(0, $54_0)
        .map(($13_0) => ({
          slug: $13_0.slug,
        }))
        .map(($31_0) => (
          <span key={$31_0.slug}>{$31_0.slug}</span>
        ))}
    </div>
  );
}
const $2_0 = [];
export { $1_0 as Home };
