function $0_0($3_0, $4_0 = 5) {
  return $3_0.slice(0, $4_0).map(($11_0) => ({
    slug: $11_0.slug,
  }));
}
function $1_0() {
  const [$48_0, $50_0 = 5] = [$2_0];
  const $18_0 = $48_0.slice(0, $50_0).map(($11_0) => ({
    slug: $11_0.slug,
  }));
  return (
    <div>
      {$48_0
        .slice(0, $50_0)
        .map(($11_0) => ({
          slug: $11_0.slug,
        }))
        .map(($29_0) => (
          <span key={$29_0.slug}>{$29_0.slug}</span>
        ))}
    </div>
  );
}
const $2_0 = [];
export { $1_0 as Home };
